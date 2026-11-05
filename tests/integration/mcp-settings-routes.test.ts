import { afterEach, beforeEach, expect, it } from "bun:test";
import { join } from "node:path";
import { AgentAccess } from "../../src/mcp/access";
import { handleRequest } from "../../src/server";
import { createTestContext, formPost, get } from "../helpers/test-vault";

let ctx: ReturnType<typeof createTestContext> & { agentAccess: AgentAccess };
beforeEach(() => {
  const base = createTestContext();
  ctx = { ...base, agentAccess: new AgentAccess(join(base.root, "mcp.json"), base.vault, base.clock) };
});
afterEach(async () => {
  await ctx.agentAccess.close();
  ctx.cleanup();
});

it("renders disabled settings and shows a generated token only in its uncached POST response", async () => {
  expect(await (await handleRequest(get("/settings"), ctx)).text()).toContain("Enable agent access");
  const response = await handleRequest(formPost("/settings", { intent: "token" }), ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  const token = /id="new-token"[^>]*value="([a-f0-9]+)"/.exec(html)![1];
  expect(ctx.agentAccess.store.acceptsToken(token)).toBe(true);
  expect(await (await handleRequest(get("/settings"), ctx)).text()).not.toContain(token);
});

it("saves the background option independently, rejects invalid ports, and keeps agent access disabled", async () => {
  const response = await handleRequest(formPost("/settings", { intent: "save", background: "on", port: "41824" }), ctx);
  expect(response.status).toBe(303);
  expect(ctx.agentAccess.snapshot()).toMatchObject({ enabled: false, background: true, port: 41824, running: false });
  const invalid = await handleRequest(formPost("/settings", { intent: "save", enabled: "on", port: "1.5" }), ctx);
  expect(invalid.status).toBe(400);
  expect(ctx.agentAccess.snapshot().enabled).toBe(false);
});
