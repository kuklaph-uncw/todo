/**
 * Development only (`bun run dev`): serves the app at http://127.0.0.1:41820 so
 * pages can be checked in a normal browser while editing, and reloads them
 * after each code change. Never shipped; the desktop app is src/electron/main.ts.
 */
import { homedir } from "node:os";
import { CSP } from "./electron/protocol";
import { resolveVaultPath } from "./launch";
import type { AppContext } from "./routes/shared";
import { handleRequest } from "./server";
import { Vault } from "./vault/vault";

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

/**
 * Live reload: `bun --watch` restarts this server when code changes, which
 * drops every open event stream. A page whose stream reconnects reloads itself.
 */
const RELOAD_SCRIPT = `let restarting = false;
const events = new EventSource("/__dev/events");
events.onerror = () => (restarting = true);
events.onopen = () => restarting && location.reload();
`;

function reloadEvents(): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("retry: 250\n\n"));
      // A comment now and then keeps the idle connection open.
      timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(timer); // the page went away
        }
      }, 5000);
    },
    cancel() {
      clearInterval(timer);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
}

async function devResponse(req: Request, ctx: AppContext): Promise<Response> {
  if (!isAllowedRequest(req)) return new Response("Forbidden", { status: 403 });
  const path = new URL(req.url).pathname;
  if (path === "/__dev/reload.js")
    return new Response(RELOAD_SCRIPT, { headers: { "content-type": "text/javascript; charset=utf-8" } });
  if (path === "/__dev/events") return reloadEvents();

  const res = await handleRequest(req, ctx);
  if (!res.headers.get("content-type")?.startsWith("text/html")) return res;
  const html = (await res.text()).replace("</head>", `  <script src="/__dev/reload.js" defer></script>\n</head>`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(html, { status: res.status, headers });
}

export function devFetch(ctx: AppContext): (req: Request) => Promise<Response> {
  return async (req) => {
    const res = await devResponse(req, ctx);
    // Same policy as the desktop app, so anything it would block shows up while developing.
    const headers = new Headers(res.headers);
    headers.set("content-security-policy", CSP);
    return new Response(res.body, { status: res.status, headers });
  };
}

if (import.meta.main) {
  const vaultPath = resolveVaultPath({
    envPath: process.env.VAULT_PATH,
    standalone: false,
    home: homedir(),
    cwd: process.cwd(),
  });
  const ctx: AppContext = { vault: new Vault(vaultPath), vaultPath, clock: () => new Date() };
  const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 41820), fetch: devFetch(ctx) });
  console.log(`ToDo (development) is running at ${server.url}\nNotes: ${vaultPath}`);
}
