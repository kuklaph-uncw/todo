import { homedir } from "node:os";
import { Vault } from "./vault/vault";
import { join } from "node:path";
import { DEFAULT_PORT, HEALTH_BODY, logErrorsTo, openApp, resolveVaultPath, showErrorBox, startOrFind } from "./launch";
import type { AppContext } from "./routes/shared";
import { notFound } from "./routes/shared";
import { handleToday } from "./routes/today";
import { changeEntry, createEntries } from "./routes/journal";
import { changeTodo, createTodo, handleTodos } from "./routes/todos";
import { createGoal, handleGoal, handleGoals, saveGoal } from "./routes/goals";
import { handleExport, handleReview } from "./routes/review";
import { dismissWelcome, handleWelcome, quitApp } from "./routes/welcome";
import stylesPath from "../public/styles.css" with { type: "file" };
import scriptPath from "../public/app.js" with { type: "file" };
import iconSvgPath from "../public/icon.svg" with { type: "file" };
import iconIcoPath from "../public/favicon.ico" with { type: "file" };
import manifestPath from "../public/manifest.webmanifest" with { type: "file" };
import icon16 from "../public/icons/icon-16.png" with { type: "file" };
import icon32 from "../public/icons/icon-32.png" with { type: "file" };
import icon48 from "../public/icons/icon-48.png" with { type: "file" };
import icon64 from "../public/icons/icon-64.png" with { type: "file" };
import icon192 from "../public/icons/icon-192.png" with { type: "file" };
import icon512 from "../public/icons/icon-512.png" with { type: "file" };

/** `bun build --compile` embeds these in the executable; from source they're plain files. */
const ASSETS: Record<string, { path: string; type: string }> = {
  "/styles.css": { path: stylesPath, type: "text/css; charset=utf-8" },
  "/app.js": { path: scriptPath, type: "text/javascript; charset=utf-8" },
  "/icon.svg": { path: iconSvgPath, type: "image/svg+xml" },
  "/favicon.ico": { path: iconIcoPath, type: "image/x-icon" },
  // Lets Edge install the app with exact-size icons (a crisp taskbar icon).
  "/manifest.webmanifest": { path: manifestPath, type: "application/manifest+json" },
  "/icons/icon-16.png": { path: icon16, type: "image/png" },
  "/icons/icon-32.png": { path: icon32, type: "image/png" },
  "/icons/icon-48.png": { path: icon48, type: "image/png" },
  "/icons/icon-64.png": { path: icon64, type: "image/png" },
  "/icons/icon-192.png": { path: icon192, type: "image/png" },
  "/icons/icon-512.png": { path: icon512, type: "image/png" },
};

function serveAsset(pathname: string): Response | null {
  const asset = ASSETS[pathname];
  if (!asset) return null;
  return new Response(Bun.file(asset.path), { headers: { "content-type": asset.type, "cache-control": "no-cache" } });
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * The app has no login, so it only answers to local hostnames (blocks DNS
 * rebinding) and refuses cross-site form posts (blocks CSRF from other tabs).
 */
export function isAllowedRequest(req: Request): boolean {
  const host = req.headers.get("host") ?? new URL(req.url).host;
  if (!LOCAL_HOST.test(host)) return false;
  if (req.method !== "POST") return true;
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;
  return new URL(origin).host === host;
}

async function route(req: Request, ctx: AppContext): Promise<Response> {
  const { pathname } = new URL(req.url);
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (req.method === "GET" || req.method === "HEAD") {
    if (pathname === "/") return handleToday(req, ctx);
    if (pathname === "/todos") return handleTodos(req, ctx);
    if (pathname === "/goals") return handleGoals(req, ctx);
    if (parts[0] === "goals" && parts.length === 2) return handleGoal(req, ctx, parts[1]);
    if (pathname === "/review") return handleReview(req, ctx);
    const exportMatch = /^\/review\/export\.(md|json|jsonl)$/.exec(pathname);
    if (exportMatch) return handleExport(req, ctx, exportMatch[1]);
    if (pathname === "/health") return Response.json(HEALTH_BODY);
    if (pathname === "/welcome") return handleWelcome(ctx);
    return serveAsset(pathname) ?? notFound(ctx);
  }

  if (req.method === "POST") {
    if (pathname === "/welcome/dismiss") return dismissWelcome(ctx);
    if (pathname === "/quit") return quitApp(ctx);
    if (pathname === "/journal") return createEntries(req, ctx);
    if (parts[0] === "journal" && (parts.length === 2 || parts.length === 3)) return changeEntry(req, ctx, parts[1], parts[2]);
    if (pathname === "/todos") return createTodo(req, ctx);
    if (parts[0] === "todos" && (parts.length === 2 || parts.length === 3)) return changeTodo(req, ctx, parts[1], parts[2]);
    if (pathname === "/goals") return createGoal(req, ctx);
    if (parts[0] === "goals" && parts.length === 2) return saveGoal(req, ctx, parts[1]);
  }

  return notFound(ctx);
}

/**
 * Entry point for every request. Exported so tests can call it directly with
 * their own vault, or boot their own Bun.serve on an ephemeral port.
 */
export async function handleRequest(req: Request, ctx: AppContext): Promise<Response> {
  if (!isAllowedRequest(req)) return new Response("Forbidden", { status: 403 });
  try {
    return await route(req, ctx);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Something went wrong while handling that request.\n\n${message}\n\nThe full details were logged.`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

// Only start when run directly (`bun run dev` or the compiled app), not when imported by tests.
if (import.meta.main) {
  // Only the compiled app has embedded files (the CSS and JS above).
  const standalone = Bun.embeddedFiles.length > 0;
  // The Windows build has no console window (see the build script).
  const noConsole = standalone && process.platform === "win32";
  try {
    const vaultPath = resolveVaultPath({ envPath: process.env.VAULT_PATH, standalone, home: homedir(), cwd: process.cwd() });
    if (noConsole) logErrorsTo(join(vaultPath, ".workledger", "error.log"));
    const ctx: AppContext = {
      vault: new Vault(vaultPath),
      vaultPath,
      clock: () => new Date(),
      quit: standalone ? () => process.exit(0) : undefined,
    };
    const { url, server } = await startOrFind(Number(process.env.PORT ?? DEFAULT_PORT), (req) => handleRequest(req, ctx));

    if (!server) {
      console.log(`Work Ledger is already running at ${url}. Opening it.`);
      openApp(url, ctx.vault.isWelcomeDismissed());
      process.exit(0);
    }

    console.log(`Work Ledger is running at ${url}\nYour notes are saved in: ${vaultPath}`);
    if (standalone) openApp(url, ctx.vault.isWelcomeDismissed());
  } catch (error) {
    const message = `Work Ledger couldn't start.\n\n${error instanceof Error ? error.message : String(error)}`;
    console.error(message);
    if (noConsole) showErrorBox(message);
    // A double-clicked console window would otherwise vanish before anyone can read the error.
    else if (standalone) prompt("\nPress Enter to close.");
    process.exit(1);
  }
}
