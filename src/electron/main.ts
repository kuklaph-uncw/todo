/**
 * The desktop app. Opens one window showing app://local/ pages, served by
 * src/electron/protocol.ts. MCP is an opt-in loopback listener in this process.
 * Security follows https://www.electronjs.org/docs/latest/tutorial/security.
 */
import { app, BrowserWindow, dialog, Menu, protocol, session, Tray, nativeImage } from "electron";
import electronUpdater from "electron-updater";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logErrorsTo, resolveVaultPath } from "../launch";
import type { AppContext } from "../routes/shared";
import { Vault } from "../vault/vault";
import { AgentAccess } from "../mcp/access";
import { WindowLifecycle } from "./lifecycle";
import { APP_ORIGIN, isAppUrl, serveAppRequest } from "./protocol";
import { Updates } from "./updates";

// Must match appId in electron-builder.yml, so taskbar pins group with the app.
const APP_ID = "com.workledger.app";

// These must run before the app is ready.
// Keep existing localStorage drafts when the displayed product name changes.
const profilePath = join(app.getPath("appData"), "Work Ledger");
mkdirSync(profilePath, { recursive: true });
app.setPath("userData", profilePath);
// standard: storage and relative links work. secure: clipboard works. supportFetchAPI: app.js can post forms.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
]);
app.setAppUserModelId(APP_ID);
app.enableSandbox();

// On a shared machine (Remote Desktop), another user could attach to a debugging port and drive the window.
const debugSwitch =
  app.commandLine.hasSwitch("remote-debugging-port") || app.commandLine.hasSwitch("remote-debugging-pipe");

let mainWindow: BrowserWindow | null = null;
let lifecycle: WindowLifecycle | null = null;
let tray: Tray | null = null;

async function start(): Promise<void> {
  const vaultPath = resolveVaultPath({
    envPath: process.env.VAULT_PATH,
    standalone: app.isPackaged,
    home: homedir(),
    cwd: process.cwd(),
  });
  if (app.isPackaged) logErrorsTo(join(vaultPath, ".workledger", "error.log"));
  const ctx: AppContext = { vault: new Vault(vaultPath), vaultPath, clock: () => new Date() };

  await app.whenReady();
  // No menu bar, and with it no reload or developer-tools shortcuts. Kept while developing.
  if (app.isPackaged) Menu.setApplicationMenu(null);

  const syncTray = () => {
    const state = ctx.agentAccess!.snapshot();
    if (state.enabled && state.background && state.running) {
      if (tray) return;
      try {
        const iconPath = app.isPackaged
          ? join(process.resourcesPath, "tray.ico")
          : join(app.getAppPath(), "public", "favicon.ico");
        const image = nativeImage.createFromPath(iconPath);
        if (image.isEmpty()) throw new Error("Tray icon could not be loaded.");
        tray = new Tray(image);
        tray.setToolTip("ToDo · agent access running");
        tray.setContextMenu(
          Menu.buildFromTemplate([
            { label: "Open ToDo", click: () => lifecycle?.open() },
            {
              label: "Settings",
              click: () => {
                lifecycle?.open();
                void mainWindow?.loadURL(`${APP_ORIGIN}/settings`);
              },
            },
            { type: "separator" },
            { label: "Quit ToDo", click: () => lifecycle?.quit() },
          ]),
        );
        tray.on("double-click", () => lifecycle?.open());
      } catch (error) {
        console.error("Could not create tray icon", error);
        tray?.destroy();
        tray = null;
        dialog.showErrorBox(
          "Background mode unavailable",
          "The system tray icon could not be created. Closing ToDo will quit the app.",
        );
      }
    } else {
      if (mainWindow && !mainWindow.isVisible() && !lifecycle?.quitting) lifecycle?.open();
      tray?.destroy();
      tray = null;
    }
  };
  const agentAccess = new AgentAccess(join(profilePath, "mcp.json"), ctx.vault, ctx.clock, syncTray);
  ctx.agentAccess = agentAccess;
  await agentAccess.start();
  let shutdownStarted = false;
  let shutdownComplete = false;
  app.on("before-quit", (event) => {
    if (lifecycle) lifecycle.quitting = true;
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    void agentAccess
      .close()
      .catch((error) => console.error("MCP shutdown failed", error))
      .finally(() => {
        tray?.destroy();
        tray = null;
        shutdownComplete = true;
        app.quit();
      });
  });

  // Deny every browser permission except copying formatted text to the clipboard.
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_contents, permission, callback, details) =>
    callback(permission === "clipboard-sanitized-write" && isAppUrl(details.requestingUrl)),
  );
  ses.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) =>
      permission === "clipboard-sanitized-write" && isAppUrl(requestingOrigin),
  );
  ses.setDevicePermissionHandler(() => false);

  protocol.handle("app", (req) =>
    serveAppRequest(req, (req as Request & { initiatorOrigin?: string }).initiatorOrigin, ctx),
  );

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "ToDo",
    backgroundColor: "#141311",
    webPreferences: {
      // Electron's defaults, stated so they're visible: pages get no Node or file access.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  lifecycle = new WindowLifecycle(
    mainWindow,
    () => {
      const state = agentAccess.snapshot();
      return state.enabled && state.background && state.running && tray !== null;
    },
    () => app.quit(),
  );
  mainWindow.on("close", (event) => lifecycle?.close(event));
  mainWindow.on("query-session-end", () => {
    if (lifecycle) lifecycle.quitting = true;
  });
  mainWindow.on("closed", () => (mainWindow = null));
  // Pages show the update state and ask the user before restarting; this process never prompts.
  // Restarting saves page storage first, so the ledger draft survives the installer closing the app.
  if (app.isPackaged) {
    ctx.updates = new Updates(electronUpdater.autoUpdater, undefined, () => ses.flushStorageData());
    void ctx.updates.check();
  }
  await mainWindow.loadURL(`${APP_ORIGIN}/`);
}

// Lock down every page the app creates: no leaving the app, no pop-ups, no embedded browsers.
// will-frame-navigate covers the main frame and any frames inside it.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-frame-navigate", (event) => {
    if (!isAppUrl(event.url)) event.preventDefault();
  });
  contents.on("will-redirect", (event) => {
    if (!isAppUrl(event.url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

// One copy at a time: opening it again brings the existing window forward.
if ((app.isPackaged && debugSwitch) || !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    lifecycle?.open();
  });
  start().catch((error: unknown) => {
    console.error(error);
    dialog.showErrorBox("ToDo couldn't start", error instanceof Error ? error.message : String(error));
    app.quit();
  });
}
