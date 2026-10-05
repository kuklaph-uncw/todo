import { escapeHtml } from "../lib/html";
import { shortMonthDay } from "../lib/date";
import { PRIORITIES, STATUSES, type Status } from "../lib/validation";
import { editableText, type Goal, type Todo } from "../vault/format";
import {
  emptyState,
  goalIndex,
  goalLinkHint,
  goalPicker,
  hidden,
  icon,
  metaChips,
  notice,
  options,
  postButton,
  richText,
  type GoalIndex,
} from "./components";

export interface TodoFilters {
  q: string;
  status: Status | null;
  priority: string | null;
  tag: string | null;
  goal: string | null;
}

export interface TodosViewData {
  todos: Todo[];
  filters: TodoFilters;
  allTags: string[];
  goals: Goal[];
  editId: string | null;
  error: string | null;
  returnTo: string;
  /** Where the edit form returns to when opened from another page (e.g. Today). */
  back: string | null;
  /** Id of a todo that was just added, to explain if the filters hide it. */
  added: string | null;
  /** What the user typed, sent back after a validation error. */
  retry: URLSearchParams | null;
}

/** Done and Cancelled start collapsed so a year of history doesn't bury the live list. */
const GROUPS: { status: Status; label: string; collapsed: boolean }[] = [
  { status: "In Progress", label: "In progress", collapsed: false },
  { status: "Open", label: "Open", collapsed: false },
  { status: "Blocked", label: "Blocked", collapsed: false },
  { status: "Done", label: "Done", collapsed: true },
  { status: "Cancelled", label: "Cancelled", collapsed: true },
];

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

/**
 * Live todos: priority, then newest first (file order is creation order).
 * Done/Cancelled: most recently completed first, so a just-checked todo is on top.
 */
export function sortTodos(todos: Todo[]): Todo[] {
  return todos
    .map((todo, index) => ({ todo, index }))
    .sort((a, b) => {
      const finished = a.todo.status === "Done" || a.todo.status === "Cancelled";
      if (finished) return (b.todo.completedOn ?? "").localeCompare(a.todo.completedOn ?? "") || b.index - a.index;
      return (PRIORITY_RANK[a.todo.priority ?? ""] ?? 3) - (PRIORITY_RANK[b.todo.priority ?? ""] ?? 3) || b.index - a.index;
    })
    .map(({ todo }) => todo);
}

export function filterTodos(todos: Todo[], filters: TodoFilters): Todo[] {
  const q = filters.q.toLowerCase();
  // Search everything the user can see on the row, including tags and goal links.
  const haystack = (todo: Todo) =>
    [todo.task, todo.notes, ...todo.tags.map((tag) => `#${tag}`), ...todo.goals].join(" ").toLowerCase();
  return todos.filter(
    (todo) =>
      (!filters.status || todo.status === filters.status) &&
      (!filters.priority || (filters.priority === "none" ? todo.priority === null : todo.priority === filters.priority)) &&
      (!filters.tag || todo.tags.includes(filters.tag)) &&
      (!filters.goal || todo.goals.includes(filters.goal)) &&
      (!q || haystack(todo).includes(q)),
  );
}

function statusClass(status: Status): string {
  return `s-${status.toLowerCase().replace(" ", "-")}`;
}

function editForm(todo: Todo, data: TodosViewData): string {
  const back = data.back ?? `${data.returnTo}#todo-${todo.id}`;
  const retry = data.retry;
  const status = retry?.get("status") ?? todo.status;
  const priority = retry?.has("priority") ? retry.get("priority") : todo.priority;
  const clear = todo.completedOn
    ? `<div class="completion-note">
        <p>Completed on <strong>${todo.completedOn}</strong>. This date stays even if you reopen the todo, and is reused if you mark it done again.</p>
        ${postButton({
          action: `/todos/${todo.id}/clear-completion`,
          label: "Clear completion date",
          body: "Clear completion date",
          returnTo: `${data.returnTo}#todo-${todo.id}`,
          className: "btn ghost danger",
          confirm: "Clear the completion date? The todo won't appear in any review until you mark it done again, which dates it today.",
        })}
      </div>`
    : "";

  return `<div class="todo-edit">
      <form class="edit-form" method="post" action="/todos/${todo.id}">
        ${hidden("return_to", back)}
        <label class="field"><span>Task</span>
          <input name="task" required value="${escapeHtml(retry?.get("task") ?? editableText(todo.task, todo.tags, todo.goals))}" autofocus>
        </label>
        ${goalLinkHint(data.goals)}
        <div class="field-row">
          <label class="field"><span>Status</span><select name="status">${options(STATUSES, status)}</select></label>
          <label class="field"><span>Priority</span><select name="priority">${options(PRIORITIES, priority, "None")}</select></label>
        </div>
        <label class="field"><span>Notes</span><textarea name="notes" rows="3">${escapeHtml(retry?.get("notes") ?? todo.notes)}</textarea></label>
        <div class="edit-bar">
          <span class="spacer"></span>
          <a class="btn ghost" href="${escapeHtml(back)}">Cancel</a>
          <button class="btn primary" type="submit">Save</button>
        </div>
      </form>
      ${clear}
    </div>`;
}

function todoRow(todo: Todo, goals: GoalIndex, data: TodosViewData): string {
  const done = todo.status === "Done";
  const editing = data.editId === todo.id;
  const returnTo = data.returnTo;
  const back = `${returnTo}#todo-${todo.id}`;
  const editHref = escapeHtml(`${returnTo}${returnTo.includes("?") ? "&" : "?"}edit=${todo.id}#todo-${todo.id}`);

  const check = postButton({
    action: `/todos/${todo.id}/status`,
    label: done ? `Reopen: ${todo.task}` : `Mark done: ${todo.task}`,
    body: icon("check"),
    returnTo: back,
    fields: { status: done ? "Open" : "Done" },
    className: done ? "check-btn is-done" : "check-btn",
    id: `done-${todo.id}`,
  });

  // A reopened todo keeps its first completion date; say so rather than "Done".
  const completion = !todo.completedOn
    ? ""
    : done
      ? `<span class="done-date" title="Completed">Done ${shortMonthDay(todo.completedOn)}</span>`
      : `<span title="Marking it done again reuses this date">Kept: done ${shortMonthDay(todo.completedOn)}</span>`;
  const dates = [todo.createdOn ? `<span title="Added">Added ${shortMonthDay(todo.createdOn)}</span>` : "", completion].join("");

  const notes = todo.notes ? `<p class="todo-notes">${escapeHtml(todo.notes).replace(/\n/g, "<br>")}</p>` : "";
  const task = escapeHtml(todo.task);

  return `<li class="todo-row ${statusClass(todo.status)}${todo.isHighlight ? " is-starred" : ""}" id="todo-${todo.id}">
      ${check}
      <div class="todo-body">
        <p class="todo-task">${richText(todo.task, goals)}</p>
        ${notes}
        ${metaChips({ ...todo, text: todo.task, minutes: null }, goals)}
      </div>
      <div class="todo-facts">
        ${todo.priority ? `<span class="priority p-${todo.priority.toLowerCase()}">${todo.priority}</span>` : ""}
        <span class="dates">${dates}</span>
      </div>
      <div class="row-actions">
        <form class="inline-form" method="post" action="/todos/${todo.id}/status">
          ${hidden("return_to", back)}
          <label class="sr-only" for="status-${todo.id}">Status: ${task}</label>
          <select id="status-${todo.id}" name="status" class="status-select" data-autosubmit>${options(STATUSES, todo.status)}</select>
          <noscript><button class="btn" type="submit">Set</button></noscript>
        </form>
        ${postButton({
          action: `/todos/${todo.id}/star`,
          label: todo.isHighlight ? `Unstar: ${todo.task}` : `Star as a highlight: ${todo.task}`,
          body: icon("star", todo.isHighlight),
          returnTo: back,
          className: `icon-btn star-btn${todo.isHighlight ? " is-on" : ""}`,
          pressed: todo.isHighlight,
          id: `star-${todo.id}`,
        })}
        <a class="icon-btn" href="${editHref}" aria-label="Edit: ${task}" title="Edit">${icon("edit")}</a>
        ${postButton({
          action: `/todos/${todo.id}/delete`,
          label: `Delete: ${todo.task}`,
          body: icon("trash"),
          returnTo,
          className: "icon-btn danger",
          confirm: "Delete this todo? A copy is kept in the notes folder's .trash/deleted.md file.",
        })}
      </div>
      ${editing ? editForm(todo, data) : ""}
    </li>`;
}

function goalOptionLabel(goal: Goal, goals: Goal[]): string {
  // Same title in two review cycles: tell them apart.
  const twin = goals.some((other) => other !== goal && other.title === goal.title);
  return twin && goal.cycle ? `${goal.title} (${goal.cycle})` : goal.title;
}

function filterBar(data: TodosViewData): string {
  const f = data.filters;
  const anyFilter = f.q || f.status || f.priority || f.tag || f.goal;
  return `<form class="filter-bar" method="get" action="/todos" role="search">
      <label class="field grow"><span>Search</span>
        <input type="search" name="q" value="${escapeHtml(f.q)}" placeholder="Task, notes, #tag or goal" data-shortcut="/">
      </label>
      <label class="field"><span>Status</span><select name="status" data-autosubmit>${options(STATUSES, f.status, "Any")}</select></label>
      <label class="field"><span>Priority</span><select name="priority" data-autosubmit>
        <option value="">Any</option>${PRIORITIES.map((p) => `<option${f.priority === p ? " selected" : ""}>${p}</option>`).join("")}
        <option value="none"${f.priority === "none" ? " selected" : ""}>None</option>
      </select></label>
      <label class="field"><span>Tag</span><select name="tag" data-autosubmit>${options(data.allTags, f.tag, "Any")}</select></label>
      <label class="field"><span>Goal</span><select name="goal" data-autosubmit>
        <option value="">Any</option>${data.goals.map((g) => `<option value="${escapeHtml(g.slug)}"${f.goal === g.slug ? " selected" : ""}>${escapeHtml(goalOptionLabel(g, data.goals))}</option>`).join("")}
      </select></label>
      <div class="filter-actions">
        <button class="btn" type="submit">Apply</button>
        ${anyFilter ? `<a class="btn ghost" href="/todos">Clear</a>` : ""}
      </div>
    </form>`;
}

function addForm(data: TodosViewData): string {
  return `<form class="todo-add wide" method="post" action="/todos">
      ${hidden("return_to", data.returnTo)}
      <label class="sr-only" for="new-task">New todo</label>
      <input id="new-task" name="task" required placeholder="Add a todo. #tags and [[goal-link]] work here too." autocomplete="off" data-shortcut="t">
      <label class="sr-only" for="new-priority">Priority</label>
      <select id="new-priority" name="priority"><option value="">No priority</option>${PRIORITIES.map((p) => `<option>${p}</option>`).join("")}</select>
      <button class="btn primary" type="submit">Add todo</button>
      <details class="add-more">
        <summary>Link to a goal</summary>
        ${goalPicker(data.goals.filter((g) => g.status === "active"))}
      </details>
    </form>`;
}

export function renderTodos(data: TodosViewData): string {
  const goals = goalIndex(data.goals);
  const filtered = filterTodos(data.todos, data.filters);
  const filtering = Boolean(data.filters.q || data.filters.status || data.filters.priority || data.filters.tag || data.filters.goal);

  const counts = GROUPS.map(({ status, label }) => {
    const n = data.todos.filter((t) => t.status === status).length;
    return n ? `<span>${n} ${label.toLowerCase()}</span>` : "";
  })
    .filter(Boolean)
    .join(" · ");
  const showing = filtering ? ` · showing ${filtered.length}` : "";

  const groups = GROUPS.map(({ status, label, collapsed }) => {
    const todos = sortTodos(filtered.filter((t) => t.status === status));
    if (todos.length === 0) return "";
    const list = `<ul class="todo-table">${todos.map((t) => todoRow(t, goals, data)).join("")}</ul>`;
    const heading = `${label} <span class="count">${todos.length}</span>`;
    const hasEdit = todos.some((t) => t.id === data.editId);
    if (collapsed && !filtering && !hasEdit) {
      return `<details class="todo-section g-${statusClass(status)}"><summary><h2 class="section-title">${heading}</h2></summary>${list}</details>`;
    }
    return `<section class="todo-section g-${statusClass(status)}"><h2 class="section-title">${heading}</h2>${list}</section>`;
  }).join("");

  const body =
    groups ||
    (filtering
      ? emptyState("No todos match these filters.", `<a href="/todos">Clear filters</a>`)
      : emptyState("No todos yet.", "Add one above. Todos support the ledger: when one's done, it becomes dated evidence for your review."));

  const addedTodo = data.added ? data.todos.find((t) => t.id === data.added) : undefined;
  const hiddenNotice =
    addedTodo && !filtered.includes(addedTodo)
      ? `<p class="notice ok" role="status">Added “${escapeHtml(addedTodo.task)}”. The current filters hide it. <a href="/todos">Clear filters</a></p>`
      : "";

  return `<div class="page">
    <header class="page-head">
      <div>
        <h1>Todos</h1>
        <p class="page-sub">${counts ? `${counts}${showing}` : "Nothing tracked yet."}</p>
      </div>
    </header>
    ${notice(data.error)}
    ${hiddenNotice}
    ${addForm(data)}
    ${filterBar(data)}
    ${body}
  </div>`;
}
