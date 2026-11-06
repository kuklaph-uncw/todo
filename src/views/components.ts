import { escapeHtml } from "../lib/html";
import { renderEntryMarkdown } from "../lib/markdown";
import { formatMinutes } from "../lib/date";
import { allSubtasks, findLinks, findTags, type Goal, type Subtask, type Todo } from "../vault/format";
import { contentRevision } from "../vault/revision";

/** Small inline icons; stroke uses currentColor so they follow text color. */
const ICON_PATHS: Record<string, string> = {
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="1.5"/><path d="M5 15.5V5.5A1.5 1.5 0 0 1 6.5 4h9"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  print: '<path d="M7 9V4h10v5M7 17H5v-7h14v7h-2M7 14h10v6H7z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  clock: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M10 3.5h4"/>',
  expand: '<path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5"/>',
  settings:
    '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="8.3" stroke-width="2.6" stroke-dasharray="2.7 3.82" stroke-linecap="butt"/>',
  keyboard:
    '<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M7 10.5h.01M10.3 10.5h.01M13.7 10.5h.01M17 10.5h.01M8.5 14h7"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2.05-4.95L19 9"/><path d="M19 4.5V9h-4.5"/>',
  update: '<circle cx="12" cy="12" r="8"/><path d="M12 16V8.5M8.5 12l3.5-3.5 3.5 3.5"/>',
  alert: '<circle cx="12" cy="12" r="8"/><path d="M12 7.8v4.6M12 15.9h.01"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
};

export function icon(name: keyof typeof ICON_PATHS | string, filled = false, extraClass = ""): string {
  const fill = filled ? "currentColor" : "none";
  return `<svg class="icon${extraClass ? ` ${extraClass}` : ""}" viewBox="0 0 24 24" width="16" height="16" fill="${fill}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] ?? ""}</svg>`;
}

export type GoalIndex = Map<string, Goal>;

/** Shown on a [[link]] that matches no goal, which otherwise fails silently. */
const UNKNOWN_GOAL_TITLE =
  "No goal has this link, so this doesn't count toward a goal. Check the spelling on the Goals page.";

export function goalIndex(goals: Goal[]): GoalIndex {
  return new Map(goals.map((goal) => [goal.slug, goal]));
}

export function goalTitle(slug: string, goals: GoalIndex): string {
  return goals.get(slug)?.title ?? slug;
}

/**
 * Escapes user text, then styles the inline #tags and [[goal]] links the
 * user typed. Runs on escaped text, so no raw HTML can get through.
 */
export function richText(text: string, goals: GoalIndex): string {
  return decorateEntryText(escapeHtml(text), goals);
}

/** Renders entry Markdown with the same inline metadata as todo text. */
export function entryHtml(text: string, goals: GoalIndex): string {
  return renderEntryMarkdown(text, (escaped) => decorateEntryText(escaped, goals));
}

function decorateEntryText(escaped: string, goals: GoalIndex): string {
  return escaped
    .replace(/(^|\s)#([\p{L}\p{N}_/-]+)/gu, (match, lead, name) =>
      /^\d+$/.test(name) ? match : `${lead}<span class="tag">#${name}</span>`,
    )
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, slug: string, label?: string) => {
      const known = goals.get(slug.trim());
      // `label` and `slug` come from already-escaped text; the goal title does not.
      const text = label ?? (known ? escapeHtml(known.title) : slug);
      return known
        ? `<a class="goal-link" href="/goals/${encodeURIComponent(known.slug)}">${text}</a>`
        : `<span class="goal-link unknown" title="${UNKNOWN_GOAL_TITLE}">${text}</span>`;
    });
}

/** Metadata chips shown under an item: `lead` (e.g. a subtask count), tags not written inline, goals, time. */
export function metaChips(
  item: { text: string; tags: string[]; goals: string[]; minutes?: number | null },
  goals: GoalIndex,
  lead = "",
): string {
  const chips: string[] = lead ? [lead] : [];
  const inlineTags = findTags(item.text);
  const inlineLinks = findLinks(item.text);
  for (const tag of item.tags) {
    if (!inlineTags.includes(tag)) chips.push(`<span class="tag">#${escapeHtml(tag)}</span>`);
  }
  for (const slug of item.goals) {
    if (inlineLinks.includes(slug)) continue;
    const known = goals.get(slug);
    chips.push(
      known
        ? `<a class="goal-link" href="/goals/${encodeURIComponent(slug)}">${escapeHtml(known.title)}</a>`
        : `<span class="goal-link unknown" title="${UNKNOWN_GOAL_TITLE}">${escapeHtml(slug)}</span>`,
    );
  }
  if (item.minutes) chips.push(`<span class="duration">${formatMinutes(item.minutes)}</span>`);
  return chips.length ? `<div class="chips">${chips.join("")}</div>` : "";
}

/** Drag handle; app.js also moves the focused row with Alt+arrows. */
export function grip(id: string, label: string): string {
  return `<button type="button" class="grip" id="grip-${escapeHtml(id)}" aria-label="Move: ${escapeHtml(label)}" title="Drag to move. Alt+arrows move and indent.">${icon("grip", true)}</button>`;
}

/** "2/5" for a todo's tag line; nothing when it has no subtasks. */
export function subtaskCount(todo: Todo): string {
  const all = allSubtasks(todo.subtasks);
  if (all.length === 0) return "";
  const done = all.filter((subtask) => subtask.done).length;
  return `<span class="progress${done === all.length ? " is-complete" : ""}"><span aria-hidden="true">${done}/${all.length}</span><span class="sr-only">${done} of ${all.length} subtasks done</span></span>`;
}

/** Makes a todo's title open and close its subtasks on click (app.js). */
export function subtaskToggle(todo: Todo): string {
  return ` data-subtasks="subs-${todo.id}"`;
}

/**
 * The same toggle as a real button for keyboard and screen-reader users, since
 * the title holds links. Hidden until it has keyboard focus, and until app.js
 * runs, since only the script can open the list.
 */
export function subtaskButton(todo: Todo): string {
  return `<button type="button" class="sr-only subtask-toggle" hidden data-subtasks="subs-${todo.id}" aria-controls="subs-${todo.id}" aria-expanded="false">Subtasks: ${escapeHtml(todo.task)}</button>`;
}

/**
 * A todo's checklist, collapsed until its title is clicked.
 * `full` (Todos page) adds drag handles, edit and delete; the Today tray only checks and adds.
 * `editId` opens the inline editor for that subtask.
 */
export function subtaskPanel(
  todo: Todo,
  goals: GoalIndex,
  opts: { returnTo: string; full: boolean; editId?: string | null },
): string {
  const all = allSubtasks(todo.subtasks);
  const back = `${opts.returnTo}#todo-${todo.id}`;
  const linkTo = (id: string) => `${opts.returnTo}${opts.returnTo.includes("?") ? "&" : "?"}edit=${id}#sub-${id}`;

  const row = (subtask: Subtask): string => {
    const text = escapeHtml(subtask.text);
    const editing = opts.full && opts.editId === subtask.id;
    const body = editing
      ? `<form class="edit-form subtask-edit" method="post" action="/subtasks/${subtask.id}">
          ${hidden("return_to", back)}${hidden("expected_revision", contentRevision(todo))}
          <label class="sr-only" for="sub-text-${subtask.id}">Subtask</label>
          <input id="sub-text-${subtask.id}" name="text" required value="${text}" autocomplete="off" autofocus>
          <button class="btn primary" type="submit">Save</button>
          <a class="btn ghost" href="${escapeHtml(back)}">Cancel</a>
        </form>`
      : `<span class="subtask-text">${richText(subtask.text, goals)}</span>`;
    const actions =
      opts.full && !editing
        ? `<div class="row-actions">
            <a class="icon-btn" href="${escapeHtml(linkTo(subtask.id))}" aria-label="Edit: ${text}" title="Edit">${icon("edit")}</a>
            ${postButton({
              todo,
              action: `/subtasks/${subtask.id}/delete`,
              label: `Delete: ${subtask.text}`,
              body: icon("trash"),
              returnTo: back,
              className: "icon-btn danger",
              confirm: subtask.children.length
                ? "Delete this subtask and everything under it? A copy is kept in the notes folder's .trash/deleted.md file."
                : "Delete this subtask? A copy is kept in the notes folder's .trash/deleted.md file.",
            })}
          </div>`
        : "";
    const move = opts.full ? ` data-move="subtask" data-id="${subtask.id}"` : "";
    return `<li class="subtask${subtask.done ? " is-done" : ""}" id="sub-${subtask.id}"${move}>
        <div class="subtask-line">
          ${opts.full ? grip(subtask.id, subtask.text) : ""}
          ${postButton({
            todo,
            action: `/subtasks/${subtask.id}/done`,
            label: subtask.done ? `Uncheck: ${subtask.text}` : `Check: ${subtask.text}`,
            body: icon("check"),
            returnTo: back,
            fields: { done: subtask.done ? "" : "1" },
            className: `check-btn${subtask.done ? " is-done" : ""}`,
            id: `check-${subtask.id}`,
          })}
          ${body}
          ${actions}
        </div>
        ${subtask.children.length ? `<ul class="subtask-list">${subtask.children.map(row).join("")}</ul>` : ""}
      </li>`;
  };

  const editing = opts.full && all.some((subtask) => subtask.id === opts.editId);
  // Opened by clicking the todo's title or its keyboard button (subtaskToggle, subtaskButton), so the summary stays hidden.
  return `<details class="subtasks" id="subs-${todo.id}" data-keep-open${editing ? " open" : ""}>
      <summary hidden></summary>
      ${todo.subtasks.length ? `<ul class="subtask-list">${todo.subtasks.map(row).join("")}</ul>` : ""}
      <form class="subtask-add" method="post" action="/todos/${todo.id}/subtasks">
        ${hidden("return_to", back)}${hidden("expected_revision", contentRevision(todo))}
        <label class="sr-only" for="add-sub-${todo.id}">Add a subtask to: ${escapeHtml(todo.task)}</label>
        <input id="add-sub-${todo.id}" name="text" required placeholder="Add a subtask" autocomplete="off">
      </form>
    </details>`;
}

export function emptyState(title: string, hint = ""): string {
  return `<div class="empty"><p class="empty-title">${escapeHtml(title)}</p>${hint ? `<p class="empty-hint">${hint}</p>` : ""}</div>`;
}

/** A one-button POST form. `returnTo` sends the browser back where it was. */
export function postButton(opts: {
  action: string;
  label: string;
  body: string;
  returnTo: string;
  fields?: Record<string, string>;
  className?: string;
  confirm?: string;
  pressed?: boolean;
  id?: string;
  todo?: Todo;
}): string {
  const hidden = Object.entries({
    return_to: opts.returnTo,
    ...(opts.todo ? { expected_revision: contentRevision(opts.todo) } : {}),
    ...opts.fields,
  })
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  const confirm = opts.confirm ? ` data-confirm="${escapeHtml(opts.confirm)}"` : "";
  const pressed = opts.pressed === undefined ? "" : ` aria-pressed="${opts.pressed}"`;
  const id = opts.id ? ` id="${escapeHtml(opts.id)}"` : "";
  return `<form class="inline-form" method="post" action="${escapeHtml(opts.action)}"${confirm}>${hidden}<button type="submit" class="${opts.className ?? "btn"}"${id} aria-label="${escapeHtml(opts.label)}" title="${escapeHtml(opts.label)}"${pressed}>${opts.body}</button></form>`;
}

export function hidden(name: string, value: string): string {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}

export function options(values: readonly string[], selected: string | null, blankLabel?: string): string {
  const blank = blankLabel !== undefined ? `<option value="">${escapeHtml(blankLabel)}</option>` : "";
  return (
    blank +
    values
      .map(
        (value) =>
          `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`,
      )
      .join("")
  );
}

/**
 * Tags and goals for the #tag and /goal suggestions in text fields marked
 * `data-composer` (see app.js). Rendered inside <main> so it stays current
 * when app.js swaps the page in place.
 */
export function composerData(tagCounts: [string, number][], goals: Goal[]): string {
  const data = {
    tags: tagCounts,
    goals: goals.map((goal) => ({ slug: goal.slug, title: goal.title, active: goal.status === "active" })),
  };
  // Escaping "<" means a goal title can't close the script tag.
  return `<script type="application/json" id="composer-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

export const COMPOSER_HINT = `<p class="field-hint">Type <kbd>#</kbd> to add a tag, <kbd>/</kbd> to link a goal.</p>`;

export function notice(message: string | null, kind: "error" | "ok" = "error"): string {
  if (!message) return "";
  return `<p class="notice ${kind}" role="${kind === "error" ? "alert" : "status"}">${escapeHtml(message)}</p>`;
}
