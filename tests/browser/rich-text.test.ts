import { afterAll, beforeAll, expect, it } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { devFetch } from "../../src/dev-server";
import { createTestContext } from "../helpers/test-vault";

const ctx = createTestContext();
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: devFetch(ctx) });
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(5000);
}, 30000);

it("round-trips formatting and treats pasted HTML as text structure, not executable content", async () => {
  await page.goto(server.url.href);
  const result = await page.evaluate(async () => {
    const moduleUrl = "/rich-text.js";
    const { editorMarkdown, renderEntryMarkdown } = await import(moduleUrl);
    const content = document.createElement("template");
    content.innerHTML =
      '<h2>Subheading</h2><blockquote><p>First quoted paragraph</p><p>Second quoted paragraph</p></blockquote><p><strong>Bold <em>and italic</em></strong></p><p>Literal * _ \\path</p><ol start="3"><li>Parent<ul><li>Child</li></ul></li></ol><script>bad()</script><img src=x onerror="bad()">';
    const markdown = editorMarkdown(content.content);
    const rendered = document.createElement("div");
    rendered.innerHTML = renderEntryMarkdown(markdown);
    return { markdown, html: rendered.innerHTML, again: editorMarkdown(rendered) };
  });
  expect(result.html).toContain("<strong>Bold <em>and italic</em></strong>");
  expect(result.markdown).toContain("## Subheading\n\nFirst quoted paragraph\n\nSecond quoted paragraph");
  expect(result.html).toContain("Literal * _ \\path");
  expect(result.html).not.toContain("script");
  expect(result.html).not.toContain("<img");
  expect(result.again).toBe(result.markdown);
});

it("round-trips adjacent formatting and boundary backticks in inline code", async () => {
  await page.goto(server.url.href);
  const result = await page.evaluate(async () => {
    const url = "/rich-text.js";
    const { editorMarkdown, renderEntryMarkdown } = await import(url);
    const source = document.createElement("div");
    source.innerHTML = "<p><strong>First</strong><strong>Second</strong></p>";
    const adjacent = renderEntryMarkdown(editorMarkdown(source));
    const codes = ["`", "``", "`start", "end`", " both "].map((text) => {
      source.replaceChildren(document.createElement("code"));
      source.firstChild!.textContent = text;
      const rendered = document.createElement("div");
      rendered.innerHTML = renderEntryMarkdown(editorMarkdown(source));
      return rendered.querySelector("code")?.textContent;
    });
    return { adjacent, codes };
  });
  expect(result.adjacent).toBe("<p><strong>First</strong><strong>Second</strong></p>");
  expect(result.codes).toEqual(["`", "``", "`start", "end`", " both "]);
});

it("keeps formatted tag metadata and ignores clipboard token attributes", async () => {
  await page.goto(server.url.href);
  const editor = page.locator("#capture");
  await editor.fill("");
  await editor.pressSequentially("Tagged #ops ");
  await editor.press("Control+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Add to ledger", exact: true }).click();
  await page.locator(".entry-text").filter({ hasText: "#ops" }).waitFor();
  expect(ctx.vault.getEntries("2026-09-28").at(-1)?.tags).toContain("ops");
  await page.locator("#capture").focus();
  await page.locator("#capture").evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/html", '<span data-token="#different">Visible text</span>');
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  expect(await page.locator("#capture").textContent()).toBe("Visible text");
}, 30000);

it("edits goal descriptions and todo notes with the same formatting and keeps real subtasks", async () => {
  const goal = ctx.vault.createGoal({ title: "Editor goal", cycle: "2026", body: "" });
  await page.goto(`${server.url}goals/${goal.slug}?edit=1`);
  const goalEditor = page.getByRole("textbox", {
    name: "Success criteria, progress notes, self-assessment",
    exact: true,
  });
  await goalEditor.fill("Rich goal description");
  await goalEditor.press("Control+a");
  await goalEditor.locator("..").getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await page.locator(".prose strong").waitFor();
  expect(ctx.vault.getGoal(goal.slug)?.body).toBe("**Rich goal description**");

  const todo = ctx.vault.addTodo({
    task: "Rich notes todo",
    priority: null,
    status: "Open",
    tags: [],
    goals: [],
    notes: "",
  });
  const subtask = ctx.vault.addSubtask(todo.id, "Actual subtask")!;
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  const notesEditor = page.getByRole("textbox", { name: "Notes", exact: true });
  await notesEditor.focus();
  await notesEditor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData(
      "text/html",
      "<h3>Plan</h3><p>First</p><p>Second</p><ul><li>Parent<ul><li>Child</li></ul></li></ul>",
    );
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".todo-notes h3").waitFor();
  const saved = ctx.vault.getTodo(todo.id)!;
  expect(saved.notes).toContain("First\n\nSecond");
  expect(saved.notes).toContain("  - Child");
  expect(saved.subtasks[0].id).toBe(subtask.id);
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  expect(await page.getByRole("textbox", { name: "Notes", exact: true }).locator("h3").textContent()).toBe("Plan");
}, 30000);

it("restores rich drafts and keeps unsupported Markdown editable without rewriting it", async () => {
  await page.goto(server.url.href);
  await page.locator("#capture").fill("Draft to keep");
  await page.locator("#capture").press("Control+a");
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page.reload();
  expect(await page.locator("#capture em").textContent()).toBe("Draft to keep");
  await page.evaluate(() => localStorage.removeItem("draft:today"));
  const body = "```\n**literal** [[ link with spaces ]]\n```";
  const goal = ctx.vault.createGoal({ title: "Literal goal", cycle: "2026", body });
  await page.goto(`${server.url}goals/${goal.slug}?edit=1`);
  expect(await page.getByRole("button", { name: "Markdown source", exact: true }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await page.getByRole("button", { name: "Save goal", exact: true }).waitFor({ state: "hidden" });
  expect(ctx.vault.getGoal(goal.slug)?.body).toBe(body);
}, 30000);

afterAll(async () => {
  await browser?.close();
  server.stop(true);
  ctx.cleanup();
});

it("formats a journal entry, supports undo, saves Markdown, and restores its formatting", async () => {
  await page.goto(server.url.href);
  const editor = page.locator("#capture");
  await editor.fill("An important update");
  await editor.press("Control+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  expect(await editor.locator("strong, b").textContent()).toBe("An important update");
  await editor.press("Control+z");
  expect(await editor.locator("strong, b").count()).toBe(0);
  await editor.press("Control+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Add to ledger", exact: true }).click();
  await page.locator(".entry-text strong").waitFor();
  expect(ctx.vault.getEntries("2026-09-28").find((entry) => entry.text.includes("An important update"))?.text).toBe(
    "**An important update**",
  );
  await page.reload();
  expect(await page.locator(".entry-text strong").filter({ hasText: "An important update" }).textContent()).toBe(
    "An important update",
  );
}, 30000);

it("keeps tag and goal suggestions in journal entries and supports keyboard toolbar navigation", async () => {
  const goal = ctx.vault.createGoal({ title: "Keyboard goal", cycle: "2026", body: "" });
  await page.goto(server.url.href);
  const editor = page.locator("#capture");
  await editor.fill("Tagged journal ");
  await editor.press("End");
  await editor.pressSequentially("#browser ");
  expect(await editor.locator(".pill-tag").count()).toBe(1);
  await editor.pressSequentially("/key");
  await page.locator("#suggest [role=option]").first().waitFor();
  await editor.press("Enter");
  expect(await editor.locator(".pill-goal").count()).toBe(1);
  await editor.press("Tab");
  expect(
    await page
      .getByRole("button", { name: "Bold", exact: true })
      .evaluate((button) => document.activeElement === button),
  ).toBe(true);
  await page.keyboard.press("ArrowRight");
  expect(
    await page
      .getByRole("button", { name: "Italic", exact: true })
      .evaluate((button) => document.activeElement === button),
  ).toBe(true);
  await page.keyboard.press("Escape");
  expect(await editor.evaluate((element) => document.activeElement === element)).toBe(true);
  await page.getByRole("button", { name: "Add to ledger", exact: true }).click();
  await page.locator(".entry-text").filter({ hasText: "Tagged journal" }).waitFor();
  const entry = ctx.vault.getEntries("2026-09-28").find((entry) => entry.text.includes("Tagged journal"))!;
  expect(entry.tags).toContain("browser");
  expect(entry.goals).toContain(goal.slug);
}, 30000);

it("keeps the editor and formatting controls inside a narrow viewport", async () => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${server.url}goals`);
  const editor = page.getByRole("textbox", { name: "What does success look like?", exact: true });
  await editor.fill("A readable goal description");
  const box = editor.locator("..");
  const bounds = await box.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  for (const button of await box.getByRole("button").all()) {
    const rect = await button.boundingBox();
    expect(rect!.width).toBeGreaterThanOrEqual(24);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}, 30000);

it("applies headings, lists and inline code through the keyboard and toolbar", async () => {
  await page.goto(`${server.url}goals`);
  const editor = page.getByRole("textbox", { name: "What does success look like?", exact: true });
  const box = editor.locator("..");
  await editor.fill("A heading");
  await editor.press("Control+Alt+1");
  expect(await editor.locator("h3").textContent()).toBe("A heading");
  await box.getByRole("button", { name: "Normal text", exact: true }).click();
  await editor.press("Control+Shift+8");
  expect(await editor.locator("ul li").textContent()).toBe("A heading");
  await box.getByRole("button", { name: "Bulleted list", exact: true }).click();
  await editor.press("Control+a");
  await editor.press("Control+e");
  expect(await editor.locator("code").textContent()).toBe("A heading");
  await editor.locator("code").click();
  expect(await box.getByRole("button", { name: "Bold", exact: true }).getAttribute("aria-disabled")).toBe("true");
  await editor.press("Control+b");
  expect(await editor.locator("strong, b").count()).toBe(0);
}, 30000);

it("keeps unsaved multiline edits when Escape is pressed", async () => {
  const todo = ctx.vault.addTodo({
    task: "Escape safety",
    priority: null,
    status: "Open",
    tags: [],
    goals: [],
    notes: "Original",
  });
  await page.goto(`${server.url}todos?edit=${todo.id}`);
  const editor = page.getByRole("textbox", { name: "Notes", exact: true });
  await editor.fill("Changes to keep");
  await editor.press("Escape");
  expect(await editor.isVisible()).toBe(true);
  expect(await editor.textContent()).toBe("Changes to keep");
  expect(ctx.vault.getTodo(todo.id)?.notes).toBe("Original");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).waitFor({ state: "hidden" });
  expect(ctx.vault.getTodo(todo.id)?.notes).toBe("Changes to keep");
}, 30000);
