import { describe, expect, it, mock, spyOn } from "bun:test";
import { EventEmitter } from "node:events";
import { Updates } from "../../src/electron/updates";
import type { UpdateCheckResult } from "electron-updater";

const info = { version: "1.4.0", files: [], path: "", sha512: "", releaseDate: "2026-11-05" };

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

/** A check that finds 1.4.0; resolve `finish` to complete its download. */
function availableUpdate(updater: ReturnType<typeof fakeUpdater>) {
  let finish!: (files: string[]) => void;
  let fail!: (error: Error) => void;
  const downloadPromise = new Promise<string[]>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  updater.checkForUpdates.mockImplementation(async () => {
    updater.emit("update-available", info);
    return { isUpdateAvailable: true, updateInfo: info, versionInfo: info, downloadPromise };
  });
  return { finish, fail };
}

const quietly = () => spyOn(console, "error").mockImplementation(() => {});
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("desktop updates", () => {
  it("configures stable background downloads that never install on quit", () => {
    const updater = fakeUpdater();
    new Updates(updater);
    expect(updater.autoDownload).toBe(true);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.disableWebInstaller).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });

  it("reports up to date with the check time", async () => {
    const updater = fakeUpdater();
    const updates = new Updates(updater, () => new Date("2026-11-05T09:14:00Z"));
    expect(updates.snapshot()).toEqual({ status: "idle" });
    const checking = updates.check();
    expect(updates.snapshot().status).toBe("checking");
    await checking;
    expect(updates.snapshot()).toEqual({ status: "current", checkedAt: "2026-11-05T09:14:00.000Z" });
  });

  it("downloads in the background, reports progress, and waits for the user when ready", async () => {
    const updater = fakeUpdater();
    const { finish } = availableUpdate(updater);
    const updates = new Updates(updater);
    const done = updates.check();
    await tick();
    expect(updates.snapshot()).toEqual({ status: "downloading", version: "1.4.0", percent: 0 });
    updater.emit("download-progress", { percent: 41.6 });
    expect(updates.snapshot()).toMatchObject({ status: "downloading", percent: 42 });
    finish([]);
    await done;
    updater.emit("update-downloaded", info);
    expect(updates.snapshot()).toEqual({ status: "ready", version: "1.4.0" });
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("ignores checks while one is running or an update is ready", async () => {
    const updater = fakeUpdater();
    const { finish } = availableUpdate(updater);
    const updates = new Updates(updater);
    const first = updates.check();
    await updates.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    finish([]);
    await first;
    await updates.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updates.snapshot().status).toBe("ready");
  });

  it("restarts only when ready, once, after its hook runs", async () => {
    const updater = fakeUpdater();
    const beforeInstall = mock(() => {});
    const updates = new Updates(updater, undefined, beforeInstall);
    expect(updates.restart()).toBe(false);
    const { finish } = availableUpdate(updater);
    finish([]);
    await updates.check();
    expect(updates.restart()).toBe(true);
    expect(updates.restart()).toBe(false);
    expect(updates.snapshot()).toEqual({ status: "restarting", version: "1.4.0" });
    await tick();
    expect(beforeInstall).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("reports a failed check without rejecting, and allows another check", async () => {
    const updater = fakeUpdater();
    const error = new Error("GitHub is unavailable");
    updater.checkForUpdates.mockRejectedValueOnce(error);
    const log = quietly();
    try {
      const updates = new Updates(updater);
      await expect(updates.check()).resolves.toBeUndefined();
      expect(updates.snapshot()).toEqual({ status: "error", message: "Couldn't check for updates." });
      expect(log).toHaveBeenCalledWith("ToDo update failed:", error);
      await updates.check();
      expect(updates.snapshot().status).toBe("current");
    } finally {
      log.mockRestore();
    }
  });

  it("reports a failed download with its version", async () => {
    const updater = fakeUpdater();
    const { fail } = availableUpdate(updater);
    const log = quietly();
    try {
      const updates = new Updates(updater);
      const done = updates.check();
      fail(new Error("Download interrupted"));
      await done;
      updater.emit("error", new Error("Download interrupted"));
      expect(updates.snapshot()).toEqual({
        status: "error",
        version: "1.4.0",
        message: "ToDo 1.4.0 didn't download.",
      });
    } finally {
      log.mockRestore();
    }
  });

  it("reports an installer that fails to start and stays usable", async () => {
    const updater = fakeUpdater();
    const { finish } = availableUpdate(updater);
    finish([]);
    updater.quitAndInstall.mockImplementation(() => {
      updater.emit("error", new Error("Installer failed"));
    });
    const log = quietly();
    try {
      const updates = new Updates(updater);
      await updates.check();
      updates.restart();
      await tick();
      expect(updates.snapshot()).toEqual({
        status: "error",
        version: "1.4.0",
        message: "ToDo 1.4.0 didn't install.",
      });
    } finally {
      log.mockRestore();
    }
  });
});
