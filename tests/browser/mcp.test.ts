import { afterAll, beforeAll, expect, it } from "bun:test";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { devFetch } from "../../src/dev-server";
import { AgentAccess } from "../../src/mcp/access";
import { createTestContext } from "../helpers/test-vault";
import { LedgerService } from "../../src/mcp/ledger";
import { VaultChanges } from "../../src/vault/changes";

const base = createTestContext();
const ctx = {
  ...base,
  agentAccess: new AgentAccess(join(base.root, "mcp.json"), base.vault, base.clock),
  changes: new VaultChanges(base.vault, base.root),
};
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 30, fetch: devFetch(ctx) });
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
}, 30000);

it("supports settings with normal form controls and only shows the token once", async () => {
  await page.goto(`${server.url}settings`);
  expect(await page.getByLabel("Enable agent access", { exact: true }).isChecked()).toBe(false);
  await page.getByLabel("Keep MCP running when the window is closed").check();
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.getByText("Settings saved.", { exact: true }).waitFor();
  expect(ctx.agentAccess.snapshot().background).toBe(true);
  await page.getByRole("button", { name: "Generate access token", exact: true }).click();
  await page.getByLabel("New access token", { exact: true }).waitFor();
  expect(await page.getByLabel("New access token", { exact: true }).inputValue()).toHaveLength(64);
  expect(await page.locator("#mcp-claude").inputValue()).toContain("YOUR_TOKEN");
  await page.reload();
  expect(await page.getByLabel("New access token", { exact: true }).count()).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
});

it("updates the page around an unsaved todo edit, then rejects the stale save", async () => {
  const todo = ctx.vault.addTodo({
    task: "Original task",
    priority: null,
    status: "Open",
    tags: [],
    goals: [],
    notes: "",
  });
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  const task = page.getByRole("textbox", { name: "Task", exact: true });
  await task.fill("My unfinished edit");
  ctx.vault.updateTodo(todo.id, { task: "Agent update" });
  await page.locator("#live-status").getByText("1 item updated.", { exact: true }).waitFor({ state: "attached" });
  expect(await task.textContent()).toBe("My unfinished edit");
  expect(await task.evaluate((el) => el === document.activeElement)).toBe(true);
  expect(await page.locator("#change-notice").isHidden()).toBe(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("heading", { name: "Todo changed", exact: true }).waitFor();
  expect(await page.getByLabel("Your submitted text").inputValue()).toBe("My unfinished edit");
  expect(ctx.vault.getTodo(todo.id)?.task).toBe("Agent update");
}, 20000);

it("updates the page around an unsaved ledger edit, then rejects the stale save", async () => {
  const ledger = new LedgerService(ctx.vault, ctx.clock);
  ledger.execute("add_entry", { text: "Original ledger text", requestId: "entry-create" });
  const entry = ledger.list({}).entries[0];
  await page.goto(`${server.url}?edit=${entry.id}`);
  const editor = page.getByRole("textbox", { name: "Entry text", exact: true });
  await editor.fill("My unfinished ledger edit");
  ledger.execute("add_entry", { text: "Agent's new entry", requestId: "entry-add" });
  ledger.execute("update_entry", {
    date: entry.date,
    id: entry.id,
    expectedRevision: entry.revision,
    text: "Agent ledger update",
    requestId: "entry-update",
  });
  await page.getByText("Agent's new entry", { exact: true }).waitFor();
  expect(await editor.textContent()).toBe("My unfinished ledger edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("heading", { name: "Entry changed", exact: true }).waitFor();
  expect(await page.getByLabel("Your submitted text").inputValue()).toBe("My unfinished ledger edit");
  expect(ledger.get(entry).text).toBe("Agent ledger update");
}, 20000);

it("keeps a goal's changed status choice through a live update", async () => {
  const goal = ctx.vault.createGoal({ title: "Refresh protection", cycle: "2026" });
  await page.goto(`${server.url}goals/${goal.slug}?edit=1`);
  const agreed = page.locator('.goal-edit input[name="status"][value="agreed"]');
  await agreed.check();
  const version = await page.locator("main").getAttribute("data-todo-version");
  ctx.vault.addTodo({ task: "Trigger goal update", priority: null, status: "Open", tags: [], goals: [], notes: "" });
  await page.waitForFunction((before) => document.querySelector("main")?.dataset.todoVersion !== before, version);
  expect(await agreed.isChecked()).toBe(true);
}, 20000);

it("keeps text typed while a live update is loading", async () => {
  await page.goto(`${server.url}todos`);
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const url = `${server.url}todos`;
  await page.route(url, async (route) => {
    const response = await route.fetch();
    started();
    await held;
    await route.fulfill({ response });
  });
  try {
    ctx.vault.addTodo({ task: "Arrives while typing", priority: null, status: "Open", tags: [], goals: [], notes: "" });
    await ready;
    const input = page.getByRole("textbox", { name: "New todo", exact: true });
    await input.fill("Typed while updating");
    release();
    await page.getByText("Arrives while typing", { exact: true }).waitFor();
    expect(await input.textContent()).toBe("Typed while updating");
    expect(await input.evaluate((el) => el === document.activeElement)).toBe(true);
  } finally {
    release();
    await page.unroute(url);
  }
}, 25000);

afterAll(async () => {
  await browser?.close();
  server.stop(true);
  await ctx.agentAccess.close();
  ctx.changes.close();
  ctx.cleanup();
}, 30000);
