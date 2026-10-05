import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { devFetch } from "../../src/dev-server";
import { handleRequest } from "../../src/server";
import { createTestContext, formPost, get } from "../helpers/test-vault";

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
  });

  it("falls back to today for an invalid date", async () => {
    expect(await html("/?date=2026-02-30")).toContain("September 28");
  });

  it("shows where the notes live in the sidebar", async () => {
    expect(await html("/todos")).toContain(ctx.vaultPath);
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
  it("splits multi-line capture into entries, stamps the time today, and redirects back", async () => {
    const res = await send(
      formPost("/journal", {
        date: "2026-09-28",
        content: "Reviewed the API proposal\n\n  Helped Sam debug staging  \n",
        tags: "#support",
        minutes: "1h30m",
        star: "1",
        return_to: "/?date=2026-09-28",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/?date=2026-09-28");

    const entries = ctx.vault.getEntries("2026-09-28");
    expect(entries.map((e) => [e.time, e.text, e.tags, e.minutes, e.isHighlight])).toEqual([
      ["14:05", "Reviewed the API proposal", ["support"], 90, true],
      ["14:05", "Helped Sam debug staging", ["support"], 90, true],
    ]);
  });

  it("logs to the real current day when the form sends no date (a window left open overnight)", async () => {
    const res = await send(formPost("/journal", { date: "", content: "Morning standup", return_to: "/" }));
    expect(res.headers.get("location")).toBe("/");
    expect(ctx.vault.getEntries("2026-09-28")[0]?.text).toBe("Morning standup");
  });

  it("drops pasted list markers and checkboxes from capture lines", async () => {
    await send(formPost("/journal", { date: "2026-09-28", content: "- Fixed the build\n* [x] Shipped docs\n• Paired with Sam", return_to: "/" }));
    expect(ctx.vault.getEntries("2026-09-28").map((e) => e.text)).toEqual(["Fixed the build", "Shipped docs", "Paired with Sam"]);
  });

  it("sends typed values back after an error so nothing is lost", async () => {
    const capture = await send(
      formPost("/journal", { date: "2026-09-28", content: "x", tags: "ops", minutes: "soon", star: "1", goals: "reliability", return_to: "/" }),
    );
    const location = capture.headers.get("location") ?? "";
    expect(location).toContain("tags=ops");
    expect(location).toContain("minutes=soon");
    expect(location).toContain("goals=reliability");
    const page = await html(location);
    expect(page).toContain('value="ops"');
    expect(page).toMatch(/<details class="capture-more"[^>]* open>/);

    const [entry] = ctx.vault.addEntries("2026-09-28", ["Original"], { tags: [], goals: [], minutes: null, isHighlight: false, time: null });
    const edit = await send(formPost(`/journal/${entry.id}`, { date: "2026-09-28", content: "Rewritten carefully", minutes: "lots" }));
    expect(await html(edit.headers.get("location") ?? "")).toContain("Rewritten carefully</textarea>");
  });

  it("backfills a past day without a clock time", async () => {
    await send(formPost("/journal", { date: "2026-09-20", content: "Wrote the retro", return_to: "/" }));
    expect(ctx.vault.getEntries("2026-09-20")[0]).toMatchObject({ time: null, text: "Wrote the retro" });
  });

  it("rejects blank capture and bad time with a message", async () => {
    const blank = await send(formPost("/journal", { date: "2026-09-28", content: "   \n ", return_to: "/?date=2026-09-28" }));
    expect(blank.headers.get("location")).toContain("error=Write+something");

    const badTime = await send(formPost("/journal", { date: "2026-09-28", content: "x", minutes: "soon", return_to: "/" }));
    expect(badTime.headers.get("location")).toContain("error=Time+spent");
    expect(ctx.vault.getEntries("2026-09-28")).toEqual([]);
  });

  it("edits, stars and deletes an entry", async () => {
    const [entry] = ctx.vault.addEntries("2026-09-28", ["Draft"], { tags: [], goals: [], minutes: null, isHighlight: false, time: null });
    await send(formPost(`/journal/${entry.id}`, { date: "2026-09-28", content: "Final #ops", minutes: "20" }));
    await send(formPost(`/journal/${entry.id}/star`, { date: "2026-09-28" }));
    expect(ctx.vault.getEntries("2026-09-28")[0]).toMatchObject({ text: "Final", tags: ["ops"], minutes: 20, isHighlight: true });

    await send(formPost(`/journal/${entry.id}/delete`, { date: "2026-09-28" }));
    expect(ctx.vault.getEntries("2026-09-28")).toEqual([]);
    expect((await send(formPost(`/journal/${entry.id}/delete`, { date: "2026-09-28" }))).status).toBe(404);
  });

  it("escapes entry text in the page", async () => {
    ctx.vault.addEntries("2026-09-28", ["<script>alert(1)</script>"], { tags: [], goals: [], minutes: null, isHighlight: false, time: null });
    const page = await html("/");
    expect(page).not.toContain("<script>alert(1)</script>");
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
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
    const other = ctx.vault.getTodos()[1];
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
    await send(formPost(`/todos/${todo.id}`, { task: "Ship v2 #release", status: "Done", priority: "Low", notes: "after QA" }));
    expect(ctx.vault.getTodo(todo.id)).toMatchObject({ task: "Ship v2", tags: ["release"], priority: "Low", notes: "after QA", completedOn: "2026-09-28" });

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

    const res = await send(formPost(`/todos/${todo.id}`, { task: "  ", status: "Open", priority: "", return_to: "/?date=2026-09-20" }));
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(`edit=${todo.id}`);
    expect(location).toContain(`back=${encodeURIComponent("/?date=2026-09-20")}`);
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

    ctx.vault.addEntries("2026-09-10", ["Cut alert noise"], { tags: [], goals: ["improve-reliability"], minutes: null, isHighlight: false, time: null });
    const page = await html("/goals/improve-reliability");
    expect(page).toContain("Cut alert noise");
    expect(page).toContain("Fewer pages.");

    await send(formPost("/goals/improve-reliability", { title: "Improve reliability", cycle: "2026", status: "achieved", body: "Met it." }));
    expect(ctx.vault.getGoal("improve-reliability")?.status).toBe("achieved");
  });

  it("points to linked open todos, which aren't evidence until done", async () => {
    ctx.vault.createGoal({ title: "Mentoring", cycle: "2026", body: "" });
    await send(formPost("/todos", { task: "Pair with Sam", goals: "mentoring", return_to: "/todos" }));
    expect(await html("/goals/mentoring")).toContain("1 open todo linked");
  });

  it("keeps the current name and cycle when the edit form sends them blank", async () => {
    ctx.vault.createGoal({ title: "Mentoring", cycle: "2026", body: "" });
    await send(formPost("/goals/mentoring", { title: " ", cycle: " ", status: "active", body: "Long self-assessment" }));
    expect(ctx.vault.getGoal("mentoring")).toMatchObject({ title: "Mentoring", cycle: "2026", body: "Long self-assessment" });
  });
});

describe("review and exports", () => {
  beforeEach(() => {
    ctx.vault.addEntries("2026-09-10", ["Led the incident review"], { tags: ["incident"], goals: [], minutes: null, isHighlight: true, time: null });
  });

  it("renders the document for the chosen range", async () => {
    const page = await html("/review?from=2026-09-01&to=2026-09-30");
    expect(page).toContain("Led the incident review");
    expect(page).toContain("Highlights");
  });

  it("downloads Markdown, JSON and JSONL from the same filters", async () => {
    const md = await send(get("/review/export.md?from=2026-09-01&to=2026-09-30"));
    expect(md.headers.get("content-disposition")).toBe('attachment; filename="accomplishments-2026-09-01-to-2026-09-30.md"');
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
    expect(await html("/review?from=2026-01-01&to=2026-01-31&tag=incident")).toContain('<option value="incident" selected>');
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

  it("refuses requests for non-local hostnames (DNS rebinding)", async () => {
    const req = new Request("http://127.0.0.1:3000/", { headers: { host: "evil.example" } });
    expect((await devSend(req)).status).toBe(403);
  });
});

describe("return paths", () => {
  it("does not redirect off-site via return_to", async () => {
    const res = await send(formPost("/journal", { date: "2026-09-28", content: "x", return_to: "//evil.example" }));
    expect(res.headers.get("location")).toBe("/?date=2026-09-28");
  });
});
