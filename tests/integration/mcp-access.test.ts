import { expect, it, spyOn } from "bun:test";
import { join } from "node:path";
import { AgentAccess } from "../../src/mcp/access";
import { startMcp } from "../../src/mcp/server";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createTestContext } from "../helpers/test-vault";

it("reports an occupied port, retries after it is free, and closes the actual listener", async () => {
  const ctx = createTestContext();
  const occupied = await startMcp(ctx.vault, ctx.clock, 0, () => false);
  const access = new AgentAccess(join(ctx.root, "mcp.json"), ctx.vault, ctx.clock);
  const errorLog = spyOn(console, "error").mockImplementation(() => {});
  try {
    await access.rotateToken();
    const preferences = { enabled: true, background: true, port: Number(new URL(occupied.url).port) };
    await access.configure(preferences);
    expect(access.snapshot()).toMatchObject({ enabled: true, running: false });
    expect(access.snapshot().error).toContain("port");
    await occupied.close();
    await access.configure(preferences);
    expect(access.snapshot()).toMatchObject({ running: true, error: null });
    await access.close();
    await expect(fetch(occupied.url)).rejects.toThrow();
  } finally {
    errorLog.mockRestore();
    await access.close();
    await occupied.close();
    ctx.cleanup();
  }
});

it("retains ledger retry protection across listener reconfiguration", async () => {
  const ctx = createTestContext();
  const probe = await startMcp(ctx.vault, ctx.clock, 0, () => false);
  const url = probe.url;
  await probe.close();
  const access = new AgentAccess(join(ctx.root, "mcp.json"), ctx.vault, ctx.clock);
  const clients: Client[] = [];
  try {
    const token = await access.rotateToken();
    const preferences = { enabled: true, background: false, port: Number(new URL(url).port) };
    const results = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      await access.configure(preferences);
      const client = new Client({ name: "ledger-retry", version: "1" });
      clients.push(client);
      await client.connect(
        new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }),
      );
      const result = await client.callTool({
        name: "add_entry",
        arguments: { text: "Only once", requestId: "same-create" },
      });
      expect(result.isError).not.toBe(true);
      results.push(result.structuredContent);
      await client.close();
    }
    expect(results[1]).toEqual(results[0]);
    expect(ctx.vault.peekEntries("2026-09-28")).toHaveLength(1);
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    await access.close();
    ctx.cleanup();
  }
});
