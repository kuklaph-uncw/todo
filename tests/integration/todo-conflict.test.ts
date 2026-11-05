import { expect, it } from "bun:test";
import { contentRevision } from "../../src/vault/revision";
import { handleRequest } from "../../src/server";
import { createTestContext, formPost, get } from "../helpers/test-vault";

it("rejects a stale form without overwriting agent changes or losing the user's submitted text", async () => {
  const ctx = createTestContext();
  try {
    const todo = ctx.vault.addTodo({ task: "Before", priority: null, status: "Open", tags: [], goals: [], notes: "" });
    const page = await (await handleRequest(get(`/todos?edit=${todo.id}`), ctx)).text();
    expect(page).toContain(`name="expected_revision" value="${contentRevision(todo)}"`);
    ctx.vault.updateTodo(todo.id, { task: "Agent update" });
    const response = await handleRequest(
      formPost(`/todos/${todo.id}`, {
        task: "My unsaved change",
        notes: "My notes",
        expected_revision: contentRevision(todo),
      }),
      ctx,
    );
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("My unsaved change");
    expect(ctx.vault.getTodo(todo.id)?.task).toBe("Agent update");
  } finally {
    ctx.cleanup();
  }
});
