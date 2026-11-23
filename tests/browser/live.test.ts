import { afterAll, beforeAll, expect, it } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { devFetch } from "../../src/dev-server";
import { VaultChanges } from "../../src/vault/changes";
import { createTestContext } from "../helpers/test-vault";

// Pages open in place, and changes made elsewhere show up without a reload.
const ctx = createTestContext();
ctx.changes = new VaultChanges(ctx.vault, ctx.root);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 30, fetch: devFetch(ctx) });
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
  page.setDefaultTimeout(10000);
}, 30000);

afterAll(async () => {
  await browser?.close();
  server.stop(true);
  ctx.changes?.close();
  ctx.cleanup();
});

const addTodo = (task: string) =>
  ctx.vault.addTodo({ task, priority: null, status: "Open", tags: [], goals: [], notes: "" }, "2026-09-28");
for (let i = 1; i <= 30; i++) addTodo(`Existing todo ${i}`);

/** A full reload would lose this mark. */
const markDocument = () => page.evaluate(() => Object.assign(window, { sameDocument: true }));
const sameDocument = () => page.evaluate(() => "sameDocument" in window);
const top = (selector: string) => page.locator(selector).evaluate((el) => el.getBoundingClientRect().top);

it("opens pages and filters in place, and Back returns to where the page was scrolled", async () => {
  await page.goto(`${server.url}todos`);
  await markDocument();
  await page.evaluate(() => scrollTo(0, 500));
  await page.waitForTimeout(300); // the scroll position is remembered after a pause
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Review" }).click();
  await page.waitForURL(/\/review$/);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.locator("main").evaluate((el) => el === document.activeElement)).toBe(true);

  await page.getByRole("checkbox", { name: "Starred only" }).check();
  await page.waitForURL(/highlights=1/);
  expect(await page.getByRole("checkbox", { name: "Starred only" }).isChecked()).toBe(true);

  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/review" && !url.search.includes("highlights"));
  await page.goBack();
  await page.waitForURL(/\/todos$/);
  await page.waitForFunction(() => Math.abs(scrollY - 500) < 2);
  expect(await sameDocument()).toBe(true);
}, 30000);

it("shows a todo an agent adds without moving what's on screen, and highlights only it", async () => {
  await page.goto(`${server.url}todos`);
  await markDocument();
  await page.evaluate(() => scrollTo(0, 400));
  const onScreen = await page.evaluate(
    () => [...document.querySelectorAll("li[id]")].find((el) => el.getBoundingClientRect().top > 100)!.id,
  );
  const before = await top(`#${onScreen}`);

  const added = addTodo("Fresh from the agent");
  const row = page.locator(`li#todo-${added.id}`);
  await row.waitFor({ state: "attached" });
  expect(Math.abs((await top(`#${onScreen}`)) - before)).toBeLessThan(2);
  expect(await row.evaluate((el) => el.classList.contains("is-updated"))).toBe(true);
  expect(await page.locator(".is-updated").count()).toBe(1);
  expect(await page.locator("#live-status").textContent()).toBe("1 item updated.");
  expect(await sameDocument()).toBe(true);
}, 30000);

it("keeps an edit whose todo an agent deleted, and says the rest of the page waits", async () => {
  const todo = addTodo("Soon deleted");
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  const task = page.getByRole("textbox", { name: "Task", exact: true });
  await task.fill("Keep this text");
  ctx.vault.deleteTodo(todo.id);
  await page.locator("#change-notice").waitFor({ state: "visible" });
  expect(await page.locator("#change-text").textContent()).toContain("Your edit is kept here");
  expect(await task.textContent()).toBe("Keep this text");
}, 30000);

it("marks a goal agreed in place and stays with that goal", async () => {
  const goal = ctx.vault.createGoal({ title: "Ship the thing", cycle: "2026" });
  await page.goto(`${server.url}goals?view=reader&cycle=2026`);
  await markDocument();
  const section = page.locator(`#goal-${goal.slug}`);
  await section.getByRole("button", { name: `Mark agreed: ${goal.title}`, exact: true }).click();
  await page.waitForFunction(() => location.hash !== "");
  expect(new URL(page.url()).hash).toBe(`#goal-${goal.slug}`);
  expect(ctx.vault.getGoal(goal.slug)?.status).toBe("agreed");
  expect(await section.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  expect(await sameDocument()).toBe(true);
}, 30000);

it("keeps a goal status choice after focus has left the form, and doesn't announce unrelated changes", async () => {
  const goal = ctx.vault.createGoal({ title: "Status kept", cycle: "2026" });
  await page.goto(`${server.url}goals/${goal.slug}?edit=1`);
  const agreed = page.locator('.goal-edit input[name="status"][value="agreed"]');
  await agreed.check();
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.mouse.move(1, 1);
  const version = await page.locator("main").getAttribute("data-todo-version");
  addTodo("Unrelated to this goal");
  await page.waitForFunction((before) => document.querySelector("main")?.dataset.todoVersion !== before, version);
  expect(await agreed.isChecked()).toBe(true);
  expect(await page.locator("#live-status").textContent()).toBe("");
}, 30000);

it("keeps focus on a sidebar link when the todo count changes", async () => {
  await page.goto(`${server.url}goals`);
  const goals = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Goals/ });
  await goals.focus();
  const count = await page.locator(".nav-count").textContent();
  addTodo("Changes the count");
  await page.waitForFunction((before) => document.querySelector(".nav-count")?.textContent !== before, count);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("href"))).toBe("/goals");
}, 30000);

it("keeps unsaved text when Back only changes the #anchor", async () => {
  await page.goto(`${server.url}todos`);
  await markDocument();
  const input = page.getByRole("textbox", { name: "New todo", exact: true });
  await input.fill("Not saved yet");
  await page.evaluate(() => (location.hash = "somewhere"));
  await page.goBack();
  await page.waitForFunction(() => location.hash === "");
  await page.waitForTimeout(300);
  expect(await input.textContent()).toBe("Not saved yet");
  expect(await sameDocument()).toBe(true);
}, 30000);

it("highlights only the new todo after the search was widened", async () => {
  await page.goto(`${server.url}todos?q=${encodeURIComponent("Existing todo 2")}`);
  const search = page.locator("#todo-search");
  await search.fill("");
  await page.waitForURL((url) => !url.search.includes("q=Existing"));
  const hidden = ctx.vault.getTodos().find((t) => t.task === "Existing todo 5")!;
  await page.locator(`li#todo-${hidden.id}`).waitFor();
  const added = addTodo("After widening");
  await page.locator(`li#todo-${added.id}`).waitFor({ state: "attached" });
  expect(await page.locator(".is-updated").count()).toBe(1);
}, 30000);

it("doesn't let a slow save pull the window back from a page opened after it", async () => {
  await page.goto(`${server.url}todos`);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${server.url}todos`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await held;
    await route.continue();
  });
  try {
    await page.getByRole("textbox", { name: "New todo", exact: true }).fill("Saved slowly");
    await page.keyboard.press("Enter");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Review" }).click();
    await page.waitForURL(/\/review$/);
    release();
    await page.waitForFunction(() => !document.querySelector("form[data-busy]"));
    await page.waitForTimeout(300);
    expect(new URL(page.url()).pathname).toBe("/review");
  } finally {
    release();
    await page.unroute(`${server.url}todos`);
  }
}, 30000);

it("asks before Refresh when ready discards an edit that couldn't be updated", async () => {
  const todo = addTodo("Deleted under an edit");
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  const task = page.getByRole("textbox", { name: "Task", exact: true });
  await task.fill("Typed before the delete");
  ctx.vault.deleteTodo(todo.id);
  await page.locator("#change-notice").waitFor({ state: "visible" });
  let asked = false;
  page.once("dialog", (dialog) => {
    asked = true;
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Refresh when ready", exact: true }).click();
  expect(asked).toBe(true);
  expect(await task.textContent()).toBe("Typed before the delete");
}, 30000);

it("keeps the undo history of the box being typed in through a live update", async () => {
  await page.goto(`${server.url}todos`);
  const input = page.getByRole("textbox", { name: "New todo", exact: true });
  await input.click();
  await page.keyboard.type("first");
  await page.waitForTimeout(600); // a separate undo step
  await page.keyboard.type(" second");
  const added = addTodo("Arrives mid-sentence");
  await page.locator(`li#todo-${added.id}`).waitFor({ state: "attached" });
  await page.keyboard.press("Control+z");
  expect(await input.textContent()).not.toBe("first second");
  expect(await input.evaluate((el) => el === document.activeElement)).toBe(true);
}, 30000);

it("moves an unsaved todo edit to where the todo went when an agent closes it", async () => {
  const todo = addTodo("Closed by the agent");
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  const task = page.getByRole("textbox", { name: "Task", exact: true });
  await task.fill("Still typing");
  ctx.vault.updateTodo(todo.id, { status: "Done" }, "2026-09-28");
  await page.waitForFunction((id) => !!document.querySelector(`.todo-section.g-s-done #todo-${id}`), todo.id);
  expect(await task.textContent()).toBe("Still typing");
  expect(await page.locator(`.todo-section.g-s-done #todo-${todo.id} .todo-edit`).count()).toBe(1);
  expect(await page.locator("main .todo-edit").count()).toBe(1);
  // The sections are the same elements a fresh copy of the page has.
  const [live, fresh] = await page.evaluate(async () => {
    const outline = (root: ParentNode) =>
      [...root.querySelectorAll("main .todo-section")].map((el) => `${el.tagName}.${el.className}`).join(" ");
    const html = await (await fetch(location.href)).text();
    return [outline(document), outline(new DOMParser().parseFromString(html, "text/html"))];
  });
  expect(live).toBe(fresh);
}, 30000);

it("goes Back from a live filter to the unfiltered list", async () => {
  await page.goto(`${server.url}todos`);
  const all = await page.locator("#todo-results li.todo-row").count();
  // Picking a filter gets its own history entry.
  await page.locator('form[data-live-search] select[name="priority"]').selectOption("High");
  await page.waitForURL(/priority=High/);
  await page.waitForFunction(() => document.querySelectorAll("#todo-results li.todo-row").length === 0);
  await page.goBack();
  await page.waitForFunction((n) => document.querySelectorAll("#todo-results li.todo-row").length === n, all);
  expect(new URL(page.url()).search).toBe("");
}, 30000);

it("doesn't move focus into an untouched editor when the page updates", async () => {
  const todo = addTodo("Editor left alone");
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  const version = await page.locator("main").getAttribute("data-todo-version");
  addTodo("Something else");
  await page.waitForFunction((before) => document.querySelector("main")?.dataset.todoVersion !== before, version);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
}, 30000);

it("ignores a click on a goal an agent changed a moment ago", async () => {
  const goal = ctx.vault.createGoal({ title: "Changed under the pointer", cycle: "2026" });
  await page.goto(`${server.url}goals?view=reader&cycle=2026`);
  const section = page.locator(`#goal-${goal.slug}`);
  const agree = section.getByRole("button", { name: `Mark agreed: ${goal.title}`, exact: true });
  await agree.hover();
  ctx.vault.saveGoal(goal.slug, { ...goal, description: "Rewritten by the agent." });
  await page.locator(`#goal-${goal.slug}.is-updated`).waitFor({ state: "attached" });
  await agree.click();
  await page.locator("#live-status").getByText("That just changed. Check it, then try again.").waitFor({
    state: "attached",
  });
  expect(ctx.vault.getGoal(goal.slug)?.status).toBe("draft");
  await page.waitForTimeout(1100);
  await agree.click();
  await page.waitForFunction(() => location.hash !== "");
  expect(ctx.vault.getGoal(goal.slug)?.status).toBe("agreed");
}, 30000);
