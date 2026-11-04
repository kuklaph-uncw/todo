/**
 * The review model. The Review page, the goal pages, and the Markdown / JSON /
 * JSONL exports all read from `buildReview`, so they can never disagree.
 */
import { escapeHtml } from "./lib/html";
import { renderEntryMarkdown } from "./lib/markdown";
import { formatMinutes, isValidDateString, presetRange, RANGE_PRESETS, type RangePreset } from "./lib/date";
import type { Priority, Status } from "./lib/validation";
import { plainText, type Goal } from "./vault/format";
import type { Vault } from "./vault/vault";

export interface ReviewItem {
  kind: "entry" | "todo";
  id: string;
  date: string;
  text: string;
  tags: string[];
  goals: string[];
  minutes: number | null;
  isHighlight: boolean;
  priority: Priority | null;
  status: Status | null;
}

export interface ReviewFilters {
  from: string;
  to: string;
  preset: RangePreset | null;
  highlightsOnly: boolean;
  sort: "asc" | "desc";
  tag: string | null;
  goal: string | null;
  q: string;
}

export interface ReviewDay {
  date: string;
  entries: ReviewItem[];
  todos: ReviewItem[];
}

export interface Review {
  filters: ReviewFilters;
  generatedAt: string;
  items: ReviewItem[];
  days: ReviewDay[];
  highlights: ReviewItem[];
  byGoal: { goal: Goal; items: ReviewItem[] }[];
  stats: {
    entries: number;
    todos: number;
    highlights: number;
    activeDays: number;
    minutes: number;
    tags: { name: string; count: number }[];
  };
}

/** A full rolling year: useful any day, unlike "this quarter" right after a quarter starts. */
export const DEFAULT_PRESET: RangePreset = "year";

/**
 * Journal entries dated in range plus done todos whose completion date is in
 * range. A reopened todo keeps its date but stops counting until it's done again.
 */
export function collectItems(vault: Vault, from: string, to: string): ReviewItem[] {
  const entries: ReviewItem[] = vault.getEntriesInRange(from, to).map((entry) => ({
    kind: "entry",
    id: entry.id,
    date: entry.date,
    text: entry.text,
    tags: entry.tags,
    goals: entry.goals,
    minutes: entry.minutes,
    isHighlight: entry.isHighlight,
    priority: null,
    status: null,
  }));

  const todos: ReviewItem[] = vault
    .getTodos()
    .filter((todo) => todo.status === "Done" && todo.completedOn !== null && todo.completedOn >= from && todo.completedOn <= to)
    .map((todo) => ({
      kind: "todo",
      id: todo.id,
      date: todo.completedOn as string,
      text: todo.task,
      tags: todo.tags,
      goals: todo.goals,
      minutes: null,
      isHighlight: todo.isHighlight,
      priority: todo.priority,
      status: todo.status,
    }));

  return [...entries, ...todos];
}

export function parseReviewFilters(params: URLSearchParams, today: string): ReviewFilters {
  const presetParam = params.get("preset");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const hasCustom = isValidDateString(from) && isValidDateString(to);
  const preset = RANGE_PRESETS.some((p) => p.key === presetParam)
    ? (presetParam as RangePreset)
    : hasCustom
      ? null
      : DEFAULT_PRESET;
  const range = preset ? presetRange(preset, today) : from <= to ? { from, to } : { from: to, to: from };
  // Changing a filter submits the dates; if they still match a preset, keep it highlighted.
  const matched =
    preset ??
    RANGE_PRESETS.find(({ key }) => {
      const r = presetRange(key, today);
      return r.from === range.from && r.to === range.to;
    })?.key ??
    null;

  return {
    ...range,
    preset: matched,
    highlightsOnly: params.get("highlights") === "1",
    sort: params.get("sort") === "desc" ? "desc" : "asc",
    tag: params.get("tag")?.replace(/^#/, "").toLowerCase() || null,
    goal: params.get("goal") || null,
    q: params.get("q")?.trim() ?? "",
  };
}

/** Query string for a filter set, leaving defaults out so URLs stay short. */
export function reviewQuery(filters: ReviewFilters, change: Partial<ReviewFilters> = {}): string {
  const f = { ...filters, ...change };
  const params = new URLSearchParams();
  if (f.preset) params.set("preset", f.preset);
  else {
    params.set("from", f.from);
    params.set("to", f.to);
  }
  if (f.highlightsOnly) params.set("highlights", "1");
  if (f.sort === "desc") params.set("sort", "desc");
  if (f.tag) params.set("tag", f.tag);
  if (f.goal) params.set("goal", f.goal);
  if (f.q) params.set("q", f.q);
  return params.toString();
}

export function buildReview(
  allItems: ReviewItem[],
  goals: Goal[],
  filters: ReviewFilters,
  generatedAt: string,
): Review {
  const q = filters.q.toLowerCase();
  const items = allItems
    .filter((item) => item.date >= filters.from && item.date <= filters.to)
    .filter((item) => !filters.highlightsOnly || item.isHighlight)
    .filter((item) => !filters.tag || item.tags.includes(filters.tag))
    .filter((item) => !filters.goal || item.goals.includes(filters.goal))
    .filter((item) => !q || item.text.toLowerCase().includes(q))
    // Stable sort keeps file order (creation order) inside a day.
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "entry" ? -1 : 1));

  const dayMap = new Map<string, ReviewDay>();
  for (const item of items) {
    const day = dayMap.get(item.date) ?? { date: item.date, entries: [], todos: [] };
    (item.kind === "entry" ? day.entries : day.todos).push(item);
    dayMap.set(item.date, day);
  }
  const days = [...dayMap.values()];
  if (filters.sort === "desc") days.reverse();
  const ordered = days.flatMap((day) => [...day.entries, ...day.todos]);

  const tagCounts = new Map<string, number>();
  for (const item of items) for (const tag of item.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

  const byGoal = goals
    .map((goal) => ({ goal, items: ordered.filter((item) => item.goals.includes(goal.slug)) }))
    .filter((group) => group.items.length > 0);

  return {
    filters,
    generatedAt,
    items: ordered,
    days,
    highlights: ordered.filter((item) => item.isHighlight),
    byGoal,
    stats: {
      entries: items.filter((item) => item.kind === "entry").length,
      todos: items.filter((item) => item.kind === "todo").length,
      highlights: items.filter((item) => item.isHighlight).length,
      activeDays: days.length,
      minutes: items.reduce((sum, item) => sum + (item.minutes ?? 0), 0),
      tags: [...tagCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    },
  };
}

export function filterSummary(filters: ReviewFilters, goals: Goal[]): string[] {
  const parts: string[] = [];
  if (filters.highlightsOnly) parts.push("highlights only");
  if (filters.tag) parts.push(`tag #${filters.tag}`);
  if (filters.goal) parts.push(`goal "${goals.find((g) => g.slug === filters.goal)?.title ?? filters.goal}"`);
  if (filters.q) parts.push(`text "${filters.q}"`);
  return parts;
}

/** File name (no extension) for downloads and PDFs; a filtered one must not pass for the whole period. */
export function reviewFileName(filters: ReviewFilters): string {
  const filtered = filters.tag || filters.goal || filters.q || filters.highlightsOnly ? "-filtered" : "";
  return `accomplishments-${filters.from}-to-${filters.to}${filtered}`;
}

type TitleOf = (slug: string) => string | undefined;

const titleLookup = (goals: Goal[]): TitleOf => (slug) => goals.find((g) => g.slug === slug)?.title;

function todoLine(item: ReviewItem, titleOf: TitleOf): string {
  const text = plainText(item.text, titleOf);
  return item.priority ? `[${item.priority}] ${text}` : text;
}

function itemLine(item: ReviewItem, titleOf: TitleOf): string {
  return item.kind === "todo" ? todoLine(item, titleOf) : plainText(item.text, titleOf);
}

/** Starred work is marked in every list, not only under Highlights. */
const star = (item: ReviewItem) => (item.isHighlight ? "★ " : "");

/** Keeps continuation text under its export bullet without adding spaces to blank lines. */
function reviewBullet(text: string): string {
  const [first, ...body] = text.split("\n");
  return [`- ${first}`, ...body.map((line) => line ? `  ${line}` : "")].join("\n");
}

export function reviewToMarkdown(review: Review, goals: Goal[]): string {
  const { filters, stats } = review;
  const titleOf = titleLookup(goals);
  const out: string[] = [`# Accomplishments: ${filters.from} to ${filters.to}`, "", "## Summary", ""];
  out.push(`- Journal entries: ${stats.entries}`);
  out.push(`- TODOs completed: ${stats.todos}`);
  out.push(`- Highlights: ${stats.highlights}`);
  out.push(`- Active logging days: ${stats.activeDays}`);
  if (stats.minutes > 0) out.push(`- Time logged: ${formatMinutes(stats.minutes)}`);
  if (stats.tags.length > 0) {
    out.push(`- Top tags: ${stats.tags.slice(0, 8).map((t) => `#${t.name} (${t.count})`).join(", ")}`);
  }
  const filterText = filterSummary(filters, goals);
  if (filterText.length > 0) out.push(`- Filters: ${filterText.join("; ")}`);

  if (review.items.length === 0) {
    out.push("", "_Nothing recorded in this range._");
    return `${out.join("\n")}\n`;
  }

  if (review.highlights.length > 0 && !filters.highlightsOnly) {
    out.push("", "## Highlights", "");
    for (const item of review.highlights) out.push(reviewBullet(`${item.date} — ${itemLine(item, titleOf)}`));
  }

  if (review.byGoal.length > 0) {
    out.push("", "## By goal");
    for (const group of review.byGoal) {
      out.push("", `### ${group.goal.title}`, "");
      for (const item of group.items) out.push(reviewBullet(`${item.date} — ${star(item)}${itemLine(item, titleOf)}`));
    }
  }

  out.push("", "## Daily Accomplishments");
  for (const day of review.days) {
    out.push("", `### ${day.date}`);
    if (day.entries.length > 0) {
      out.push("", "#### Journal", "");
      for (const item of day.entries) out.push(reviewBullet(`${star(item)}${plainText(item.text, titleOf)}`));
    }
    if (day.todos.length > 0) {
      out.push("", "#### Completed TODOs", "");
      for (const item of day.todos) out.push(`- ${star(item)}${todoLine(item, titleOf)}`);
    }
  }

  return `${out.join("\n")}\n`;
}

/**
 * The review Markdown above as minimal HTML (headings, lists, paragraphs), so
 * "Copy" pastes into Word or Google Docs as formatted text, not raw "##" and "-".
 * Only handles the Markdown this file writes.
 */
export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  const lines = markdown.split("\n");
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at];
    const heading = /^(#{1,4}) (.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
    } else if (line.startsWith("- ")) {
      const start = at;
      while (at + 1 < lines.length && (/^- |^[ \t]/.test(lines[at + 1]) || !lines[at + 1].trim())) at++;
      out.push(renderEntryMarkdown(lines.slice(start, at + 1).join("\n")));
    } else if (/^_.*_$/.test(line)) {
      out.push(`<p><em>${escapeHtml(line.slice(1, -1))}</em></p>`);
    } else if (line.trim()) {
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  return out.join("\n");
}

function itemJson(item: ReviewItem, goals: Goal[]) {
  return {
    type: item.kind === "entry" ? "journal" : "todo",
    id: item.id,
    date: item.date,
    text: plainText(item.text, titleLookup(goals)),
    tags: item.tags,
    goals: item.goals.map((slug) => ({ slug, title: goals.find((g) => g.slug === slug)?.title ?? slug })),
    highlight: item.isHighlight,
    minutes: item.minutes,
    priority: item.priority,
    status: item.status,
  };
}

export function reviewToJson(review: Review, goals: Goal[]) {
  const { filters } = review;
  return {
    range: { from: filters.from, to: filters.to },
    generatedAt: review.generatedAt,
    filters: {
      highlightsOnly: filters.highlightsOnly,
      sort: filters.sort,
      tag: filters.tag,
      goal: filters.goal,
      q: filters.q || null,
    },
    stats: {
      journalEntries: review.stats.entries,
      completedTodos: review.stats.todos,
      highlights: review.stats.highlights,
      activeDays: review.stats.activeDays,
      minutesLogged: review.stats.minutes,
    },
    tagCounts: review.stats.tags,
    goals: goals.map(({ slug, title, cycle, status }) => ({ slug, title, cycle, status })),
    items: review.items.map((item) => itemJson(item, goals)),
  };
}

/** One item per line; each line carries the range so it stands alone when chunked. */
export function reviewToJsonl(review: Review, goals: Goal[]): string {
  const range = { from: review.filters.from, to: review.filters.to };
  return review.items.map((item) => JSON.stringify({ ...itemJson(item, goals), range })).join("\n") + (review.items.length ? "\n" : "");
}
