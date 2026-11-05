import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TodoService } from "../../src/mcp/todos";
import { createTestContext } from "../helpers/test-vault";

let ctx: ReturnType<typeof createTestContext>;
beforeEach(() => {
  ctx = createTestContext();
});
afterEach(() => ctx.cleanup());

describe("MCP task operations", () => {
  it("keeps read tools read-only, including hand-written tasks without IDs", () => {
    const source = "- [ ] Hand written\n    - [ ] Child\n";
    writeFileSync(join(ctx.root, "todos.md"), source);
    const service = new TodoService(ctx.vault, ctx.clock);
    expect(service.list({}).todos).toHaveLength(1);
    expect(readFileSync(join(ctx.root, "todos.md"), "utf8")).toBe(source);
  });

  it("deduplicates retries, rejects reused keys and stale revisions, and preserves completion rules", () => {
    const service = new TodoService(ctx.vault, ctx.clock);
    const first = service.execute("add_todo", { task: "Ship #ops", requestId: "create-1" });
    expect(service.execute("add_todo", { task: "Ship #ops", requestId: "create-1" })).toEqual(first);
    expect(() => service.execute("add_todo", { task: "Other", requestId: "create-1" })).toThrow("requestId");
    expect(ctx.vault.getTodos()).toHaveLength(1);
    const todo = service.list({}).todos[0];
    service.execute("add_subtask", {
      id: todo.id,
      expectedRevision: todo.revision,
      text: "Verify",
      requestId: "child-1",
    });
    expect(() =>
      service.execute("update_todo", {
        id: todo.id,
        expectedRevision: todo.revision,
        task: "Stale",
        requestId: "edit-1",
      }),
    ).toThrow("changed");
    const current = service.get(todo.id);
    service.execute("set_todo_status", {
      id: todo.id,
      expectedRevision: current.revision,
      status: "Done",
      requestId: "done-1",
    });
    expect(ctx.vault.getTodo(todo.id)).toMatchObject({ completedOn: "2026-09-28", subtasks: [{ done: true }] });
    const done = service.get(todo.id);
    service.execute("set_todo_status", {
      id: todo.id,
      expectedRevision: done.revision,
      status: "Open",
      requestId: "reopen-1",
    });
    expect(ctx.vault.getTodo(todo.id)?.completedOn).toBe("2026-09-28");
  });
});
