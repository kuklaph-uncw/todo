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

describe("applyTodoPatch", () => {
  const base: Todo = {
    id: "x", status: "Open", task: "T", tags: [], goals: [], priority: null,
    isHighlight: false, createdOn: null, completedOn: null, notes: "",
  };

  it("uses an explicit completion day when given (backfilling)", () => {
    expect(applyTodoPatch(base, { status: "Done", completedOn: "2026-09-25" }, "2026-09-28").completedOn).toBe("2026-09-25");
  });

  it("does not stamp a date when cancelling", () => {
    expect(applyTodoPatch(base, { status: "Cancelled" }, "2026-09-28").completedOn).toBeNull();
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
