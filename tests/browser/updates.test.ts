import { afterAll, beforeAll, beforeEach, expect, it, mock } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { devFetch } from "../../src/dev-server";
import type { UpdateSnapshot } from "../../src/electron/updates";
import { createTestContext } from "../helpers/test-vault";

// The main process owns updates. Here a stand-in updater lets each test set the state the page sees.
const fake = {
  state: { status: "current", checkedAt: "2026-11-05T14:14:00.000Z" } as UpdateSnapshot,
  snapshot: () => fake.state,
  check: mock(async () => {}),
  restart: mock(() => false),
};
const ctx = { ...createTestContext(), updates: fake };
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: devFetch(ctx) });
const plain = createTestContext();
const plainServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: devFetch(plain) });
let browser: Browser;
let page: Page;
let dialogs: string[];

beforeAll(async () => {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(5000);
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
}, 30000);

beforeEach(() => {
  dialogs = [];
  fake.state = { status: "current", checkedAt: "2026-11-05T14:14:00.000Z" };
  fake.check.mockReset();
  fake.restart.mockReset();
  fake.restart.mockImplementation(() => false);
});

afterAll(async () => {
  await browser?.close();
  server.stop(true);
  plainServer.stop(true);
  ctx.cleanup();
  plain.cleanup();
});

const updateButton = () => page.locator("#update-btn");
const live = () => page.locator("#update-live");

it("says plainly that updates are unavailable outside the installed app", async () => {
  await page.goto(plainServer.url.href);
  expect(await page.locator(".version-number").textContent()).toMatch(/^\d+\.\d+\.\d+$/);
  await updateButton().click();
  await page.getByRole("heading", { name: "Updates unavailable", exact: true }).waitFor();
  expect(await updateButton().getAttribute("aria-expanded")).toBe("true");
  await page.keyboard.press("Escape");
  expect(await page.locator("#update-pop").isHidden()).toBe(true);
  expect(await updateButton().evaluate((el) => document.activeElement === el)).toBe(true);
  await page.goto(`${plainServer.url}settings`);
  expect(await page.locator("#settings-updates").textContent()).toContain("Not available in this copy");
  expect(await page.locator("#settings-updates button").count()).toBe(0);
}, 30000);

it("checks only when asked, shows checking, and announces the result", async () => {
  fake.check.mockImplementation(async () => {
    fake.state = { status: "checking" };
  });
  await page.goto(server.url.href);
  expect(await updateButton().getAttribute("aria-label")).toContain("Check for updates. Up to date, checked");
  expect(fake.check).not.toHaveBeenCalled();
  await updateButton().click();
  expect(fake.check).toHaveBeenCalledTimes(1);
  await page.waitForFunction(() => document.getElementById("update-btn")?.getAttribute("aria-disabled") === "true");
  expect(await updateButton().getAttribute("aria-label")).toBe("Checking for updates…");
  await updateButton().click({ force: true });
  expect(fake.check).toHaveBeenCalledTimes(1);
  fake.state = { status: "current", checkedAt: "2026-11-05T15:00:00.000Z" };
  await page.waitForFunction(() => document.getElementById("update-btn")?.dataset.icon === "check");
  await page.waitForFunction(() => document.getElementById("update-live")?.textContent === "ToDo is up to date.");
  expect(dialogs).toEqual([]);
}, 30000);

it("shows download progress on request without announcing it", async () => {
  fake.state = { status: "downloading", version: "1.4.0", percent: 42 };
  await page.goto(server.url.href);
  expect(await updateButton().getAttribute("data-icon")).toBe("download");
  expect(await updateButton().getAttribute("aria-label")).toBe("Downloading ToDo 1.4.0. Show details.");
  await updateButton().click();
  const progress = page.getByRole("progressbar", { name: "Downloading ToDo 1.4.0" });
  expect(await progress.getAttribute("value")).toBe("42");
  fake.state = { status: "downloading", version: "1.4.0", percent: 60 };
  await page.waitForFunction(
    () => (document.querySelector("#update-pop progress") as HTMLProgressElement)?.value === 60,
  );
  expect(await live().textContent()).toBe("");
  fake.state = { status: "ready", version: "1.4.0" };
  await page.getByRole("button", { name: "Restart to update", exact: true }).waitFor();
  await page.waitForFunction(() => document.getElementById("update-live")?.textContent?.includes("1.4.0 is ready"));
  expect(dialogs).toEqual([]);
  expect(fake.restart).not.toHaveBeenCalled();
}, 30000);

it("restarts only after an explicit choice, and warns first about unsaved edits", async () => {
  fake.state = { status: "ready", version: "1.4.0" };
  fake.restart.mockImplementation(() => {
    fake.state = { status: "restarting", version: "1.4.0" };
    return true;
  });
  const todo = ctx.vault.addTodo({ task: "Unsaved", priority: null, status: "Open", tags: [], goals: [], notes: "" });
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  await updateButton().click();
  await page.getByRole("button", { name: "Restart to update", exact: true }).waitFor();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  expect(await page.locator("#update-pop").isHidden()).toBe(true);

  // An edit made while the panel is open still gets a warning before anything restarts.
  await updateButton().click();
  await page.getByRole("textbox", { name: "Task", exact: true }).evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.type(" changed");
  expect(await page.locator("#update-pop").isHidden()).toBe(false);
  await page.getByRole("button", { name: "Restart to update", exact: true }).click();
  expect(fake.restart).not.toHaveBeenCalled();
  expect(await page.locator(".update-warn").textContent()).toContain("unsaved changes");
  await page.getByRole("button", { name: "Restart and discard changes", exact: true }).click();
  expect(fake.restart).toHaveBeenCalledTimes(1);
  await page.waitForFunction(() => document.getElementById("update-btn")?.getAttribute("aria-disabled") === "true");
  expect(await live().textContent()).toBe("Restarting ToDo.");
  expect(dialogs).toEqual([]);
}, 30000);

it("does not warn about the unsent ledger entry, which is kept as a draft", async () => {
  fake.state = { status: "ready", version: "1.4.0" };
  await page.goto(server.url.href);
  await page.locator("#capture").fill("Half-written entry");
  await updateButton().click();
  await page.getByRole("button", { name: "Restart to update", exact: true }).waitFor();
  expect(await page.locator(".update-warn").count()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("draft:today"))).toBe("Half-written entry");
  await page.evaluate(() => localStorage.removeItem("draft:today"));
}, 30000);

it("refreshes the state when a restart is refused", async () => {
  fake.state = { status: "ready", version: "1.4.0" };
  await page.goto(`${server.url}settings`);
  await page.locator("#settings-updates").getByRole("button", { name: "Restart to update", exact: true }).waitFor();
  fake.state = { status: "error", version: "1.4.0", message: "ToDo 1.4.0 didn't download." };
  await page.locator("#settings-updates").getByRole("button", { name: "Restart to update", exact: true }).click();
  expect(fake.restart).toHaveBeenCalledTimes(1);
  await page.locator("#settings-updates").getByRole("button", { name: "Try again", exact: true }).waitFor();
  expect(await page.locator("#settings-updates .is-error").textContent()).toBe("ToDo 1.4.0 didn't download.");
}, 30000);

it("explains errors on click or tap, not only on hover, and retries", async () => {
  fake.state = { status: "error", message: "Couldn't check for updates." };
  await page.goto(server.url.href);
  expect(await live().textContent()).toBe("");
  await updateButton().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Couldn't check for updates.", exact: true }).waitFor();
  fake.check.mockImplementation(async () => {
    fake.state = { status: "current", checkedAt: "2026-11-05T15:00:00.000Z" };
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  expect(fake.check).toHaveBeenCalledTimes(1);
  await page.locator("#update-pop").waitFor({ state: "hidden" });
  expect(await updateButton().evaluate((el) => document.activeElement === el)).toBe(true);
}, 30000);

it("keeps the version and update icon on one line, at any width, with motion reduced", async () => {
  fake.state = { status: "checking" };
  for (const width of [1280, 820, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(server.url.href);
    const row = (await page.locator("#version-row").boundingBox())!;
    const button = (await updateButton().boundingBox())!;
    expect(row.height).toBeLessThan(40);
    expect(button.width).toBeGreaterThanOrEqual(24);
    expect(button.x + button.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator("#update-btn .update-refresh").evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 900 });
}, 30000);
