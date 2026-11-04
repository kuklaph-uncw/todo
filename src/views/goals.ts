import { escapeHtml } from "../lib/html";
import { monthYear, shortMonthDay } from "../lib/date";
import { GOAL_STATUSES } from "../lib/validation";
import type { Goal } from "../vault/format";
import type { ReviewItem } from "../review";
import { emptyState, entryHtml, goalIndex, hidden, icon, metaChips, notice, richText, type GoalIndex } from "./components";

export interface GoalStats {
  entries: number;
  todos: number;
  starred: number;
  lastDate: string | null;
}

export interface GoalsViewData {
  cycle: string;
  cycles: string[];
  goals: Goal[];
  stats: Map<string, GoalStats>;
  error: string | null;
  /** The description typed into the new-goal form, sent back after an error. */
  retryBody: string;
}

export interface GoalViewData {
  goal: Goal;
  goals: Goal[];
  items: ReviewItem[];
  /** Linked todos not done yet: not evidence, but worth pointing to. */
  openTodos: number;
  editing: boolean;
  error: string | null;
}

const STATUS_LABEL: Record<string, string> = { active: "Active", achieved: "Achieved", dropped: "Dropped" };

export function goalStats(items: ReviewItem[], slug: string): GoalStats {
  const linked = items.filter((item) => item.goals.includes(slug));
  return {
    entries: linked.filter((item) => item.kind === "entry").length,
    todos: linked.filter((item) => item.kind === "todo").length,
    starred: linked.filter((item) => item.isHighlight).length,
    lastDate: linked.reduce<string | null>((last, item) => (last === null || item.date > last ? item.date : last), null),
  };
}

/** Plain paragraphs with line breaks; the goal body is the user's own Markdown, shown as text. */
function prose(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function evidenceLine(stats: GoalStats | undefined): string {
  if (!stats || stats.entries + stats.todos === 0) return `<span class="muted">No linked work yet</span>`;
  const parts = [`${stats.entries} ${stats.entries === 1 ? "entry" : "entries"}`, `${stats.todos} ${stats.todos === 1 ? "todo" : "todos"}`];
  if (stats.starred) parts.push(`${stats.starred} starred`);
  if (stats.lastDate) parts.push(`last ${shortMonthDay(stats.lastDate)}`);
  return parts.join(" · ");
}

export function renderGoals(data: GoalsViewData): string {
  const cycleLinks = data.cycles
    .map((cycle) => `<a class="seg" href="/goals?cycle=${encodeURIComponent(cycle)}"${cycle === data.cycle ? ' aria-current="true"' : ""}>${escapeHtml(cycle)}</a>`)
    .join("");

  const inCycle = data.goals.filter((goal) => goal.cycle === data.cycle);
  const list = inCycle.length
    ? `<ol class="goal-list">${inCycle
        .map((goal) => {
          const stats = data.stats.get(goal.slug);
          const summary = goal.body.split("\n").find((line) => line.trim() && !line.startsWith("#")) ?? "";
          return `<li class="goal-item st-${goal.status}">
              <a class="goal-title" href="/goals/${encodeURIComponent(goal.slug)}">${escapeHtml(goal.title)}</a>
              <span class="goal-status">${STATUS_LABEL[goal.status]}</span>
              ${summary ? `<p class="goal-summary">${escapeHtml(summary.trim())}</p>` : ""}
              <p class="goal-evidence">${evidenceLine(stats)}</p>
              <code class="goal-slug">[[${escapeHtml(goal.slug)}]]</code>
            </li>`;
        })
        .join("")}</ol>`
    : emptyState(`No goals for ${data.cycle} yet.`, "Add the goals you agreed on for this review cycle. Then link work to them as you log it.");

  return `<div class="page goals-page">
    <header class="page-head">
      <div>
        <h1>Goals</h1>
        <p class="page-sub">What this review cycle is measured against. Work you link to a goal becomes its evidence.</p>
      </div>
      <nav class="segmented" aria-label="Review cycle">${cycleLinks}</nav>
    </header>
    ${notice(data.error)}
    <div class="goals-layout">
      <section aria-label="Goals for ${escapeHtml(data.cycle)}">${list}</section>
      <aside class="side-panel">
        <h2 class="section-title">New goal</h2>
        <form class="stack-form" method="post" action="/goals">
          <label class="field"><span>Goal</span><input name="title" required placeholder="Cut incident response time" autocomplete="off"></label>
          <label class="field field-short"><span>Review cycle</span><input name="cycle" required value="${escapeHtml(data.cycle)}"></label>
          <label class="field"><span>What does success look like?</span><textarea name="body" rows="4" placeholder="Measures, scope, what your manager will look for.">${escapeHtml(data.retryBody)}</textarea></label>
          <button class="btn primary" type="submit">Add goal</button>
        </form>
        <p class="field-hint">Link work by ticking the goal when you log it, or type its link, like <code>[[cut-incident-response-time]]</code>.</p>
      </aside>
    </div>
  </div>`;
}

function evidenceFeed(items: ReviewItem[], goals: GoalIndex, slug: string): string {
  if (items.length === 0) {
    return emptyState(
      "No linked work yet.",
      `Tick this goal under “Tags, time, goal, star” when you log an entry, or add <code>[[${escapeHtml(slug)}]]</code> to the text. To count earlier work, edit that entry and add the link. Linked todos show up here once they're done.`,
    );
  }
  const months = new Map<string, ReviewItem[]>();
  for (const item of [...items].reverse()) {
    const key = item.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), item]);
  }
  return [...months.entries()]
    .map(
      ([month, monthItems]) => `<section class="month">
        <h3 class="month-title">${monthYear(month)} <span class="count">${monthItems.length}</span></h3>
        <ol class="ledger-list">${monthItems
          .map(
            (item) => `<li class="entry${item.isHighlight ? " is-starred" : ""}${item.kind === "todo" ? " is-todo" : ""}">
              <div class="margin"><time datetime="${item.date}">${shortMonthDay(item.date)}</time>${item.kind === "todo" ? `<span class="done-mark" title="Completed todo">${icon("check")}</span>` : ""}</div>
              <div class="entry-body">${item.kind === "entry" ? `<div class="entry-text">${entryHtml(item.text, goals)}</div>` : `<p class="entry-text">${richText(item.text, goals)}</p>`}${metaChips({ ...item, goals: item.goals.filter((g) => g !== slug) }, goals)}</div>
              <a class="icon-btn" href="/?date=${item.date}#${item.kind === "todo" ? "todo" : "entry"}-${item.id}" aria-label="Open ${item.date}" title="Open day">${icon("arrow")}</a>
            </li>`,
          )
          .join("")}</ol>
      </section>`,
    )
    .join("");
}

export function renderGoal(data: GoalViewData): string {
  const { goal } = data;
  const goals = goalIndex(data.goals);
  const stats = goalStats(data.items, goal.slug);
  const first = data.items[0]?.date;
  const reviewHref = first
    ? `/review?goal=${encodeURIComponent(goal.slug)}&amp;from=${first}&amp;to=${stats.lastDate}`
    : `/review?goal=${encodeURIComponent(goal.slug)}`;

  const statusOptions = GOAL_STATUSES.map(
    (status) => `<option value="${status}"${status === goal.status ? " selected" : ""}>${STATUS_LABEL[status]}</option>`,
  ).join("");

  const statement = data.editing
    ? `<form class="stack-form goal-edit" method="post" action="/goals/${encodeURIComponent(goal.slug)}">
        ${hidden("return_to", `/goals/${goal.slug}`)}
        <label class="field"><span>Goal</span><input name="title" required value="${escapeHtml(goal.title)}"></label>
        <div class="field-row">
          <label class="field field-short"><span>Review cycle</span><input name="cycle" required value="${escapeHtml(goal.cycle)}"></label>
          <label class="field field-short"><span>Status</span><select name="status">${statusOptions}</select></label>
        </div>
        <label class="field"><span>Success criteria, progress notes, self-assessment</span>
          <textarea name="body" rows="14" autofocus>${escapeHtml(goal.body)}</textarea>
        </label>
        <div class="edit-bar"><span class="spacer"></span>
          <a class="btn ghost" href="/goals/${encodeURIComponent(goal.slug)}">Cancel</a>
          <button class="btn primary" type="submit">Save goal</button>
        </div>
      </form>`
    : `<div class="goal-statement">
        ${goal.body ? `<div class="prose">${prose(goal.body)}</div>` : `<p class="muted">No description yet. Add success criteria now, then your self-assessment at review time.</p>`}
        <a class="btn" href="/goals/${encodeURIComponent(goal.slug)}?edit=1">${icon("edit")} Edit goal or status</a>
      </div>`;

  const openTodos = data.openTodos
    ? `<p class="goal-open-todos"><a href="/todos?goal=${encodeURIComponent(goal.slug)}">${data.openTodos} open ${data.openTodos === 1 ? "todo" : "todos"} linked</a>. They count as evidence once done.</p>`
    : "";

  return `<div class="page goal-page">
    <header class="page-head">
      <div>
        <p class="kicker"><a href="/goals?cycle=${encodeURIComponent(goal.cycle)}">Goals · ${escapeHtml(goal.cycle)}</a></p>
        <h1>${escapeHtml(goal.title)}</h1>
        <p class="page-sub"><span class="goal-status st-${goal.status}">${STATUS_LABEL[goal.status]}</span> · ${evidenceLine(stats)} · <code>[[${escapeHtml(goal.slug)}]]</code></p>
      </div>
      <a class="btn" href="${reviewHref}">Review this goal ${icon("arrow")}</a>
    </header>
    ${notice(data.error)}
    <div class="goal-layout">
      <section class="goal-evidence-feed" aria-labelledby="evidence-title">
        <h2 class="section-title" id="evidence-title">Evidence <span class="count">${data.items.length}</span></h2>
        ${openTodos}
        ${evidenceFeed(data.items, goals, goal.slug)}
      </section>
      <aside class="side-panel">${statement}</aside>
    </div>
  </div>`;
}
