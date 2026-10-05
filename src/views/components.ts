import { escapeHtml } from "../lib/html";
import { formatMinutes } from "../lib/date";
import { findLinks, findTags, type Goal } from "../vault/format";

/** Small inline icons; stroke uses currentColor so they follow text color. */
const ICON_PATHS: Record<string, string> = {
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="1.5"/><path d="M5 15.5V5.5A1.5 1.5 0 0 1 6.5 4h9"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  print: '<path d="M7 9V4h10v5M7 17H5v-7h14v7h-2M7 14h10v6H7z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
};

export function icon(name: keyof typeof ICON_PATHS | string, filled = false): string {
  const fill = filled ? "currentColor" : "none";
  return `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="${fill}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] ?? ""}</svg>`;
}

export type GoalIndex = Map<string, Goal>;

/** Shown on a [[link]] that matches no goal, which otherwise fails silently. */
const UNKNOWN_GOAL_TITLE = "No goal has this link, so this doesn't count toward a goal. Check the spelling on the Goals page.";

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
  return escapeHtml(text)
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

/** Metadata chips shown under an item: tags not written inline, goals, time. */
export function metaChips(
  item: { text: string; tags: string[]; goals: string[]; minutes?: number | null },
  goals: GoalIndex,
): string {
  const chips: string[] = [];
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
}): string {
  const hidden = Object.entries({ return_to: opts.returnTo, ...opts.fields })
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
      .map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`)
      .join("")
  );
}

/**
 * Checkbox list of goals for the capture / add forms. Each shows its
 * [[link]] too, so people learn what to type to link a goal by hand.
 */
export function goalPicker(goals: Goal[], name = "goals", checked: string[] = []): string {
  if (goals.length === 0) {
    return `<p class="field-hint">No active goals yet. <a href="/goals">Add one</a> to link work to it.</p>`;
  }
  return `<fieldset class="goal-picker"><legend>Counts toward</legend>${goals
    .map(
      (goal) =>
        `<label class="check-label"><input type="checkbox" name="${name}" value="${escapeHtml(goal.slug)}"${checked.includes(goal.slug) ? " checked" : ""}> ${escapeHtml(goal.title)} <small class="slug">[[${escapeHtml(goal.slug)}]]</small></label>`,
    )
    .join("")}</fieldset>`;
}

/** Lists the goal links someone can type, since a goal's link isn't otherwise visible while editing. */
export function goalLinkHint(goals: Goal[]): string {
  const active = goals.filter((goal) => goal.status === "active");
  if (active.length === 0) return "";
  const links = active.map((g) => `<code title="${escapeHtml(g.title)}">[[${escapeHtml(g.slug)}]]</code>`).join(" ");
  return `<p class="field-hint">Link a goal by typing its link: ${links}</p>`;
}

export function notice(message: string | null, kind: "error" | "ok" = "error"): string {
  if (!message) return "";
  return `<p class="notice ${kind}" role="${kind === "error" ? "alert" : "status"}">${escapeHtml(message)}</p>`;
}
