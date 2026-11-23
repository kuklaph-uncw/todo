import { type FSWatcher, watch } from "node:fs";
import { vaultRevision } from "./revision";
import type { Vault } from "./vault";

/** Saves rename a temporary file into place, so give a burst of file events a moment to finish. */
const SETTLE_MS = 50;

/** The files a revision covers (see vaultRevision), including temporary files saves rename into place. */
const COVERED = /^(todos\.md|journal|goals)([\\/.]|$)/;

/**
 * Tells an open window when anything in the vault changes: the app's own saves,
 * an agent's, or another program's. A file watcher wakes waiting requests, which
 * then compare revisions, so nothing reads the vault on a timer. Changes to other
 * files in the folder, such as an editor's settings or a git repository, are ignored.
 */
export class VaultChanges {
  private readonly waiters = new Set<() => void>();
  private watcher: FSWatcher | null = null;
  private closed = false;

  constructor(
    private readonly vault: Vault,
    private readonly vaultPath: string,
  ) {
    this.startWatching();
  }

  /** The vault's revision once it differs from `known`, or the same one after `ms` or an abort. */
  async next(known: string, ms: number, signal?: AbortSignal): Promise<string> {
    // The folder may not have existed yet, or a drive may have dropped out; try again.
    this.startWatching();
    const deadline = Date.now() + ms;
    for (;;) {
      const revision = vaultRevision(this.vault);
      const left = deadline - Date.now();
      if (revision !== known || left <= 0 || signal?.aborted) return revision;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          signal?.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, left);
        this.waiters.add(done);
        signal?.addEventListener("abort", done);
      });
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    }
  }

  close(): void {
    this.closed = true;
    this.watcher?.close();
    this.watcher = null;
    this.wake();
  }

  private startWatching(): void {
    if (this.watcher || this.closed) return;
    try {
      const watcher = watch(this.vaultPath, { recursive: true }, (_event, file) => {
        // Without a file name, it could be anything.
        if (!file || COVERED.test(file)) this.wake();
      });
      watcher.on("error", () => {
        watcher.close();
        if (this.watcher === watcher) this.watcher = null;
      });
      this.watcher = watcher;
    } catch {
      // Not there yet, or can't be watched. Waits still end on time and compare.
    }
  }

  private wake(): void {
    for (const done of [...this.waiters]) done();
  }
}
