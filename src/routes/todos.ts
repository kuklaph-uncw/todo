import { isValidDateString } from "../lib/date";
import { isValidPriority, isValidStatus, safeReturnPath, type Priority, type Status } from "../lib/validation";
import { renderTodos, type TodoFilters } from "../views/todos";
import { notFound, page, readForm, redirect, redirectWithError, today, type AppContext } from "./shared";

function parseFilters(params: URLSearchParams): TodoFilters {
  const status = params.get("status") ?? "";
  const priority = params.get("priority") ?? "";
  return {
    q: params.get("q")?.trim() ?? "",
    status: isValidStatus(status) ? status : null,
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
  for (const name of ["q", "status", "priority", "tag", "goal"]) {
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

function readPriority(raw: string): Priority | null | undefined {
  if (raw === "") return null;
  return isValidPriority(raw) ? raw : undefined;
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

  const todo = ctx.vault.addTodo({ task, priority, status, tags: [], goals: [], notes: form.text("notes") }, today(ctx));
  // Lets the Todos page explain when its filters hide the new todo.
  if (!back.startsWith("/todos")) return redirect(back);
  const url = new URL(back, "http://local");
  url.searchParams.set("added", todo.id);
  return redirect(`${url.pathname}${url.search}`);
}

/** POST /todos/:id and /todos/:id/{status,star,clear-completion,delete} */
export async function changeTodo(req: Request, ctx: AppContext, id: string, action: string | undefined): Promise<Response> {
  const form = await readForm(req);
  const back = form.returnTo("/todos");
  const now = today(ctx);
  const existing = ctx.vault.getTodo(id);
  if (!existing) return notFound(ctx, "That todo");

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
        ["status", form.text("status")],
        ["notes", form.text("notes")],
      ];
      if (!task) return redirectWithError(retryAt, "A todo needs a task.", keep);
      const priority = readPriority(form.text("priority"));
      if (priority === undefined) return redirectWithError(retryAt, "Pick High, Medium, Low or no priority.", keep);
      const status = form.text("status");
      if (!isValidStatus(status)) return redirectWithError(retryAt, "That status isn't one the app knows.", keep);
      ctx.vault.updateTodo(id, { task, priority, status, notes: form.text("notes") }, now);
      return redirect(back);
    }

    default:
      return notFound(ctx);
  }
}
