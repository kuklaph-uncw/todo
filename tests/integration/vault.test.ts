import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyTodoPatch, renameInBlocks, type Vault } from "../../src/vault/vault";
import { isGoalSlug, slugify } from "../../src/lib/validation";
import { entryView, parseEntryBlocks, type Todo } from "../../src/vault/format";
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

  it("stores each multi-line input as one block and normalizes its input boundary", () => {
    const [entry] = vault.addEntries(
      "2026-09-28",
      ["\n[x] Shipped #ops \n  Ran **checks**:  \n\n  - tables #data [[delivery]]\n    - counts \n\n"],
      { ...noMeta, time: "09:15", minutes: 45 },
    );
    expect(read("journal", "2026", "2026-09-28.md")).toBe(
      [
        "---",
        "date: 2026-09-28",
        "---",
        "",
        `- 09:15 Shipped #ops ⏱ 45m ^${entry.id}`,
        "      Ran **checks**:",
        "",
        "      - tables #data [[delivery]]",
        "        - counts",
        "",
      ].join("\n"),
    );
    expect(vault.getEntries("2026-09-28")).toEqual([entry]);
    const texts = ["Title\n\n  Body", "- Parent\n  - Child"];
    const created = vault.addEntries("2026-09-29", texts, noMeta);
    expect(created.map((item) => item.text)).toEqual(texts);
    expect(vault.getEntries("2026-09-29")).toEqual(created);
  });

  it("adds new entries after existing ones, leaving the user's other notes alone", () => {
    const dir = join(root, "journal", "2026");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "2026-09-28.md"),
      "# Monday\n\n- First thing\n    A paragraph\n\n    - a bullet\n\nFree-form notes stay here.\n",
    );
    vault.addEntries("2026-09-28", ["Second thing"], noMeta);
    const lines = read("journal", "2026", "2026-09-28.md").split("\n");
    expect(lines[0]).toBe("# Monday");
    expect(lines[2]).toMatch(/^- First thing \^\w+$/);
    expect(lines.slice(3, 6)).toEqual(["    A paragraph", "", "    - a bullet"]);
    expect(lines[6]).toMatch(/^- Second thing \^\w+$/);
    expect(lines.slice(7)).toEqual(["", "Free-form notes stay here.", ""]);
  });

  it("preserves literal whitespace inside journal code fences on creation and reread", () => {
    const texts = [
      "```text\nvalue  \n   \n\tnext\n```",
      "Intro\n\n~~~\nvalue  \n \t \nnext\n~~~\n\nAfter",
      "Intro\n\n- Code\n  ```\n  value  \n     \n  next\n  ```",
    ];
    const entries = vault.addEntries("2026-09-28", texts, noMeta);
    expect(entries.map((entry) => entry.text)).toEqual(texts);
    expect(vault.getEntries("2026-09-28").map((entry) => entry.text)).toEqual(texts);
  });

  it("gives hand-written blocks an id by changing only their first line", () => {
    const dir = join(root, "journal", "2026");
    mkdirSync(dir, { recursive: true });
    const body = "\n  - Nested list #ops\n\n    - Child [[delivery]]\n\nOther notes\n";
    writeFileSync(join(dir, "2026-09-27.md"), `- Typed in another editor${body}`);
    const [entry] = vault.getEntries("2026-09-27");
    expect(entry.id).toMatch(/^\w{6}$/);
    expect(entry.text).toBe("Typed in another editor\n- Nested list #ops\n\n  - Child [[delivery]]");
    expect(read("journal", "2026", "2026-09-27.md")).toBe(`- Typed in another editor ^${entry.id}${body}`);
    expect(vault.getEntries("2026-09-27")).toEqual([entry]);
  });

  it("updates and deletes by id; deletes are logged to .trash", () => {
    const dir = join(root, "journal", "2026");
    mkdirSync(dir, { recursive: true });
    const before = "# Monday\n\n";
    const after = "\n\nFree-form notes\n- Neighbour ^next\n    Keep this body\n";
    writeFileSync(join(dir, "2026-09-28.md"), `${before}- Draft ^draft\n    Old paragraph\n\n    - old bullet${after}`);
    const [entry, neighbour] = vault.getEntries("2026-09-28");
    vault.updateEntry("2026-09-28", entry.id, (e) => ({
      ...e,
      text: "Final\nNew paragraph\n\n- new bullet\n  - nested",
      isHighlight: true,
    }));
    const updated = `- Final ⭐ ^${entry.id}\n    New paragraph\n\n    - new bullet\n      - nested`;
    expect(read("journal", "2026", "2026-09-28.md")).toBe(`${before}${updated}${after}`);

    expect(vault.deleteEntry("2026-09-28", entry.id)).toBe(true);
    expect(read("journal", "2026", "2026-09-28.md")).toBe(`${before}${after.slice(1)}`);
    expect(vault.getEntries("2026-09-28")).toEqual([neighbour]);
    expect(read(".trash", "deleted.md").split("\n").slice(1)).toEqual([
      `    - Final ⭐ ^${entry.id}`,
      "        New paragraph",
      "    ",
      "        - new bullet",
      "          - nested",
      "",
    ]);
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
    const todo = vault.addTodo(
      { task: "Fix auth test #bug", priority: "High", status: "Open", tags: [], goals: ["reliability"], notes: "" },
      "2026-09-20",
    );
    expect(todo).toMatchObject({
      task: "Fix auth test",
      tags: ["bug"],
      goals: ["reliability"],
      createdOn: "2026-09-20",
      completedOn: null,
    });
    expect(read("todos.md")).toContain(`- [ ] Fix auth test #bug [[reliability]] ⏫ ➕ 2026-09-20 ^${todo.id}`);
  });

  it("freezes the first completion date through reopen and re-close", () => {
    const todo = vault.addTodo(
      { task: "Ship", priority: null, status: "Open", tags: [], goals: [], notes: "" },
      "2026-09-20",
    );
    vault.updateTodo(todo.id, { status: "Done" }, "2026-09-21");
    vault.updateTodo(todo.id, { status: "Open" }, "2026-09-22");
    expect(vault.getTodo(todo.id)).toMatchObject({ status: "Open", completedOn: "2026-09-21" });
    vault.updateTodo(todo.id, { status: "Done" }, "2026-09-25");
    expect(vault.getTodo(todo.id)?.completedOn).toBe("2026-09-21");
  });

  it("clears the completion date only when asked", () => {
    const todo = vault.addTodo(
      { task: "Ship", priority: null, status: "Done", tags: [], goals: [], notes: "" },
      "2026-09-20",
    );
    expect(todo.completedOn).toBe("2026-09-20");
    vault.updateTodo(todo.id, { clearCompletion: true });
    expect(vault.getTodo(todo.id)?.completedOn).toBeNull();
  });

  it("keeps notes attached when editing and removes them with the todo", () => {
    const a = vault.addTodo({
      task: "A",
      priority: null,
      status: "Open",
      tags: [],
      goals: [],
      notes: "line one\nline two",
    });
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
    vault.getTodos().map((t) => [
      t.task,
      ...t.subtasks.map(function show(s): unknown {
        const label = `${s.done ? "x " : ""}${s.text}`;
        return s.children.length ? [label, ...s.children.map(show)] : label;
      }),
    ]);

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
    expect(tree()).toEqual([
      ["Other", "A"],
      ["Set up the org", "C", "B"],
    ]);
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
    id: "x",
    status: "Open",
    task: "T",
    tags: [],
    goals: [],
    priority: null,
    minutes: null,
    isHighlight: false,
    createdOn: null,
    dueOn: null,
    completedOn: null,
    notes: "",
    subtasks: [],
  };

  it("uses an explicit completion day when given (backfilling)", () => {
    expect(applyTodoPatch(base, { status: "Done", completedOn: "2026-09-25" }, "2026-09-28").completedOn).toBe(
      "2026-09-25",
    );
  });
});

describe("goals", () => {
  const fields = { description: "", meeting: "", exceeding: "", notes: "" };

  it("creates goal files with unique slugs and keeps the slug when renamed", () => {
    const first = vault.createGoal({ title: "Improve reliability", cycle: "2026", description: "Fewer pages." });
    const second = vault.createGoal({ title: "Improve reliability", cycle: "2026" });
    expect([first.slug, second.slug]).toEqual(["improve-reliability", "improve-reliability-2"]);

    vault.saveGoal(first.slug, {
      ...fields,
      title: "Improve platform reliability",
      status: "agreed",
      description: "Fewer pages.",
      meeting: "Runbooks.",
    });
    expect(vault.getGoal("improve-reliability")).toMatchObject({
      title: "Improve platform reliability",
      cycle: "2026",
      status: "agreed",
      description: "Fewer pages.",
      meeting: "Runbooks.",
    });
    expect(read("goals", "improve-reliability.md")).toContain("## Meeting expectations\n\nRunbooks.\n");
  });

  it("starts new goals as drafts, numbered after the others of their cycle and kind", () => {
    const a = vault.createGoal({ title: "A", cycle: "2026" });
    const b = vault.createGoal({ title: "B", cycle: "2026" });
    const plan = vault.createGoal({ title: "Learn", cycle: "2026", kind: "activity", description: "Courses." });
    const next = vault.createGoal({ title: "Next year", cycle: "2027" });
    expect([a.order, b.order, plan.order, next.order]).toEqual([1, 2, 1, 1]);
    expect(a).toMatchObject({ status: "draft", kind: "goal", droppedOn: null });
    expect(vault.getGoal(plan.slug)).toMatchObject({ kind: "activity", description: "Courses." });
  });

  it("lists goals newest cycle first, goals before activities, then by order and title", () => {
    vault.createGoal({ title: "Old", cycle: "2025" });
    vault.createGoal({ title: "Zed", cycle: "2026" });
    vault.createGoal({ title: "Plan", cycle: "2026", kind: "activity" });
    vault.createGoal({ title: "Alpha", cycle: "2026" });
    mkdirSync(join(root, "goals"), { recursive: true });
    writeFileSync(join(root, "goals", "hand.md"), "---\ntitle: Hand written\ncycle: 2026\n---\n");
    expect(vault.getGoals().map((goal) => goal.title)).toEqual(["Zed", "Alpha", "Hand written", "Plan", "Old"]);
  });

  describe("changing a goal's link", () => {
    const day = (date: string, body: string) => {
      mkdirSync(join(root, "journal", date.slice(0, 4)), { recursive: true });
      writeFileSync(join(root, "journal", date.slice(0, 4), `${date}.md`), body);
    };

    it("renames the file and rewrites links in entries, todos, notes and subtasks only", () => {
      vault.createGoal({ title: "Old", cycle: "2026", description: "Kept." });
      vault.createGoal({ title: "Old 2", cycle: "2026" });
      day(
        "2026-09-01",
        [
          "---",
          "date: 2026-09-01",
          "---",
          "A loose line [[old]] outside any entry.",
          "",
          "- 09:00 Shipped it [[old]] ^aaaaaa",
          "    Body with [[old|the old goal]] and [[ old ]], `code [[old]]`, ``[[old]]`` and [[old-2]] [[older]].",
          "    ```",
          "    [[old]] in a fence",
          "    ```",
          "    After the fence [[old]]",
          "- 10:00 Unrelated [[old-2]] ^bbbbbb",
          "",
        ].join("\n"),
      );
      day("2026-09-02", "- Nothing here ^cccccc\n");
      writeFileSync(
        join(root, "todos.md"),
        [
          "- [ ] Follow up [[old]] ^dddddd",
          "    A note about [[old]] and `[[old]]`",
          "    - [ ] Subtask [[old|label]] ^eeeeee",
          "        - [x] Nested [[old]] ^ffffff",
          "- [ ] Other [[older]] ^gggggg",
          "",
        ].join("\n"),
      );
      const untouched = read("journal", "2026", "2026-09-02.md");

      expect(vault.renameGoal("old", "shipping")).toEqual({ slug: "shipping", entries: 1, todos: 1, failed: 0 });
      expect(vault.getGoal("old")).toBeNull();
      expect(vault.getGoal("shipping")).toMatchObject({ title: "Old", description: "Kept.", order: 1 });
      expect(read("journal", "2026", "2026-09-01.md")).toBe(
        [
          "---",
          "date: 2026-09-01",
          "---",
          "A loose line [[old]] outside any entry.",
          "",
          "- 09:00 Shipped it [[shipping]] ^aaaaaa",
          "    Body with [[shipping|the old goal]] and [[ shipping ]], `code [[old]]`, ``[[old]]`` and [[old-2]] [[older]].",
          "    ```",
          "    [[old]] in a fence",
          "    ```",
          "    After the fence [[shipping]]",
          "- 10:00 Unrelated [[old-2]] ^bbbbbb",
          "",
        ].join("\n"),
      );
      expect(read("todos.md")).toBe(
        [
          "- [ ] Follow up [[shipping]] ^dddddd",
          "    A note about [[shipping]] and `[[old]]`",
          "    - [ ] Subtask [[shipping|label]] ^eeeeee",
          "        - [x] Nested [[shipping]] ^ffffff",
          "- [ ] Other [[older]] ^gggggg",
          "",
        ].join("\n"),
      );
      expect(read("journal", "2026", "2026-09-02.md")).toBe(untouched);
      expect(vault.getEntries("2026-09-01")[0].goals).toEqual(["shipping", "old-2", "older"]);
      expect(vault.getTodos()[0].goals).toEqual(["shipping"]);
    });

    it("finishes the other files and counts the ones it couldn't write", () => {
      vault.createGoal({ title: "Old", cycle: "2026" });
      day("2026-09-01", "- One [[old]] ^aaaaaa\n");
      day("2026-09-02", "- Two [[old]] ^bbbbbb\n");
      // A folder where the atomic write puts its temp file makes that one write fail.
      mkdirSync(join(root, "journal", "2026", "2026-09-01.md.tmp"));
      expect(vault.renameGoal("old", "new")).toEqual({ slug: "new", entries: 1, todos: 0, failed: 1 });
      expect(read("journal", "2026", "2026-09-01.md")).toBe("- One [[old]] ^aaaaaa\n");
      expect(read("journal", "2026", "2026-09-02.md")).toBe("- Two [[new]] ^bbbbbb\n");
      expect(vault.getGoal("new")).not.toBeNull();
    });

    it("keeps a block exactly as it was, and counts it, when a rewrite wouldn't read the same", () => {
      const date = "2026-09-01";
      const view = (block: string[], renamed: boolean) =>
        renamed ? entryView(block, date, "old", "new") : entryView(block, date);
      const original = ["- Real [[old]] and `[[old]]` ^aaaaaa", "- Other [[old]] ^bbbbbb", "- Unrelated ^cccccc"];

      // Rewrites code too: the first entry would read differently, so it's kept; the second is fine.
      const careless = [...original];
      const replaceAll = (block: string[]) => block.map((line) => line.replaceAll("[[old]]", "[[new]]"));
      expect(renameInBlocks(careless, parseEntryBlocks(careless, date), replaceAll, view)).toEqual({
        changed: 1,
        failed: 1,
      });
      expect(careless).toEqual([original[0], "- Other [[new]] ^bbbbbb", original[2]]);

      // Misses real links: both linked entries are counted, nothing changes.
      const lazy = [...original];
      expect(renameInBlocks(lazy, parseEntryBlocks(lazy, date), (block) => block, view)).toEqual({
        changed: 0,
        failed: 2,
      });
      expect(lazy).toEqual(original);
    });

    it("passes the checked slug through as is", () => {
      vault.createGoal({ title: "Old", cycle: "2026" });
      expect(vault.renameGoal("old", "Hello")?.slug).toBe("Hello");
      expect(vault.getGoal("Hello")).not.toBeNull();
    });

    it("refuses an empty, reserved or taken link, and changes nothing", () => {
      vault.createGoal({ title: "Old", cycle: "2026" });
      vault.createGoal({ title: "Taken", cycle: "2026" });
      expect(vault.goalLinkProblem("old", slugify("!!!"))).toBe("A link needs at least one letter or number.");
      expect(vault.goalLinkProblem("old", "carry")).toBe("That link is reserved. Pick another.");
      expect(vault.goalLinkProblem("old", "taken")).toBe("Another goal already uses [[taken]].");
      expect(vault.goalLinkProblem("old", "fresh")).toBeNull();
      // slugify no longer splits a rare character at its 48-character cut, so the link stays usable.
      const long = slugify(`${"a".repeat(47)}\u{20000}b`);
      expect(long).toBe(`${"a".repeat(47)}\u{20000}`);
      expect(vault.goalLinkProblem("old", long)).toBeNull();
      // Half of one, or anything else that isn't a slug, is still refused.
      expect(vault.goalLinkProblem("old", `${"a".repeat(47)}\uD840`)).toBe(
        "Use letters and numbers, joined by single hyphens.",
      );
      expect(() => vault.renameGoal("old", "taken")).toThrow("Another goal already uses [[taken]].");
      expect(vault.getGoal("old")).not.toBeNull();
      expect(vault.renameGoal("missing", "fresh")).toBeNull();
    });
  });

  it("moves a goal up or down among the live goals of its cycle and kind", () => {
    const a = vault.createGoal({ title: "A", cycle: "2026" });
    const gone = vault.createGoal({ title: "Gone", cycle: "2026" });
    const b = vault.createGoal({ title: "B", cycle: "2026" });
    const c = vault.createGoal({ title: "C", cycle: "2026" });
    vault.createGoal({ title: "Plan", cycle: "2026", kind: "activity" });
    vault.createGoal({ title: "Other year", cycle: "2025" });
    vault.saveGoal(gone.slug, { ...gone, status: "dropped" });
    const order = () =>
      vault
        .getGoals()
        .filter((goal) => goal.cycle === "2026" && goal.kind === "goal")
        .map((goal) => `${goal.title}:${goal.order}`);

    expect(vault.moveGoal(c.slug, "up")).toBe(true);
    // Live goals renumber 1..n in the new order; dropped ones follow.
    expect(order()).toEqual(["A:1", "C:2", "B:3", "Gone:4"]);
    expect(vault.moveGoal(a.slug, "up")).toBe(false);
    expect(vault.moveGoal(b.slug, "down")).toBe(false);
    expect(vault.moveGoal(gone.slug, "up")).toBe(false);
    expect(vault.moveGoal(a.slug, "down")).toBe(true);
    expect(order()).toEqual(["C:1", "A:2", "B:3", "Gone:4"]);
    expect(vault.getGoal("plan")?.order).toBe(1);
    expect(vault.moveGoal("missing", "up")).toBe(false);
  });

  it("stamps the drop date when dropped and clears it when restored", () => {
    const goal = vault.createGoal({ title: "Retire the server", cycle: "2026" });
    const change = { ...fields, title: goal.title };
    expect(vault.saveGoal(goal.slug, { ...change, status: "dropped" }, "2026-05-12")?.droppedOn).toBe("2026-05-12");
    expect(read("goals", `${goal.slug}.md`)).toContain("dropped: 2026-05-12\n");
    // Saving again while dropped keeps the first date.
    expect(vault.saveGoal(goal.slug, { ...change, status: "dropped" }, "2026-06-01")?.droppedOn).toBe("2026-05-12");
    expect(vault.saveGoal(goal.slug, { ...change, status: "agreed" }, "2026-06-02")?.droppedOn).toBeNull();
    expect(read("goals", `${goal.slug}.md`)).not.toContain("dropped:");
  });

  it("doesn't invent a drop date for a goal dropped before dates were kept", () => {
    mkdirSync(join(root, "goals"), { recursive: true });
    writeFileSync(join(root, "goals", "old.md"), "---\ntitle: Old\ncycle: 2025\nstatus: dropped\n---\n");
    const old = vault.getGoal("old")!;
    expect(vault.saveGoal("old", { ...old, notes: "Typo fixed." }, "2026-09-28")?.droppedOn).toBeNull();
  });

  it("ignores a drop date that isn't a date, or on a goal that isn't dropped", () => {
    mkdirSync(join(root, "goals"), { recursive: true });
    writeFileSync(join(root, "goals", "a.md"), "---\ntitle: A\nstatus: dropped\ndropped: yes\n---\n");
    writeFileSync(join(root, "goals", "b.md"), "---\ntitle: B\nstatus: agreed\ndropped: 2026-05-12\n---\n");
    expect(vault.getGoal("a")?.droppedOn).toBeNull();
    expect(vault.getGoal("b")?.droppedOn).toBeNull();
  });

  it("adds a new goal after goals written before ordering, numbering those first", () => {
    mkdirSync(join(root, "goals"), { recursive: true });
    writeFileSync(join(root, "goals", "zed.md"), "---\ntitle: Zed\ncycle: 2026\nstatus: active\n---\nOld body.\n");
    writeFileSync(join(root, "goals", "alpha.md"), "---\ntitle: Alpha\ncycle: 2026\nstatus: active\n---\n");
    vault.createGoal({ title: "Brand new", cycle: "2026" });
    expect(vault.getGoals().map((goal) => [goal.title, goal.order])).toEqual([
      ["Alpha", 1],
      ["Zed", 2],
      ["Brand new", 3],
    ]);
    expect(vault.getGoal("zed")?.notes).toBe("Old body.");
  });

  it("finds a long duplicate-titled goal by its suffixed slug", () => {
    const title = "A very long goal title that runs well past the slug length limit";
    vault.createGoal({ title, cycle: "2026" });
    const second = vault.createGoal({ title, cycle: "2026" });
    expect(second.slug.length).toBeGreaterThan(48);
    expect(vault.getGoal(second.slug)?.title).toBe(title);
  });

  it("turns control characters in names and cycles into spaces, as it does line breaks", () => {
    const goal = vault.createGoal({ title: "Ship\u0001it\u007f now", cycle: "\u00002026\u001f" });
    expect(goal).toMatchObject({ title: "Ship it now", cycle: "2026" });
    expect(vault.getGoal(goal.slug)).toMatchObject({ title: "Ship it now", cycle: "2026" });
    const saved = vault.saveGoal(goal.slug, { ...goal, title: "Ship\u0007 again" })!;
    expect(saved.title).toBe("Ship again");
    const control = (char: string) => (char < " " && char !== "\t" && char !== "\n") || char === "\u007f";
    expect([...read("goals", `${goal.slug}.md`)].filter(control)).toEqual([]);
  });

  it("keeps a cycle's own spacing, so a goal joins a hand-written cycle like 'FY  2027'", () => {
    expect(vault.createGoal({ title: "Spaced", cycle: "FY  2027" }).cycle).toBe("FY  2027");
    expect(vault.createGoal({ title: "Wide", cycle: "FY\u00a02027" }).cycle).toBe("FY\u00a02027");
    expect(vault.createGoal({ title: "Odd", cycle: "FY\u00852027\u2028" }).cycle).toBe("FY 2027");
    expect(vault.createGoal({ title: "Next\u0085line", cycle: "2026" }).title).toBe("Next line");
  });

  it("names a goal reused in a new cycle after that cycle", () => {
    vault.createGoal({ title: "Improve reliability", cycle: "2026" });
    expect(vault.createGoal({ title: "Improve reliability", cycle: "2027" }).slug).toBe("improve-reliability-2027");
  });

  it("keeps the cycle in the link of a long FCP-style name reused in a new cycle", () => {
    const title = "Improve Client Communication, Service Delivery, and Stakeholder Engagement Across Campus Units";
    vault.createGoal({ title, cycle: "2026" });
    const next = vault.createGoal({ title, cycle: "2027" }).slug;
    expect(next).toStartWith("improve-client-communication-service-");
    expect(next).toEndWith("-2027");
    expect(next.length).toBeLessThanOrEqual(48);
  });

  it("always writes a slug the app can open, even when a long name ends in a letter outside the BMP", () => {
    const title = `${"a".repeat(47)}\u{20000}`;
    const first = vault.createGoal({ title, cycle: "2026" });
    const second = vault.createGoal({ title, cycle: "2026" });
    for (const goal of [first, second]) {
      expect(isGoalSlug(goal.slug)).toBe(true);
      expect(vault.getGoal(goal.slug)?.title).toBe(title);
    }
    expect(first.slug).toBe(`${"a".repeat(47)}\u{20000}`);
    expect(vault.getGoals()).toHaveLength(2);
  });

  it("drops the cycle suffix when a long cycle leaves no room for the name", () => {
    vault.createGoal({ title: "Same", cycle: "2026" });
    const cycle = "b".repeat(50);
    const goal = vault.createGoal({ title: "Same", cycle });
    expect(isGoalSlug(goal.slug)).toBe(true);
    expect(goal.slug).toBe("same-2");
    expect(vault.getGoal(goal.slug)?.cycle).toBe(cycle);
    // A cycle that leaves some room keeps a shortened name in front of it.
    const roomy = vault.createGoal({ title: "Same", cycle: "c".repeat(40) });
    expect(roomy.slug).toBe(`same-${"c".repeat(40)}`);
  });

  it("keeps hand-written frontmatter keys when it renumbers, saves or moves a goal", () => {
    mkdirSync(join(root, "goals"), { recursive: true });
    const extras = ["tags: [work]", "aliases: hand-goal", "related:", "  - first", "created: 2020-01-01"];
    writeFileSync(
      join(root, "goals", "hand.md"),
      ["---", "title: Hand", ...extras, "cycle: 2026", "---", ""].join("\n"),
    );
    // Adding a goal to the same cycle numbers the hand-written one first, rewriting its file.
    vault.createGoal({ title: "New", cycle: "2026" });
    const lines = () => read("goals", "hand.md").split("\n");
    expect(vault.getGoal("hand")?.order).toBe(1);
    for (const extra of extras) expect(lines()).toContain(extra);
    expect(lines().indexOf("related:") + 1).toBe(lines().indexOf("  - first"));

    const hand = vault.getGoal("hand")!;
    vault.saveGoal("hand", { ...hand, notes: "Edited." });
    vault.moveGoal("hand", "down");
    expect(vault.getGoal("hand")).toMatchObject({ notes: "Edited.", order: 2 });
    for (const extra of extras) expect(lines()).toContain(extra);
  });

  it("never names a goal after a Windows device name, which Windows won't open as a file", () => {
    expect(vault.createGoal({ title: "Con", cycle: "2026" }).slug).toBe("con-2");
    expect(vault.createGoal({ title: "NUL", cycle: "2026" }).slug).toBe("nul-2");
    expect(vault.createGoal({ title: "LPT9", cycle: "2026" }).slug).toBe("lpt9-2");
    // Only the exact names: ones that merely start with them are fine.
    for (const title of ["Console", "COM10", "Auxiliary", "com0"])
      expect(vault.createGoal({ title, cycle: "2026" }).slug).toBe(title.toLowerCase());
    expect(vault.goalLinkProblem("con-2", "aux")).toBe("That link is reserved. Pick another.");
    expect(vault.goalLinkProblem("con-2", "COM1")).toBe("That link is reserved. Pick another.");
    expect(vault.goalLinkProblem("con-2", "com10")).not.toBe("That link is reserved. Pick another.");
  });

  it("never names a goal after the carry-over route", () => {
    expect(vault.createGoal({ title: "Carry", cycle: "2026" }).slug).toBe("carry-2");
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
