import { escapeHtml } from "../lib/html";
import { renderEntryMarkdown } from "../lib/markdown";
import { monthYear, shortMonthDay } from "../lib/date";
import { GOAL_STATUSES, isValidGoalStatus, slugify, type GoalKind, type GoalStatus } from "../lib/validation";
import type { Goal } from "../vault/format";
import type { GoalsView } from "../preferences";
import type { ReviewItem } from "../review";
import { cycleYear } from "../timeline";
import { contentRevision } from "../vault/revision";
import {
  emptyState,
  entryHtml,
  goalIndex,
  hidden,
  icon,
  metaChips,
  notice,
  richText,
  type GoalIndex,
} from "./components";
import { timelineHead, timelineLegend, timelineRow } from "./goal-timeline";

export interface GoalStats {
  entries: number;
  todos: number;
  starred: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface GoalsViewData {
  view: GoalsView;
  cycle: string;
  cycles: string[];
  /** Goals and activities in this cycle, in sheet order. */
  goals: Goal[];
  stats: Map<string, GoalStats>;
  /** Every linked entry and done todo, for the timeline. */
  items: ReviewItem[];
  today: string;
  /** Slug shown as a form in place. */
  edit: string | null;
  /** Slug unfolded in the timeline. */
  open: string | null;
  /** Kind of the blank form shown at the end of its section. */
  add: GoalKind | null;
  /** The next cycle, when it has no goals yet and this one has. */
  nextCycle: string | null;
  /** Carry-over: the cycle to copy from and its goals, when this cycle is empty. */
  carry: { from: string; goals: Goal[] } | null;
  error: string | null;
  /** After a link change: entries and todos rewritten, and any left on `old`. */
  renamed: LinkChange | null;
  /** What was typed into the new-goal or edit form, sent back after an error. */
  retry: URLSearchParams;
}

export interface GoalViewData {
  goal: Goal;
  /** Every goal, for links in the evidence. */
  goals: Goal[];
  items: ReviewItem[];
  /** Linked todos not done yet: not evidence, but worth pointing to. */
  openTodos: number;
  today: string;
  error: string | null;
}

const STATUS_LABEL: Record<GoalStatus, string> = { draft: "Draft", agreed: "Agreed", dropped: "Dropped" };
const STATUS_HINT: Record<GoalStatus, string> = {
  draft: "Still working it out with your manager",
  agreed: "Matches what's in FCP",
  dropped: "Off the sheet. Linked work stays in your ledger",
};
const KIND_LABEL: Record<GoalKind, string> = { goal: "Goal", activity: "Activity" };

export function goalStats(items: ReviewItem[], slug: string): GoalStats {
  const linked = items.filter((item) => item.goals.includes(slug));
  const dates = linked.map((item) => item.date).sort();
  return {
    entries: linked.filter((item) => item.kind === "entry").length,
    todos: linked.filter((item) => item.kind === "todo").length,
    starred: linked.filter((item) => item.isHighlight).length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}

/** A Goals page URL; attribute values still need escapeHtml. */
export function goalsUrl(view: GoalsView, cycle: string, extra: Record<string, string> = {}, hash = ""): string {
  const query = new URLSearchParams({ view, cycle, ...extra });
  return `/goals?${query}${hash ? `#${hash}` : ""}`;
}

const anchor = (goal: Goal) => `goal-${goal.slug}`;
const goalPath = (goal: Goal) => `/goals/${encodeURIComponent(goal.slug)}`;

function reviewUrl(goal: Goal, stats: GoalStats | undefined): string {
  const query = new URLSearchParams({ goal: goal.slug });
  if (stats?.firstDate && stats.lastDate) {
    query.set("from", stats.firstDate);
    query.set("to", stats.lastDate);
  }
  return `/review?${query}`;
}

/** Goals then activities, each in order, with dropped ones set aside. */
function sections(goals: Goal[]) {
  const live = goals.filter((goal) => goal.status !== "dropped");
  return {
    goals: live.filter((goal) => goal.kind === "goal"),
    activities: live.filter((goal) => goal.kind === "activity"),
    dropped: goals.filter((goal) => goal.status === "dropped"),
  };
}

/** "Goal 2" by position among the cycle's live goals of its kind; just "Goal" once dropped. */
function numberLabel(goal: Goal, goals: Goal[]): string {
  if (goal.status === "dropped") return KIND_LABEL[goal.kind];
  const peers = goals.filter((other) => other.kind === goal.kind && other.status !== "dropped");
  return `${KIND_LABEL[goal.kind]} ${peers.findIndex((other) => other.slug === goal.slug) + 1}`;
}

/** Plain text in Full Cycle Performance's order, ready to paste field by field. */
export function fcpText(goal: Goal): string {
  if (goal.kind === "activity") return goal.description;
  return [
    ["Goal name", goal.title],
    ["Description", goal.description],
    ["Meeting expectations", goal.meeting],
    ["Exceeding expectations", goal.exceeding],
  ]
    .map(([label, text]) => `${label}\n${text}`)
    .join("\n\n");
}

/** The Copy for FCP button. The text sits in a hidden field, as the Review page's copy does. */
function copyForFcp(goal: Goal, className = "btn ghost"): string {
  // Distinct prefixes, so no slug can make one goal's id match another's.
  const id = `fcp-text-${goal.slug}`;
  const statusId = `fcp-note-${goal.slug}`;
  return `<button class="${className}" type="button" data-copy="#${escapeHtml(id)}" data-copy-status="#${escapeHtml(statusId)}" data-copy-message="Copied.">${icon("copy")} Copy for FCP</button>
    <textarea id="${escapeHtml(id)}" hidden readonly aria-label="${escapeHtml(`FCP text: ${goal.title}`)}">${escapeHtml(fcpText(goal))}</textarea>
    <p id="${escapeHtml(statusId)}" class="copy-status" role="status"></p>`;
}

/** FCP fields are plain text, pasted as typed, so line breaks are kept and nothing is formatted. */
function plain(text: string): string {
  return text ? escapeHtml(text) : `<span class="muted">Not written yet</span>`;
}

// ---- Header -------------------------------------------------------------

function header(data: GoalsViewData): string {
  const switchLink = (view: GoalsView, label: string) =>
    `<a class="seg" href="${escapeHtml(goalsUrl(view, data.cycle))}"${view === data.view ? ' aria-current="page"' : " data-view-switch"}>${label}</a>`;
  const cycleLinks = data.cycles
    .map(
      (cycle) =>
        `<a class="seg" href="${escapeHtml(goalsUrl(data.view, cycle))}"${cycle === data.cycle ? ' aria-current="true"' : ""}>${escapeHtml(cycle || "No cycle")}</a>`,
    )
    .join("");
  const start = data.nextCycle
    ? `<a class="btn" href="${escapeHtml(goalsUrl(data.view, data.nextCycle, { from: data.cycle }))}">Start ${escapeHtml(data.nextCycle)}</a>`
    : "";
  const key = GOAL_STATUSES.map((status) => `<div><dt>${stamp(status)}</dt><dd>${STATUS_HINT[status]}</dd></div>`).join(
    "",
  );

  return `<header class="page-head">
      <div>
        <p class="kicker">${data.cycle ? `Review cycle ${escapeHtml(data.cycle)}` : "No review cycle"}</p>
        <h1>Goals</h1>
        <p class="page-sub">What your work should add up to this cycle. You agree on these with your manager, who copies them into Full Cycle Performance (FCP). Work you link to a goal becomes its evidence.</p>
        <dl class="status-key" aria-label="Goal status">${key}</dl>
      </div>
      <div class="head-actions">
        <nav class="segmented" aria-label="Review cycle">${cycleLinks}</nav>
        ${start}
      </div>
    </header>
    <div class="view-bar">
      <nav class="segmented" aria-label="Goals view">${switchLink("reader", "Reader")}${switchLink("timeline", "Timeline")}</nav>
    </div>`;
}

function stamp(status: GoalStatus): string {
  return `<span class="stamp${status === "agreed" ? "" : ` ${status}`}">${STATUS_LABEL[status]}</span>`;
}

// ---- A goal as a section of the sheet -----------------------------------

interface ClauseOptions {
  label: string;
  stats: GoalStats | undefined;
  editHref: string;
  /** Where "Mark agreed" returns to; omitted on the goal page. */
  returnTo?: string;
  /** The goal page names the goal in its h1 and keeps only Edit and Copy. */
  zoomed?: boolean;
  /** Reader only: whether the goal can move up or down among its live peers. */
  move?: { up: boolean; down: boolean };
}

/** Move up and Move down; disabled at the ends. Posts normally so the page returns to the goal. */
function moveButtons(goal: Goal, opts: ClauseOptions): string {
  if (!opts.move || !opts.returnTo) return "";
  const button = (direction: "up" | "down", enabled: boolean) =>
    `<button class="icon-btn" type="submit" name="direction" value="${direction}"${enabled ? "" : " disabled"} aria-label="${escapeHtml(`Move ${goal.title} ${direction}`)}" title="Move ${direction}">${icon(direction)}</button>`;
  return `<form class="move-goal" method="post" action="${goalPath(goal)}/move" data-full-page>
      ${hidden("return_to", opts.returnTo)}${hidden("expected_revision", contentRevision(goal))}${button("up", opts.move.up)}${button("down", opts.move.down)}
    </form>`;
}

function record(goal: Goal, opts: ClauseOptions): string {
  const stats = opts.stats;
  const parts = [`<span class="no">${opts.label}</span>`, stamp(goal.status)];
  if (goal.droppedOn) parts.push(`<span>on ${shortMonthDay(goal.droppedOn)}</span>`);
  if (!stats || stats.entries + stats.todos === 0) parts.push("<span>No linked work yet</span>");
  else {
    const link = (count: number, one: string, many: string) =>
      opts.zoomed
        ? `<span>${count} ${count === 1 ? one : many}</span>`
        : `<a href="${goalPath(goal)}">${count} ${count === 1 ? one : many}</a>`;
    if (stats.entries) parts.push(link(stats.entries, "entry", "entries"));
    if (stats.todos) parts.push(link(stats.todos, "todo", "todos"));
    if (stats.starred) parts.push(`<span class="starred">${icon("star", true)}${stats.starred} starred</span>`);
    if (stats.lastDate) parts.push(`<span>last ${shortMonthDay(stats.lastDate)}</span>`);
  }
  if (goal.status === "draft" && opts.returnTo) {
    parts.push(`<form method="post" action="${goalPath(goal)}/status" data-full-page>
        ${hidden("return_to", opts.returnTo)}${hidden("expected_revision", contentRevision(goal))}${hidden("status", "agreed")}
        <button class="btn small" type="submit" aria-label="${escapeHtml(`Mark agreed: ${goal.title}`)}">${icon("check")} Mark agreed</button>
      </form>`);
  }
  return `<div class="record">${parts.join("")}</div>`;
}

function clause(goal: Goal, opts: ClauseOptions): string {
  const nameId = `name-${goal.slug}`;
  const heading = opts.zoomed ? "h1" : "h3";
  const terms =
    goal.kind === "activity"
      ? `<dt>Activity</dt><dd class="lead">${plain(goal.description)}</dd>`
      : `<dt>Description</dt><dd class="lead">${plain(goal.description)}</dd>
         <dt>Meeting expectations</dt><dd>${plain(goal.meeting)}</dd>
         <dt>Exceeding expectations</dt><dd>${plain(goal.exceeding)}</dd>`;
  const notes = goal.notes
    ? `<div class="prose">${renderEntryMarkdown(goal.notes)}</div>`
    : `<a class="link-button" href="${escapeHtml(opts.editHref)}">Add talking points</a>`;
  const more = opts.zoomed
    ? ""
    : `<a class="quiet-link" href="${goalPath(goal)}">Open ${KIND_LABEL[goal.kind].toLowerCase()} page ${icon("arrow")}</a>
       <a class="quiet-link" href="${escapeHtml(reviewUrl(goal, opts.stats))}">Review this ${KIND_LABEL[goal.kind].toLowerCase()} ${icon("arrow")}</a>`;

  return `<article class="clause is-${goal.status}"${opts.zoomed ? "" : ` id="${escapeHtml(anchor(goal))}" data-goal`} aria-labelledby="${escapeHtml(nameId)}">
      ${record(goal, opts)}
      <div class="clause-body">
        <${heading} class="clause-name" id="${escapeHtml(nameId)}">${escapeHtml(goal.title)}</${heading}>
        <p class="clause-link">[[${escapeHtml(goal.slug)}]]</p>
        <dl class="terms">${terms}</dl>
        <dl class="terms notes"><dt>Notes<span class="term-sub">Not in FCP</span></dt><dd>${notes}</dd></dl>
      </div>
      <div class="clause-actions">
        ${moveButtons(goal, opts)}
        <a class="btn ghost" href="${escapeHtml(opts.editHref)}">${icon("edit")} Edit</a>
        ${copyForFcp(goal)}
        ${more}
      </div>
    </article>`;
}

// ---- The same section as a form ----------------------------------------

interface FormOptions {
  label: string;
  kind: GoalKind;
  /** Null for a new goal. */
  goal: Goal | null;
  cycle: string;
  view: GoalsView;
  values: URLSearchParams;
  cancelHref: string;
  /** Set when the form stands in for the goal's section, so links to it still land. */
  id?: string;
}

/** Edit and add share this form, in the reader and in the timeline. */
function goalForm(opts: FormOptions): string {
  const { goal, kind } = opts;
  const prefix = goal ? `edit-${goal.slug}` : `new-${kind}`;
  const value = (name: "title" | "description" | "meeting" | "exceeding" | "notes") =>
    escapeHtml(opts.values.get(name) ?? (goal ? goal[name] : ""));
  const typedStatus = opts.values.get("status") ?? "";
  const status = isValidGoalStatus(typedStatus) ? typedStatus : (goal?.status ?? "draft");
  const statuses: GoalStatus[] = goal ? ["draft", "agreed", "dropped"] : ["draft", "agreed"];
  const radios = statuses
    .map(
      (option) =>
        `<label><input type="radio" name="status" value="${option}"${option === status ? " checked" : ""}> ${STATUS_LABEL[option]}</label>`,
    )
    .join("");
  const field = (name: "description" | "meeting" | "exceeding", label: string, placeholder: string) =>
    `<label class="term-label" for="${escapeHtml(`${prefix}-${name}`)}">${label}</label>
     <div class="term-field"><textarea id="${escapeHtml(`${prefix}-${name}`)}" name="${name}" rows="4" placeholder="${placeholder}" data-plain>${value(name)}</textarea></div>`;
  const kindName = KIND_LABEL[kind];
  const fcpFields =
    kind === "activity"
      ? field("description", "Activity", "What you'll work on and why.")
      : `${field("description", "Description", "What the goal is and why it matters.")}
         ${field("meeting", "Meeting expectations", "Meeting expectations may include…")}
         ${field("exceeding", "Exceeding expectations", "Exceeding expectations may include…")}`;
  const returnTo = goal
    ? goalsUrl(opts.view, opts.cycle, opts.view === "timeline" ? { open: goal.slug } : {}, anchor(goal))
    : goalsUrl(opts.view, opts.cycle);
  const action = goal ? goalPath(goal) : "/goals";
  const fields = goal
    ? `${hidden("view", opts.view)}${hidden("expected_revision", contentRevision(goal))}`
    : `${hidden("cycle", opts.cycle)}${hidden("kind", kind)}${hidden("view", opts.view)}`;
  // The link is what entries and todos type; changing it rewrites them (see the route).
  const link = goal
    ? `<label class="term-label" for="${escapeHtml(`${prefix}-link`)}">Link</label>
          <div class="term-field"><input class="slug" id="${escapeHtml(`${prefix}-link`)}" name="link" value="${escapeHtml(opts.values.get("link") ?? goal.slug)}" autocomplete="off" spellcheck="false" aria-describedby="${escapeHtml(`${prefix}-link-hint`)}">
            <p class="field-hint" id="${escapeHtml(`${prefix}-link-hint`)}">What you type to link work, like <code>[[${escapeHtml(goal.slug)}]]</code>. Changing it updates linked entries.</p></div>`
    : "";

  return `<form class="clause goal-edit is-editing is-${status}"${opts.id ? ` id="${escapeHtml(opts.id)}"${goal ? " data-goal" : ""}` : ""} method="post" action="${action}" data-full-page aria-label="${goal ? `Edit ${opts.label.toLowerCase()}` : `New ${kindName.toLowerCase()}`}">
      ${hidden("return_to", returnTo)}${fields}
      <div class="record">
        <span class="no">${opts.label}</span>
        <span class="editing-mark">${goal ? "Editing" : "New"}</span>
        <fieldset class="status-pick"><legend>Status</legend>${radios}</fieldset>
      </div>
      <div class="clause-body">
        <div class="terms">
          <label class="term-label" for="${escapeHtml(`${prefix}-title`)}">${kindName} name</label>
          <div class="term-field"><textarea class="name" id="${escapeHtml(`${prefix}-title`)}" name="title" rows="2" required autocomplete="off" placeholder="A short title your manager can copy as is" data-plain${goal ? "" : " autofocus"}>${value("title")}</textarea></div>
          ${link}
          ${fcpFields}
        </div>
        <div class="terms notes">
          <span class="term-label"><span id="${escapeHtml(`${prefix}-notes-label`)}">Notes</span><span class="term-sub">Not in FCP</span></span>
          <div class="term-field"><textarea name="notes" rows="2" aria-labelledby="${escapeHtml(`${prefix}-notes-label`)}" placeholder="Talking points for check-ins.">${value("notes")}</textarea></div>
        </div>
      </div>
      <div class="clause-bar">
        <span class="spacer"></span>
        <span class="key-hint" aria-hidden="true"><kbd>Ctrl</kbd> <kbd>Enter</kbd></span>
        <a class="btn ghost" href="${escapeHtml(opts.cancelHref)}">Cancel</a>
        <button class="btn primary" type="submit">${goal ? "Save" : "Add"} ${kindName.toLowerCase()}</button>
      </div>
    </form>`;
}

// ---- Reader -------------------------------------------------------------

function band(cycle: string, title: string, count: number, note: string, plan = false): string {
  return `<div class="band${plan ? " is-plan" : ""}">
      <span class="band-m">${escapeHtml(cycle)}</span>
      <h2>${title} <span class="count">${count}</span></h2>
      <p class="band-note">${note}</p>
    </div>`;
}

const GOALS_NOTE = "Weight is set by your manager in FCP.";
const PLAN_NOTE = "Not rated. Reviewed for progress and future planning.";

function addUrl(data: GoalsViewData, kind: GoalKind): string {
  return goalsUrl(data.view, data.cycle, { add: kind }, "add-goal");
}

function slot(data: GoalsViewData, kind: GoalKind, count: number): string {
  const hint =
    kind === "goal"
      ? "Most people have 3 to 5. Start it as a draft and agree on it later."
      : "You can add activities any time during the year.";
  return `<div class="clause is-slot">
      <div class="record"><span class="no">${KIND_LABEL[kind]} ${count + 1}</span></div>
      <div class="clause-body slot-body">
        <a class="btn" href="${escapeHtml(addUrl(data, kind))}">${icon("plus")} Add ${KIND_LABEL[kind].toLowerCase()}</a>
        <p class="field-hint">${hint}</p>
      </div>
    </div>`;
}

function newForm(data: GoalsViewData, kind: GoalKind, count: number): string {
  return goalForm({
    label: `${KIND_LABEL[kind]} ${count + 1}`,
    kind,
    goal: null,
    cycle: data.cycle,
    view: data.view,
    values: data.retry,
    cancelHref: goalsUrl(data.view, data.cycle),
    id: "add-goal",
  });
}

/** An empty cycle shows the shape of a goal instead of a blank page. */
function firstRun(data: GoalsViewData): string {
  return `<div class="clause is-draft first-run">
      <div class="record"><span class="no">Goal 1</span>${stamp("draft")}</div>
      <div class="clause-body">
        <p class="empty-title">No goals for ${escapeHtml(data.cycle)} yet.</p>
        <p class="empty-hint">Write the goals you and your manager agree on. Each one has the same parts as Full Cycle Performance, so your manager can copy them straight over.</p>
        <dl class="terms ghost-terms">
          <dt>Goal name</dt><dd>A short title, like "Improve workflow efficiency"</dd>
          <dt>Description</dt><dd>What the goal is and why it matters</dd>
          <dt>Meeting expectations</dt><dd>Work that meets the goal</dd>
          <dt>Exceeding expectations</dt><dd>Work that goes beyond it</dd>
          <dt>Notes</dt><dd>Your talking points for check-ins. Not copied to FCP.</dd>
        </dl>
        <a class="btn primary" href="${escapeHtml(addUrl(data, "goal"))}">Write your first goal</a>
      </div>
    </div>`;
}

function readerSection(data: GoalsViewData, goal: Goal): string {
  const label = numberLabel(goal, data.goals);
  if (goal.slug === data.edit) {
    return goalForm({
      label,
      kind: goal.kind,
      goal,
      cycle: data.cycle,
      view: "reader",
      values: data.retry,
      cancelHref: goalsUrl("reader", data.cycle, {}, anchor(goal)),
      id: anchor(goal),
    });
  }
  return clause(goal, {
    label,
    stats: data.stats.get(goal.slug),
    editHref: goalsUrl("reader", data.cycle, { edit: goal.slug }, anchor(goal)),
    returnTo: goalsUrl("reader", data.cycle, {}, anchor(goal)),
    move: goal.status === "dropped" ? undefined : moveRange(goal, data.goals),
  });
}

/** Whether a live goal has a live neighbour of its kind above and below it. */
function moveRange(goal: Goal, goals: Goal[]): { up: boolean; down: boolean } {
  const peers = goals.filter((other) => other.kind === goal.kind && other.status !== "dropped");
  const index = peers.findIndex((other) => other.slug === goal.slug);
  return { up: index > 0, down: index < peers.length - 1 };
}

function renderReader(data: GoalsViewData): string {
  const { goals, activities, dropped } = sections(data.goals);
  const noGoals = !data.goals.some((goal) => goal.kind === "goal");
  const goalRows =
    noGoals && data.add !== "goal"
      ? firstRun(data)
      : [
          ...goals.map((goal) => readerSection(data, goal)),
          data.add === "goal" ? newForm(data, "goal", goals.length) : slot(data, "goal", goals.length),
        ].join("");
  const activityRows = [
    ...activities.map((goal) => readerSection(data, goal)),
    data.add === "activity" ? newForm(data, "activity", activities.length) : slot(data, "activity", activities.length),
  ].join("");
  const droppedList = dropped.length
    ? `<details class="dropped-goals"${dropped.some((goal) => goal.slug === data.edit) ? " open" : ""}>
        <summary>Dropped <span class="count">${dropped.length}</span></summary>
        ${dropped.map((goal) => readerSection(data, goal)).join("")}
      </details>`
    : "";

  return `<div class="agreement">
      ${band(data.cycle, "Individual goals", goals.length, GOALS_NOTE)}
      ${goalRows}
      ${band(data.cycle, "Talent development plan", activities.length, PLAN_NOTE, true)}
      ${activityRows}
      ${droppedList}
      <p class="sheet-foot">Link work to a goal by picking it when you log (type <kbd>/</kbd>), or by typing its link, like <code>[[${escapeHtml(goals[0]?.slug ?? "goal-link")}]]</code>. Review turns linked work into evidence you can copy.</p>
    </div>`;
}

// ---- Timeline -------------------------------------------------------------

function itemsFor(items: ReviewItem[], slug: string): ReviewItem[] {
  return items.filter((item) => item.goals.includes(slug));
}

function folio(goal: Goal, data: GoalsViewData): string {
  const stats = data.stats.get(goal.slug);
  const kind = KIND_LABEL[goal.kind].toLowerCase();
  const fcp =
    goal.kind === "activity"
      ? `<div class="f-desc"><dt>Activity</dt><dd>${plain(goal.description)}</dd></div>`
      : `<div class="f-desc"><dt>Description</dt><dd>${plain(goal.description)}</dd></div>
         <div><dt>Meeting expectations</dt><dd>${plain(goal.meeting)}</dd></div>
         <div><dt>Exceeding expectations</dt><dd>${plain(goal.exceeding)}</dd></div>`;
  const evidence =
    stats && stats.entries + stats.todos
      ? `${stats.entries} ${stats.entries === 1 ? "entry" : "entries"} · ${stats.todos} ${stats.todos === 1 ? "todo" : "todos"}<br>${stats.starred} starred${stats.lastDate ? ` · last ${shortMonthDay(stats.lastDate)}` : ""}`
      : "No linked work yet";
  return `<div class="detail-grid">
      <dl class="folio">
        ${fcp}
        <div class="f-notes"><dt>Notes<small>Not in FCP</small></dt><dd>${goal.notes ? `<div class="prose">${renderEntryMarkdown(goal.notes)}</div>` : '<span class="muted">None yet</span>'}</dd></div>
      </dl>
      <aside class="detail-meta">
        <dl class="meta">
          <div><dt>Status</dt><dd>${STATUS_LABEL[goal.status]}. ${STATUS_HINT[goal.status]}.</dd></div>
          <div><dt>Evidence</dt><dd class="rec">${evidence}</dd></div>
          <div><dt>Link</dt><dd><code>[[${escapeHtml(goal.slug)}]]</code></dd></div>
        </dl>
        <div class="meta-actions">
          <a class="btn" href="${escapeHtml(goalsUrl("timeline", data.cycle, { edit: goal.slug }, anchor(goal)))}">${icon("edit")} Edit ${kind}</a>
          ${copyForFcp(goal)}
          <a class="quiet-link" href="${goalPath(goal)}">Open ${kind} page ${icon("arrow")}</a>
          <a class="quiet-link" href="${escapeHtml(reviewUrl(goal, stats))}">Review this ${kind} ${icon("arrow")}</a>
        </div>
      </aside>
    </div>`;
}

function timelineGoal(data: GoalsViewData, goal: Goal, year: number): string {
  const editing = goal.slug === data.edit;
  const open = editing || goal.slug === data.open;
  const detailId = `detail-${goal.slug}`;
  // A real form, so the row opens without the script too; app.js opens it in place.
  const toggle = `<form class="row-open" method="get" action="/goals#${escapeHtml(anchor(goal))}">
      ${hidden("view", "timeline")}${hidden("cycle", data.cycle)}
      <button class="row-name" type="submit" name="open" value="${open ? "" : escapeHtml(goal.slug)}" aria-expanded="${open}" aria-controls="${escapeHtml(detailId)}" data-unfold>
        <span class="chev" aria-hidden="true">▸</span><span>${escapeHtml(goal.title)}</span>
      </button>
    </form>`;
  const status =
    goal.status === "dropped" && goal.droppedOn
      ? `<span class="st">Dropped</span> ${shortMonthDay(goal.droppedOn)}`
      : `<span class="st st-${goal.status}">${STATUS_LABEL[goal.status]}</span>`;
  const content = editing
    ? goalForm({
        label: numberLabel(goal, data.goals),
        kind: goal.kind,
        goal,
        cycle: data.cycle,
        view: "timeline",
        values: data.retry,
        cancelHref: goalsUrl("timeline", data.cycle, { open: goal.slug }, anchor(goal)),
      })
    : folio(goal, data);
  return timelineRow({
    goal,
    year,
    today: data.today,
    items: itemsFor(data.items, goal.slug),
    label: `${toggle}<p class="row-status">${status}</p>`,
    detail: `<div class="row-detail" id="${escapeHtml(detailId)}"${open ? "" : " hidden"}>${content}</div>`,
    id: anchor(goal),
  });
}

function timelineAdd(data: GoalsViewData, kind: GoalKind, count: number): string {
  if (data.add === kind) return `<div class="map-add-form">${newForm(data, kind, count)}</div>`;
  return `<div class="map-band band-add"><div class="row-label">
      <a class="btn ghost" href="${escapeHtml(addUrl(data, kind))}">${icon("plus")} Add ${KIND_LABEL[kind].toLowerCase()}</a>
    </div></div>`;
}

function renderTimeline(data: GoalsViewData): string {
  const year = cycleYear(data.cycle, data.today);
  const { goals, activities, dropped } = sections(data.goals);
  const rows = (list: Goal[]) => list.map((goal) => timelineGoal(data, goal, year)).join("");
  const droppedOf = (kind: GoalKind) => dropped.filter((goal) => goal.kind === kind);
  return `<div class="map-scroll">
      <section class="map" aria-label="Goals for ${escapeHtml(data.cycle)} by month">
        ${timelineHead({ year, today: data.today, label: `<h2 class="section-title">Individual goals <span class="count">${goals.length}</span></h2>` })}
        <ol class="map-rows">${rows([...goals, ...droppedOf("goal")])}</ol>
        ${timelineAdd(data, "goal", goals.length)}
        <div class="map-band band-section"><div class="row-label">
          <h2 class="section-title">Talent development plan <span class="count">${activities.length}</span></h2>
          <p class="band-note">${PLAN_NOTE}</p>
        </div></div>
        <ol class="map-rows">${rows([...activities, ...droppedOf("activity")])}</ol>
        ${timelineAdd(data, "activity", activities.length)}
      </section>
    </div>
    <div class="map-foot">${timelineLegend(data.today, year)}</div>`;
}

// ---- New cycle: carry goals over ------------------------------------------

function renderCarry(data: GoalsViewData, carry: { from: string; goals: Goal[] }): string {
  const row = (goal: Goal) => {
    const stats = data.stats.get(goal.slug);
    const linked = stats ? stats.entries + stats.todos : 0;
    const nameId = `carry-${goal.slug}`;
    return `<label class="carry-row">
        <span class="carry-m">${numberLabel(goal, carry.goals)} <input type="checkbox" name="goal" value="${escapeHtml(goal.slug)}" checked aria-labelledby="${escapeHtml(nameId)}"></span>
        <span><span class="carry-name" id="${escapeHtml(nameId)}">${escapeHtml(goal.title)}</span>${goal.description ? `<span class="carry-desc">${escapeHtml(goal.description)}</span>` : ""}</span>
        <span class="carry-meta">${STATUS_LABEL[goal.status]} · ${linked} linked</span>
      </label>`;
  };
  const { goals, activities } = sections(carry.goals);
  const from = escapeHtml(carry.from);
  return `<form class="agreement" method="post" action="/goals/carry" data-full-page>
      ${hidden("from", carry.from)}${hidden("cycle", data.cycle)}${hidden("view", data.view)}
      <div class="band"><span class="band-m">${escapeHtml(data.cycle)}</span><h2>Start from ${from}</h2></div>
      <div class="lead-copy">
        <p class="empty-title">No goals for ${escapeHtml(data.cycle)} yet.</p>
        <p class="empty-hint">Pick the ${from} goals to carry over. Copies start as drafts, so you can rework them with your manager and mark each one agreed. ${from} keeps its goals, notes, and evidence.</p>
      </div>
      <div class="carry">
        ${goals.map(row).join("")}
        ${activities.length ? `<p class="carry-sub">Talent development plan</p>${activities.map(row).join("")}` : ""}
      </div>
      <div class="carry-actions">
        <label class="check-label"><input type="checkbox" name="notes" value="1"> Copy notes too</label>
        <span class="spacer"></span>
        <a class="btn ghost" href="${escapeHtml(addUrl({ ...data, view: "reader" }, "goal"))}">Start with a blank goal</a>
        <button class="btn primary" type="submit">Copy as drafts</button>
      </div>
    </form>`;
}

// ---- Pages ----------------------------------------------------------------

export interface LinkChange {
  entries: number;
  todos: number;
  /** Entries and todos left linking to `old`. */
  left: number;
  old: string;
}

/** "Link changed. Updated 3 entries and 1 todo." */
function renamedMessage({ entries, todos, left, old }: LinkChange): string {
  if (left) {
    const count = `${left} ${left === 1 ? "entry or todo" : "entries or todos"}`;
    const start = `Link changed, but ${count} couldn't be updated safely and still link to [[${old}]].`;
    // Typed links are slugified, so only a link that survives that can be typed back exactly.
    if (slugify(old) !== old) return `${start} Fix those links by hand.`;
    return `${start} If another app has a file open, close it, then change the link back to ${old} to undo, or fix those links by hand.`;
  }
  if (entries + todos === 0) return "Link changed. Nothing was linked to it yet.";
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `Link changed. Updated ${count(entries, "entry", "entries")} and ${count(todos, "todo", "todos")}.`;
}

export function renderGoals(data: GoalsViewData): string {
  const body = data.carry
    ? renderCarry(data, data.carry)
    : data.view === "timeline" && data.goals.length > 0
      ? renderTimeline(data)
      : renderReader(data);
  return `<div class="page goals-sheet goals-${data.view}">
    ${header(data)}
    ${notice(data.error)}
    ${data.renamed ? notice(renamedMessage(data.renamed), data.renamed.left ? "error" : "ok") : ""}
    ${body}
  </div>`;
}

function evidenceFeed(items: ReviewItem[], goals: GoalIndex, slug: string): string {
  if (items.length === 0) {
    return emptyState(
      "No linked work yet.",
      `Link this goal when you log an entry (type <kbd>/</kbd>), or add <code>[[${escapeHtml(slug)}]]</code> to the text. To count earlier work, edit that entry and add the link. Linked todos show up here once they're done.`,
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
            (
              item,
            ) => `<li class="entry${item.isHighlight ? " is-starred" : ""}${item.kind === "todo" ? " is-todo" : ""}">
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
  const kind = KIND_LABEL[goal.kind].toLowerCase();

  // Previous and next among the same kind in this cycle, in sheet order.
  const inCycle = data.goals.filter((other) => other.cycle === goal.cycle);
  const { goals: live, activities, dropped } = sections(inCycle);
  const peers = [...(goal.kind === "goal" ? live : activities), ...dropped.filter((other) => other.kind === goal.kind)];
  const index = peers.findIndex((other) => other.slug === goal.slug);
  const label = numberLabel(goal, inCycle);
  const position =
    goal.status === "dropped" ? `Dropped ${kind}` : `${label} of ${peers.filter((p) => p.status !== "dropped").length}`;
  const step = (other: Goal | undefined, dir: "left" | "right", word: string) =>
    other
      ? `<a class="icon-btn" href="${goalPath(other)}" aria-label="${escapeHtml(`${word}: ${other.title}`)}" title="${escapeHtml(`${word}: ${other.title}`)}">${icon(dir)}</a>`
      : `<span class="icon-btn" aria-disabled="true">${icon(dir)}</span>`;

  const openTodos = data.openTodos
    ? `<p class="goal-open-todos"><a href="/todos?goal=${encodeURIComponent(goal.slug)}">${data.openTodos} open ${data.openTodos === 1 ? "todo" : "todos"} linked</a>. They count as evidence once done.</p>`
    : "";
  const year = cycleYear(goal.cycle, data.today);

  return `<div class="page goals-sheet goal-page">
    <div class="agreement">
      <div class="zoom-head">
        <p class="kicker"><a href="/goals?cycle=${encodeURIComponent(goal.cycle)}#${escapeHtml(anchor(goal))}">Goals · ${escapeHtml(goal.cycle)}</a></p>
        <div class="zoom-nav">${step(peers[index - 1], "left", "Previous")}<span>${position}</span>${step(peers[index + 1], "right", "Next")}</div>
        <a class="btn" href="${escapeHtml(reviewUrl(goal, stats))}">Review this ${kind} ${icon("arrow")}</a>
      </div>
      ${notice(data.error)}
      ${clause(goal, {
        label,
        stats,
        editHref: goalsUrl("reader", goal.cycle, { edit: goal.slug }, anchor(goal)),
        zoomed: true,
      })}
      <section class="zoom-timeline" aria-label="Linked work across ${year}">
        ${timelineHead({ year, today: data.today, label: "" })}
        <ol class="map-rows">${timelineRow({ goal, year, today: data.today, items: data.items, label: `<p class="row-status">Linked work in ${year}</p>` })}</ol>
      </section>
      <section class="goal-evidence-feed" aria-labelledby="evidence-title">
        <h2 class="section-title" id="evidence-title">Evidence <span class="count">${data.items.length}</span></h2>
        ${openTodos}
        ${evidenceFeed(data.items, goals, goal.slug)}
      </section>
    </div>
  </div>`;
}
