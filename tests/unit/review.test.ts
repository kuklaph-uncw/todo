import { describe, expect, it } from "bun:test";
import {
  buildReview,
  markdownToHtml,
  parseReviewFilters,
  reviewQuery,
  reviewToJson,
  reviewToJsonl,
  reviewToMarkdown,
  type ReviewFilters,
  type ReviewItem,
} from "../../src/review";
import type { Goal } from "../../src/vault/format";

function item(overrides: Partial<ReviewItem>): ReviewItem {
  return {
    kind: "entry", id: "i", date: "2026-09-01", text: "Did a thing", tags: [], goals: [],
    minutes: null, isHighlight: false, priority: null, status: null, ...overrides,
  };
}

const goals: Goal[] = [{ slug: "reliability", title: "Improve reliability", cycle: "2026", status: "active", body: "" }];

const filters: ReviewFilters = {
  from: "2026-09-01", to: "2026-09-30", preset: null, highlightsOnly: false, sort: "asc", tag: null, goal: null, q: "",
};

const items: ReviewItem[] = [
  item({ id: "a", date: "2026-09-02", text: "Reviewed [[reliability]] plan", tags: ["review"], goals: ["reliability"], minutes: 30 }),
  item({ id: "b", date: "2026-09-01", text: "Fixed flaky test", tags: ["bug", "review"], isHighlight: true, minutes: 60 }),
  item({ id: "c", kind: "todo", date: "2026-09-01", text: "Deploy hotfix", priority: "High", status: "Done" }),
  item({ id: "d", date: "2026-10-05", text: "Outside range" }),
];

describe("buildReview", () => {
  const review = buildReview(items, goals, filters, "2026-09-28T12:00:00.000Z");

  it("groups by date with entries before completed todos, and hides out-of-range items", () => {
    expect(review.days.map((d) => [d.date, d.entries.map((e) => e.id), d.todos.map((t) => t.id)])).toEqual([
      ["2026-09-01", ["b"], ["c"]],
      ["2026-09-02", ["a"], []],
    ]);
  });

  it("computes stats and tag counts from the same items", () => {
    expect(review.stats).toEqual({
      entries: 2, todos: 1, highlights: 1, activeDays: 2, minutes: 90,
      tags: [{ name: "review", count: 2 }, { name: "bug", count: 1 }],
    });
  });

  it("collects goal evidence", () => {
    expect(review.byGoal.map((g) => [g.goal.slug, g.items.map((i) => i.id)])).toEqual([["reliability", ["a"]]]);
  });

  it("filters to highlights, tag, goal and text", () => {
    const ids = (f: Partial<ReviewFilters>) => buildReview(items, goals, { ...filters, ...f }, "").items.map((i) => i.id);
    expect(ids({ highlightsOnly: true })).toEqual(["b"]);
    expect(ids({ tag: "bug" })).toEqual(["b"]);
    expect(ids({ goal: "reliability" })).toEqual(["a"]);
    expect(ids({ q: "HOTFIX" })).toEqual(["c"]);
  });

  it("orders days newest first on request", () => {
    expect(buildReview(items, goals, { ...filters, sort: "desc" }, "").days.map((d) => d.date)).toEqual(["2026-09-02", "2026-09-01"]);
  });
});

describe("exports", () => {
  const review = buildReview(items, goals, filters, "2026-09-28T12:00:00.000Z");

  it("writes review-ready Markdown", () => {
    expect(reviewToMarkdown(review, goals)).toBe(
      [
        "# Accomplishments: 2026-09-01 to 2026-09-30",
        "",
        "## Summary",
        "",
        "- Journal entries: 2",
        "- TODOs completed: 1",
        "- Highlights: 1",
        "- Active logging days: 2",
        "- Time logged: 1h 30m",
        "- Top tags: #review (2), #bug (1)",
        "",
        "## Highlights",
        "",
        "- 2026-09-01 — Fixed flaky test",
        "",
        "## By goal",
        "",
        "### Improve reliability",
        "",
        "- 2026-09-02 — Reviewed Improve reliability plan",
        "",
        "## Daily Accomplishments",
        "",
        "### 2026-09-01",
        "",
        "#### Journal",
        "",
        "- ★ Fixed flaky test",
        "",
        "#### Completed TODOs",
        "",
        "- [High] Deploy hotfix",
        "",
        "### 2026-09-02",
        "",
        "#### Journal",
        "",
        "- Reviewed Improve reliability plan",
        "",
      ].join("\n"),
    );
  });

  it("converts its own Markdown to minimal HTML for pasting into documents", () => {
    expect(markdownToHtml("# Title\n\n- one & two\n- <three>\n\n_Nothing recorded._\n\nPlain line")).toBe(
      [
        "<h1>Title</h1>",
        "<ul>",
        "<li>one &amp; two</li>",
        "<li>&lt;three&gt;</li>",
        "</ul>",
        "<p><em>Nothing recorded.</em></p>",
        "<p>Plain line</p>",
      ].join("\n"),
    );
  });

  it("says so when the range is empty", () => {
    const empty = buildReview([], goals, filters, "");
    expect(reviewToMarkdown(empty, goals)).toContain("_Nothing recorded in this range._");
    expect(reviewToJsonl(empty, goals)).toBe("");
  });

  it("JSON carries range, stats, goals and items with resolved goal titles", () => {
    const json = reviewToJson(review, goals);
    expect(json.range).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(json.stats).toEqual({ journalEntries: 2, completedTodos: 1, highlights: 1, activeDays: 2, minutesLogged: 90 });
    expect(json.items[2]).toMatchObject({ type: "journal", id: "a", goals: [{ slug: "reliability", title: "Improve reliability" }] });
  });

  it("JSONL writes one self-contained item per line", () => {
    const lines = reviewToJsonl(review, goals).trimEnd().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatchObject({ type: "todo", priority: "High", range: { from: "2026-09-01", to: "2026-09-30" } });
  });
});

describe("parseReviewFilters", () => {
  const params = (q: string) => parseReviewFilters(new URLSearchParams(q), "2026-09-28");

  it("defaults to the last 12 months", () => {
    expect(params("")).toMatchObject({ preset: "year", from: "2025-09-29", to: "2026-09-28" });
  });

  it("keeps a preset highlighted when a filter change submits its dates", () => {
    expect(params("from=2026-07-01&to=2026-09-28&tag=ops")).toMatchObject({ preset: "quarter", tag: "ops" });
  });

  it("accepts a custom range and swaps it if reversed", () => {
    expect(params("from=2026-03-31&to=2026-01-01")).toMatchObject({ preset: null, from: "2026-01-01", to: "2026-03-31" });
  });

  it("reads toggles and normalizes the tag", () => {
    expect(params("preset=ytd&highlights=1&sort=desc&tag=%23Review")).toMatchObject({
      from: "2026-01-01", highlightsOnly: true, sort: "desc", tag: "review",
    });
  });

  it("reviewQuery round-trips filters", () => {
    const f = params("from=2026-01-01&to=2026-03-31&highlights=1&goal=reliability");
    expect(parseReviewFilters(new URLSearchParams(reviewQuery(f)), "2026-09-28")).toEqual(f);
  });
});
