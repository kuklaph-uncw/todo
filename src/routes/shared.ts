import { localDateString } from "../lib/date";
import { safeReturnPath } from "../lib/validation";
import type { Vault } from "../vault/vault";
import type { AgentAccess } from "../mcp/access";
import type { Updates } from "../electron/updates";
import { contentRevision } from "../vault/revision";
import { renderLayout, type NavKey } from "../views/layout";

export interface AppContext {
  vault: Vault;
  /** Shown in Settings so the user can find and back up their notes. */
  vaultPath: string;
  /** Injectable clock so tests can pin "today". */
  clock: () => Date;
  agentAccess?: AgentAccess;
  /** Only the installed desktop app can update itself. */
  updates?: Pick<Updates, "snapshot" | "check" | "restart">;
}

export function today(ctx: AppContext): string {
  return localDateString(ctx.clock());
}

export function page(ctx: AppContext, title: string, active: NavKey | null, main: string, status = 200): Response {
  const openTodos = ctx.vault.getTodos().filter((t) => t.status === "Open").length;
  const html = renderLayout({
    title,
    active,
    main,
    openTodos,
    agentAccess: ctx.agentAccess?.snapshot().running,
    updates: ctx.updates?.snapshot() ?? { status: "unavailable" },
    todoVersion: contentRevision(ctx.vault.peekTodos()),
  });
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export function notFound(ctx: AppContext, what = "That page"): Response {
  return page(
    ctx,
    "Not found",
    null,
    `<div class="page"><header class="page-head"><div><h1>Not found</h1><p class="page-sub">${what} doesn't exist. It may have been deleted or edited outside the app.</p></div></header><p><a class="btn" href="/">Back to today</a></p></div>`,
    404,
  );
}

/** 303 so the browser follows with GET (post/redirect/get). */
export function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

/**
 * Redirects back to the form's page with an error message the page will show.
 * `keep` carries what the user typed so the page can put it back.
 */
export function redirectWithError(returnTo: string, message: string, keep: [string, string][] = []): Response {
  const url = new URL(returnTo, "http://local");
  url.searchParams.set("error", message);
  for (const [name, value] of keep) if (value) url.searchParams.append(name, value);
  return redirect(`${url.pathname}${url.search}${url.hash}`);
}

export async function readForm(req: Request) {
  const form = await req.formData();
  const text = (name: string): string => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    text,
    returnTo: (fallback: string) => safeReturnPath(text("return_to"), fallback),
  };
}
