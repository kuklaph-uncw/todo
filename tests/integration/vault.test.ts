import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyTodoPatch, Vault } from "../../src/vault/vault";
import type { Todo } from "../../src/vault/format";
import { createTestVault } from "../helpers/test-vault";

let vault: Vault;
let root: string;
let cleanup: () => void;

beforeEach(() => {
  ({ vault, root, cleanup } = createTestVault());
});
afterEach(() => cleanup());

const noMeta = { tags: [], goals: [], minutes: null, isHighlight: false, time: null };
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

describe("journal", () => {
  it("creates a daily note with frontmatter and one line per entry", () => {
    vault.addEntries("2026-09-28", ["Reviewed the plan", "Helped Sam #support"], { ...noMeta, time: "09:15" });
    const file = read("journal", "2026", "2026-09-28.md");
    expect(file.startsWith("---\ndate: 2026-09-28\n---\n\n- 09:15 Reviewed the plan ^")).toBe(true);
    expect(vault.getEntries("2026-09-28").map((e) => [e.text, e.tags])).toEqual([
      ["Reviewed the plan", []],
      ["Helped Sam", ["support"]],
    ]);
  });

  it("adds new entries after existing ones, leaving the user's other notes alone", () => {
    const dir = join(root, "journal", "2026");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2026-09-28.md"), "# Monday\n\n- First thing\n\nFree-form notes stay here.\n");
    vault.addEntries("2026-09-28", ["Second thing"], noMeta);
    const lines = read("journal", "2026", "2026-09-28.md").split("\n");
    expect(lines[0]).toBe("# Monday");
    expect(lines[2]).toMatch(/^- First thing \^\w+$/);
    expect(lines[3]).toMatch(/^- Second thing \^\w+$/);
    expect(lines[5]).toBe("Free-form notes stay here.");
  });

  it("gives hand-written lines a block id the first time they're read", () => {
    const dir = join(root, "journal", "2026");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2026-09-27.md"), "- Typed in another editor\n");
    const [entry] = vault.getEntries("2026-09-27");
    expect(entry.id).toMatch(/^\w{6}$/);
    expect(read("journal", "2026", "2026-09-27.md")).toBe(`- Typed in another editor ^${entry.id}\n`);
  });

  it("updates and deletes by id; deletes are logged to .trash", () => {
    const [entry] = vault.addEntries("2026-09-28", ["Draft"], noMeta);
    vault.updateEntry("2026-09-28", entry.id, (e) => ({ ...e, text: "Final", isHighlight: true }));
    expect(vault.getEntries("2026-09-28")[0]).toMatchObject({ text: "Final", isHighlight: true });

    expect(vault.deleteEntry("2026-09-28", entry.id)).toBe(true);
    expect(vault.getEntries("2026-09-28")).toEqual([]);
    expect(read(".trash", "deleted.md")).toContain(`- Final ⭐ ^${entry.id}`);
    expect(vault.deleteEntry("2026-09-28", entry.id)).toBe(false);
  });

  it("lists dates across years and reads a range", () => {
    vault.addEntries("2025-12-31", ["Old year"], noMeta);
    vault.addEntries("2026-01-02", ["New year"], noMeta);
    vault.addEntries("2026-02-01", ["Later"], noMeta);
    expect(vault.listDates()).toEqual(["2025-12-31", "2026-01-02", "2026-02-01"]);
    expect(vault.getEntriesInRange("2025-12-01", "2026-01-31").map((e) => e.text)).toEqual(["Old year", "New year"]);
  });
});

describe("todos", () => {
  it("adds a todo with a created date and inline tags", () => {
    const todo = vault.addTodo({ task: "Fix auth test #bug", priority: "High", status: "Open", tags: [], goals: ["reliability"], notes: "" }, "2026-09-20");
    expect(todo).toMatchObject({ task: "Fix auth test", tags: ["bug"], goals: ["reliability"], createdOn: "2026-09-20", completedOn: null });
    expect(read("todos.md")).toContain(`- [ ] Fix auth test #bug [[reliability]] ⏫ ➕ 2026-09-20 ^${todo.id}`);
  });

  it("freezes the first completion date through reopen and re-close", () => {
    const todo = vault.addTodo({ task: "Ship", priority: null, status: "Open", tags: [], goals: [], notes: "" }, "2026-09-20");
    vault.updateTodo(todo.id, { status: "Done" }, "2026-09-21");
    vault.updateTodo(todo.id, { status: "Open" }, "2026-09-22");
    expect(vault.getTodo(todo.id)).toMatchObject({ status: "Open", completedOn: "2026-09-21" });
    vault.updateTodo(todo.id, { status: "Done" }, "2026-09-25");
    expect(vault.getTodo(todo.id)?.completedOn).toBe("2026-09-21");
  });

  it("clears the completion date only when asked", () => {
    const todo = vault.addTodo({ task: "Ship", priority: null, status: "Done", tags: [], goals: [], notes: "" }, "2026-09-20");
    expect(todo.completedOn).toBe("2026-09-20");
    vault.updateTodo(todo.id, { clearCompletion: true });
    expect(vault.getTodo(todo.id)?.completedOn).toBeNull();
  });

  it("keeps notes attached when editing and removes them with the todo", () => {
    const a = vault.addTodo({ task: "A", priority: null, status: "Open", tags: [], goals: [], notes: "line one\nline two" });
    const b = vault.addTodo({ task: "B", priority: null, status: "Open", tags: [], goals: [], notes: "" });
    vault.updateTodo(a.id, { task: "A edited" });
    expect(vault.getTodo(a.id)).toMatchObject({ task: "A edited", notes: "line one\nline two" });
    vault.deleteTodo(a.id);
    expect(vault.getTodos().map((t) => t.id)).toEqual([b.id]);
    expect(read("todos.md")).not.toContain("line one");
  });
});

describe("todo order", () => {
  const add = (task: string) => vault.addTodo({ task, priority: null, status: "Open", tags: [], goals: [], notes: "" });

  it("writes new todos at the top", () => {
    const a = add("A");
    const b = add("B");
    expect(vault.getTodos().map((t) => t.id)).toEqual([b.id, a.id]);
    expect(read("todos.md").startsWith("---\ntype: todos\n---\n\n- [ ] B")).toBe(true);
  });

  it("moves a todo before or after another, carrying its notes and subtasks", () => {
    const c = add("C");
    const b = add("B");
    const a = add("A");
    vault.updateTodo(a.id, { notes: "note" });
    vault.addSubtask(a.id, "step");
    expect(vault.moveTodo(a.id, { after: c.id })).toBe(true);
    expect(vault.getTodos().map((t) => t.task)).toEqual(["B", "C", "A"]);
    expect(vault.getTodo(a.id)).toMatchObject({ notes: "note", subtasks: [{ text: "step" }] });
    expect(vault.moveTodo(a.id, { before: b.id })).toBe(true);
    expect(vault.getTodos().map((t) => t.task)).toEqual(["A", "B", "C"]);
  });

  it("refuses to move a todo next to itself, a subtask or nothing", () => {
    const a = add("A");
    const sub = vault.addSubtask(add("B").id, "step")!;
    expect(vault.moveTodo(a.id, { before: a.id })).toBe(false);
    expect(vault.moveTodo(a.id, { after: sub.id })).toBe(false);
    expect(vault.moveTodo(a.id, {})).toBe(false);
  });
});

describe("subtasks", () => {
  let todo: Todo;
  beforeEach(() => {
    todo = vault.addTodo({ task: "Set up the org", priority: null, status: "Open", tags: [], goals: [], notes: "" });
  });
  const tree = () =>
    vault.getTodos().map((t) => [t.task, ...t.subtasks.map(function show(s): unknown {
      const label = `${s.done ? "x " : ""}${s.text}`;
      return s.children.length ? [label, ...s.children.map(show)] : label;
    })]);

  it("adds subtasks at the end of a todo with ids from the file's id space", () => {
    const a = vault.addSubtask(todo.id, "Pick a name #naming")!;
    const b = vault.addSubtask(todo.id, "Invite team")!;
    expect(new Set([todo.id, a.id, b.id]).size).toBe(3);
    expect(read("todos.md")).toContain(`    - [ ] Pick a name #naming ^${a.id}\n    - [ ] Invite team ^${b.id}\n`);
    // Subtask tags are text, not the todo's tags.
    expect(vault.getTodo(todo.id)?.tags).toEqual([]);
    expect(vault.addSubtask("missing", "x")).toBeNull();
  });

  it("checking a subtask checks everything under it; unchecking leaves the rest", () => {
    const parent = vault.addSubtask(todo.id, "Invite team")!;
    const child = vault.addSubtask(todo.id, "Get the list")!;
    vault.moveSubtask(child.id, { into: parent.id });
    expect(vault.setSubtaskDone(parent.id, true)).toBe(true);
    expect(tree()).toEqual([["Set up the org", ["x Invite team", "x Get the list"]]]);
    vault.setSubtaskDone(parent.id, false);
    expect(tree()).toEqual([["Set up the org", ["Invite team", "x Get the list"]]]);
  });

  it("marking the todo done checks every subtask; reopening leaves them", () => {
    const a = vault.addSubtask(todo.id, "A")!;
    const b = vault.addSubtask(todo.id, "B")!;
    vault.moveSubtask(b.id, { into: a.id });
    vault.updateTodo(todo.id, { status: "Done" }, "2026-09-28");
    expect(tree()).toEqual([["Set up the org", ["x A", "x B"]]]);
    vault.updateTodo(todo.id, { status: "Open" }, "2026-09-28");
    expect(tree()).toEqual([["Set up the org", ["x A", "x B"]]]);
  });

  it("saving a todo that is already done doesn't re-check a subtask the user unchecked", () => {
    const a = vault.addSubtask(todo.id, "A")!;
    vault.updateTodo(todo.id, { status: "Done" }, "2026-09-28");
    vault.setSubtaskDone(a.id, false);
    // The edit form always sends the status.
    vault.updateTodo(todo.id, { task: "Set up the org (typo fixed)", status: "Done" }, "2026-09-28");
    expect(tree()).toEqual([["Set up the org (typo fixed)", "A"]]);
  });

  it("moves a subtask into a todo further down the file", () => {
    const below = todo;
    const above = vault.addTodo({ task: "Above", priority: null, status: "Open", tags: [], goals: [], notes: "" });
    const a = vault.addSubtask(above.id, "A")!;
    vault.addSubtask(below.id, "B");
    expect(vault.moveSubtask(a.id, { into: below.id })).toBe(true);
    expect(tree()).toEqual([["Above"], ["Set up the org", "B", "A"]]);
  });

  it("edits a subtask's text and deletes it with everything under it, keeping a copy in the trash", () => {
    const a = vault.addSubtask(todo.id, "A")!;
    const b = vault.addSubtask(todo.id, "B")!;
    vault.moveSubtask(b.id, { into: a.id });
    expect(vault.editSubtask(a.id, "  A edited  ")).toBe(true);
    expect(vault.getTodo(todo.id)?.subtasks[0].text).toBe("A edited");
    expect(vault.deleteSubtask(a.id)).toBe(true);
    expect(vault.getTodo(todo.id)?.subtasks).toEqual([]);
    expect(read(".trash", "deleted.md")).toContain(`    - [ ] A edited ^${a.id}\n        - [ ] B ^${b.id}\n`);
    expect(vault.deleteSubtask(a.id)).toBe(false);
  });

  it("trashes subtasks with their todo", () => {
    const a = vault.addSubtask(todo.id, "A")!;
    vault.deleteTodo(todo.id);
    expect(read(".trash", "deleted.md")).toContain(`- [ ] A ^${a.id}`);
    expect(read("todos.md")).not.toContain("- [ ] A");
  });

  it("moves subtasks before, after and into others, and across todos", () => {
    const other = vault.addTodo({ task: "Other", priority: null, status: "Open", tags: [], goals: [], notes: "" });
    const a = vault.addSubtask(todo.id, "A")!;
    const b = vault.addSubtask(todo.id, "B")!;
    const c = vault.addSubtask(todo.id, "C")!;
    expect(vault.moveSubtask(c.id, { before: a.id })).toBe(true);
    expect(vault.moveSubtask(b.id, { into: c.id })).toBe(true);
    expect(tree()).toEqual([["Other"], ["Set up the org", ["C", "B"], "A"]]);
    // Outdent: B becomes the sibling right after its parent.
    expect(vault.moveSubtask(b.id, { after: c.id })).toBe(true);
    expect(vault.moveSubtask(a.id, { into: other.id })).toBe(true);
    expect(tree()).toEqual([["Other", "A"], ["Set up the org", "C", "B"]]);
  });

  it("refuses moves into itself, under its own children, or next to a todo", () => {
    const a = vault.addSubtask(todo.id, "A")!;
    const b = vault.addSubtask(todo.id, "B")!;
    vault.moveSubtask(b.id, { into: a.id });
    expect(vault.moveSubtask(a.id, { into: a.id })).toBe(false);
    expect(vault.moveSubtask(a.id, { into: b.id })).toBe(false);
    expect(vault.moveSubtask(a.id, { after: b.id })).toBe(false);
    expect(vault.moveSubtask(a.id, { before: todo.id })).toBe(false);
    expect(vault.moveSubtask("missing", { into: todo.id })).toBe(false);
  });

  it("gives hand-written subtasks an id, rewriting only their lines", () => {
    writeFileSync(
      join(root, "todos.md"),
      "---\ntype: todos\n---\n\n- [ ] Hand written ^t1\n  odd   note spacing\n  - [/] No id\n      - [x] Deeper, no id\n",
    );
    const [only] = vault.getTodos();
    const [first] = only.subtasks;
    const [deeper] = first.children;
    expect(first.id).toBeTruthy();
    expect(deeper).toMatchObject({ text: "Deeper, no id", done: true });
    expect(read("todos.md")).toBe(
      `---\ntype: todos\n---\n\n- [ ] Hand written ^t1\n  odd   note spacing\n  - [/] No id ^${first.id}\n      - [x] Deeper, no id ^${deeper.id}\n`,
    );
  });
});

describe("applyTodoPatch", () => {
  const base: Todo = {
    id: "x", status: "Open", task: "T", tags: [], goals: [], priority: null, minutes: null,
    isHighlight: false, createdOn: null, completedOn: null, notes: "", subtasks: [],
  };

  it("uses an explicit completion day when given (backfilling)", () => {
    expect(applyTodoPatch(base, { status: "Done", completedOn: "2026-09-25" }, "2026-09-28").completedOn).toBe("2026-09-25");
  });
});

describe("goals", () => {
  it("creates goal files with unique slugs and keeps the slug when renamed", () => {
    const first = vault.createGoal({ title: "Improve reliability", cycle: "2026", body: "Fewer pages." });
    const second = vault.createGoal({ title: "Improve reliability", cycle: "2026", body: "" });
    expect([first.slug, second.slug]).toEqual(["improve-reliability", "improve-reliability-2"]);

    vault.saveGoal(first.slug, { title: "Improve platform reliability", cycle: "2026", status: "achieved", body: "Done." });
    expect(vault.getGoal("improve-reliability")).toMatchObject({ title: "Improve platform reliability", status: "achieved", body: "Done." });
  });

  it("finds a long duplicate-titled goal by its suffixed slug", () => {
    const title = "A very long goal title that runs well past the slug length limit";
    vault.createGoal({ title, cycle: "2026", body: "" });
    const second = vault.createGoal({ title, cycle: "2026", body: "" });
    expect(second.slug.length).toBeGreaterThan(48);
    expect(vault.getGoal(second.slug)?.title).toBe(title);
  });

  it("names a goal reused in a new cycle after that cycle", () => {
    vault.createGoal({ title: "Improve reliability", cycle: "2026", body: "" });
    expect(vault.createGoal({ title: "Improve reliability", cycle: "2027", body: "" }).slug).toBe("improve-reliability-2027");
  });

  it("refuses slugs that aren't plain slugs", () => {
    expect(vault.getGoal("../todos")).toBeNull();
  });
});

describe("tag counts", () => {
  it("counts tags across entries and todos, most used first, then by name", () => {
    vault.addEntries("2026-09-27", ["Paired #review", "Fixed #ops #review"], noMeta);
    vault.addEntries("2026-09-28", ["Docs #docs"], noMeta);
    vault.addTodo({ task: "Ship #ops", priority: null, status: "Open", tags: [], goals: [], notes: "" });
    vault.addTodo({ task: "Write #review", priority: null, status: "Done", tags: [], goals: [], notes: "" });
    expect(vault.getTagCounts()).toEqual([
      ["review", 3],
      ["ops", 2],
      ["docs", 1],
    ]);
  });
});
