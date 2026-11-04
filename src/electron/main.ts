/**
 * The desktop app. Opens one window showing app://local/ pages, served by
 * src/electron/protocol.ts with no network port. Closing the window quits.
 * Security follows https://www.electronjs.org/docs/latest/tutorial/security.
 */
import { app, BrowserWindow, dialog, Menu, protocol, session } from "electron";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logErrorsTo, resolveVaultPath } from "../launch";
import type { AppContext } from "../routes/shared";
import { Vault } from "../vault/vault";
import { APP_ORIGIN, isAppUrl, serveAppRequest } from "./protocol";

// Must match appId in electron-builder.yml, so taskbar pins group with the app.
const APP_ID = "com.workledger.app";

// These must run before the app is ready.
// Keep existing localStorage drafts when the displayed product name changes.
const profilePath = join(app.getPath("appData"), "Work Ledger");
mkdirSync(profilePath, { recursive: true });
app.setPath("userData", profilePath);
// standard: storage and relative links work. secure: clipboard works. supportFetchAPI: app.js can post forms.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }]);
app.setAppUserModelId(APP_ID);
app.enableSandbox();

// On a shared machine (Remote Desktop), another user could attach to a debugging port and drive the window.
const debugSwitch = app.commandLine.hasSwitch("remote-debugging-port") || app.commandLine.hasSwitch("remote-debugging-pipe");

let mainWindow: BrowserWindow | null = null;

async function start(): Promise<void> {
  const vaultPath = resolveVaultPath({ envPath: process.env.VAULT_PATH, standalone: app.isPackaged, home: homedir(), cwd: process.cwd() });
  if (app.isPackaged) logErrorsTo(join(vaultPath, ".workledger", "error.log"));
  const ctx: AppContext = { vault: new Vault(vaultPath), vaultPath, clock: () => new Date() };

  await app.whenReady();
  // No menu bar, and with it no reload or developer-tools shortcuts. Kept while developing.
  if (app.isPackaged) Menu.setApplicationMenu(null);

  // Deny every browser permission except copying formatted text to the clipboard.
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_contents, permission, callback, details) =>
    callback(permission === "clipboard-sanitized-write" && isAppUrl(details.requestingUrl)),
  );
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => permission === "clipboard-sanitized-write" && isAppUrl(requestingOrigin));
  ses.setDevicePermissionHandler(() => false);

  protocol.handle("app", (req) => serveAppRequest(req, (req as Request & { initiatorOrigin?: string }).initiatorOrigin, ctx));

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
  mainWindow.on("closed", () => (mainWindow = null));
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
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  // With no "window-all-closed" handler, closing the window quits the app.
  start().catch((error: unknown) => {
    console.error(error);
    dialog.showErrorBox("ToDo couldn't start", error instanceof Error ? error.message : String(error));
    app.quit();
  });
}
