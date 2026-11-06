import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { devFetch } from "../../src/dev-server";
import { handleRequest } from "../../src/server";
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
    ctx.vault.createGoal({ title: "Ship </script><b>v2</b>", cycle: "2026", body: "" });
    const page = await html(path);
    const json = /<script type="application\/json" id="composer-data">(.*?)<\/script>/.exec(page)?.[1] ?? "";
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({
      tags: [["ops", 1]],
      goals: [{ slug: "ship-script-b-v2-b", title: "Ship </script><b>v2</b>", active: true }],
    });
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
    const goal = ctx.vault.createGoal({ title: "Delivery", cycle: "2026", body: "" });
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
  it("keeps the typed description when a new goal has no name", async () => {
    const res = await send(formPost("/goals", { title: "  ", cycle: "2026", body: "A long self-assessment." }));
    const page = await html(res.headers.get("location")!);
    expect(page).toContain("A goal needs a name.");
    expect(page).toContain("A long self-assessment.</textarea>");
  });

  it("creates a goal and shows linked evidence on its page", async () => {
    const res = await send(formPost("/goals", { title: "Improve reliability", cycle: "2026", body: "Fewer pages." }));
    expect(res.headers.get("location")).toBe("/goals/improve-reliability");

    ctx.vault.addEntries("2026-09-10", ["Cut alert noise"], {
      tags: [],
      goals: ["improve-reliability"],
      minutes: null,
      isHighlight: false,
      time: null,
    });
    const page = await html("/goals/improve-reliability");
    expect(page).toContain("Cut alert noise");
    expect(page).toContain("Fewer pages.");

    await send(
      formPost("/goals/improve-reliability", {
        title: "Improve reliability",
        cycle: "2026",
        status: "achieved",
        body: "Met it.",
      }),
    );
    expect(ctx.vault.getGoal("improve-reliability")?.status).toBe("achieved");
  });

  it("points to linked open todos, which aren't evidence until done", async () => {
    ctx.vault.createGoal({ title: "Mentoring", cycle: "2026", body: "" });
    await send(formPost("/todos", { task: "Pair with Sam [[mentoring]]", return_to: "/todos" }));
    expect(await html("/goals/mentoring")).toContain("1 open todo linked");
  });

  it("keeps the current name and cycle when the edit form sends them blank", async () => {
    ctx.vault.createGoal({ title: "Mentoring", cycle: "2026", body: "" });
    await send(
      formPost("/goals/mentoring", { title: " ", cycle: " ", status: "active", body: "Long self-assessment" }),
    );
    expect(ctx.vault.getGoal("mentoring")).toMatchObject({
      title: "Mentoring",
      cycle: "2026",
      body: "Long self-assessment",
    });
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
