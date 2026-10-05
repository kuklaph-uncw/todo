import { isValidGoalStatus } from "../lib/validation";
import { collectItems } from "../review";
import { goalStats, renderGoal, renderGoals, type GoalStats } from "../views/goals";
import { notFound, page, readForm, redirect, redirectWithError, today, type AppContext } from "./shared";

const ALL_TIME = { from: "0000-01-01", to: "9999-12-31" };

function byDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

/** GET /goals?cycle= */
export function handleGoals(req: Request, ctx: AppContext): Response {
  const params = new URL(req.url).searchParams;
  const currentYear = today(ctx).slice(0, 4);
  const goals = ctx.vault.getGoals();
  const cycles = [...new Set([currentYear, ...goals.map((g) => g.cycle).filter(Boolean)])].sort().reverse();
  const cycle = params.get("cycle") || currentYear;

  const items = collectItems(ctx.vault, ALL_TIME.from, ALL_TIME.to);
  const stats = new Map<string, GoalStats>(goals.map((goal) => [goal.slug, goalStats(items, goal.slug)]));

  const main = renderGoals({
    cycle,
    cycles: cycles.includes(cycle) ? cycles : [cycle, ...cycles],
    goals,
    stats,
    error: params.get("error"),
  });
  return page(ctx, "Goals", "goals", main);
}

/** GET /goals/:slug */
export function handleGoal(req: Request, ctx: AppContext, slug: string): Response {
  const params = new URL(req.url).searchParams;
  const goal = ctx.vault.getGoal(slug);
  if (!goal) return notFound(ctx, "That goal");

  const items = byDate(collectItems(ctx.vault, ALL_TIME.from, ALL_TIME.to).filter((item) => item.goals.includes(slug)));
  const openTodos = ctx.vault
    .getTodos()
    .filter((todo) => todo.goals.includes(slug) && todo.status !== "Done" && todo.status !== "Cancelled").length;
  const main = renderGoal({
    goal,
    goals: ctx.vault.getGoals(),
    items,
    openTodos,
    editing: params.get("edit") === "1",
    error: params.get("error"),
  });
  return page(ctx, goal.title, "goals", main);
}

/** POST /goals */
export async function createGoal(req: Request, ctx: AppContext): Promise<Response> {
  const form = await readForm(req);
  const title = form.text("title").trim();
  const cycle = form.text("cycle").trim() || today(ctx).slice(0, 4);
  if (!title) return redirectWithError(`/goals?cycle=${encodeURIComponent(cycle)}`, "A goal needs a name.");
  const goal = ctx.vault.createGoal({ title, cycle, body: form.text("body") });
  return redirect(`/goals/${goal.slug}`);
}

/** POST /goals/:slug */
export async function saveGoal(req: Request, ctx: AppContext, slug: string): Promise<Response> {
  const form = await readForm(req);
  const existing = ctx.vault.getGoal(slug);
  if (!existing) return notFound(ctx, "That goal");
  const status = form.text("status");
  if (!isValidGoalStatus(status)) return redirectWithError(`/goals/${slug}?edit=1`, "Pick Active, Achieved or Dropped.");

  // A blank name or cycle keeps the current one rather than bouncing the
  // form back and risking a long self-assessment.
  ctx.vault.saveGoal(slug, {
    title: form.text("title").trim() || existing.title,
    cycle: form.text("cycle").trim() || existing.cycle,
    status,
    body: form.text("body"),
  });
  return redirect(`/goals/${slug}`);
}
