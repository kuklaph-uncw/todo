import type { AppUpdater } from "electron-updater";

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
  on(event: "update-downloaded", listener: () => void): unknown;
};

/** Main process only. An update must never close the app without permission. */
export async function startUpdates(updater: UpdateClient, askToRestart: () => Promise<boolean>): Promise<void> {
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.disableWebInstaller = true;
  updater.on("error", (error) => console.error("ToDo update failed:", error));
  updater.on("update-downloaded", async () => {
    try {
      if (await askToRestart()) updater.quitAndInstall();
    } catch (error) {
      console.error("ToDo update failed:", error);
    }
  });
  try {
    const result = await updater.checkForUpdates();
    // The check resolves before the download finishes; both promises can reject.
    await result?.downloadPromise;
  } catch (error) {
    console.error("ToDo update failed:", error);
  }
}
