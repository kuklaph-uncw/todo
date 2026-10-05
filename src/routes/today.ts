import { addDays, isValidDateString, startOfWeek } from "../lib/date";
import { renderToday } from "../views/today";
import { page, today, type AppContext } from "./shared";

/** GET / and /?date=YYYY-MM-DD */
export function handleToday(req: Request, ctx: AppContext): Response {
  const params = new URL(req.url).searchParams;
  const now = today(ctx);
  const requested = params.get("date") ?? "";
  const date = isValidDateString(requested) ? requested : now;

  const todos = ctx.vault.getTodos();
  const doneOn = (day: string) => todos.filter((t) => t.status === "Done" && t.completedOn === day);
  const weekStart = startOfWeek(date);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    const count = ctx.vault.getEntries(day).length + doneOn(day).length;
    return { date: day, count };
  });

  const main = renderToday({
    date,
    today: now,
    entries: ctx.vault.getEntries(date),
    closedTodos: doneOn(date),
    activeTodos: todos.filter((t) => t.status === "Open" || t.status === "In Progress" || t.status === "Blocked"),
    week,
    goals: ctx.vault.getGoals(),
    editId: params.get("edit"),
    error: params.get("error"),
    retry: params.has("error") ? params : null,
  });
  return page(ctx, date === now ? "Today" : date, "today", main);
}
