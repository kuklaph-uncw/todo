/**
 * Startup helpers for running the app, especially as a compiled executable
 * that coworkers double-click.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Server } from "bun";

/** Served at /health so a second launch can recognise a running copy of this app. */
export const HEALTH_BODY = { app: "work-ledger" };

/**
 * Where notes live: VAULT_PATH if set; otherwise a "Work Ledger" folder in the
 * user's home for the packaged app (its launch folder is unpredictable), or
 * ./vault when running from source.
 */
export function resolveVaultPath(opts: { envPath?: string; standalone: boolean; home: string; cwd: string }): string {
  if (opts.envPath) return resolve(opts.cwd, opts.envPath);
  return opts.standalone ? join(opts.home, "Work Ledger") : resolve(opts.cwd, "vault");
}

/**
 * The packaged Windows app has no console window, so errors are shown in a
 * standard message box instead (built-in PowerShell, no extra files).
 */
export function showErrorBox(message: string): void {
  const quoted = `'${message.replace(/'/g, "''")}'`;
  const script = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show(${quoted}, 'Work Ledger', 'OK', 'Error') | Out-Null`;
  Bun.spawnSync(["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], { windowsHide: true });
}

/** With no console to read, send console.error to <notes>/.workledger/error.log instead. */
export function logErrorsTo(path: string): void {
  console.error = (...args: unknown[]) => {
    const text = args.map((arg) => (arg instanceof Error ? (arg.stack ?? arg.message) : String(arg))).join(" ");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${new Date().toISOString()} ${text}\n`);
  };
}

/** True only when this app, not some other program, answers on the port. */
export async function isLedgerRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { app?: string };
    return body.app === HEALTH_BODY.app;
  } catch {
    return false;
  }
}

/**
 * Binds the first free port from `start` upward. If a port is taken by an
 * already-running copy of this app, returns that copy's URL instead of
 * starting a second one on the same notes.
 */
export async function startOrFind(
  start: number,
  fetch: (req: Request) => Response | Promise<Response>,
  attempts = 20,
): Promise<{ url: string; server: Server<unknown> | null }> {
  for (let port = start; port < start + attempts; port++) {
    const url = `http://127.0.0.1:${port}`;
    try {
      return { url, server: Bun.serve({ hostname: "127.0.0.1", port, fetch }) };
    } catch (error) {
      if ((error as { code?: string }).code !== "EADDRINUSE") throw error;
      if (await isLedgerRunning(port)) return { url, server: null };
    }
  }
  throw new Error(`Ports ${start} to ${start + attempts - 1} are all in use. Set PORT to pick another.`);
}

type Env = Record<string, string | undefined>;

/** Edge ships with Windows; its standard install locations. */
export function findEdge(env: Env = process.env): string | null {
  const roots = [env["ProgramFiles(x86)"], env.ProgramFiles, env.LOCALAPPDATA].filter((root): root is string => Boolean(root));
  return roots.map((root) => join(root, "Microsoft", "Edge", "Application", "msedge.exe")).find((path) => existsSync(path)) ?? null;
}

/** Chromium browsers support app windows and installing; this is where each keeps its profiles. */
const CHROMIUM_USER_DATA: Record<string, string[]> = {
  "msedge.exe": ["Microsoft", "Edge", "User Data"],
  "chrome.exe": ["Google", "Chrome", "User Data"],
  "brave.exe": ["BraveSoftware", "Brave-Browser", "User Data"],
  "vivaldi.exe": ["Vivaldi", "User Data"],
};

export interface Browser {
  exe: string;
  /** Set for Chromium browsers only. */
  userData: string | null;
}

export function toBrowser(exe: string, env: Env = process.env): Browser {
  const parts = CHROMIUM_USER_DATA[basename(exe).toLowerCase()];
  return { exe, userData: parts && env.LOCALAPPDATA ? join(env.LOCALAPPDATA, ...parts) : null };
}

/** The program in a registry "open" command such as `"C:\...\chrome.exe" --single-argument %1`. */
export function exeFromCommand(command: string, env: Env = process.env): string | null {
  const match = /^\s*(?:"([^"]+)"|(\S+))/.exec(command);
  const exe = match?.[1] ?? match?.[2];
  return exe ? exe.replace(/%([^%]+)%/g, (whole, name: string) => env[name] ?? whole) : null;
}

function readRegistry(key: string, value: string | null): string | null {
  const args = value ? ["reg", "query", key, "/v", value] : ["reg", "query", key, "/ve"];
  // reg.exe is a console program: without windowsHide, Windows opens a terminal for it.
  const output = Bun.spawnSync(args, { stdout: "pipe", stderr: "ignore", windowsHide: true }).stdout.toString();
  return /REG_(?:EXPAND_)?SZ\s+(.+)$/m.exec(output)?.[1].trim() ?? null;
}

/** The user's default browser on Windows (where Windows records it), or Edge if that can't be read. */
export function findBrowser(env: Env = process.env): Browser | null {
  const progId = readRegistry("HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice", "ProgId");
  const command = progId ? readRegistry(`HKCR\\${progId}\\shell\\open\\command`, null) : null;
  const exe = command ? exeFromCommand(command, env) : null;
  if (exe && existsSync(exe)) return toBrowser(exe, env);
  const edge = findEdge(env);
  return edge ? toBrowser(edge, env) : null;
}

export const APP_NAME = "Work Ledger";
/**
 * Away from ports dev tools usually take (3000, 5173, 8080...) and below
 * Windows' dynamic range (49152+). Changing it breaks existing installs of
 * the Edge app, which is tied to this address.
 */
export const DEFAULT_PORT = 41820;

export interface InstalledApp {
  profile: string;
  appId: string;
}

/**
 * Chromium keeps each installed web app in
 * <profile>\Web Applications\_crx_<id>\ (Edge uses "_crx__") next to an
 * "<app name>.ico". Finding that file gives the app id and profile.
 */
export function findInstalledApp(appName: string, userData: string): InstalledApp | null {
  if (!existsSync(userData)) return null;
  for (const profile of readdirSync(userData)) {
    const apps = join(userData, profile, "Web Applications");
    if (!existsSync(apps)) continue;
    for (const dir of readdirSync(apps)) {
      const id = /^_crx_+(.+)$/.exec(dir)?.[1];
      if (id && existsSync(join(apps, dir, `${appName}.ico`))) return { profile, appId: id };
    }
  }
  return null;
}

/**
 * What to run to show the app:
 * - installed in a Chromium browser: open the installed app
 * - first run: the welcome page in a normal tab (installing needs a tab)
 * - after "Not now": a Chromium app window, or a normal tab elsewhere
 */
export function launchCommand(opts: {
  url: string;
  platform: string;
  browser: Browser | null;
  installed: InstalledApp | null;
  welcomeDismissed: boolean;
}): string[] {
  const { url, browser, installed } = opts;
  if (browser?.userData && installed) return [browser.exe, `--profile-directory=${installed.profile}`, `--app-id=${installed.appId}`];
  const target = opts.welcomeDismissed ? url : `${url}/welcome`;
  if (browser) return browser.userData && opts.welcomeDismissed ? [browser.exe, `--app=${url}`] : [browser.exe, target];
  // Windows' own URL opener: uses the default browser, and unlike `cmd /c start` has no console window.
  if (opts.platform === "win32") return ["rundll32", "url.dll,FileProtocolHandler", target];
  return [opts.platform === "darwin" ? "open" : "xdg-open", target];
}

export function openApp(url: string, welcomeDismissed: boolean): void {
  const browser = process.platform === "win32" ? findBrowser() : null;
  // An installed app is tied to the address it was installed from, so only
  // look for one when we're on that (default) port.
  const installed =
    browser?.userData && new URL(url).port === String(DEFAULT_PORT) ? findInstalledApp(APP_NAME, browser.userData) : null;
  // No windowsHide here: these are windowed programs, and hiding would hide
  // the app window itself. (launchCommand never starts a console program.)
  Bun.spawn(launchCommand({ url, platform: process.platform, browser, installed, welcomeDismissed }), {
    stdout: "ignore",
    stderr: "ignore",
  });
}
