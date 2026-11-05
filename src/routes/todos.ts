import { isValidDateString } from "../lib/date";
import { isValidPriority, isValidStatus, safeReturnPath, type Priority, type Status } from "../lib/validation";
import type { MoveTarget } from "../vault/vault";
import { contentRevision } from "../vault/revision";
import { allSubtasks } from "../vault/format";
import { escapeHtml } from "../lib/html";
import { renderTodos, type TodoFilters } from "../views/todos";
import { notFound, page, readForm, redirect, redirectWithError, today, type AppContext } from "./shared";

function parseFilters(params: URLSearchParams): TodoFilters {
  const priority = params.get("priority") ?? "";
  return {
    q: params.get("q")?.trim() ?? "",
    priority: priority === "none" || isValidPriority(priority) ? priority || null : null,
    tag: params.get("tag") || null,
    goal: params.get("goal") || null,
  };
}

/** GET /todos */
export function handleTodos(req: Request, ctx: AppContext): Response {
  const url = new URL(req.url);
  const filters = parseFilters(url.searchParams);

  // Where forms on this page send you back to: same filters, no one-off state.
  const keep = new URLSearchParams();
  for (const name of ["q", "priority", "tag", "goal"]) {
    const value = url.searchParams.get(name);
    if (value) keep.set(name, value);
  }
  const returnTo = keep.size ? `/todos?${keep}` : "/todos";
  const back = url.searchParams.get("back");
  const error = url.searchParams.get("error");

  const todos = ctx.vault.getTodos();
  const main = renderTodos({
    todos,
    filters,
    allTags: [...new Set(todos.flatMap((t) => t.tags))].sort(),
    goals: ctx.vault.getGoals(),
    tagCounts: ctx.vault.getTagCounts(),
    editId: url.searchParams.get("edit"),
    error,
    returnTo,
    back: back ? safeReturnPath(back, "") || null : null,
    added: url.searchParams.get("added"),
    retry: error ? url.searchParams : null,
  });
  return page(ctx, "Todos", "todos", main);
}

/** before / after / into fields sent by a drag or a move hotkey. Blank ones are left out. */
function readMoveTarget(form: Awaited<ReturnType<typeof readForm>>): MoveTarget {
  const target: MoveTarget = {};
  for (const name of ["before", "after", "into"] as const) {
    const value = form.text(name);
    if (value) target[name] = value;
  }
  return target;
}

function readPriority(raw: string): Priority | null | undefined {
  if (raw === "") return null;
  return isValidPriority(raw) ? raw : undefined;
}

function staleForm(ctx: AppContext, form: Awaited<ReturnType<typeof readForm>>, back: string): Response {
  const typed = [form.text("task"), form.text("notes"), form.text("text")].filter(Boolean).join("\n\n");
  return page(
    ctx,
    "Todo changed",
    "todos",
    `<div class="page"><h1>Todo changed</h1><p class="notice" role="alert">This todo changed after the page was opened. Your action was not saved. Review the current todo before trying again.</p>${typed ? `<label class="field">Your submitted text<textarea readonly rows="8">${escapeHtml(typed)}</textarea></label>` : ""}<p><a class="btn" href="${escapeHtml(back)}">Review current todos</a></p></div>`,
    409,
  );
}

/** POST /todos */
export async function createTodo(req: Request, ctx: AppContext): Promise<Response> {
  const form = await readForm(req);
  const back = form.returnTo("/todos");
  const task = form.text("task").trim();
  if (!task) return redirectWithError(back, "A todo needs a task.");
  const priority = readPriority(form.text("priority"));
  if (priority === undefined) return redirectWithError(back, "Pick High, Medium, Low or no priority.");
  const status = form.text("status") || "Open";
  if (!isValidStatus(status)) return redirectWithError(back, "That status isn't one the app knows.");

  const todo = ctx.vault.addTodo(
    { task, priority, status, tags: [], goals: [], notes: form.text("notes") },
    today(ctx),
  );
  // Lets the Todos page explain when its filters hide the new todo.
  if (!back.startsWith("/todos")) return redirect(back);
  const url = new URL(back, "http://local");
  url.searchParams.set("added", todo.id);
  return redirect(`${url.pathname}${url.search}`);
}

/** POST /todos/:id and /todos/:id/{status,star,clear-completion,delete,subtasks,move} */
export async function changeTodo(
  req: Request,
  ctx: AppContext,
  id: string,
  action: string | undefined,
): Promise<Response> {
  const form = await readForm(req);
  const back = form.returnTo("/todos");
  const now = today(ctx);
  const existing = ctx.vault.getTodo(id);
  if (!existing) return notFound(ctx, "That todo");
  if (form.text("expected_revision") && form.text("expected_revision") !== contentRevision(existing))
    return staleForm(ctx, form, back);

  switch (action) {
    case "delete":
      ctx.vault.deleteTodo(id);
      return redirect(back);

    case "star":
      ctx.vault.updateTodo(id, { isHighlight: !existing.isHighlight }, now);
      return redirect(back);

    case "clear-completion":
      ctx.vault.updateTodo(id, { clearCompletion: true }, now);
      return redirect(back);

    case "subtasks": {
      const text = form.text("text").trim();
      if (!text) return redirectWithError(back, "A subtask needs some text.");
      ctx.vault.addSubtask(id, text);
      return redirect(back);
    }

    case "move":
      if (!ctx.vault.moveTodo(id, readMoveTarget(form))) return redirectWithError(back, "That todo can't move there.");
      return redirect(back);

    case "status": {
      const status = form.text("status");
      if (!isValidStatus(status)) return redirectWithError(back, "That status isn't one the app knows.");
      // Checking a todo off while viewing a past day records it on that day. Never in the future.
      const on = form.text("on");
      const completedOn = isValidDateString(on) && on <= now ? on : now;
      ctx.vault.updateTodo(id, { status: status as Status, completedOn }, now);
      return redirect(back);
    }

    case undefined: {
      const task = form.text("task").trim();
      // On error, reopen the editor with the same filters and what was typed.
      const editUrl = new URL(back, "http://local");
      if (editUrl.pathname === "/todos") {
        editUrl.searchParams.set("edit", id);
        editUrl.hash = `todo-${id}`;
      } else {
        editUrl.pathname = "/todos";
        editUrl.search = `?edit=${id}&back=${encodeURIComponent(back)}`;
        editUrl.hash = `todo-${id}`;
      }
      const retryAt = `${editUrl.pathname}${editUrl.search}${editUrl.hash}`;
      const keep: [string, string][] = [
        ["task", form.text("task")],
        ["priority", form.text("priority")],
        ["notes", form.text("notes")],
      ];
      if (!task) return redirectWithError(retryAt, "A todo needs a task.", keep);
      const priority = readPriority(form.text("priority"));
      if (priority === undefined) return redirectWithError(retryAt, "Pick High, Medium, Low or no priority.", keep);
      // Open or done is changed by the check button, not the editor.
      ctx.vault.updateTodo(id, { task, priority, notes: form.text("notes") }, now);
      return redirect(back);
    }

    default:
      return notFound(ctx);
  }
}

/** POST /subtasks/:id and /subtasks/:id/{done,delete,move} */
export async function changeSubtask(
  req: Request,
  ctx: AppContext,
  id: string,
  action: string | undefined,
): Promise<Response> {
  const form = await readForm(req);
  const back = form.returnTo("/todos");
  if (!ctx.vault.getSubtask(id)) return notFound(ctx, "That subtask");
  const parent = ctx.vault.peekTodos().find((todo) => allSubtasks(todo.subtasks).some((s) => s.id === id));
  if (parent && form.text("expected_revision") && form.text("expected_revision") !== contentRevision(parent))
    return staleForm(ctx, form, back);

  switch (action) {
    case "done":
      ctx.vault.setSubtaskDone(id, form.text("done") === "1");
      return redirect(back);

    case "delete":
      ctx.vault.deleteSubtask(id);
      return redirect(back);

    case "move":
      if (!ctx.vault.moveSubtask(id, readMoveTarget(form)))
        return redirectWithError(back, "That subtask can't move there.");
      return redirect(back);

    case undefined: {
      const text = form.text("text").trim();
      if (!text) return redirectWithError(back, "A subtask needs some text.");
      ctx.vault.editSubtask(id, text);
      return redirect(back);
    }

    default:
      return notFound(ctx);
  }
}
