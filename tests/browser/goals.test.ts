import { afterAll, beforeAll, expect, it } from "bun:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { devFetch } from "../../src/dev-server";
import { createTestContext } from "../helpers/test-vault";

const ctx = createTestContext();
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: devFetch(ctx) });
let browser: Browser;
let context: BrowserContext;
let page: Page;

const long = "Improve, automate, and document workflows that reduce manual effort and increase consistency. ".repeat(4);
const goals = Array.from({ length: 6 }, (_, i) =>
  ctx.vault.createGoal({
    title: `Goal number ${i + 1}`,
    cycle: "26-27",
    status: "agreed",
    description: long,
    meeting: `Meets ${i + 1}.`,
    exceeding: `Exceeds ${i + 1}.`,
    notes: "Talking point.",
  }),
);

beforeAll(async () => {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.url.origin });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
}, 30000);

afterAll(async () => {
  await browser?.close();
  server.stop(true);
  ctx.cleanup();
});

/** Top of an element relative to the window. */
const top = (id: string) => page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().top);

/** The goal sits just under the sticky view switch, not hidden behind it and not far down the page. */
async function expectAtTop(id: string) {
  const bar = await page.locator(".view-bar").evaluate((el) => el.getBoundingClientRect().bottom);
  const y = await top(id);
  expect(y).toBeGreaterThanOrEqual(bar - 1);
  expect(y).toBeLessThan(120);
}

it("keeps the view switch on screen and lands on the same goal both ways, then opens Timeline next time", async () => {
  // Short enough that the timeline can scroll its third row to the top.
  await page.setViewportSize({ width: 1280, height: 480 });
  const target = `goal-${goals[2].slug}`;
  await page.goto(`${server.url}goals?view=reader&cycle=26-27`);
  await page.locator(`#${target}`).evaluate((el) => el.scrollIntoView({ block: "start" }));
  const timelineLink = page.getByRole("link", { name: "Timeline", exact: true });
  expect(await timelineLink.isVisible()).toBe(true);
  const box = await timelineLink.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(60);
  await timelineLink.click();
  await page.waitForURL(/view=timeline/);
  expect(new URL(page.url()).hash).toBe(`#${target}`);
  await expectAtTop(target);

  await page.getByRole("link", { name: "Reader", exact: true }).click();
  await page.waitForURL(/view=reader/);
  expect(new URL(page.url()).hash).toBe(`#${target}`);
  await expectAtTop(target);

  await page.goto(`${server.url}goals?view=timeline&cycle=26-27`);
  await page.goto(`${server.url}goals`);
  expect(await page.locator(".map-row").count()).toBe(6);
  await page.setViewportSize({ width: 1280, height: 900 });
}, 30000);

it("unfolds a timeline row from the keyboard", async () => {
  await page.goto(`${server.url}goals?view=timeline&cycle=26-27`);
  const name = page.getByRole("button", { name: goals[0].title, exact: true });
  await name.focus();
  await page.keyboard.press("Enter");
  expect(await name.getAttribute("aria-expanded")).toBe("true");
  expect(await page.locator(`#detail-${goals[0].slug}`).isVisible()).toBe(true);
  expect(page.url()).not.toContain("open=");
  await page.keyboard.press("Enter");
  expect(await page.locator(`#detail-${goals[0].slug}`).isVisible()).toBe(false);
}, 30000);

it("copies a goal for FCP as plain text", async () => {
  await page.goto(`${server.url}goals?view=reader&cycle=26-27`);
  const section = page.locator(`#goal-${goals[1].slug}`);
  await section.getByRole("button", { name: "Copy for FCP", exact: true }).click();
  await section.getByText("Copied.", { exact: true }).waitFor();
  // The Windows clipboard hands text back with CRLF line ends.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(
    `Goal name\nGoal number 2\n\nDescription\n${long.trim()}\n\nMeeting expectations\nMeets 2.\n\nExceeding expectations\nExceeds 2.`,
  );
}, 30000);

it("edits a goal in place and comes back to it", async () => {
  const goal = goals[3];
  await page.goto(`${server.url}goals?view=reader&cycle=26-27`);
  await page.locator(`#goal-${goal.slug}`).getByRole("link", { name: "Edit", exact: true }).click();
  await page.waitForURL(/edit=/);
  const meeting = page.getByLabel("Meeting expectations", { exact: true });
  await meeting.fill("Meets, rewritten.");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await page.waitForURL((url) => !url.search.includes("edit=") && url.hash === `#goal-${goal.slug}`);
  expect(ctx.vault.getGoal(goal.slug)?.meeting).toBe("Meets, rewritten.");
  expect(await page.locator(`#goal-${goal.slug}`).textContent()).toContain("Meets, rewritten.");
  const y = await top(`goal-${goal.slug}`);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(y).toBeLessThan(200);
}, 30000);

it("fits the reader in a phone-width window", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["goals?view=reader&cycle=26-27", `goals?view=reader&cycle=26-27&edit=${goals[0].slug}`]) {
    await page.goto(`${server.url}${path}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto(`${server.url}goals?view=timeline&cycle=26-27`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
}, 30000);

it("opens and cancels an activity's notes editor over and over without getting stuck", async () => {
  ctx.vault.createGoal({
    title: "Technical expertise",
    cycle: "26-27",
    kind: "activity",
    status: "agreed",
    description: "Learn.",
  });
  await page.goto(`${server.url}goals?view=reader&cycle=26-27`);
  for (let round = 1; round <= 4; round++) {
    await page.getByRole("link", { name: "Add talking points" }).first().click();
    await page.waitForURL(/edit=technical-expertise/);
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await page.waitForURL((url) => !url.search.includes("edit="));
  }
});

it("copies a reference's address when it can't open here, and opens web ones in a new window", async () => {
  ctx.vault.addEntries("2026-09-28", ["Shipped the reference work"], {
    tags: [],
    goals: [],
    minutes: null,
    isHighlight: false,
    time: null,
    references: [
      { label: "ToDo thread", url: "t3-thread://v2/a/b" },
      { label: "Notes", url: "https://example.com/notes" },
    ],
  });
  await page.goto(`${server.url}?date=2026-09-28`);
  const thread = page.getByRole("button", { name: "ToDo thread", exact: true });
  await thread.click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("t3-thread://v2/a/b");
  await page.getByRole("button", { name: "ToDo thread", exact: true }).waitFor({ timeout: 3000 });
  const notes = page.getByRole("link", { name: "Notes", exact: true });
  expect(await notes.getAttribute("target")).toBe("_blank");
  expect(await notes.getAttribute("href")).toBe("https://example.com/notes");
}, 30000);

it("copies an inline thread link's address by click or keyboard, then shows its label again", async () => {
  ctx.vault.addEntries("2026-09-28", ["Wrapped up, see [the **thread**](t3-thread://v2/inline)."], {
    tags: [],
    goals: [],
    minutes: null,
    isHighlight: false,
    time: null,
  });
  await page.goto(`${server.url}?date=2026-09-28`);
  await page.evaluate(() => navigator.clipboard.writeText(""));
  const link = page.getByRole("button", { name: "the thread", exact: true });
  await link.click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("t3-thread://v2/inline");
  // Its own markup comes back.
  await page.locator(".local-link strong").waitFor({ timeout: 3000 });

  await page.evaluate(() => navigator.clipboard.writeText(""));
  await link.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(async () => (await navigator.clipboard.readText()) === "t3-thread://v2/inline");
}, 30000);
