import type { AppContext } from "./shared";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** The update state for the rail and Settings. Only the installed app has an updater. */
export function updateStatus(ctx: AppContext): Response {
  return json(ctx.updates?.snapshot() ?? { status: "unavailable" });
}

/** Starts a check now; the page polls for the result. */
export function checkForUpdates(ctx: AppContext): Response {
  if (!ctx.updates) return json({ status: "unavailable" }, 404);
  void ctx.updates.check();
  return json(ctx.updates.snapshot());
}

/** Restarts into a downloaded update. The page asks the user first. */
export function restartToUpdate(ctx: AppContext): Response {
  if (!ctx.updates) return json({ status: "unavailable" }, 404);
  const started = ctx.updates.restart();
  return json(ctx.updates.snapshot(), started ? 202 : 409);
}
