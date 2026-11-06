import { afterAll, beforeAll, beforeEach, expect, it } from "bun:test";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { devFetch } from "../../src/dev-server";
import { createTestContext } from "../helpers/test-vault";

// The formatting strip stays hidden until asked for; typed Markdown works either way.
const ctx = createTestContext();
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: devFetch(ctx) });
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(5000);
}, 30000);

beforeEach(async () => {
  await page.goto(server.url.href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}, 30000);

afterAll(async () => {
  await browser?.close();
  server.stop(true);
  ctx.cleanup();
}, 30000);

const capture = () => page.locator("#capture");
const saved = () => page.locator("#capture").evaluate((el) => (el.previousElementSibling as HTMLTextAreaElement).value);
const isFocused = (locator: Locator) => locator.evaluate((el) => document.activeElement === el);

async function typeInto(editor: Locator, text: string) {
  await editor.click();
  await page.keyboard.type(text);
}

it("hides formatting behind the Aa toggle, remembers it, and keeps the selection", async () => {
  const toggle = page.getByRole("button", { name: "Formatting", exact: true });
  expect(await toggle.getAttribute("aria-expanded")).toBe("false");
  expect(await toggle.getAttribute("aria-keyshortcuts")).toBe("Control+Shift+X");
  expect(await page.getByRole("button", { name: "Bold", exact: true }).count()).toBe(0);
  expect(await toggle.evaluate((el) => el.closest(".composer-bar") !== null)).toBe(true);

  await capture().fill("Keep this selected");
  await capture().press("Control+a");
  await capture().press("Control+Shift+X");
  expect(await toggle.getAttribute("aria-expanded")).toBe("true");
  expect(await isFocused(capture())).toBe(true);
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  expect(await capture().locator("strong, b").textContent()).toBe("Keep this selected");

  await page.reload();
  expect(await page.getByRole("button", { name: "Formatting", exact: true }).getAttribute("aria-expanded")).toBe(
    "true",
  );
  await page.getByRole("button", { name: "Formatting", exact: true }).click();
  expect(await page.getByRole("button", { name: "Bold", exact: true }).count()).toBe(0);
}, 30000);

it("returns focus to the text when the strip closes around it", async () => {
  await capture().fill("Text");
  await capture().press("Control+Shift+X");
  await capture().press("Tab");
  expect(await isFocused(page.getByRole("button", { name: "Bold", exact: true }))).toBe(true);
  await page.keyboard.press("Control+Shift+X");
  expect(await isFocused(capture())).toBe(true);
  expect(await page.getByRole("button", { name: "Formatting", exact: true }).getAttribute("aria-expanded")).toBe(
    "false",
  );
}, 30000);

it("shows the format at the cursor on the toggle", async () => {
  const face = page.locator(".lens-face").first();
  expect(await face.textContent()).toBe("Aa");
  await typeInto(capture(), "# Title");
  expect(await face.textContent()).toBe("H1");
}, 30000);

it("turns typed list and heading markers into structure", async () => {
  await typeInto(capture(), "* one");
  expect(await capture().locator("ul li").textContent()).toBe("one");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("3. third");
  expect(await capture().locator("ol").getAttribute("start")).toBe("3");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## Sub");
  expect(await capture().locator("h4").textContent()).toBe("Sub");
  expect(await saved()).toBe("- one\n\n3. third\n\n## Sub");
}, 30000);

it("puts typed list and heading markers back on Backspace right after", async () => {
  await typeInto(capture(), "- ");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("not a list");
  expect(await capture().locator("ul").count()).toBe(0);
  expect(await saved()).toBe("\\- not a list");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## ");
  await page.keyboard.press("Backspace");
  expect(await capture().locator("h4").count()).toBe(0);
  expect(await saved()).toBe("\\- not a list\n\n\\## ");
}, 30000);

it("turns `code` into inline code and continues typing outside it", async () => {
  await typeInto(capture(), "Run `npm test` now");
  expect(await capture().innerHTML()).toContain("<code>npm test</code>");
  expect(await capture().locator("code").textContent()).toBe("npm test");
  expect(await saved()).toBe("Run `npm test` now");
  await page.keyboard.type("\u200B");
  expect(await saved()).toBe("Run `npm test` now\u200B");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("A `b`");
  await page.keyboard.press("Backspace");
  expect(await capture().locator("code").count()).toBe(0);
  expect(await saved()).toBe("A \\`b\\`");
}, 30000);

it("builds a code block from ``` and Enter, keeps its text literal, and leaves it on an empty last line", async () => {
  await typeInto(capture(), "```sh");
  await page.keyboard.press("Enter");
  await page.keyboard.type("echo **not bold** #notatag");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- not a list");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("After #real");
  expect(await saved()).toBe("```sh\necho **not bold** #notatag\n- not a list\n```\n\nAfter #real");
  expect(await capture().locator("pre .pill").count()).toBe(0);
  await page.getByRole("button", { name: "Add to ledger", exact: true }).click();
  await page.locator(".entry-text pre").waitFor();
  const entry = ctx.vault.getEntries("2026-09-28").at(-1)!;
  expect(entry.text).toBe("```sh\necho **not bold** #notatag\n- not a list\n```\n\nAfter #real");
  expect(entry.tags).toEqual(["real"]);
}, 30000);

it("undoes leaving a code block without losing its text", async () => {
  await typeInto(capture(), "```");
  await page.keyboard.press("Enter");
  await page.keyboard.type("keep this code");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+z");
  expect(await capture().locator("pre").textContent()).toContain("keep this code");
  expect(
    await capture().evaluate((editor) => {
      const selection = getSelection();
      return editor.querySelector("pre")!.contains(selection!.anchorNode);
    }),
  ).toBe(true);
}, 30000);

it("pastes into a code block as literal text", async () => {
  await typeInto(capture(), "```");
  await page.keyboard.press("Enter");
  await capture().evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "# not a heading\n**x** <b>y</b>");
    data.setData("text/html", "<h1>not a heading</h1><script>bad()</script>");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  expect(await capture().locator("h1, h3, script").count()).toBe(0);
  expect(await saved()).toBe("```\n# not a heading\n**x** <b>y</b>\n```");
}, 30000);

it("preserves pasted zero-width spaces when saving prose and copying code", async () => {
  const literal = "left\u200Bright";
  await capture().focus();
  await capture().evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, literal);
  expect(await saved()).toBe(literal);
  await page.getByRole("button", { name: "Add to ledger", exact: true }).click();
  await page.locator(".entry-text").filter({ hasText: literal }).waitFor();
  expect(ctx.vault.getEntries("2026-09-28").at(-1)?.text).toBe(literal);

  await typeInto(capture(), "```");
  await page.keyboard.press("Enter");
  const copied = await capture().evaluate((editor, text) => {
    const pasted = new DataTransfer();
    pasted.setData("text/plain", text);
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: pasted, bubbles: true, cancelable: true }));
    getSelection()!.selectAllChildren(editor.querySelector("pre")!);
    const data = new DataTransfer();
    editor.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData("text/plain");
  }, literal);
  expect(copied).toBe(literal);
  expect(await saved()).toBe(`\`\`\`\n${literal}\n\`\`\``);
}, 30000);

it("keeps pasted code whitespace through journal submission and reload", async () => {
  const literal = "value  \n   \nnext";
  await typeInto(capture(), "```");
  await page.keyboard.press("Enter");
  await capture().evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, literal);
  const markdown = `\`\`\`\n${literal}\n\`\`\``;
  expect(await saved()).toBe(markdown);
  await page.getByRole("button", { name: "Add to ledger", exact: true }).click();
  await page.locator(".entry-text pre").waitFor();
  expect(ctx.vault.getEntries("2026-09-28").at(-1)?.text).toBe(markdown);
  await page.reload();
  expect(await page.locator(".entry-text pre").last().textContent()).toBe(literal);
}, 30000);

it("toggles a code block from the strip and copies code as typed", async () => {
  await typeInto(capture(), "a *b*");
  await capture().press("Control+Shift+X");
  const codeBlock = page.getByRole("button", { name: "Code block", exact: true });
  await codeBlock.click();
  expect(await capture().locator("pre").textContent()).toBe("a *b*");
  expect(await codeBlock.getAttribute("aria-pressed")).toBe("true");
  expect(await page.getByRole("button", { name: "Bold", exact: true }).getAttribute("aria-disabled")).toBe("true");
  expect(await page.locator(".lens-face").first().textContent()).toBe("{ }");
  expect(await saved()).toBe("```\na *b*\n```");

  const copied = await capture().evaluate((editor) => {
    getSelection()!.selectAllChildren(editor.querySelector("pre")!);
    const data = new DataTransfer();
    editor.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData("text/plain");
  });
  expect(copied).toBe("a *b*");

  await codeBlock.click();
  expect(await capture().locator("pre, code").count()).toBe(0);
  expect(await saved()).toBe("a \\*b\\*");
}, 30000);

it("opens saved code blocks in visual mode and round-trips them unchanged", async () => {
  const body = "Plan\n\n```ts\nconst x = `y`; // **literal** [[ link ]]\n```";
  const goal = ctx.vault.createGoal({ title: "Code goal", cycle: "2026", body });
  await page.goto(`${server.url}goals/${goal.slug}?edit=1`);
  const editor = page.getByRole("textbox", { name: "Success criteria, progress notes, self-assessment", exact: true });
  expect(await editor.locator("pre").count()).toBe(1);
  expect(await editor.evaluate((el) => el.classList.contains("is-rich"))).toBe(true);
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await page.getByRole("button", { name: "Save goal", exact: true }).waitFor({ state: "hidden" });
  expect(ctx.vault.getGoal(goal.slug)?.body).toBe(body);
}, 30000);

it("applies typed Markdown in todo notes and keeps source mode literal", async () => {
  const todo = ctx.vault.addTodo({
    task: "Typed notes",
    priority: null,
    status: "Open",
    tags: [],
    goals: [],
    notes: "",
  });
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  const notes = page.getByRole("textbox", { name: "Notes", exact: true });
  await typeInto(notes, "1. step");
  expect(await notes.locator("ol li").textContent()).toBe("step");
  await notes.press("Control+Shift+X");
  await notes.locator("..").getByRole("button", { name: "Markdown source", exact: true }).click();
  await notes.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("* raw `x`");
  expect(await notes.locator("ul, code").count()).toBe(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).waitFor({ state: "hidden" });
  expect(ctx.vault.getTodo(todo.id)?.notes).toBe("1. step\n* raw `x`");
}, 30000);

it("keeps the composer bar on one line at narrow widths with a compact, reachable Add button", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const add = page.getByRole("button", { name: "Add to ledger", exact: true });
  const box = (await add.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeLessThan(34);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
}, 30000);
