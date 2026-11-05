import { describe, expect, it, mock, spyOn } from "bun:test";
import { EventEmitter } from "node:events";
import { startUpdates } from "../../src/electron/updates";
import type { UpdateCheckResult } from "electron-updater";

function fakeUpdater() {
  return Object.assign(new EventEmitter(), {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    disableWebInstaller: false,
    checkForUpdates: mock(async (): Promise<UpdateCheckResult | null> => null),
    quitAndInstall: mock(() => {}),
  });
}

describe("desktop updates", () => {
  it("checks for stable updates, downloads automatically, and requires permission to install", async () => {
    const updater = fakeUpdater();
    const askToRestart = mock(async () => true);

    await startUpdates(updater, askToRestart);

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.autoDownload).toBe(true);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.disableWebInstaller).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(askToRestart).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    updater.emit("update-downloaded");
    await Promise.resolve();

    expect(askToRestart).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("leaves the app running when restart is declined", async () => {
    const updater = fakeUpdater();
    await startUpdates(updater, async () => false);

    updater.emit("update-downloaded");
    await Promise.resolve();

    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });

  it("logs a failed check without rejecting startup", async () => {
    const updater = fakeUpdater();
    const error = new Error("GitHub is unavailable");
    updater.checkForUpdates.mockRejectedValue(error);
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(startUpdates(updater, async () => false)).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith("ToDo update failed:", error);
    } finally {
      log.mockRestore();
    }
  });

  it("handles download rejection after the check has succeeded", async () => {
    const updater = fakeUpdater();
    const error = new Error("Download interrupted");
    const log = spyOn(console, "error").mockImplementation(() => {});
    const info = { version: "1.2.0", files: [], path: "", sha512: "", releaseDate: "2026-11-04" };
    updater.checkForUpdates.mockImplementation(async () => ({
      isUpdateAvailable: true,
      updateInfo: info,
      versionInfo: info,
      downloadPromise: Promise.reject(error),
    }));
    try {
      await expect(startUpdates(updater, async () => true)).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith("ToDo update failed:", error);
      expect(updater.quitAndInstall).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("handles updater errors and a failed restart prompt without quitting", async () => {
    const updater = fakeUpdater();
    const promptError = new Error("Window closed");
    const updateError = new Error("Installer failed");
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      await startUpdates(updater, async () => {
        throw promptError;
      });
      updater.emit("error", updateError);
      updater.emit("update-downloaded");
      await Promise.resolve();

      expect(log).toHaveBeenCalledWith("ToDo update failed:", updateError);
      expect(log).toHaveBeenCalledWith("ToDo update failed:", promptError);
      expect(updater.quitAndInstall).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
