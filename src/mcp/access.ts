import type { Vault } from "../vault/vault";
import { McpSettingsStore, type McpPreferences } from "./settings";
import { startMcp } from "./server";
import { TodoService } from "./todos";
import { LedgerService } from "./ledger";

/** One owner for settings and the listener, including when the window is hidden. */
export class AgentAccess {
  private listener: Awaited<ReturnType<typeof startMcp>> | null = null;
  private pending: Promise<unknown> = Promise.resolve();
  private error: string | null = null;
  private stopped = false;
  readonly store: McpSettingsStore;
  private readonly todos: TodoService;
  private readonly ledger: LedgerService;

  constructor(
    path: string,
    private readonly vault: Vault,
    private readonly clock: () => Date,
    private readonly changed: () => void = () => {},
  ) {
    this.store = new McpSettingsStore(path);
    this.todos = new TodoService(vault, clock);
    this.ledger = new LedgerService(vault, clock);
  }

  snapshot() {
    return {
      ...this.store.get(),
      hasToken: this.store.hasToken,
      running: this.listener !== null,
      error: this.error ?? this.store.error,
    };
  }

  start(): Promise<void> {
    return this.enqueue(() => this.apply());
  }

  configure(preferences: McpPreferences): Promise<void> {
    return this.enqueue(async () => {
      this.store.save(preferences);
      await this.apply();
    });
  }

  rotateToken(): Promise<string> {
    return this.enqueue(async () => {
      const token = this.store.rotateToken();
      await this.apply();
      return token;
    });
  }

  close(): Promise<void> {
    this.stopped = true;
    return this.enqueue(async () => {
      await this.listener?.close();
      this.listener = null;
      this.changed();
    });
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.then(action);
    this.pending = next.catch(() => {});
    return next;
  }

  private async apply(): Promise<void> {
    await this.listener?.close();
    this.listener = null;
    this.error = null;
    const preferences = this.store.get();
    if (!this.stopped && preferences.enabled) {
      if (!this.store.hasToken) this.error = "Generate an access token before agents can connect.";
      else {
        try {
          this.listener = await startMcp(
            this.vault,
            this.clock,
            preferences.port,
            (token) => this.store.acceptsToken(token),
            this.todos,
            this.ledger,
          );
        } catch (error) {
          this.error = `Could not start agent access on port ${preferences.port}. Choose another port if it is in use.`;
          console.error(this.error, error);
        }
      }
    }
    this.changed();
  }
}
