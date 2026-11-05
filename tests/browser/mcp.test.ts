import { afterAll, beforeAll, expect, it } from "bun:test";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { devFetch } from "../../src/dev-server";
import { AgentAccess } from "../../src/mcp/access";
import { createTestContext } from "../helpers/test-vault";

const base = createTestContext();
const ctx = { ...base, agentAccess: new AgentAccess(join(base.root, "mcp.json"), base.vault, base.clock) };
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: devFetch(ctx) });
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

it("announces changed tasks without replacing typed text, and rejects a stale editor save", async () => {
  const todo = ctx.vault.addTodo({
    task: "Original task",
    priority: null,
    status: "Open",
    tags: [],
    goals: [],
    notes: "",
  });
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  await page.getByRole("textbox", { name: "Task", exact: true }).fill("My unfinished edit");
  ctx.vault.updateTodo(todo.id, { task: "Agent update" });
  await page.locator("#change-notice").waitFor({ state: "visible" });
  expect(await page.getByRole("textbox", { name: "Task", exact: true }).textContent()).toBe("My unfinished edit");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Refresh when ready", exact: true }).click();
  expect(await page.getByRole("textbox", { name: "Task", exact: true }).textContent()).toBe("My unfinished edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("heading", { name: "Todo changed", exact: true }).waitFor();
  expect(await page.getByLabel("Your submitted text").inputValue()).toBe("My unfinished edit");
  expect(ctx.vault.getTodo(todo.id)?.task).toBe("Agent update");
}, 20000);

it("confirms refresh when only a goal's status selection has changed", async () => {
  const goal = ctx.vault.createGoal({ title: "Refresh protection", cycle: "2026", body: "" });
  await page.goto(`${server.url}goals/${goal.slug}?edit=1`);
  await page.locator('.goal-edit select[name="status"]').selectOption("achieved");
  ctx.vault.addTodo({ task: "Trigger goal notice", priority: null, status: "Open", tags: [], goals: [], notes: "" });
  await page.locator("#change-notice").waitFor({ state: "visible" });
  let prompted = false;
  const dismiss = (dialog: import("playwright").Dialog) => {
    prompted = true;
    void dialog.dismiss();
  };
  page.on("dialog", dismiss);
  try {
    await page.getByRole("button", { name: "Refresh when ready", exact: true }).click();
    expect(prompted).toBe(true);
    expect(await page.locator('.goal-edit select[name="status"]').inputValue()).toBe("achieved");
  } finally {
    page.off("dialog", dismiss);
  }
}, 20000);

it("keeps text entered while a refresh response is loading", async () => {
  await page.goto(`${server.url}todos`);
  ctx.vault.addTodo({
    task: "Trigger delayed refresh",
    priority: null,
    status: "Open",
    tags: [],
    goals: [],
    notes: "",
  });
  await page.locator("#change-notice").waitFor({ state: "visible" });
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
    await page.getByRole("button", { name: "Refresh when ready", exact: true }).click();
    await ready;
    await page.getByRole("textbox", { name: "New todo", exact: true }).fill("Typed while refreshing");
    release();
    await page.getByText("New edits were made while refreshing. Your page has been kept.", { exact: true }).waitFor();
    expect(await page.getByRole("textbox", { name: "New todo", exact: true }).textContent()).toBe(
      "Typed while refreshing",
    );
  } finally {
    release();
    await page.unroute(url);
  }
}, 25000);

afterAll(async () => {
  await browser?.close();
  server.stop(true);
  await ctx.agentAccess.close();
  ctx.cleanup();
}, 30000);
