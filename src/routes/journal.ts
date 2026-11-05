import { isValidDateString, localTimeString } from "../lib/date";
import { parseMinutes } from "../lib/validation";
import { parseEntryInput } from "../vault/vault";
import { notFound, readForm, redirect, redirectWithError, today, type AppContext } from "./shared";

const TIME_HELP = "Time spent should look like 45m, 1h, 1h 30m or 90 minutes.";

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
  const content = form.text("content");
  if (!parseEntryInput(content).text)
    return redirectWithError(back, "Write something before adding it to the ledger.", keep);
  const minutes = parseMinutes(form.text("minutes"));
  if (minutes === undefined) return redirectWithError(back, TIME_HELP, keep);

  ctx.vault.addEntries(date, [content], {
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
export async function changeEntry(
  req: Request,
  ctx: AppContext,
  id: string,
  action: string | undefined,
): Promise<Response> {
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
  const input = parseEntryInput(form.text("content"));
  if (!input.text) return redirectWithError(editUrl, "An entry can't be empty. Delete it instead.", keep);
  const minutes = parseMinutes(form.text("minutes"));
  if (minutes === undefined) return redirectWithError(editUrl, TIME_HELP, keep);

  const updated = ctx.vault.updateEntry(date, id, (entry) => ({
    ...entry,
    text: input.text,
    tags: input.tags,
    goals: input.goals,
    minutes,
  }));
  return updated ? redirect(back) : notFound(ctx, "That entry");
}
