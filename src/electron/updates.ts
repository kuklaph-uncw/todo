import type { AppUpdater, UpdateInfo } from "electron-updater";

type UpdateClient = Pick<
  AppUpdater,
  | "autoDownload"
  | "autoInstallOnAppQuit"
  | "allowPrerelease"
  | "disableWebInstaller"
  | "checkForUpdates"
  | "quitAndInstall"
> & {
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "update-downloaded", listener: (info: UpdateInfo) => void): unknown;
};

/** What the app's pages show about updates. `idle` means no check has started yet. */
export type UpdateSnapshot =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current"; checkedAt: string }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready" | "restarting"; version: string }
  | { status: "error"; version?: string; message: string };

/**
 * Main process only. Checks and downloads in the background; installs only
 * when the user chooses Restart. Never closes the app on its own.
 */
export class Updates {
  private state: UpdateSnapshot = { status: "idle" };

  constructor(
    private readonly updater: UpdateClient,
    private readonly clock: () => Date = () => new Date(),
    /** Runs just before the installer takes over, for example to save page storage. */
    private readonly beforeInstall: () => void = () => {},
  ) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.disableWebInstaller = true;
    updater.on("error", (error) => this.fail(error));
    updater.on("download-progress", (progress) => {
      if (this.state.status === "downloading") this.state = { ...this.state, percent: Math.round(progress.percent) };
    });
    updater.on("update-downloaded", (info) => {
      if (this.state.status === "downloading" || this.state.status === "checking")
        this.state = { status: "ready", version: info.version };
    });
  }

  snapshot(): UpdateSnapshot {
    return this.state;
  }

  /** Starts a check unless one is running or an update is already downloaded. Never rejects. */
  async check(): Promise<void> {
    if (["checking", "downloading", "ready", "restarting"].includes(this.state.status)) return;
    this.state = { status: "checking" };
    try {
      const result = await this.updater.checkForUpdates();
      if (!result?.isUpdateAvailable) {
        this.state = { status: "current", checkedAt: this.clock().toISOString() };
        return;
      }
      const version = result.updateInfo.version;
      this.state = { status: "downloading", version, percent: 0 };
      await result.downloadPromise;
      if (this.state.status === "downloading") this.state = { status: "ready", version };
    } catch (error) {
      this.fail(error);
    }
  }

  /** Installs a downloaded update. Returns false when there is nothing ready to install. */
  restart(): boolean {
    if (this.state.status !== "ready") return false;
    this.state = { status: "restarting", version: this.state.version };
    // Later, so the page that asked gets its answer before the app quits.
    setTimeout(() => {
      try {
        this.beforeInstall();
        this.updater.quitAndInstall();
      } catch (error) {
        this.fail(error);
      }
    });
    return true;
  }

  private fail(error: unknown): void {
    console.error("ToDo update failed:", error);
    const state = this.state;
    if (state.status === "error") return;
    const version = "version" in state ? state.version : undefined;
    this.state = version
      ? {
          status: "error",
          version,
          message: `ToDo ${version} didn't ${state.status === "restarting" ? "install" : "download"}.`,
        }
      : { status: "error", message: "Couldn't check for updates." };
  }
}
