/** Startup helpers shared by the desktop app and the development server. */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Where notes live: VAULT_PATH if set; otherwise a "Work Ledger" folder in the
 * user's home for the installed app, or ./vault when running from source.
 */
export function resolveVaultPath(opts: { envPath?: string; standalone: boolean; home: string; cwd: string }): string {
  if (opts.envPath) return resolve(opts.cwd, opts.envPath);
  return opts.standalone ? join(opts.home, "Work Ledger") : resolve(opts.cwd, "vault");
}

/** The installed app has no console to read, so send console.error to <notes>/.workledger/error.log instead. */
export function logErrorsTo(path: string): void {
  console.error = (...args: unknown[]) => {
    const text = args.map((arg) => (arg instanceof Error ? (arg.stack ?? arg.message) : String(arg))).join(" ");
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${new Date().toISOString()} ${text}\n`);
    } catch {
      // The notes folder isn't writable. Logging must never stop the error from being shown.
    }
  };
}
