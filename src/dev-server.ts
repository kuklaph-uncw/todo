/**
 * Development only (`bun run dev`): serves the app at http://127.0.0.1:41820 so
 * pages can be checked in a normal browser while editing. Never shipped; the
 * desktop app is src/electron/main.ts.
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

export function devFetch(ctx: AppContext): (req: Request) => Promise<Response> {
  return async (req) => {
    const res = isAllowedRequest(req) ? await handleRequest(req, ctx) : new Response("Forbidden", { status: 403 });
    // Same policy as the desktop app, so anything it would block shows up while developing.
    const headers = new Headers(res.headers);
    headers.set("content-security-policy", CSP);
    return new Response(res.body, { status: res.status, headers });
  };
}

if (import.meta.main) {
  const vaultPath = resolveVaultPath({ envPath: process.env.VAULT_PATH, standalone: false, home: homedir(), cwd: process.cwd() });
  const ctx: AppContext = { vault: new Vault(vaultPath), vaultPath, clock: () => new Date() };
  const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT ?? 41820), fetch: devFetch(ctx) });
  console.log(`Work Ledger (development) is running at ${server.url}\nNotes: ${vaultPath}`);
}
