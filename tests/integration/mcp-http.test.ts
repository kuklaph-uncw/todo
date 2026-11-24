import { afterEach, beforeEach, expect, it } from "bun:test";
import { startMcp } from "../../src/mcp/server";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createTestContext } from "../helpers/test-vault";

let ctx: ReturnType<typeof createTestContext>;
let running: Awaited<ReturnType<typeof startMcp>>;
let validToken = "test-token";
beforeEach(async () => {
  ctx = createTestContext();
  validToken = "test-token";
  running = await startMcp(ctx.vault, ctx.clock, 0, (token) => token === validToken);
});
afterEach(async () => {
  await running?.close();
  ctx.cleanup();
});

const rpc = (method: string, params: object = {}, headers: Record<string, string> = {}) =>
  fetch(running.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer test-token",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

async function readRpc(response: Response) {
  const body = await response.text();
  // Legacy MCP can return one result as SSE; current clients accept JSON or SSE.
  const data = body.startsWith("event:")
    ? body
        .split("\n")
        .find((line) => line.startsWith("data: "))!
        .slice(6)
    : body;
  return JSON.parse(data);
}

it("rejects browsers, foreign hosts, missing tokens, and revoked tokens before accessing the vault", async () => {
  expect((await rpc("tools/list", {}, { authorization: "" })).status).toBe(401);
  expect((await rpc("tools/list", {}, { host: "evil.example" })).status).toBe(403);
  expect((await rpc("tools/list", {}, { origin: "http://127.0.0.1" })).status).toBe(403);
  validToken = "replacement";
  expect((await rpc("tools/list")).status).toBe(401);
  expect(ctx.vault.peekTodos()).toEqual([]);
});

it("serves legacy MCP clients, lists tools, and creates through the real HTTP transport", async () => {
  const init = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  expect(init.status).toBe(200);
  expect((await readRpc(init)).result.serverInfo.name).toBe("todo");
  const list = await rpc("tools/list");
  expect((await readRpc(list)).result.tools.map((tool: { name: string }) => tool.name)).toContain("add_todo");
  const added = await rpc("tools/call", { name: "add_todo", arguments: { task: "From MCP", requestId: "one" } });
  const result = (await readRpc(added)).result;
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent.task).toBe("From MCP");
  expect(ctx.vault.getTodos()).toHaveLength(1);
  const retried = await rpc("tools/call", { name: "add_todo", arguments: { task: "From MCP", requestId: "one" } });
  expect((await readRpc(retried)).result.structuredContent.id).toBe(result.structuredContent.id);
  expect(ctx.vault.getTodos()).toHaveLength(1);
});

it("exposes ledger tools over HTTP and preserves metadata through create, patch, retry and delete", async () => {
  ctx.vault.createGoal({ title: "Delivery", cycle: "26-27", description: "Ship" });
  const tools = (await readRpc(await rpc("tools/list"))).result.tools;
  for (const name of ["list_entries", "get_entry", "list_goals", "list_tags"]) {
    expect(tools.find((tool: { name: string }) => tool.name === name)?.annotations.readOnlyHint).toBe(true);
  }
  const call = async (name: string, args: object) =>
    (await readRpc(await rpc("tools/call", { name, arguments: args }))).result;
  const args = { text: "Release #ops [[delivery]]", minutes: 90, isHighlight: true, requestId: "ledger-create" };
  const added = await call("add_entry", args);
  expect(added.isError).not.toBe(true);
  const entry = added.structuredContent;
  expect(entry).toMatchObject({
    date: "2026-09-28",
    time: "14:05",
    tags: ["ops"],
    goals: ["delivery"],
    minutes: 90,
    isHighlight: true,
  });
  expect((await call("add_entry", args)).structuredContent).toEqual(entry);
  expect((await call("get_entry", { date: entry.date, id: entry.id })).structuredContent).toEqual(entry);
  expect((await call("list_entries", { tag: "ops" })).structuredContent.total).toBe(1);
  expect((await call("list_goals", {})).structuredContent.goals[0].slug).toBe("delivery");
  expect((await call("list_tags", {})).structuredContent.tags).toEqual([{ tag: "ops", count: 1 }]);
  const target = { date: entry.date, id: entry.id, expectedRevision: entry.revision };
  const changed = await call("update_entry", {
    ...target,
    isHighlight: false,
    minutes: null,
    requestId: "ledger-edit",
  });
  expect(changed.structuredContent).toMatchObject({ isHighlight: false, minutes: null, goals: ["delivery"] });
  expect((await call("update_entry", { ...target, text: "Stale", requestId: "ledger-stale" })).isError).toBe(true);
  expect((await call("add_entry", { ...args, date: "2026-02-30", requestId: "bad-date" })).isError).toBe(true);
  expect(
    (
      await call("delete_entry", {
        ...target,
        expectedRevision: changed.structuredContent.revision,
        requestId: "ledger-delete",
      })
    ).structuredContent.deleted,
  ).toBe(entry.id);
  expect((await call("list_entries", {})).structuredContent.entries).toEqual([]);
});

it("exposes goal tools over HTTP: read-only reads, writes with retries and revisions, and no delete", async () => {
  const tools = (await readRpc(await rpc("tools/list"))).result.tools;
  const tool = (name: string) => tools.find((item: { name: string }) => item.name === name);
  expect(tool("get_goal")?.annotations.readOnlyHint).toBe(true);
  expect(tool("list_goals")?.annotations.readOnlyHint).toBe(true);
  for (const name of ["add_goal", "update_goal"]) expect(tool(name)?.annotations.readOnlyHint).toBe(false);
  expect(tool("update_goal")?.description).toContain('status "dropped"');
  expect(tools.some((item: { name: string }) => /delete_goal|remove_goal/.test(item.name))).toBe(false);

  const call = async (name: string, args: object) =>
    (await readRpc(await rpc("tools/call", { name, arguments: args }))).result;
  const args = { title: "Delivery", description: "Ship.", requestId: "goal-create" };
  const added = await call("add_goal", args);
  expect(added.isError).not.toBe(true);
  expect(added.structuredContent).toMatchObject({ slug: "delivery", cycle: "26-27", status: "draft", order: 1 });
  expect((await call("add_goal", args)).structuredContent).toEqual(added.structuredContent);
  expect(ctx.vault.getGoals()).toHaveLength(1);
  expect((await call("get_goal", { slug: "delivery" })).structuredContent).toEqual(added.structuredContent);
  const changed = await call("update_goal", {
    slug: "delivery",
    expectedRevision: added.structuredContent.revision,
    status: "agreed",
    requestId: "goal-edit",
  });
  expect(changed.structuredContent).toMatchObject({ status: "agreed", description: "Ship." });
  const stale = await call("update_goal", {
    slug: "delivery",
    expectedRevision: added.structuredContent.revision,
    title: "Stale",
    requestId: "goal-stale",
  });
  expect(stale.isError).toBe(true);
  expect(stale.content[0].text).toContain("This goal changed");
  expect((await call("get_goal", { slug: "missing" })).isError).toBe(true);
  expect((await call("list_goals", { cycle: "26-27" })).structuredContent.goals).toEqual([
    {
      slug: "delivery",
      title: "Delivery",
      cycle: "26-27",
      status: "agreed",
      kind: "goal",
      revision: changed.structuredContent.revision,
    },
  ]);
  expect((await call("list_goals", { cycle: "25-26" })).structuredContent.goals).toEqual([]);
});

it("rejects goal calls without a valid token before touching the vault", async () => {
  validToken = "replacement";
  const response = await rpc("tools/call", { name: "add_goal", arguments: { title: "Sneaky", requestId: "x" } });
  expect(response.status).toBe(401);
  expect(ctx.vault.getGoals()).toEqual([]);
});

it("rejects invalid JSON, oversized bodies, and unrelated routes", async () => {
  const send = (body: string) =>
    fetch(running.url, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body,
    });
  expect((await send("not json")).status).toBe(400);
  expect((await send("x".repeat(1024 * 1024 + 1))).status).toBe(413);
  expect(
    (await fetch(running.url.replace("/mcp", "/settings"), { headers: { authorization: "Bearer test-token" } })).status,
  ).toBe(404);
});

it("supports the official current SDK client and concurrent independent clients", async () => {
  const clients = [new Client({ name: "first", version: "1" }), new Client({ name: "second", version: "1" })];
  try {
    await Promise.all(
      clients.map((client) =>
        client.connect(
          new StreamableHTTPClientTransport(new URL(running.url), {
            requestInit: { headers: { authorization: "Bearer test-token" } },
          }),
        ),
      ),
    );
    const results = await Promise.all(
      clients.map((client, index) =>
        client.callTool({ name: "add_todo", arguments: { task: `Client ${index}`, requestId: `client-${index}` } }),
      ),
    );
    expect(results.every((result) => !result.isError)).toBe(true);
    expect(
      ctx.vault
        .getTodos()
        .map((todo) => todo.task)
        .sort(),
    ).toEqual(["Client 0", "Client 1"]);
    expect(
      (await clients[0].listTools()).tools.find((tool) => tool.name === "list_todos")?.annotations?.readOnlyHint,
    ).toBe(true);
  } finally {
    await Promise.all(clients.map((client) => client.close()));
  }
});
