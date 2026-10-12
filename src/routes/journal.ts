import { isValidDateString, localTimeString } from "../lib/date";
import { parseMinutes } from "../lib/validation";
import { parseTaskInput } from "../vault/vault";
import { notFound, readForm, redirect, redirectWithError, today, type AppContext } from "./shared";

const TIME_HELP = "Time spent should look like 45m, 1h, 1h 30m or 90 minutes.";

/**
 * Quick capture: every non-blank line becomes its own entry. Pasted list
 * markers ("- ", "* ", "• ", "[x] ") are dropped so they don't end up in the text.
 */
export function splitEntryLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]\s+)?(?:\[.\]\s+)?/, "").trim())
    .filter((line) => line.length > 0);
}

/** POST /journal */
export async function createEntries(req: Request, ctx: AppContext): Promise<Response> {
  const form = await readForm(req);
  // No date means "the current day" (see the capture form on Today).
  const date = form.text("date") || today(ctx);
  const back = form.returnTo(`/?date=${date}`);
  if (!isValidDateString(date)) return redirectWithError("/", "That date isn't valid.");

  // Put the extra fields back if something's wrong; the text itself survives as a draft.
  const keep: [string, string][] = [
    ["minutes", form.text("minutes")],
    ["star", form.text("star")],
  ];
  const lines = splitEntryLines(form.text("content"));
  if (lines.length === 0) return redirectWithError(back, "Write something before adding it to the ledger.", keep);
  const minutes = parseMinutes(form.text("minutes"));
  if (minutes === undefined) return redirectWithError(back, TIME_HELP, keep);

  ctx.vault.addEntries(date, lines, {
    tags: [],
    goals: [],
    minutes,
    isHighlight: form.text("star") === "1",
    // A clock time only means something when you're logging as it happens.
    time: date === today(ctx) ? localTimeString(ctx.clock()) : null,
  });
  return redirect(back);
}

/** POST /journal/:id, /journal/:id/star, /journal/:id/delete */
export async function changeEntry(req: Request, ctx: AppContext, id: string, action: string | undefined): Promise<Response> {
  const form = await readForm(req);
  const date = form.text("date");
  const back = form.returnTo(`/?date=${date}`);
  if (!isValidDateString(date)) return notFound(ctx, "That entry");

  if (action === "delete") {
    return ctx.vault.deleteEntry(date, id) ? redirect(back) : notFound(ctx, "That entry");
  }

  if (action === "star") {
    const updated = ctx.vault.updateEntry(date, id, (entry) => ({ ...entry, isHighlight: !entry.isHighlight }));
    return updated ? redirect(back) : notFound(ctx, "That entry");
  }

  if (action !== undefined) return notFound(ctx);

  const editUrl = `/?date=${date}&edit=${id}#entry-${id}`;
  const keep: [string, string][] = [
    ["content", form.text("content")],
    ["minutes", form.text("minutes")],
  ];
  const input = parseTaskInput(form.text("content"));
  if (!input.task) return redirectWithError(editUrl, "An entry can't be empty. Delete it instead.", keep);
  const minutes = parseMinutes(form.text("minutes"));
  if (minutes === undefined) return redirectWithError(editUrl, TIME_HELP, keep);

  const updated = ctx.vault.updateEntry(date, id, (entry) => ({
    ...entry,
    text: input.task,
    tags: input.tags,
    goals: input.goals,
    minutes,
  }));
  return updated ? redirect(back) : notFound(ctx, "That entry");
}
