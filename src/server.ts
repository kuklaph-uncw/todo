import type { AppContext } from "./routes/shared";
import { notFound } from "./routes/shared";
import { handleToday } from "./routes/today";
import { changeEntry, createEntries } from "./routes/journal";
import { changeSubtask, changeTodo, createTodo, handleTodos } from "./routes/todos";
import { createGoal, handleGoal, handleGoals, saveGoal } from "./routes/goals";
import { handleExport, handleReview } from "./routes/review";
import { handleSettings, saveSettings } from "./routes/settings";
import { checkForUpdates, restartToUpdate, updateStatus } from "./routes/updates";
import { vaultRevision } from "./vault/revision";
import styles from "../public/styles.css" with { type: "text" };
import script from "../public/app.js" with { type: "text" };
import { richTextSource } from "./rich-text-source" with { type: "macro" };
import iconSvg from "../public/icon.svg" with { type: "text" };

/**
 * Bundled into the app as text, so nothing is read from disk at runtime.
 * Exact-match paths only, so a request can't reach any other file.
 */
const ASSETS: Record<string, { body: string; type: string }> = {
  "/styles.css": { body: styles, type: "text/css; charset=utf-8" },
  "/app.js": { body: script, type: "text/javascript; charset=utf-8" },
  "/rich-text.js": { body: richTextSource(), type: "text/javascript; charset=utf-8" },
  "/icon.svg": { body: iconSvg, type: "image/svg+xml" },
};

function serveAsset(pathname: string): Response | null {
  const asset = ASSETS[pathname];
  if (!asset) return null;
  return new Response(asset.body, { headers: { "content-type": asset.type, "cache-control": "no-cache" } });
}

async function route(req: Request, ctx: AppContext): Promise<Response> {
  const { pathname } = new URL(req.url);
  let parts: string[];
  try {
    parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    // A malformed %-escape can't name any page.
    return notFound(ctx);
  }

  if (req.method === "GET" || req.method === "HEAD") {
    if (pathname === "/settings") return handleSettings(req, ctx);
    if (pathname === "/updates") return updateStatus(ctx);
    if (pathname === "/todo-version")
      return Response.json({ revision: vaultRevision(ctx.vault) }, { headers: { "cache-control": "no-store" } });
    if (pathname === "/") return handleToday(req, ctx);
    if (pathname === "/todos") return handleTodos(req, ctx);
    if (pathname === "/goals") return handleGoals(req, ctx);
    if (parts[0] === "goals" && parts.length === 2) return handleGoal(req, ctx, parts[1]);
    if (pathname === "/review") return handleReview(req, ctx);
    const exportMatch = /^\/review\/export\.(md|json|jsonl)$/.exec(pathname);
    if (exportMatch) return handleExport(req, ctx, exportMatch[1]);
    return serveAsset(pathname) ?? notFound(ctx);
  }

  if (req.method === "POST") {
    if (pathname === "/settings") return saveSettings(req, ctx);
    if (pathname === "/updates/check") return checkForUpdates(ctx);
    if (pathname === "/updates/restart") return restartToUpdate(ctx);
    if (pathname === "/journal") return createEntries(req, ctx);
    if (parts[0] === "journal" && (parts.length === 2 || parts.length === 3))
      return changeEntry(req, ctx, parts[1], parts[2]);
    if (pathname === "/todos") return createTodo(req, ctx);
    if (parts[0] === "todos" && (parts.length === 2 || parts.length === 3))
      return changeTodo(req, ctx, parts[1], parts[2]);
    if (parts[0] === "subtasks" && (parts.length === 2 || parts.length === 3))
      return changeSubtask(req, ctx, parts[1], parts[2]);
    if (pathname === "/goals") return createGoal(req, ctx);
    if (parts[0] === "goals" && parts.length === 2) return saveGoal(req, ctx, parts[1]);
  }

  return notFound(ctx);
}

/**
 * Turns a request into a page. Shared by the desktop app (src/electron/main.ts)
 * and the development server (src/dev-server.ts), which each check where the
 * request came from first. Tests call it directly with their own vault.
 */
export async function handleRequest(req: Request, ctx: AppContext): Promise<Response> {
  try {
    return await route(req, ctx);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      `Something went wrong while handling that request.\n\n${message}\n\nThe full details were logged.`,
      {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }
}
