import { cleanCycle, isValidGoalKind, isValidGoalStatus, slugify } from "../lib/validation";
import { collectItems } from "../review";
import type { Goal } from "../vault/format";
import { contentRevision } from "../vault/revision";
import { readGoalsView, saveGoalsView, type GoalsView } from "../preferences";
import { goalStats, goalsUrl, renderGoal, renderGoals, type GoalStats, type LinkChange } from "../views/goals";
import { notFound, page, readForm, redirect, redirectWithError, today, type AppContext } from "./shared";

const ALL_TIME = { from: "0000-01-01", to: "9999-12-31" };

function byDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

/** A view named in the URL is remembered, so /goals opens the same way next time. */
function goalsView(ctx: AppContext, requested: string | null): GoalsView {
  const remembered = readGoalsView(ctx.preferencesPath);
  if (requested !== "reader" && requested !== "timeline") return remembered;
  try {
    if (requested !== remembered) saveGoalsView(ctx.preferencesPath, requested);
  } catch (error) {
    // Remembering is a convenience; a locked file must not stop the page.
    console.error(error);
  }
  return requested;
}

/** The year after a year-like cycle, if that cycle has no goals yet and this one has some. */
function nextCycle(cycle: string, goals: Goal[]): string | null {
  if (!/^\d{4}$/.test(cycle)) return null;
  const next = String(Number(cycle) + 1);
  const ready = goals.some((goal) => goal.cycle === cycle && goal.status !== "dropped");
  return ready && !goals.some((goal) => goal.cycle === next) ? next : null;
}

/** "3,1" after a link change (entries and todos rewritten), or "3,1,2,old" when 2 were left on `old`. */
function renamedCounts(raw: string | null): LinkChange | null {
  const match = /^(\d+),(\d+)(?:,(\d+),(.+))?$/.exec(raw ?? "");
  if (!match) return null;
  const failed = { left: Number(match[3] ?? 0), old: match[4] ?? "" };
  return { entries: Number(match[1]), todos: Number(match[2]), ...failed };
}

/** GET /goals?view=&cycle=&edit=&open=&add=&from=&renamed= */
export function handleGoals(req: Request, ctx: AppContext): Response {
  const params = new URL(req.url).searchParams;
  const view = goalsView(ctx, params.get("view"));
  const currentYear = today(ctx).slice(0, 4);
  const all = ctx.vault.getGoals();
  // Goals written by hand without a cycle get their own "No cycle" entry, so they can still be edited.
  const cycles = [...new Set([currentYear, ...all.map((g) => g.cycle)])].sort().reverse();
  const cycle = params.get("cycle") ?? currentYear;
  const goals = all.filter((goal) => goal.cycle === cycle);

  const from = params.get("from");
  const carryGoals = all.filter((goal) => goal.cycle === from && goal.status !== "dropped");
  const carry = from && goals.length === 0 && carryGoals.length > 0 ? { from, goals: carryGoals } : null;

  const items = collectItems(ctx.vault, ALL_TIME.from, ALL_TIME.to);
  const stats = new Map<string, GoalStats>(
    [...goals, ...carryGoals].map((goal) => [goal.slug, goalStats(items, goal.slug)]),
  );
  const add = params.get("add") ?? "";

  const main = renderGoals({
    view,
    cycle,
    cycles: cycles.includes(cycle) ? cycles : [cycle, ...cycles],
    goals,
    stats,
    items,
    today: today(ctx),
    edit: params.get("edit"),
    open: params.get("open"),
    add: isValidGoalKind(add) ? add : null,
    nextCycle: carry ? null : nextCycle(cycle, all),
    carry,
    error: params.get("error"),
    renamed: renamedCounts(params.get("renamed")),
    retry: params.has("error") ? params : new URLSearchParams(),
  });
  return page(ctx, "Goals", "goals", main);
}

/** GET /goals/:slug */
export function handleGoal(req: Request, ctx: AppContext, slug: string): Response {
  const params = new URL(req.url).searchParams;
  const goal = ctx.vault.getGoal(slug);
  if (!goal) return notFound(ctx, "That goal");
  // Goals are edited in place on the sheet now; keep old edit links working.
  if (params.get("edit") === "1") return redirect(goalsUrl("reader", goal.cycle, { edit: slug }, `goal-${slug}`));

  const items = byDate(collectItems(ctx.vault, ALL_TIME.from, ALL_TIME.to).filter((item) => item.goals.includes(slug)));
  const openTodos = ctx.vault.getTodos().filter((todo) => todo.goals.includes(slug) && todo.status === "Open").length;
  const main = renderGoal({
    goal,
    goals: ctx.vault.getGoals(),
    items,
    openTodos,
    today: today(ctx),
    error: params.get("error"),
  });
  return page(ctx, goal.title, "goals", main);
}

function viewField(value: string): GoalsView {
  return value === "timeline" ? "timeline" : "reader";
}

/** POST /goals */
export async function createGoal(req: Request, ctx: AppContext): Promise<Response> {
  const form = await readForm(req);
  const title = form.text("title").trim();
  const cycle = cleanCycle(form.text("cycle")) || today(ctx).slice(0, 4);
  const rawKind = form.text("kind");
  const kind = isValidGoalKind(rawKind) ? rawKind : "goal";
  const view = viewField(form.text("view"));
  const text = {
    description: form.text("description"),
    meeting: kind === "goal" ? form.text("meeting") : "",
    exceeding: kind === "goal" ? form.text("exceeding") : "",
    notes: form.text("notes"),
  };
  // Send the text back too, so a long description isn't lost.
  if (!title)
    return redirectWithError(
      goalsUrl(view, cycle, { add: kind }, "add-goal"),
      kind === "goal" ? "A goal needs a name." : "An activity needs a name.",
      Object.entries(text),
    );
  const goal = ctx.vault.createGoal({
    title,
    cycle,
    kind,
    status: form.text("status") === "agreed" ? "agreed" : "draft",
    ...text,
  });
  return redirect(goalsUrl(view, goal.cycle, {}, `goal-${goal.slug}`));
}

/** POST /goals/:slug */
export async function saveGoal(req: Request, ctx: AppContext, slug: string): Promise<Response> {
  const form = await readForm(req);
  const existing = ctx.vault.getGoal(slug);
  if (!existing) return notFound(ctx, "That goal");
  const back = form.returnTo(`/goals?cycle=${encodeURIComponent(existing.cycle)}#goal-${slug}`);
  const status = form.text("status");
  if (!isValidGoalStatus(status)) return redirectWithError(back, "Pick Draft, Agreed or Dropped.");

  // A blank link keeps the current one, like a blank name. Any other change
  // is checked before saving anything, so a refused link loses no typing.
  const view = viewField(form.text("view"));
  // The field shows the slug as it is, which slugify might respell (long, uppercase or
  // accented hand-written slugs), so an unchanged value is never slugified.
  const typed = form.text("link").trim();
  const link = !typed || typed === slug ? slug : slugify(typed);
  const backToForm = (message: string) =>
    redirectWithError(
      goalsUrl(view, existing.cycle, { edit: slug }, `goal-${slug}`),
      message,
      ["title", "status", "description", "meeting", "exceeding", "notes", "link"].map((name) => [
        name,
        form.text(name),
      ]),
      // An emptied field stays empty on the way back; the form fills in only fields not sent at all.
      true,
    );
  // The form carries the revision it was opened with, so a change made meanwhile (say, by
  // an agent) isn't silently undone. Older posts without one are still accepted.
  const expected = form.text("expected_revision");
  if (expected && expected !== contentRevision(existing))
    return backToForm(
      "This goal changed somewhere else while you were editing, perhaps by an agent. Your text is kept below: save to replace that change, or cancel to see it.",
    );
  const problem = ctx.vault.goalLinkProblem(slug, link);
  if (problem) return backToForm(problem);

  // A blank name keeps the current one rather than bouncing the form back
  // and risking long text. Activities have no expectation fields to send.
  const activity = existing.kind === "activity";
  ctx.vault.saveGoal(
    slug,
    {
      title: form.text("title").trim() || existing.title,
      status,
      description: form.text("description"),
      meeting: activity ? existing.meeting : form.text("meeting"),
      exceeding: activity ? existing.exceeding : form.text("exceeding"),
      notes: form.text("notes"),
    },
    today(ctx),
  );
  if (link === slug) return redirect(back);

  let renamed: ReturnType<typeof ctx.vault.renameGoal>;
  try {
    renamed = ctx.vault.renameGoal(slug, link);
  } catch (error) {
    // Usually the goal's file is open in another app. The text above is saved.
    console.error(error);
    return backToForm(
      `Your changes were saved under [[${slug}]], but the link couldn't be changed. Another app may have the goal's file open. Close it and try again.`,
    );
  }
  if (!renamed) return notFound(ctx, "That goal");

  // The old anchor is gone, so return to the goal under its new link.
  const extra: Record<string, string> = view === "timeline" ? { open: link } : {};
  const failed = renamed.failed ? `,${renamed.failed},${slug}` : "";
  extra.renamed = `${renamed.entries},${renamed.todos}${failed}`;
  return redirect(goalsUrl(view, existing.cycle, extra, `goal-${link}`));
}

// Also what a double-click gets, so it doesn't blame anyone in particular.
const CHANGED_ELSEWHERE = "This goal changed after this page loaded. Check it and try again.";

/**
 * True when a quick action's form came from a page showing an older version of
 * the goal. Posts without a revision (older pages) are still accepted.
 */
function isStale(form: Awaited<ReturnType<typeof readForm>>, goal: Goal): boolean {
  const expected = form.text("expected_revision");
  return Boolean(expected) && expected !== contentRevision(goal);
}

/** POST /goals/:slug/status, e.g. "Mark agreed" on a draft. */
export async function setGoalStatus(req: Request, ctx: AppContext, slug: string): Promise<Response> {
  const form = await readForm(req);
  const existing = ctx.vault.getGoal(slug);
  if (!existing) return notFound(ctx, "That goal");
  const back = form.returnTo(`/goals?cycle=${encodeURIComponent(existing.cycle)}#goal-${slug}`);
  if (isStale(form, existing)) return redirectWithError(back, CHANGED_ELSEWHERE);
  const status = form.text("status");
  if (!isValidGoalStatus(status)) return redirectWithError(back, "Pick Draft, Agreed or Dropped.");
  ctx.vault.saveGoal(slug, { ...existing, status }, today(ctx));
  return redirect(back);
}

/** POST /goals/:slug/move: one place up or down. At an end it just returns. */
export async function moveGoal(req: Request, ctx: AppContext, slug: string): Promise<Response> {
  const form = await readForm(req);
  const existing = ctx.vault.getGoal(slug);
  if (!existing) return notFound(ctx, "That goal");
  const back = form.returnTo(`/goals?cycle=${encodeURIComponent(existing.cycle)}#goal-${slug}`);
  // Only the moved goal is checked: it's the one the user sees. A move only
  // renumbers its cycle's goals, read fresh, so no text or status is lost.
  if (isStale(form, existing)) return redirectWithError(back, CHANGED_ELSEWHERE);
  const direction = form.text("direction");
  if (direction !== "up" && direction !== "down") return redirectWithError(back, "Move a goal up or down.");
  ctx.vault.moveGoal(slug, direction);
  return redirect(back);
}

/**
 * POST /goals/carry: copies the picked goals of one cycle into the next as
 * drafts, in the same order. Copies get their own links, so earlier evidence
 * stays with the original goal.
 */
export async function carryGoals(req: Request, ctx: AppContext): Promise<Response> {
  const form = await readForm(req);
  const from = form.text("from");
  // Cleaned as createGoal stores it, so the double-post check and the redirect see the same cycle.
  const cycle = cleanCycle(form.text("cycle"));
  const view = viewField(form.text("view"));
  const picked = new Set(form.all("goal"));
  const all = ctx.vault.getGoals();
  // Posting twice (or going back and posting again) must not copy twice.
  if (cycle && !all.some((goal) => goal.cycle === cycle)) {
    for (const goal of all.filter((g) => g.cycle === from && g.status !== "dropped" && picked.has(g.slug))) {
      ctx.vault.createGoal({
        title: goal.title,
        cycle,
        kind: goal.kind,
        description: goal.description,
        meeting: goal.meeting,
        exceeding: goal.exceeding,
        notes: form.text("notes") ? goal.notes : "",
      });
    }
  }
  return redirect(goalsUrl(view, cycle || from));
}
