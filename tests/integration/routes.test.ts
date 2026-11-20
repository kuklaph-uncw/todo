import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { devFetch } from "../../src/dev-server";
import { handleRequest } from "../../src/server";
import { escapeHtml } from "../../src/lib/html";
import { contentRevision } from "../../src/vault/revision";
import { createTestContext, formPost, get } from "../helpers/test-vault";
import packageJson from "../../package.json";

let ctx: ReturnType<typeof createTestContext>;

beforeEach(() => {
  ctx = createTestContext();
});
afterEach(() => ctx.cleanup());

const send = (req: Request) => handleRequest(req, ctx);
const html = async (path: string) => (await send(get(path))).text();

describe("pages", () => {
  it.each(["/", "/?date=2026-01-05", "/todos", "/goals", "/review"])("GET %s renders", async (path) => {
    const res = await send(get(path));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const page = await res.text();
    expect(page).toMatch(/<title>[^<]+ · ToDo<\/title>/);
    expect(page).toContain('<span class="wordmark-rule" aria-hidden="true"></span>ToDo</a>');
  });

  it("falls back to today for an invalid date", async () => {
    expect(await html("/?date=2026-02-30")).toContain("September 28");
  });

  it("keeps the notes folder in Settings and the version with its update control in the sidebar", async () => {
    const todos = await html("/todos");
    expect(todos).not.toContain(ctx.vaultPath);
    expect(todos).toContain(`<span class="version-number">${packageJson.version}</span>`);
    expect(todos).toContain(`data-updates="{&quot;status&quot;:&quot;unavailable&quot;}"`);
    expect(todos).toMatch(/<a class="foot-link agent-settings-link" href="\/settings"><svg/);
    expect(todos).toContain('aria-label="Keyboard shortcuts"');

    const settings = await html("/settings");
    expect(settings).toContain(
      `id="vault-path" class="path-value" readonly spellcheck="false" value="${ctx.vaultPath}"`,
    );
    expect(settings).toContain('data-copy="#vault-path"');
    expect(settings).toContain('<section aria-labelledby="updates-title" id="updates">');
    expect(settings).toContain("Updates work only in the installed app.");
    expect(settings).toContain("Agent access settings are available in the desktop app.");
  });

  it("describes background updates in Settings when the updater runs", async () => {
    ctx.updates = { snapshot: () => ({ status: "idle" }), check: async () => {}, restart: () => false };
    const settings = await html("/settings");
    expect(settings).toContain("It never restarts on its own");
    expect(settings).toContain(`data-updates="{&quot;status&quot;:&quot;idle&quot;}"`);
  });

  it.each(["/", "/todos"])("GET %s embeds tags and goals for #tag and /goal suggestions", async (path) => {
    ctx.vault.addEntries("2026-09-28", ["Fixed it #ops"], {
      tags: [],
      goals: [],
      minutes: null,
      isHighlight: false,
      time: null,
    });
    ctx.vault.createGoal({ title: "Ship </script><b>v2</b>", cycle: "2026" });
    const page = await html(path);
    const json = /<script type="application\/json" id="composer-data">(.*?)<\/script>/.exec(page)?.[1] ?? "";
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({
      tags: [["ops", 1]],
      goals: [{ slug: "ship-script-b-v2-b", title: "Ship </script><b>v2</b>", active: true }],
    });
  });

  it.each(["/", "/todos"])("GET %s suggests only this cycle's goals that aren't dropped", async (path) => {
    const old = ctx.vault.createGoal({ title: "Last year", cycle: "2025", status: "agreed" });
    const current = ctx.vault.createGoal({ title: "This year", cycle: "2026" });
    const gone = ctx.vault.createGoal({ title: "Gone", cycle: "2026" });
    ctx.vault.saveGoal(gone.slug, { ...gone, status: "dropped" });
    ctx.vault.addEntries("2026-09-28", [`Kept the old link [[${old.slug}]]`], {
      tags: [],
      goals: [],
      minutes: null,
      isHighlight: false,
      time: null,
    });
    const page = await html(path);
    const json = /<script type="application\/json" id="composer-data">(.*?)<\/script>/.exec(page)?.[1] ?? "";
    // Every goal stays in the data, so typed links still show as goal pills; only suggestions narrow.
    expect(JSON.parse(json).goals).toEqual([
      { slug: current.slug, title: "This year", active: true },
      { slug: gone.slug, title: "Gone", active: false },
      { slug: old.slug, title: "Last year", active: false },
    ]);
    if (path === "/") expect(page).toContain(`<a class="goal-link" href="/goals/${old.slug}">Last year</a>`);
  });

  it("suggests the viewed day's cycle on Today, so backfilling December offers that year's goals", async () => {
    ctx.vault.createGoal({ title: "Last year", cycle: "2025" });
    ctx.vault.createGoal({ title: "This year", cycle: "2026" });
    const active = async (path: string) =>
      JSON.parse(/<script type="application\/json" id="composer-data">(.*?)<\/script>/.exec(await html(path))![1])
        .goals.filter((goal: { active: boolean }) => goal.active)
        .map((goal: { title: string }) => goal.title);
    expect(await active("/?date=2025-12-30")).toEqual(["Last year"]);
    expect(await active("/")).toEqual(["This year"]);
    // Todos have no day, so they keep this year.
    expect(await active("/todos")).toEqual(["This year"]);
  });

  it("returns 404 for unknown pages and goals", async () => {
    expect((await send(get("/nope"))).status).toBe(404);
    expect((await send(get("/goals/missing"))).status).toBe(404);
  });

  it("returns 404, not an error, for a malformed address", async () => {
    expect((await send(get("/goals/%E0%A4%A"))).status).toBe(404);
  });
});

describe("journal capture", () => {
  it("stores one multi-line entry per capture, stamps the time today, and redirects back", async () => {
    const res = await send(
      formPost("/journal", {
        date: "2026-09-28",
        content: "Reviewed the API proposal #support\n\n  Helped Sam debug staging #support  \n",
        minutes: "1h30m",
        star: "1",
        return_to: "/?date=2026-09-28",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/?date=2026-09-28");

    const entries = ctx.vault.getEntries("2026-09-28");
    expect(entries.map((e) => [e.time, e.text, e.tags, e.minutes, e.isHighlight])).toEqual([
      ["14:05", "Reviewed the API proposal\n\n  Helped Sam debug staging #support", ["support"], 90, true],
    ]);
  });

  it("logs to the real current day when the form sends no date (a window left open overnight)", async () => {
    const res = await send(formPost("/journal", { date: "", content: "Morning standup", return_to: "/" }));
    expect(res.headers.get("location")).toBe("/");
    expect(ctx.vault.getEntries("2026-09-28")[0]?.text).toBe("Morning standup");
  });

  it("keeps Markdown list markers and body checkboxes in one capture entry", async () => {
    await send(
      formPost("/journal", {
        date: "2026-09-28",
        content: "- Fixed the build\n* [x] Shipped docs\n• Paired with Sam",
        return_to: "/",
      }),
    );
    expect(ctx.vault.getEntries("2026-09-28").map((e) => e.text)).toEqual([
      "- Fixed the build\n* [x] Shipped docs\n• Paired with Sam",
    ]);
  });

  it("sends typed values back after an error so nothing is lost", async () => {
    const capture = await send(
      formPost("/journal", { date: "2026-09-28", content: "x", minutes: "soon", star: "1", return_to: "/" }),
    );
    const location = capture.headers.get("location") ?? "";
    expect(location).toContain("minutes=soon");
    expect(location).toContain("star=1");
    const page = await html(location);
    expect(page).toContain('value="soon"');
    expect(page).toContain('name="star" value="1" checked');

    const [entry] = ctx.vault.addEntries("2026-09-28", ["Original"], {
      tags: [],
      goals: [],
      minutes: null,
      isHighlight: false,
      time: null,
    });
    const edit = await send(
      formPost(`/journal/${entry.id}`, { date: "2026-09-28", content: "Rewritten carefully", minutes: "lots" }),
    );
    expect(await html(edit.headers.get("location") ?? "")).toContain("Rewritten carefully</textarea>");
  });

  it("backfills a past day without a clock time", async () => {
    await send(formPost("/journal", { date: "2026-09-20", content: "Wrote the retro", return_to: "/" }));
    expect(ctx.vault.getEntries("2026-09-20")[0]).toMatchObject({ time: null, text: "Wrote the retro" });
  });

  it("rejects blank capture and bad time with a message", async () => {
    const blank = await send(
      formPost("/journal", { date: "2026-09-28", content: "   \n ", return_to: "/?date=2026-09-28" }),
    );
    expect(blank.headers.get("location")).toContain("error=Write+something");
    const checkbox = await send(formPost("/journal", { date: "2026-09-28", content: "[x]", return_to: "/" }));
    expect(checkbox.headers.get("location")).toContain("error=Write+something");

    const badTime = await send(
      formPost("/journal", { date: "2026-09-28", content: "x", minutes: "soon", return_to: "/" }),
    );
    expect(badTime.headers.get("location")).toContain("error=Time+spent");
    expect(ctx.vault.getEntries("2026-09-28")).toEqual([]);
  });

  it("edits, stars and deletes an entry", async () => {
    const [entry] = ctx.vault.addEntries("2026-09-28", ["Draft"], {
      tags: [],
      goals: [],
      minutes: null,
      isHighlight: false,
      time: null,
    });
    await send(
      formPost(`/journal/${entry.id}`, {
        date: "2026-09-28",
        content: "Final #ops\n\n- **Checks** passed",
        minutes: "20",
      }),
    );
    await send(formPost(`/journal/${entry.id}/star`, { date: "2026-09-28" }));
    expect(ctx.vault.getEntries("2026-09-28")[0]).toMatchObject({
      text: "Final\n\n- **Checks** passed",
      tags: ["ops"],
      minutes: 20,
      isHighlight: true,
    });

    await send(formPost(`/journal/${entry.id}/delete`, { date: "2026-09-28" }));
    expect(ctx.vault.getEntries("2026-09-28")).toEqual([]);
    expect((await send(formPost(`/journal/${entry.id}/delete`, { date: "2026-09-28" }))).status).toBe(404);
  });

  it("escapes entry text in the page", async () => {
    ctx.vault.addEntries("2026-09-28", ["<script>alert(1)</script>"], {
      tags: [],
      goals: [],
      minutes: null,
      isHighlight: false,
      time: null,
    });
    const page = await html("/");
    expect(page).not.toContain("<script>alert(1)</script>");
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders entry Markdown and inline metadata across Today, goal evidence and review, leaving todos inline", async () => {
    const goal = ctx.vault.createGoal({ title: "Delivery", cycle: "2026" });
    const text = "Retro\n\n- **Checks** #ops [[delivery]]\n- `#literal`";
    ctx.vault.addEntries("2026-09-28", [text], { tags: [], goals: [], minutes: null, isHighlight: false, time: null });
    const todo = ctx.vault.addTodo(
      { task: "**Todo**", priority: null, status: "Open", tags: [], goals: [goal.slug], notes: "" },
      "2026-09-28",
    );
    ctx.vault.updateTodo(todo.id, { status: "Done" }, "2026-09-28");
    for (const path of ["/", "/goals/delivery", "/review"]) {
      const page = await html(path);
      const className = path === "/review" ? "sheet-text" : "entry-text";
      expect(page).toContain(
        `<div class="${className}"><p>Retro</p><ul><li><strong>Checks</strong> <span class="tag">#ops</span> <a class="goal-link" href="/goals/delivery">Delivery</a></li><li><code>#literal</code></li></ul></div>`,
      );
      expect(page).toContain(
        path === "/review" ? '<span class="sheet-text">**Todo**</span>' : '<p class="entry-text">**Todo**</p>',
      );
    }
  });
});

describe("todos", () => {
  it("checking a todo off from a past day records that day, never a future one", async () => {
    await send(formPost("/todos", { task: "Write rollout plan", priority: "High", return_to: "/" }));
    const [todo] = ctx.vault.getTodos();
    await send(formPost(`/todos/${todo.id}/status`, { status: "Done", on: "2026-09-25", return_to: "/" }));
    expect(ctx.vault.getTodo(todo.id)).toMatchObject({ status: "Done", completedOn: "2026-09-25" });

    const day = await html("/?date=2026-09-25");
    expect(day).toContain("Todos closed this day");
    expect(day).toContain("Write rollout plan");

    await send(formPost("/todos", { task: "Other", return_to: "/" }));
    // New todos go on top.
    const other = ctx.vault.getTodos()[0];
    await send(formPost(`/todos/${other.id}/status`, { status: "Done", on: "2027-01-01", return_to: "/" }));
    expect(ctx.vault.getTodo(other.id)?.completedOn).toBe("2026-09-28");
  });

  it("the tray on today sends no date, so a window left open overnight uses the new day", async () => {
    await send(formPost("/todos", { task: "Ship it", return_to: "/" }));
    const [todo] = ctx.vault.getTodos();
    const tray = await html("/");
    const doneForm = new RegExp(`action="/todos/${todo.id}/status"[\\s\\S]*?name="on" value="([^"]*)"`).exec(tray);
    expect(doneForm?.[1]).toBe("");
    // A past day still sends its own date.
    expect(await html("/?date=2026-09-25")).toContain('name="on" value="2026-09-25"');
  });

  it("filters the todo list", async () => {
    await send(formPost("/todos", { task: "Fix login #bug", return_to: "/todos" }));
    await send(formPost("/todos", { task: "Plan offsite", return_to: "/todos" }));
    const page = await html("/todos?tag=bug");
    expect(page).toContain("Fix login");
    expect(page).not.toContain("Plan offsite");
  });

  it("edits, clears completion and deletes", async () => {
    await send(formPost("/todos", { task: "Ship", status: "Done", return_to: "/todos" }));
    const [todo] = ctx.vault.getTodos();
    await send(formPost(`/todos/${todo.id}`, { task: "Ship v2 #release", priority: "Low", notes: "after QA" }));
    expect(ctx.vault.getTodo(todo.id)).toMatchObject({
      task: "Ship v2",
      tags: ["release"],
      priority: "Low",
      notes: "after QA",
      completedOn: "2026-09-28",
    });

    await send(formPost(`/todos/${todo.id}/clear-completion`, {}));
    expect(ctx.vault.getTodo(todo.id)?.completedOn).toBeNull();

    await send(formPost(`/todos/${todo.id}/delete`, {}));
    expect(ctx.vault.getTodos()).toEqual([]);
  });

  it("adds, shows, edits and clears an optional due date", async () => {
    await send(formPost("/todos", { task: "Renew badge", due: "2026-09-27", return_to: "/todos" }));
    const [todo] = ctx.vault.getTodos();
    expect(todo.dueOn).toBe("2026-09-27");
    // The test clock reads 2026-09-28, so this one is overdue on both pages.
    expect(await html("/todos")).toContain('<span class="due-date is-overdue" title="Overdue">Due Sep 27</span>');
    expect(await html("/")).toContain("Due Sep 27");
    expect(await html(`/todos?edit=${todo.id}`)).toContain('name="due" value="2026-09-27"');

    const bad = await send(formPost("/todos", { task: "Bad date", due: "soon", return_to: "/todos" }));
    expect(bad.headers.get("location")).toContain("error=");
    expect(ctx.vault.getTodos()).toHaveLength(1);

    const retry = await send(formPost(`/todos/${todo.id}`, { task: " ", priority: "", notes: "", due: "2026-10-05" }));
    expect(await html(retry.headers.get("location") ?? "")).toContain('name="due" value="2026-10-05"');

    // Due today is not overdue yet.
    await send(formPost(`/todos/${todo.id}`, { task: "Renew badge", priority: "", notes: "", due: "2026-09-28" }));
    expect(await html("/todos")).toContain('<span class="due-date" title="Due date">Due Sep 28</span>');
    await send(formPost(`/todos/${todo.id}`, { task: "Renew badge", priority: "", notes: "", due: "2026-10-05" }));
    expect(ctx.vault.getTodo(todo.id)?.dueOn).toBe("2026-10-05");
    // Done todos don't show it.
    await send(formPost(`/todos/${todo.id}/status`, { status: "Done" }));
    expect(await html("/todos")).not.toContain("Due Oct 5");
    await send(formPost(`/todos/${todo.id}/status`, { status: "Open" }));
    await send(formPost(`/todos/${todo.id}`, { task: "Renew badge", priority: "", notes: "", due: "" }));
    expect(ctx.vault.getTodo(todo.id)?.dueOn).toBeNull();
  });

  it("explains when the current filters hide a todo that was just added", async () => {
    const res = await send(formPost("/todos", { task: "Write retro", return_to: "/todos?q=deploy" }));
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^\/todos\?q=deploy&added=\w+$/);
    expect(await html(location)).toContain("The current filters hide it");
  });

  it("returns to Today after editing a todo opened from Today, even after an error", async () => {
    await send(formPost("/todos", { task: "Plan offsite", return_to: "/" }));
    const [todo] = ctx.vault.getTodos();
    const page = await html(`/todos?edit=${todo.id}&back=${encodeURIComponent("/?date=2026-09-20")}`);
    expect(page).toContain('name="return_to" value="/?date=2026-09-20"');

    const res = await send(
      formPost(`/todos/${todo.id}`, { task: "  ", status: "Open", priority: "", return_to: "/?date=2026-09-20" }),
    );
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(`edit=${todo.id}`);
    expect(location).toContain(`back=${encodeURIComponent("/?date=2026-09-20")}`);
  });

  it("gives each tray todo an edit link instead of a status menu", async () => {
    await send(formPost("/todos", { task: "Ship it", return_to: "/" }));
    const [todo] = ctx.vault.getTodos();
    const page = await html("/");
    expect(page).toContain(
      `href="/todos?edit=${todo.id}&amp;back=%2F#todo-${todo.id}" aria-label="Edit details: Ship it"`,
    );
    expect(page).not.toContain('class="menu"');
  });

  it("saves an edit without a status field, leaving the todo open or done as it was", async () => {
    await send(formPost("/todos", { task: "Ship", status: "Done", return_to: "/todos" }));
    const [todo] = ctx.vault.getTodos();
    const res = await send(
      formPost(`/todos/${todo.id}`, { task: "Ship v2", priority: "", notes: "", return_to: "/todos" }),
    );
    expect(res.headers.get("location")).toBe("/todos");
    expect(ctx.vault.getTodo(todo.id)).toMatchObject({ task: "Ship v2", status: "Done" });
    const page = await html(`/todos?edit=${todo.id}`);
    // No status field in the editor and no status filter: the Open and Done groups are enough.
    expect(page).not.toContain('<select name="status"');
    expect(page).not.toContain("In progress");
  });

  it("says a reopened todo keeps its completion date", async () => {
    await send(formPost("/todos", { task: "Ship", status: "Done", return_to: "/todos" }));
    const [todo] = ctx.vault.getTodos();
    await send(formPost(`/todos/${todo.id}/status`, { status: "Open" }));
    expect(await html("/todos")).toContain("Kept: done Sep 28");
  });

  it("rejects an unknown priority", async () => {
    const res = await send(formPost("/todos", { task: "x", priority: "Urgent", return_to: "/todos" }));
    expect(res.headers.get("location")).toContain("error=");
    expect(ctx.vault.getTodos()).toEqual([]);
  });

  it("reorders todos, and says so when a move isn't possible", async () => {
    await send(formPost("/todos", { task: "B", return_to: "/todos" }));
    await send(formPost("/todos", { task: "A", return_to: "/todos" }));
    const [a, b] = ctx.vault.getTodos();
    const res = await send(formPost(`/todos/${a.id}/move`, { after: b.id, return_to: "/todos" }));
    expect(res.headers.get("location")).toBe("/todos");
    expect(ctx.vault.getTodos().map((t) => t.task)).toEqual(["B", "A"]);
    expect(
      (await send(formPost(`/todos/${a.id}/move`, { after: a.id, return_to: "/todos" }))).headers.get("location"),
    ).toContain("error=");
  });
});

describe("subtasks", () => {
  let todoId: string;
  beforeEach(async () => {
    await send(formPost("/todos", { task: "Set up the org", return_to: "/todos" }));
    todoId = ctx.vault.getTodos()[0].id;
  });
  const subtasks = () => ctx.vault.getTodo(todoId)?.subtasks ?? [];

  it("adds, checks, edits and deletes a subtask, returning where the form was", async () => {
    const added = await send(formPost(`/todos/${todoId}/subtasks`, { text: "Pick a name", return_to: "/" }));
    expect(added.headers.get("location")).toBe("/");
    const [sub] = subtasks();
    expect(sub).toMatchObject({ text: "Pick a name", done: false });

    await send(formPost(`/subtasks/${sub.id}/done`, { done: "1", return_to: "/" }));
    expect(subtasks()[0].done).toBe(true);
    await send(formPost(`/subtasks/${sub.id}/done`, { done: "", return_to: "/" }));
    expect(subtasks()[0].done).toBe(false);

    await send(formPost(`/subtasks/${sub.id}`, { text: "Pick an org name", return_to: "/todos" }));
    expect(subtasks()[0].text).toBe("Pick an org name");

    await send(formPost(`/subtasks/${sub.id}/delete`, { return_to: "/todos" }));
    expect(subtasks()).toEqual([]);
  });

  it("rejects blank subtask text", async () => {
    const res = await send(formPost(`/todos/${todoId}/subtasks`, { text: "  ", return_to: "/todos" }));
    expect(res.headers.get("location")).toContain("error=");
    expect(subtasks()).toEqual([]);
  });

  it("moves a subtask, and says so when a move isn't possible", async () => {
    await send(formPost(`/todos/${todoId}/subtasks`, { text: "A", return_to: "/todos" }));
    await send(formPost(`/todos/${todoId}/subtasks`, { text: "B", return_to: "/todos" }));
    const [a, b] = subtasks();
    await send(formPost(`/subtasks/${b.id}/move`, { into: a.id, return_to: "/todos" }));
    expect(subtasks()).toMatchObject([{ text: "A", children: [{ text: "B" }] }]);
    const res = await send(formPost(`/subtasks/${a.id}/move`, { into: b.id, return_to: "/todos" }));
    expect(res.headers.get("location")).toContain("error=");
  });

  it("shows progress across every level on the tag line, and the title opens the list, on Todos and on Today", async () => {
    await send(formPost("/todos", { task: "No subtasks #solo", return_to: "/todos" }));
    const a = ctx.vault.addSubtask(todoId, "A")!;
    const b = ctx.vault.addSubtask(todoId, "B")!;
    ctx.vault.moveSubtask(b.id, { into: a.id });
    ctx.vault.addSubtask(todoId, "C");
    ctx.vault.setSubtaskDone(b.id, true);
    for (const path of ["/todos", "/"]) {
      const page = await html(path);
      expect(page).toContain(
        `<div class="chips"><span class="progress"><span aria-hidden="true">1/3</span><span class="sr-only">1 of 3 subtasks done</span>`,
      );
      // Keyboard and screen-reader users get a real button for the same toggle.
      expect(page).toContain(
        `<button type="button" class="sr-only subtask-toggle" hidden data-subtasks="subs-${todoId}" aria-controls="subs-${todoId}" aria-expanded="false">`,
      );
      expect(page).toContain(`id="sub-${b.id}"`);
      expect(page).toContain(`<p class="todo-task" data-subtasks="subs-${todoId}"`);
      // A todo without subtasks gets no count.
      expect(page.match(/class="progress"/g)).toHaveLength(1);
    }
  });

  it("lets the Todos page move and edit subtasks, while Today only checks and adds", async () => {
    const sub = ctx.vault.addSubtask(todoId, "Pick a name")!;
    const todos = await html("/todos");
    expect(todos).toContain(`data-move="subtask" data-id="${sub.id}"`);
    expect(todos).toContain(`data-move="todo" data-id="${todoId}"`);
    expect(todos).toContain(`action="/subtasks/${sub.id}/delete"`);
    const today = await html("/");
    expect(today).not.toContain("data-move=");
    expect(today).not.toContain(`/subtasks/${sub.id}/delete`);
    expect(today).toContain(`action="/subtasks/${sub.id}/done"`);
    expect(today).toContain(`action="/todos/${todoId}/subtasks"`);
  });

  it("opens the subtask editor from the Todos page, even under a collapsed Done todo", async () => {
    const sub = ctx.vault.addSubtask(todoId, "Pick a name")!;
    ctx.vault.updateTodo(todoId, { status: "Done" });
    const page = await html(`/todos?edit=${sub.id}`);
    expect(page).toContain(`action="/subtasks/${sub.id}"`);
    expect(page).toContain(`id="subs-${todoId}" data-keep-open open`);
    expect(page).not.toContain(`<details class="todo-section g-s-done">`);
    // Done todos keep their date order, so they can't be dragged.
    expect(page).not.toContain(`data-move="todo"`);
  });

  it("finds a todo by its subtask text", async () => {
    ctx.vault.addSubtask(todoId, "Invite the platform team");
    await send(formPost("/todos", { task: "Unrelated", return_to: "/todos" }));
    const page = await html("/todos?q=platform");
    expect(page).toContain("Set up the org");
    expect(page).not.toContain("Unrelated");
  });

  it("lists live todos in file order, not by priority", async () => {
    await send(formPost("/todos", { task: "Low one", priority: "Low", return_to: "/todos" }));
    await send(formPost("/todos", { task: "High one", priority: "High", return_to: "/todos" }));
    const low = ctx.vault.getTodos().find((t) => t.task === "Low one")!;
    const high = ctx.vault.getTodos().find((t) => t.task === "High one")!;
    await send(formPost(`/todos/${low.id}/move`, { before: high.id, return_to: "/todos" }));
    const page = await html("/todos");
    expect(page.indexOf("Low one")).toBeLessThan(page.indexOf("High one"));
  });

  it("returns 404 for a missing todo or subtask", async () => {
    expect((await send(formPost("/todos/missing/subtasks", { text: "x" }))).status).toBe(404);
    expect((await send(formPost("/subtasks/missing/done", { done: "1" }))).status).toBe(404);
    const sub = ctx.vault.addSubtask(todoId, "A")!;
    expect((await send(formPost(`/subtasks/${sub.id}/nope`, {}))).status).toBe(404);
  });
});

describe("goals", () => {
  const link = (date: string, slug: string, isHighlight = false) =>
    ctx.vault.addEntries(date, [`Work on ${slug}`], {
      tags: [],
      goals: [slug],
      minutes: null,
      isHighlight,
      time: null,
    });
  const composerGoals = async () =>
    JSON.parse(/<script type="application\/json" id="composer-data">(.*?)<\/script>/.exec(await html("/"))![1]).goals;
  /** The HTML of one goal's section, from its id to the next section. */
  const section = (page: string, slug: string) => {
    const start = page.indexOf(`id="goal-${slug}"`);
    expect(start).toBeGreaterThan(-1);
    const rest = page.slice(page.indexOf(">", start));
    const next = rest.search(/ data-goal[ >]|class="band|class="map-band|class="clause is-slot|<details/);
    return page.slice(start, page.indexOf(">", start) + (next === -1 ? rest.length : next));
  };
  const goalFields = { description: "", meeting: "", exceeding: "", notes: "" };

  it("starts new goals as drafts and drops dropped goals from goal suggestions", async () => {
    const res = await send(
      formPost("/goals", { title: "Improve reliability", cycle: "2026", kind: "goal", view: "reader" }),
    );
    expect(res.headers.get("location")).toBe("/goals?view=reader&cycle=2026#goal-improve-reliability");
    expect(ctx.vault.getGoal("improve-reliability")).toMatchObject({ status: "draft", kind: "goal", order: 1 });
    expect(await composerGoals()).toEqual([
      { slug: "improve-reliability", title: "Improve reliability", active: true },
    ]);

    await send(
      formPost("/goals/improve-reliability", { ...goalFields, title: "Improve reliability", status: "dropped" }),
    );
    expect(ctx.vault.getGoal("improve-reliability")).toMatchObject({ status: "dropped", droppedOn: "2026-09-28" });
    expect((await composerGoals())[0].active).toBe(false);
  });

  it("shows the sheet: numbered goals, FCP parts, notes, and dropped goals folded away at the end", async () => {
    const first = ctx.vault.createGoal({
      title: "Workflow <b>efficiency</b>",
      cycle: "2026",
      status: "agreed",
      description: "Automate & document.\nSecond line.",
      meeting: "Meeting: forms.",
      exceeding: "Exceeding: standards.",
      notes: "Ask about **templates**.",
    });
    const gone = ctx.vault.createGoal({ title: "Retire the server", cycle: "2026" });
    const third = ctx.vault.createGoal({ title: "Client communication", cycle: "2026" });
    const plan = ctx.vault.createGoal({
      title: "Technical expertise",
      cycle: "2026",
      kind: "activity",
      description: "Learn MCP.",
    });
    ctx.vault.saveGoal(gone.slug, { ...gone, status: "dropped" }, "2026-05-12");
    link("2026-09-10", first.slug, true);
    link("2026-09-20", first.slug);

    const page = await html("/goals?view=reader&cycle=2026");
    expect(page).toContain('<p class="kicker">Review cycle 2026</p>');
    expect(page).toContain('Individual goals <span class="count">2</span>');
    expect(page).toContain("Weight is set by your manager in FCP.");
    expect(page).toContain('Talent development plan <span class="count">1</span>');

    const one = section(page, first.slug);
    expect(one).toContain('<span class="no">Goal 1</span><span class="stamp">Agreed</span>');
    expect(one).toContain("Workflow &lt;b&gt;efficiency&lt;/b&gt;");
    expect(one).toContain("<dt>Meeting expectations</dt><dd>Meeting: forms.</dd>");
    expect(one).toContain("Automate &amp; document.\nSecond line.");
    expect(one).toContain("<strong>templates</strong>");
    expect(one).toContain('<span class="term-sub">Not in FCP</span>');
    expect(one).toContain(`<a href="/goals/${first.slug}">2 entries</a>`);
    expect(one).toContain("1 starred");
    expect(one).toContain("last Sep 20");
    expect(one).not.toContain("Mark agreed");

    const draft = section(page, third.slug);
    expect(draft).toContain('<span class="no">Goal 2</span><span class="stamp draft">Draft</span>');
    expect(draft).toContain(`action="/goals/${third.slug}/status"`);
    expect(section(page, plan.slug)).toContain('<span class="no">Activity 1</span>');
    expect(section(page, plan.slug)).toContain("<dt>Activity</dt>");

    const dropped = page.slice(page.indexOf('<details class="dropped-goals">'));
    expect(dropped).toContain('<summary>Dropped <span class="count">1</span></summary>');
    expect(dropped).toContain(`id="goal-${gone.slug}"`);
    expect(page.indexOf(`id="goal-${gone.slug}"`)).toBeGreaterThan(page.indexOf(`id="goal-${plan.slug}"`));
  });

  it("moves goals up and down from the sheet, with no move past either end", async () => {
    const first = ctx.vault.createGoal({ title: "First <one>", cycle: "2026" });
    const second = ctx.vault.createGoal({ title: "Second", cycle: "2026" });
    const gone = ctx.vault.createGoal({ title: "Gone", cycle: "2026" });
    ctx.vault.saveGoal(gone.slug, { ...gone, status: "dropped" });
    const page = await html("/goals?view=reader&cycle=2026");
    const one = section(page, first.slug);
    expect(one).toContain(`action="/goals/${first.slug}/move"`);
    expect(one).toMatch(
      /<button class="icon-btn" type="submit" name="direction" value="up" disabled aria-label="Move First &lt;one&gt; up"/,
    );
    expect(one).toMatch(
      /<button class="icon-btn" type="submit" name="direction" value="down" aria-label="Move First &lt;one&gt; down"/,
    );
    expect(section(page, second.slug)).toMatch(/value="down" disabled aria-label="Move Second down"/);
    expect(section(page, gone.slug)).not.toContain("/move");

    const res = await send(
      formPost(`/goals/${second.slug}/move`, {
        direction: "up",
        return_to: `/goals?view=reader&cycle=2026#goal-${second.slug}`,
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/goals?view=reader&cycle=2026#goal-${second.slug}`);
    expect([ctx.vault.getGoal(second.slug)?.order, ctx.vault.getGoal(first.slug)?.order]).toEqual([1, 2]);
    expect((await send(formPost(`/goals/${second.slug}/move`, { direction: "sideways" }))).status).toBe(303);
    expect(ctx.vault.getGoal(second.slug)?.order).toBe(1);
    expect((await send(formPost("/goals/missing/move", { direction: "up" }))).status).toBe(404);
  });

  it("refuses a stale Mark agreed or move from a page loaded before another change", async () => {
    const first = ctx.vault.createGoal({ title: "First", cycle: "2026" });
    ctx.vault.createGoal({ title: "Second", cycle: "2026" });
    const page = await html("/goals?view=reader&cycle=2026");
    const revisionIn = (action: string) =>
      new RegExp(
        `action="${action}"[^>]*>\\s*<input type="hidden" name="return_to" value="[^"]*">\\s*<input type="hidden" name="expected_revision" value="([a-f0-9]{64})">`,
      ).exec(page)?.[1];
    const statusRevision = revisionIn("/goals/first/status");
    const moveRevision = revisionIn("/goals/first/move");
    expect(statusRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(moveRevision).toBe(statusRevision);

    // An agent drops the goal after the page loaded.
    ctx.vault.saveGoal(first.slug, { ...first, status: "dropped" }, "2026-09-20");
    const back = "/goals?view=reader&cycle=2026#goal-first";
    const status = (fields: Record<string, string>) =>
      send(formPost("/goals/first/status", { status: "agreed", return_to: back, ...fields }));
    const move = (fields: Record<string, string>) =>
      send(formPost("/goals/first/move", { direction: "down", return_to: back, ...fields }));
    const notice = "This goal changed after this page loaded. Check it and try again.";

    for (const response of [
      await status({ expected_revision: statusRevision! }),
      await move({ expected_revision: moveRevision! }),
    ]) {
      const location = response.headers.get("location")!;
      expect(location).toStartWith("/goals?view=reader&cycle=2026&error=");
      expect(location).toEndWith("#goal-first");
      expect(await html(location)).toContain(escapeHtml(notice));
    }
    expect(ctx.vault.getGoal("first")).toMatchObject({ status: "dropped", droppedOn: "2026-09-20", order: 1 });

    // With the current revision, or none (older pages), the buttons work.
    const current = { expected_revision: contentRevision(ctx.vault.getGoal("first")!) };
    expect((await status(current)).headers.get("location")).toBe(back);
    expect(ctx.vault.getGoal("first")).toMatchObject({ status: "agreed", droppedOn: null });
    expect(
      (await move({ expected_revision: contentRevision(ctx.vault.getGoal("first")!) })).headers.get("location"),
    ).toBe(back);
    expect(ctx.vault.getGoal("first")?.order).toBe(2);
    expect((await move({})).headers.get("location")).toBe(back);
    expect(ctx.vault.getGoal("first")?.order).toBe(2);
    expect(
      (await send(formPost("/goals/first/move", { direction: "up", return_to: back }))).headers.get("location"),
    ).toBe(back);
    expect(ctx.vault.getGoal("first")?.order).toBe(1);
  });

  it("marks a draft agreed from the sheet", async () => {
    const goal = ctx.vault.createGoal({ title: "Client communication", cycle: "2026", description: "Kept." });
    const back = "/goals?view=reader&cycle=2026#goal-client-communication";
    const res = await send(formPost(`/goals/${goal.slug}/status`, { status: "agreed", return_to: back }));
    expect(res.headers.get("location")).toBe(back);
    expect(ctx.vault.getGoal(goal.slug)).toMatchObject({ status: "agreed", description: "Kept." });
  });

  it("shows the shape of a goal on an empty cycle, and offers to start the next cycle", async () => {
    const empty = await html("/goals?view=reader&cycle=2026");
    expect(empty).toContain("No goals for 2026 yet.");
    expect(empty).toContain('href="/goals?view=reader&amp;cycle=2026&amp;add=goal#add-goal">Write your first goal</a>');
    expect(empty).not.toContain("Start 2027");

    ctx.vault.createGoal({ title: "Ship", cycle: "2026" });
    const sheet = await html("/goals?view=reader&cycle=2026");
    expect(sheet).not.toContain("Write your first goal");
    expect(sheet).toContain('href="/goals?view=reader&amp;cycle=2027&amp;from=2026">Start 2027</a>');
    ctx.vault.createGoal({ title: "Ship", cycle: "2027" });
    expect(await html("/goals?view=reader&cycle=2026")).not.toContain("Start 2027");
  });

  it("edits a goal in place and returns to it on the sheet", async () => {
    const goal = ctx.vault.createGoal({ title: "Ship", cycle: "2026", description: "Old.", notes: "Mine." });
    const page = await html(`/goals?view=reader&cycle=2026&edit=${goal.slug}`);
    const form = section(page, goal.slug);
    expect(page).toContain(
      `<form class="clause goal-edit is-editing is-draft" id="goal-${goal.slug}" data-goal method="post"`,
    );
    expect(form).toContain(`action="/goals/${goal.slug}"`);
    for (const label of ["Goal name", "Description", "Meeting expectations", "Exceeding expectations"])
      expect(form).toMatch(new RegExp(`<label class="term-label" for="edit-${goal.slug}-\\w+">${label}</label>`));
    expect(form).toContain(
      'name="description" rows="4" placeholder="What the goal is and why it matters." data-plain>Old.</textarea>',
    );
    expect(form).toMatch(
      /<textarea name="notes" rows="2" aria-labelledby="edit-ship-notes-label"[^>]*>Mine\.<\/textarea>/,
    );
    expect(form).toContain('<input type="radio" name="status" value="draft" checked> Draft');
    expect(form).toContain('value="dropped"');
    expect(form).toContain('href="/goals?view=reader&amp;cycle=2026#goal-ship">Cancel</a>');

    const res = await send(
      formPost(`/goals/${goal.slug}`, {
        title: " ",
        status: "agreed",
        description: "New.\r\nLine two.",
        meeting: "Meets.",
        exceeding: "Exceeds.",
        notes: "Talk.",
        return_to: "/goals?view=reader&cycle=2026#goal-ship",
      }),
    );
    expect(res.headers.get("location")).toBe("/goals?view=reader&cycle=2026#goal-ship");
    expect(ctx.vault.getGoal("ship")).toMatchObject({
      title: "Ship",
      cycle: "2026",
      status: "agreed",
      description: "New.\nLine two.",
      meeting: "Meets.",
      exceeding: "Exceeds.",
      notes: "Talk.",
    });
  });

  it("changes a goal's link from the edit form, updating linked work, and lands on the new anchor", async () => {
    const goal = ctx.vault.createGoal({ title: "Client communication", cycle: "2026", description: "Old." });
    link("2026-09-10", goal.slug);
    await send(formPost("/todos", { task: `Call the client [[${goal.slug}]]`, return_to: "/todos" }));
    const form = section(await html(`/goals?view=reader&cycle=2026&edit=${goal.slug}`), goal.slug);
    expect(form).toContain(`<label class="term-label" for="edit-${goal.slug}-link">Link</label>`);
    expect(form).toContain(`name="link" value="${goal.slug}"`);
    expect(form).toContain("Changing it updates linked entries.");

    const fields = {
      title: "Client communication",
      status: "agreed",
      description: "New text.",
      meeting: "",
      exceeding: "",
      notes: "",
      view: "reader",
      return_to: `/goals?view=reader&cycle=2026#goal-${goal.slug}`,
    };
    const res = await send(formPost(`/goals/${goal.slug}`, { ...fields, link: "Clients" }));
    expect(res.headers.get("location")).toBe("/goals?view=reader&cycle=2026&renamed=1%2C1#goal-clients");
    expect(ctx.vault.getGoal(goal.slug)).toBeNull();
    expect(ctx.vault.getGoal("clients")).toMatchObject({ status: "agreed", description: "New text." });
    expect(ctx.vault.getEntries("2026-09-10")[0].goals).toEqual(["clients"]);
    expect(ctx.vault.getTodos()[0].goals).toEqual(["clients"]);
    const page = await html(res.headers.get("location")!);
    expect(page).toContain("Link changed. Updated 1 entry and 1 todo.");
    expect(page).toContain('id="goal-clients" data-goal');
  });

  it("leaves a goal's link alone when the Link field is saved unchanged, however the slug is spelled", async () => {
    const title = "A very long goal title that runs well past the slug length limit";
    ctx.vault.createGoal({ title, cycle: "2026" });
    const long = ctx.vault.createGoal({ title, cycle: "2026" }).slug;
    mkdirSync(join(ctx.root, "goals"), { recursive: true });
    writeFileSync(join(ctx.root, "goals", "Improve.md"), "---\ntitle: Improve\ncycle: 2026\n---\n");
    writeFileSync(join(ctx.root, "goals", "café.md"), "---\ntitle: Café\ncycle: 2026\n---\n");
    for (const slug of [long, "Improve", "café"]) {
      const res = await send(
        formPost(`/goals/${encodeURIComponent(slug)}`, {
          title: "Kept",
          status: "agreed",
          description: "Saved.",
          link: slug,
          view: "reader",
          return_to: "/goals?view=reader&cycle=2026",
        }),
      );
      expect(res.headers.get("location")).toBe("/goals?view=reader&cycle=2026");
      expect(ctx.vault.getGoal(slug)).toMatchObject({ status: "agreed", description: "Saved." });
    }
  });

  it("says which old link is left when a file couldn't be updated", async () => {
    ctx.vault.createGoal({ title: "Old", cycle: "2026" });
    link("2026-09-10", "old");
    mkdirSync(join(ctx.root, "journal", "2026", "2026-09-10.md.tmp"));
    const res = await send(formPost("/goals/old", { title: "Old", status: "draft", link: "new", view: "reader" }));
    const location = res.headers.get("location")!;
    expect(location).toBe("/goals?view=reader&cycle=2026&renamed=0%2C0%2C1%2Cold#goal-new");
    const page = await html(location);
    expect(page).toContain(
      escapeHtml("Link changed, but 1 entry or todo couldn't be updated safely and still link to [[old]]."),
    );
    expect(page).not.toContain("Updated 1 entry");
    expect(page).toContain("change the link back to old to undo");
  });

  it("doesn't offer to undo by typing a hand-written link that typing would respell", async () => {
    const page = await html("/goals?view=reader&cycle=2026&renamed=0%2C0%2C1%2CImprove");
    expect(page).toContain(
      escapeHtml("couldn't be updated safely and still link to [[Improve]]. Fix those links by hand."),
    );
    expect(page).not.toContain("change the link back");
  });

  it("sends a goal's new link through exactly as checked, even when slugify would respell it again", async () => {
    ctx.vault.createGoal({ title: "Old", cycle: "2026" });
    // slugify("ℌello") is "Hello", and slugify("Hello") is "hello".
    const res = await send(formPost("/goals/old", { title: "Old", status: "draft", link: "ℌello", view: "reader" }));
    expect(res.headers.get("location")).toBe("/goals?view=reader&cycle=2026&renamed=0%2C0#goal-Hello");
    expect(ctx.vault.getGoals().map((goal) => goal.slug)).toEqual(["Hello"]);
  });

  it("returns to the form with the text kept when the goal's file can't be renamed", async () => {
    ctx.vault.createGoal({ title: "Old", cycle: "2026" });
    // Stands in for a file another app holds open (EBUSY on Windows).
    ctx.vault.renameGoal = () => {
      throw new Error("EBUSY: resource busy or locked");
    };
    const res = await send(
      formPost("/goals/old", {
        title: "Old",
        status: "agreed",
        description: "Typed.",
        link: "new",
        view: "reader",
        return_to: "/goals?view=reader&cycle=2026#goal-old",
      }),
    );
    const location = res.headers.get("location")!;
    expect(location).toStartWith("/goals?view=reader&cycle=2026&edit=old&error=");
    expect(location).toEndWith("#goal-old");
    const page = await html(location);
    expect(page).toContain(escapeHtml("Your changes were saved under [[old]], but the link couldn't be changed."));
    expect(page).toContain('name="link" value="new"');
    expect(ctx.vault.getGoal("old")).toMatchObject({ status: "agreed", description: "Typed." });
  });

  it("changes only the case of a hand-written link", async () => {
    mkdirSync(join(ctx.root, "goals"), { recursive: true });
    writeFileSync(join(ctx.root, "goals", "Improve.md"), "---\ntitle: Improve\ncycle: 2026\n---\n");
    ctx.vault.addEntries("2026-09-10", ["Work [[Improve]]"], {
      tags: [],
      goals: [],
      minutes: null,
      isHighlight: false,
      time: null,
    });
    const res = await send(
      formPost("/goals/Improve", { title: "Improve", status: "draft", link: "improve", view: "reader" }),
    );
    expect(res.headers.get("location")).toBe("/goals?view=reader&cycle=2026&renamed=1%2C0#goal-improve");
    expect(ctx.vault.getGoals().map((goal) => goal.slug)).toEqual(["improve"]);
    expect(ctx.vault.getEntries("2026-09-10")[0].goals).toEqual(["improve"]);
  });

  it("keeps the typed text and changes nothing when the new link is taken, reserved or empty", async () => {
    const goal = ctx.vault.createGoal({ title: "Ship", cycle: "2026", description: "Old." });
    ctx.vault.createGoal({ title: "Taken", cycle: "2026" });
    const post = (link: string) =>
      send(
        formPost(`/goals/${goal.slug}`, {
          title: "Ship",
          status: "agreed",
          description: "Typed <text>.",
          meeting: "",
          exceeding: "",
          notes: "",
          link,
          view: "timeline",
          return_to: "/goals?view=timeline&cycle=2026&open=ship#goal-ship",
        }),
      );
    for (const [link, message] of [
      ["taken", "Another goal already uses [[taken]]."],
      ["carry", "That link is reserved. Pick another."],
      ["aux", "That link is reserved. Pick another."],
      ["!!", "A link needs at least one letter or number."],
    ]) {
      const location = (await post(link)).headers.get("location")!;
      expect(location).toStartWith("/goals?view=timeline&cycle=2026&edit=ship&error=");
      expect(location).toEndWith("#goal-ship");
      const page = await html(location);
      expect(page).toContain(escapeHtml(message));
      expect(page).toContain("Typed &lt;text&gt;.</textarea>");
      expect(page).toContain(`name="link" value="${escapeHtml(link)}"`);
      expect(page).toContain('<input type="radio" name="status" value="agreed" checked>');
    }
    expect(ctx.vault.getGoal("ship")).toMatchObject({ status: "draft", description: "Old." });
  });

  it("doesn't let a stale edit form undo a change made elsewhere, such as by an agent", async () => {
    const goal = ctx.vault.createGoal({
      title: "Ship",
      cycle: "2026",
      description: "Old description.",
      notes: "Mine.",
    });
    const form = await html(`/goals?view=reader&cycle=2026&edit=${goal.slug}`);
    const revision = /name="expected_revision" value="([a-f0-9]{64})"/.exec(form)![1];
    ctx.vault.saveGoal(goal.slug, { ...goal, notes: "From an agent." });
    const post = (expected: string) =>
      send(
        formPost(`/goals/${goal.slug}`, {
          title: "Ship",
          status: "draft",
          // Cleared by the user: it must stay cleared, not refill with the stored text.
          description: "",
          notes: "Typed in the form.",
          link: goal.slug,
          view: "reader",
          expected_revision: expected,
          return_to: "/goals?view=reader&cycle=2026#goal-ship",
        }),
      );
    const location = (await post(revision)).headers.get("location")!;
    expect(location).toStartWith("/goals?view=reader&cycle=2026&edit=ship&error=");
    const page = await html(location);
    expect(page).toContain("This goal changed somewhere else while you were editing");
    expect(page).toContain("Typed in the form.</textarea>");
    expect(page).toMatch(/name="description" rows="4" placeholder="[^"]*" data-plain><\/textarea>/);
    expect(page).not.toContain("Old description.</textarea>");
    expect(ctx.vault.getGoal("ship")).toMatchObject({ notes: "From an agent.", description: "Old description." });
    // Saving again from that form, which now carries the current revision, replaces it on purpose.
    const fresh = /name="expected_revision" value="([a-f0-9]{64})"/.exec(page)![1];
    expect((await post(fresh)).headers.get("location")).toBe("/goals?view=reader&cycle=2026#goal-ship");
    expect(ctx.vault.getGoal("ship")).toMatchObject({ notes: "Typed in the form.", description: "" });
  });

  it("edits an activity with one activity field and keeps any expectation text it has", async () => {
    const plan = ctx.vault.createGoal({ title: "Learn", cycle: "2026", kind: "activity", meeting: "Hand-written." });
    const form = section(await html(`/goals?view=reader&cycle=2026&edit=${plan.slug}`), plan.slug);
    expect(form).toContain(">Activity</label>");
    expect(form).toContain(">Activity name</label>");
    expect(form).not.toContain("Meeting expectations");
    await send(
      formPost(`/goals/${plan.slug}`, { title: "Learn", status: "agreed", description: "Courses.", notes: "" }),
    );
    expect(ctx.vault.getGoal(plan.slug)).toMatchObject({ description: "Courses.", meeting: "Hand-written." });
  });

  it("cleans control characters out of names and cycles posted by the goal forms", async () => {
    await send(formPost("/goals", { title: "Ship\u0001 it", cycle: "2026\u007f", kind: "goal", view: "reader" }));
    expect(ctx.vault.getGoal("ship-it")).toMatchObject({ title: "Ship it", cycle: "2026" });
    await send(
      formPost("/goals/ship-it", { title: "Ship\u0000 again", status: "draft", link: "ship-it", view: "reader" }),
    );
    expect(ctx.vault.getGoal("ship-it")?.title).toBe("Ship again");
  });

  it("keeps a hand-written cycle's spacing when adding to it or carrying into it", async () => {
    ctx.vault.createGoal({ title: "First", cycle: "FY  2027" });
    const res = await send(formPost("/goals", { title: "Second", cycle: "FY  2027", kind: "goal", view: "reader" }));
    expect(ctx.vault.getGoal("second")?.cycle).toBe("FY  2027");
    expect(res.headers.get("location")).toContain(`cycle=${encodeURIComponent("FY  2027").replace(/%20/g, "+")}`);

    ctx.vault.createGoal({ title: "Carried", cycle: "2026" });
    const carry = { from: "2026", cycle: "Q1  2027", goal: "carried", view: "reader" };
    const first = await send(formPost("/goals/carry", carry));
    await send(formPost("/goals/carry", carry));
    expect(ctx.vault.getGoals().filter((goal) => goal.cycle === "Q1  2027")).toHaveLength(1);
    expect(first.headers.get("location")).toContain(`cycle=${encodeURIComponent("Q1  2027").replace(/%20/g, "+")}`);
  });

  it("adds a goal or activity in place and keeps typed text when the name is missing", async () => {
    ctx.vault.createGoal({ title: "First", cycle: "2026" });
    const page = await html("/goals?view=reader&cycle=2026&add=goal");
    const form = page.slice(page.indexOf('id="add-goal"'));
    expect(form).toMatch(/<span class="no">Goal 2<\/span>\s*<span class="editing-mark">New<\/span>/);
    expect(form).toContain('<input type="hidden" name="kind" value="goal">');
    expect(form).not.toContain('value="dropped"');

    const res = await send(
      formPost("/goals", {
        title: "  ",
        cycle: "2026",
        kind: "goal",
        view: "reader",
        description: "A long description.",
        meeting: "Meets <it>.",
      }),
    );
    const location = res.headers.get("location")!;
    expect(location).toStartWith("/goals?view=reader&cycle=2026&add=goal&error=");
    expect(location).toEndWith("#add-goal");
    const retry = await html(location);
    expect(retry).toContain("A goal needs a name.");
    expect(retry).toContain("data-plain>A long description.</textarea>");
    expect(retry).toContain("Meets &lt;it&gt;.</textarea>");

    const added = await send(
      formPost("/goals", { title: "Learn MCP", cycle: "2026", kind: "activity", view: "reader", status: "agreed" }),
    );
    expect(added.headers.get("location")).toBe("/goals?view=reader&cycle=2026#goal-learn-mcp");
    expect(ctx.vault.getGoal("learn-mcp")).toMatchObject({ kind: "activity", status: "agreed", order: 1 });
  });

  it("copies a goal for FCP as plain text in FCP's order", async () => {
    const goal = ctx.vault.createGoal({
      title: "Ship <v2>",
      cycle: "2026",
      description: "Why.",
      meeting: "Meets.",
      exceeding: "Exceeds.",
      notes: "Not copied.",
    });
    const plan = ctx.vault.createGoal({ title: "Learn", cycle: "2026", kind: "activity", description: "Courses." });
    const page = await html("/goals?view=reader&cycle=2026");
    expect(page).toContain(`data-copy="#fcp-text-${goal.slug}"`);
    expect(page).toContain(
      `<textarea id="fcp-text-${goal.slug}" hidden readonly aria-label="FCP text: Ship &lt;v2&gt;">Goal name\nShip &lt;v2&gt;\n\nDescription\nWhy.\n\nMeeting expectations\nMeets.\n\nExceeding expectations\nExceeds.</textarea>`,
    );
    expect(page).toContain(`aria-label="FCP text: Learn">Courses.</textarea>`);
    expect(page).toContain(`<p id="fcp-note-${plan.slug}" class="copy-status" role="status"></p>`);
  });

  it("draws the timeline: ticks on their days, today, gaps, drafts and dropped goals", async () => {
    const agreed = ctx.vault.createGoal({ title: "Agreed goal", cycle: "2026", status: "agreed" });
    const draft = ctx.vault.createGoal({ title: "Draft goal", cycle: "2026" });
    const gone = ctx.vault.createGoal({ title: "Gone goal", cycle: "2026" });
    ctx.vault.saveGoal(gone.slug, { ...gone, status: "dropped" }, "2026-05-12");
    link("2026-01-16", agreed.slug, true);
    link("2026-02-03", agreed.slug);
    link("2026-09-05", agreed.slug);
    link("2026-03-01", gone.slug);
    link("2026-06-01", gone.slug);

    const page = await html("/goals?view=timeline&cycle=2026");
    expect(page).toContain('aria-current="page">Timeline</a>');
    const row = section(page, agreed.slug);
    expect(page).toContain('<li class="map-row is-agreed" id="goal-agreed-goal" data-goal>');
    expect(row).toContain('<span class="sr-only">January: 1, 1 starred</span>');
    expect(row).toContain('<line class="tick s" x1="50.00%" x2="50.00%" y1="100%" y2="55%"></line>');
    expect(row).toContain(
      '<span class="gap-note" data-span="6" aria-hidden="true">Nothing linked March to August</span>',
    );
    expect(row).toContain('<li class="m is-now"><span class="sr-only">September so far: 1</span>');
    expect(row).toContain('<li class="m is-future"><span class="sr-only">October: still ahead</span>');
    expect(row).toContain('<span class="t-total">3 linked</span>');
    expect(row).toContain("last Sep 5");
    expect(row).toContain('aria-expanded="false" aria-controls="detail-agreed-goal" data-unfold');
    expect(row).toContain('<div class="row-detail" id="detail-agreed-goal" hidden>');

    expect(page).toContain(`<li class="map-row is-draft" id="goal-${draft.slug}"`);
    const dropped = section(page, gone.slug);
    expect(dropped).toContain('<span class="st">Dropped</span> May 12');
    expect(dropped).toContain('<text class="drop-mark"');
    // The line stops at the drop; the tally still counts all linked work, like the sheet.
    expect(dropped).toContain(
      '<li class="m is-off"><svg class="tick-marks" aria-hidden="true" focusable="false"></svg></li>',
    );
    expect(dropped).not.toContain('<li class="m is-off"><span class="sr-only">');
    expect(dropped).toContain('<span class="t-total">2 linked</span>');
    expect(page).toContain('<ul class="legend" aria-label="How to read the timeline">');
    expect(page).toContain("Today, Sep 28");
  });

  it("unfolds a timeline row, and edits it there with the same form as the sheet", async () => {
    const goal = ctx.vault.createGoal({ title: "Ship", cycle: "2026", description: "Why.", notes: "Talk." });
    const open = section(await html("/goals?view=timeline&cycle=2026&open=ship"), goal.slug);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('<div class="row-detail" id="detail-ship">');
    expect(open).toContain("<dt>Description</dt><dd>Why.</dd>");
    expect(open).toContain('href="/goals?view=timeline&amp;cycle=2026&amp;edit=ship#goal-ship"');
    expect(open).toContain('data-copy="#fcp-text-ship"');
    expect(open).toContain('href="/goals/ship">Open goal page');
    expect(open).toContain('href="/review?goal=ship">Review this goal');

    const editing = section(await html("/goals?view=timeline&cycle=2026&edit=ship"), goal.slug);
    expect(editing).toContain('<form class="clause goal-edit is-editing is-draft" method="post" action="/goals/ship"');
    expect(editing).toContain('name="return_to" value="/goals?view=timeline&amp;cycle=2026&amp;open=ship#goal-ship"');
  });

  it("remembers the last view, and both views name goals the same way for switching", async () => {
    const goal = ctx.vault.createGoal({ title: "Ship", cycle: "2026" });
    expect(await html("/goals")).toContain('aria-current="page">Reader</a>');
    const timeline = await html("/goals?view=timeline&cycle=2026");
    expect(timeline).toContain('<a class="seg" href="/goals?view=reader&amp;cycle=2026" data-view-switch>Reader</a>');
    expect(await html("/goals")).toContain('aria-current="page">Timeline</a>');
    expect(await html("/goals?cycle=2026")).toContain(`id="goal-${goal.slug}" data-goal`);
    const reader = await html("/goals?view=reader");
    expect(reader).toContain(`id="goal-${goal.slug}" data-goal`);
    expect(await html("/goals")).toContain('aria-current="page">Reader</a>');
    // Kept with the app's own settings, never in the notes folder.
    expect(JSON.parse(readFileSync(ctx.preferencesPath!, "utf8"))).toEqual({ goalsView: "reader" });
    expect(existsSync(join(ctx.root, ".workledger"))).toBe(false);
  });

  it("still shows the page when the view can't be saved", async () => {
    // A folder where the file should be makes every save fail.
    mkdirSync(ctx.preferencesPath!);
    try {
      const res = await send(get("/goals?view=timeline"));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('aria-current="page">Timeline</a>');
    } finally {
      rmSync(ctx.preferencesPath!, { recursive: true, force: true });
      rmSync(`${ctx.preferencesPath}.tmp`, { force: true });
    }
  });

  it("opens Reader and remembers nothing when there's nowhere to keep preferences", async () => {
    ctx.preferencesPath = undefined;
    await html("/goals?view=timeline");
    expect(await html("/goals")).toContain('aria-current="page">Reader</a>');
    expect(existsSync(join(ctx.root, ".workledger"))).toBe(false);
  });

  it("starts the next cycle by copying picked goals as drafts, notes only if asked", async () => {
    const one = ctx.vault.createGoal({
      title: "Workflow",
      cycle: "2026",
      status: "agreed",
      description: "D1",
      notes: "N1",
    });
    const two = ctx.vault.createGoal({ title: "Data", cycle: "2026", description: "D2" });
    const gone = ctx.vault.createGoal({ title: "Gone", cycle: "2026" });
    ctx.vault.saveGoal(gone.slug, { ...gone, status: "dropped" });
    const plan = ctx.vault.createGoal({ title: "Expertise", cycle: "2026", kind: "activity", description: "Learn" });

    const page = await html("/goals?view=reader&cycle=2027&from=2026");
    expect(page).toContain('action="/goals/carry"');
    expect(page).toContain("Start from 2026");
    for (const goal of [one, two, plan])
      expect(page).toContain(`<input type="checkbox" name="goal" value="${goal.slug}" checked`);
    expect(page).not.toContain(`value="${gone.slug}"`);
    expect(page).toContain('<input type="checkbox" name="notes" value="1"> Copy notes too');
    expect(page).toContain(
      'href="/goals?view=reader&amp;cycle=2027&amp;add=goal#add-goal">Start with a blank goal</a>',
    );

    const res = await send(
      formPost("/goals/carry", { from: "2026", cycle: "2027", view: "reader", goal: [one.slug, plan.slug, gone.slug] }),
    );
    expect(res.headers.get("location")).toBe("/goals?view=reader&cycle=2027");
    const copies = ctx.vault.getGoals().filter((goal) => goal.cycle === "2027");
    expect(copies.map(({ slug, status, kind, order, notes }) => ({ slug, status, kind, order, notes }))).toEqual([
      { slug: "workflow-2027", status: "draft", kind: "goal", order: 1, notes: "" },
      { slug: "expertise-2027", status: "draft", kind: "activity", order: 1, notes: "" },
    ]);
    expect(ctx.vault.getGoal(one.slug)?.cycle).toBe("2026");

    // A second post (say, after going back) copies nothing more.
    await send(formPost("/goals/carry", { from: "2026", cycle: "2027", goal: [two.slug] }));
    expect(ctx.vault.getGoals().filter((goal) => goal.cycle === "2027")).toHaveLength(2);
  });

  it("copies notes too when asked", async () => {
    const one = ctx.vault.createGoal({ title: "Workflow", cycle: "2026", notes: "N1" });
    await send(formPost("/goals/carry", { from: "2026", cycle: "2027", goal: [one.slug], notes: "1" }));
    expect(ctx.vault.getGoal("workflow-2027")?.notes).toBe("N1");
  });

  it("shows a goal page with neighbours, its timeline row and its evidence", async () => {
    const first = ctx.vault.createGoal({ title: "First", cycle: "2026", description: "Fewer pages." });
    const second = ctx.vault.createGoal({ title: "Second", cycle: "2026" });
    link("2026-09-10", second.slug);
    const page = await html(`/goals/${second.slug}`);
    expect(page).toContain('<p class="kicker"><a href="/goals?cycle=2026#goal-second">Goals · 2026</a></p>');
    expect(page).toContain('href="/goals/first" aria-label="Previous: First"');
    expect(page).toContain("<span>Goal 2 of 2</span>");
    expect(page).toContain('href="/review?goal=second&amp;from=2026-09-10&amp;to=2026-09-10">Review this goal');
    expect(page).toContain('<h1 class="clause-name" id="name-second">Second</h1>');
    expect(page).toContain('href="/goals?view=reader&amp;cycle=2026&amp;edit=second#goal-second">');
    expect(page).toContain('data-copy="#fcp-text-second"');
    expect(page).toContain('<li class="map-row is-draft">');
    expect(page).toContain("Work on second");
    expect(await html(`/goals/${first.slug}`)).toContain("Fewer pages.");
  });

  it("shows and edits goals that have no cycle", async () => {
    mkdirSync(join(ctx.root, "goals"), { recursive: true });
    writeFileSync(join(ctx.root, "goals", "loose.md"), "---\ntitle: Loose\n---\nBody.\n");
    expect(await html("/goals?view=reader&cycle=2026")).toContain('href="/goals?view=reader&amp;cycle=">No cycle</a>');
    const page = await html("/goals?view=reader&cycle=&edit=loose");
    expect(page).toContain('<p class="kicker">No review cycle</p>');
    expect(page).toContain('<form class="clause goal-edit is-editing is-draft" id="goal-loose" data-goal');
  });

  it("keeps the add form's anchor apart from a goal named New, and copy ids apart too", async () => {
    ctx.vault.createGoal({ title: "New", cycle: "2026" });
    ctx.vault.createGoal({ title: "X", cycle: "2026" });
    ctx.vault.createGoal({ title: "Status X", cycle: "2026" });
    ctx.vault.createGoal({ title: "Text X", cycle: "2026" });
    const page = await html("/goals?view=reader&cycle=2026&add=goal");
    expect(page.match(/id="goal-new"/g)).toHaveLength(1);
    expect(page).toContain(
      '<form class="clause goal-edit is-editing is-draft" id="add-goal" method="post" action="/goals"',
    );
    expect(page).toContain('href="/goals?view=reader&amp;cycle=2026&amp;add=activity#add-goal"');
    const ids = [...page.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBe(new Set(ids).size);
    expect(page).toContain('data-copy-status="#fcp-note-x"');
  });

  it("returns to the unfolded timeline row after editing there", async () => {
    ctx.vault.createGoal({ title: "Ship", cycle: "2026" });
    const page = await html("/goals?view=timeline&cycle=2026&edit=ship");
    expect(page).toContain('name="return_to" value="/goals?view=timeline&amp;cycle=2026&amp;open=ship#goal-ship"');
  });

  it("sends old goal edit links to the edit form on the sheet", async () => {
    ctx.vault.createGoal({ title: "Ship", cycle: "2026" });
    const res = await send(get("/goals/ship?edit=1"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/goals?view=reader&cycle=2026&edit=ship#goal-ship");
  });

  it("points to linked open todos, which aren't evidence until done", async () => {
    ctx.vault.createGoal({ title: "Mentoring", cycle: "2026" });
    await send(formPost("/todos", { task: "Pair with Sam [[mentoring]]", return_to: "/todos" }));
    expect(await html("/goals/mentoring")).toContain("1 open todo linked");
  });
});

describe("review and exports", () => {
  beforeEach(() => {
    ctx.vault.addEntries("2026-09-10", ["Led the incident review"], {
      tags: ["incident"],
      goals: [],
      minutes: null,
      isHighlight: true,
      time: null,
    });
  });

  it("renders the document for the chosen range", async () => {
    const page = await html("/review?from=2026-09-01&to=2026-09-30");
    expect(page).toContain("Led the incident review");
    expect(page).toContain("Highlights");
  });

  it("downloads Markdown, JSON and JSONL from the same filters", async () => {
    const md = await send(get("/review/export.md?from=2026-09-01&to=2026-09-30"));
    expect(md.headers.get("content-disposition")).toBe(
      'attachment; filename="accomplishments-2026-09-01-to-2026-09-30.md"',
    );
    expect(await md.text()).toContain("- 2026-09-10 — Led the incident review");

    const json = await (await send(get("/review/export.json?from=2026-09-01&to=2026-09-30"))).json();
    expect(json.items).toHaveLength(1);

    const jsonl = await (await send(get("/review/export.jsonl?from=2026-10-01&to=2026-10-31"))).text();
    expect(jsonl).toBe("");
  });

  it("marks a filtered document and its downloads as filtered", async () => {
    const page = await html("/review?from=2026-09-01&to=2026-09-30&tag=incident");
    expect(page).toContain("Filtered: tag #incident");
    expect(page).toContain("Clear filters");
    const md = await send(get("/review/export.md?from=2026-09-01&to=2026-09-30&tag=incident"));
    expect(md.headers.get("content-disposition")).toContain("-filtered.md");
    // The suggested PDF name too.
    expect(page).toContain('data-print="accomplishments-2026-09-01-to-2026-09-30-filtered"');
  });

  it("keeps an active tag selected even when the period has no items with it", async () => {
    expect(await html("/review?from=2026-01-01&to=2026-01-31&tag=incident")).toContain(
      '<option value="incident" selected>',
    );
  });
});

describe("development server request guard", () => {
  const devSend = (req: Request) => devFetch(ctx)(req);
  const post = (origin: string) =>
    new Request("http://127.0.0.1:3000/journal", {
      method: "POST",
      body: new URLSearchParams({ date: "2026-09-28", content: "x" }),
      headers: { origin, host: "127.0.0.1:3000" },
    });

  it("refuses cross-site and opaque-origin form posts", async () => {
    expect((await devSend(post("https://evil.example"))).status).toBe(403);
    expect((await devSend(post("null"))).status).toBe(403);
    expect(ctx.vault.getEntries("2026-09-28")).toEqual([]);
  });

  it("accepts same-origin form posts", async () => {
    expect((await devSend(post("http://127.0.0.1:3000"))).status).toBe(303);
  });

  it.each(["/", "/__dev/reload.js", "/__dev/events"])(
    "refuses %s for non-local hostnames (DNS rebinding)",
    async (path) => {
      const req = new Request(`http://127.0.0.1:3000${path}`, { headers: { host: "evil.example" } });
      expect((await devSend(req)).status).toBe(403);
    },
  );
});

describe("return paths", () => {
  it("does not redirect off-site via return_to", async () => {
    const res = await send(formPost("/journal", { date: "2026-09-28", content: "x", return_to: "//evil.example" }));
    expect(res.headers.get("location")).toBe("/?date=2026-09-28");
  });
});
