import { escapeHtml } from "../lib/html";
import { formatMinutes, monthYear, RANGE_PRESETS, shortMonthDay, weekdayName } from "../lib/date";
import type { Goal } from "../vault/format";
import {
  filterSummary,
  markdownToHtml,
  reviewFileName,
  reviewQuery,
  type Review,
  type ReviewFilters,
  type ReviewItem,
} from "../review";
import { emptyState, entryHtml, goalIndex, icon, metaChips, richText, type GoalIndex } from "./components";

export interface ReviewViewData {
  review: Review;
  goals: Goal[];
  markdown: string;
  allTags: string[];
}

function rangeLabel(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return sameYear
    ? `${shortMonthDay(from)} – ${shortMonthDay(to)}, ${to.slice(0, 4)}`
    : `${shortMonthDay(from)}, ${from.slice(0, 4)} – ${shortMonthDay(to)}, ${to.slice(0, 4)}`;
}

function hasFilters(f: ReviewFilters): boolean {
  return Boolean(f.tag || f.goal || f.q || f.highlightsOnly);
}

/** Same period, filters removed. */
function clearFiltersHref(f: ReviewFilters): string {
  return `/review?${reviewQuery(f, { tag: null, goal: null, q: "", highlightsOnly: false })}`;
}

function sheetItem(item: ReviewItem, goals: GoalIndex, withDate: boolean): string {
  const marker = item.kind === "todo" ? `<span class="done-mark" title="Completed todo">${icon("check")}</span>` : "";
  const priority = item.priority
    ? `<span class="priority p-${item.priority.toLowerCase()}">${item.priority}</span>`
    : "";
  const date = withDate ? `<time class="item-date" datetime="${item.date}">${shortMonthDay(item.date)}</time>` : "";
  return `<li class="sheet-item${item.isHighlight ? " is-starred" : ""}${item.kind === "todo" ? " is-todo" : ""}">
      ${date}${marker}${item.kind === "entry" ? `<div class="sheet-text">${entryHtml(item.text, goals)}</div>` : `<span class="sheet-text">${richText(item.text, goals)}</span>`}${priority}
      ${metaChips({ ...item, minutes: null }, goals)}
    </li>`;
}

function dailyLog(review: Review, goals: GoalIndex): string {
  let month = "";
  return review.days
    .map((day) => {
      const monthKey = day.date.slice(0, 7);
      const monthHead = monthKey !== month ? `<h4 class="sheet-month">${monthYear(monthKey)}</h4>` : "";
      month = monthKey;
      const items = [...day.entries, ...day.todos].map((item) => sheetItem(item, goals, false)).join("");
      return `${monthHead}<section class="sheet-day">
          <div class="margin"><h5 class="sheet-date"><time datetime="${day.date}"><span>${weekdayName(day.date).slice(0, 3)}</span> <span>${shortMonthDay(day.date)}</span></time></h5></div>
          <ul class="sheet-items">${items}</ul>
        </section>`;
    })
    .join("");
}

function controls(data: ReviewViewData): string {
  const f = data.review.filters;
  const presets = RANGE_PRESETS.map(
    (p) =>
      `<a class="seg" href="/review?${escapeHtml(reviewQuery(f, { preset: p.key }))}"${f.preset === p.key ? ' aria-current="true"' : ""}>${p.label}</a>`,
  ).join("");
  // Keep an active tag selectable even if the new period has no items with it,
  // so the filter can't be in force while the dropdown says "Any".
  const tags = f.tag && !data.allTags.includes(f.tag) ? [f.tag, ...data.allTags] : data.allTags;
  const tagOptions = tags
    .map((tag) => `<option value="${escapeHtml(tag)}"${tag === f.tag ? " selected" : ""}>#${escapeHtml(tag)}</option>`)
    .join("");
  const goalOptions = data.goals
    .map(
      (g) =>
        `<option value="${escapeHtml(g.slug)}"${g.slug === f.goal ? " selected" : ""}>${escapeHtml(g.title)}${g.cycle ? ` (${escapeHtml(g.cycle)})` : ""}</option>`,
    )
    .join("");

  return `<section class="review-controls" aria-label="Review period and filters">
      <nav class="segmented" aria-label="Period">${presets}</nav>
      <form class="filter-bar" method="get" action="/review">
        <label class="field"><span>From</span><input type="date" name="from" value="${f.from}" required></label>
        <label class="field"><span>To</span><input type="date" name="to" value="${f.to}" required></label>
        <label class="field"><span>Tag</span><select name="tag" data-autosubmit><option value="">Any</option>${tagOptions}</select></label>
        <label class="field"><span>Goal</span><select name="goal" data-autosubmit><option value="">Any</option>${goalOptions}</select></label>
        <label class="field grow"><span>Contains</span><input type="search" name="q" value="${escapeHtml(f.q)}" placeholder="Text in an entry" data-shortcut="/"></label>
        <div class="toggles">
          <label class="check-label"><input type="checkbox" name="highlights" value="1"${f.highlightsOnly ? " checked" : ""} data-autosubmit> Starred only</label>
          <label class="check-label"><input type="checkbox" name="sort" value="desc"${f.sort === "desc" ? " checked" : ""} data-autosubmit> Newest first</label>
        </div>
        <div class="filter-actions">
          <button class="btn" type="submit">Apply</button>
          ${hasFilters(f) ? `<a class="btn ghost" href="${escapeHtml(clearFiltersHref(f))}">Clear filters</a>` : ""}
        </div>
      </form>
    </section>`;
}

function side(data: ReviewViewData): string {
  const { review } = data;
  const f = review.filters;
  const query = escapeHtml(reviewQuery(f));
  const tags = review.stats.tags.length
    ? `<ol class="tally">${review.stats.tags
        .slice(0, 12)
        .map(
          (t) =>
            `<li><a href="/review?${escapeHtml(reviewQuery(f, { tag: t.name === f.tag ? null : t.name }))}"${t.name === f.tag ? ' aria-current="true"' : ""}>#${escapeHtml(t.name)}</a><span class="count">${t.count}</span></li>`,
        )
        .join("")}</ol>`
    : `<p class="muted">No tags in this range.</p>`;

  // Like tags: clicking a goal filters the review to it (click again to clear).
  const goalTally = review.byGoal.length
    ? `<ol class="tally">${review.byGoal
        .map(
          (g) =>
            `<li><a href="/review?${escapeHtml(reviewQuery(f, { goal: g.goal.slug === f.goal ? null : g.goal.slug }))}"${g.goal.slug === f.goal ? ' aria-current="true"' : ""}>${escapeHtml(g.goal.title)}</a><span class="count">${g.items.length}</span></li>`,
        )
        .join("")}</ol>`
    : `<p class="muted">No goal-linked work in this range.</p>`;

  const fileName = reviewFileName(f);

  return `<aside class="review-side">
      <section class="export-panel" aria-labelledby="export-title">
        <h2 class="section-title" id="export-title">Take it with you</h2>
        <button class="btn primary block" type="button" data-copy="#md-source" data-copy-html="#html-source" data-copy-status="#copy-status">${icon("copy")} Copy the document</button>
        <p id="copy-status" class="copy-status" role="status"></p>
        <p class="field-hint">Pastes as formatted text in Word or Google Docs, and as Markdown in plain text boxes.</p>
        <div class="download-row">
          <a class="btn" href="/review/export.md?${query}" download>${icon("download")} .md</a>
          <a class="btn" href="/review/export.json?${query}" download>.json</a>
          <a class="btn" href="/review/export.jsonl?${query}" download>.jsonl</a>
        </div>
        <p class="field-hint">For an AI assistant: give it the .json file to draft your review from. .jsonl has the same items, one per line, for tools that read files in chunks.</p>
        <button class="btn ghost block" type="button" data-print="${escapeHtml(fileName)}">${icon("print")} Print or save as PDF</button>
      </section>
      <section aria-labelledby="tags-title">
        <h2 class="section-title" id="tags-title">Tags</h2>
        ${tags}
      </section>
      <section aria-labelledby="goals-title">
        <h2 class="section-title" id="goals-title">Goals</h2>
        ${goalTally}
      </section>
      <details class="md-source">
        <summary>Markdown source</summary>
        <label class="sr-only" for="md-source">Markdown</label>
        <textarea id="md-source" rows="14" readonly>${escapeHtml(data.markdown)}</textarea>
      </details>
      <template id="html-source">${markdownToHtml(data.markdown)}</template>
    </aside>`;
}

export function renderReview(data: ReviewViewData): string {
  const { review } = data;
  const goals = goalIndex(data.goals);
  const { stats, filters } = review;

  const summary = [
    `${stats.entries} journal ${stats.entries === 1 ? "entry" : "entries"}`,
    `${stats.todos} ${stats.todos === 1 ? "todo" : "todos"} completed`,
    `${stats.highlights} starred`,
    `${stats.activeDays} active ${stats.activeDays === 1 ? "day" : "days"}`,
    stats.minutes ? `${formatMinutes(stats.minutes)} logged` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // A filtered document (or PDF) must not pass for the whole period.
  const applied = filterSummary(filters, data.goals);
  const filterLine = applied.length
    ? `<p class="sheet-filters">Filtered: ${escapeHtml(applied.join("; "))} · <a href="${escapeHtml(clearFiltersHref(filters))}">Clear filters</a></p>`
    : "";

  const highlights =
    review.highlights.length && !filters.highlightsOnly
      ? `<section class="sheet-section is-highlights">
          <h3 class="sheet-heading">Highlights</h3>
          <ul class="sheet-items">${review.highlights.map((item) => sheetItem(item, goals, true)).join("")}</ul>
        </section>`
      : "";

  const byGoal = review.byGoal.length
    ? `<section class="sheet-section">
        <h3 class="sheet-heading">By goal</h3>
        ${review.byGoal
          .map(
            (
              group,
            ) => `<h4 class="sheet-goal"><a href="/goals/${encodeURIComponent(group.goal.slug)}">${escapeHtml(group.goal.title)}</a> <span class="count">${group.items.length}</span></h4>
              <ul class="sheet-items">${group.items.map((item) => sheetItem({ ...item, goals: item.goals.filter((g) => g !== group.goal.slug) }, goals, true)).join("")}</ul>`,
          )
          .join("")}
      </section>`
    : "";

  const document = review.items.length
    ? `${highlights}${byGoal}
       <section class="sheet-section">
         <h3 class="sheet-heading">Day by day</h3>
         ${dailyLog(review, goals)}
       </section>`
    : applied.length
      ? emptyState(
          "Nothing matches these filters in this period.",
          `<a href="${escapeHtml(clearFiltersHref(filters))}">Clear filters</a> or pick a longer period.`,
        )
      : emptyState("Nothing recorded in this period.", "Pick a longer period above.");

  return `<div class="page review-page">
    <header class="page-head">
      <div>
        <h1>Review</h1>
        <p class="page-sub">Pick a period. The document below is what you paste into your review.</p>
      </div>
    </header>
    ${controls(data)}
    <div class="review-layout">
      <article class="sheet" aria-labelledby="sheet-title">
        <header class="sheet-head">
          <h2 id="sheet-title">Accomplishments</h2>
          <p class="sheet-range">${rangeLabel(filters.from, filters.to)}</p>
          <p class="sheet-summary">${summary}</p>
          ${filterLine}
        </header>
        ${document}
      </article>
      ${side(data)}
    </div>
  </div>`;
}
