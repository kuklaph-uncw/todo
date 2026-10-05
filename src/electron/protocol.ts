/**
 * How the desktop window gets its pages: Electron hands each app:// request to
 * this function instead of a network server, so nothing listens on a port.
 * No `electron` import here, so `bun test` can load it.
 */
import type { AppContext } from "../routes/shared";
import { handleRequest } from "../server";

/** The app's own address. The window only ever shows pages from here. */
export const APP_ORIGIN = "app://local";

/** Node treats app: as an unknown scheme (its URL.origin is "null"), so compare the parts instead. */
export function isAppUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "app:" && url.host === "local";
  } catch {
    return false;
  }
}

/** Pages may only use the app's own scripts, styles and images, and only post back to the app. */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";

async function allowedResponse(req: Request, initiatorOrigin: string | undefined, ctx: AppContext): Promise<Response> {
  if (!isAppUrl(req.url)) return new Response("Not found", { status: 404 });
  const viewing = req.method === "GET" || req.method === "HEAD";
  if (viewing || initiatorOrigin === APP_ORIGIN) return handleRequest(req, ctx);
  return new Response("Forbidden", { status: 403 });
}

/**
 * Viewing pages is open; changes must come from the app's own pages. Electron
 * sets `initiatorOrigin` itself, so a page can't fake it.
 */
export async function serveAppRequest(req: Request, initiatorOrigin: string | undefined, ctx: AppContext): Promise<Response> {
  const res = await allowedResponse(req, initiatorOrigin, ctx);
  const headers = new Headers(res.headers);
  headers.set("content-security-policy", CSP);
  // Exports and error pages contain user text; never let them run as a script or style.
  headers.set("x-content-type-options", "nosniff");
  return new Response(res.body, { status: res.status, headers });
}
