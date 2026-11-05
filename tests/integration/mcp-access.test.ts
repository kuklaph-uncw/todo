import { expect, it, spyOn } from "bun:test";
import { join } from "node:path";
import { AgentAccess } from "../../src/mcp/access";
import { startMcp } from "../../src/mcp/server";
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
