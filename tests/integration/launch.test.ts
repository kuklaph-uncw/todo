import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "bun";
import {
  exeFromCommand,
  findEdge,
  findInstalledApp,
  HEALTH_BODY,
  isLedgerRunning,
  launchCommand,
  logErrorsTo,
  resolveVaultPath,
  startOrFind,
  toBrowser,
  type Browser,
} from "../../src/launch";

describe("resolveVaultPath", () => {
  const base = { home: "/home/sam", cwd: "/work/app" };

  it("uses VAULT_PATH when set, relative to where the app was started", () => {
    expect(resolveVaultPath({ ...base, envPath: "notes", standalone: true })).toBe(resolve("/work/app", "notes"));
  });

  it("keeps notes in the user's home folder for the packaged app", () => {
    expect(resolveVaultPath({ ...base, standalone: true })).toBe(join("/home/sam", "Work Ledger"));
  });

  it("uses ./vault when running from source", () => {
    expect(resolveVaultPath({ ...base, standalone: false })).toBe(resolve("/work/app", "vault"));
  });
});

describe("logErrorsTo", () => {
  it("appends errors, with stack traces, to the log file", () => {
    const dir = mkdtempSync(join(tmpdir(), "log-test-"));
    const original = console.error;
    try {
      const log = join(dir, ".workledger", "error.log");
      logErrorsTo(log);
      console.error("first problem");
      console.error(new Error("second problem"));
      const text = readFileSync(log, "utf8");
      expect(text).toContain("first problem");
      expect(text).toContain("Error: second problem");
      expect(text.trim().split("\n")[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.* first problem$/);
    } finally {
      console.error = original;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("findEdge", () => {
  it("finds msedge.exe under the first install root that has it", () => {
    const root = mkdtempSync(join(tmpdir(), "edge-test-"));
    try {
      const dir = join(root, "Microsoft", "Edge", "Application");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "msedge.exe"), "");
      expect(findEdge({ ProgramFiles: join(root, "missing"), LOCALAPPDATA: root })).toBe(join(dir, "msedge.exe"));
      expect(findEdge({ ProgramFiles: join(root, "missing") })).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("findInstalledApp", () => {
  const install = (userData: string, profile: string, dir: string, icon: string) => {
    const path = join(userData, profile, "Web Applications", dir);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, icon), "");
  };

  it("finds the app id and profile by its icon file (Edge names folders _crx__, Chrome _crx_)", () => {
    const root = mkdtempSync(join(tmpdir(), "web-apps-"));
    try {
      const edge = join(root, "edge");
      install(edge, "Default", "_crx__otherapp", "Teams.ico");
      expect(findInstalledApp("Work Ledger", edge)).toBeNull();
      install(edge, "Profile 1", "_crx__abcdefghijklmnop", "Work Ledger.ico");
      expect(findInstalledApp("Work Ledger", edge)).toEqual({ profile: "Profile 1", appId: "abcdefghijklmnop" });

      const chrome = join(root, "chrome");
      install(chrome, "Default", "_crx_ponmlkjihgfedcba", "Work Ledger.ico");
      expect(findInstalledApp("Work Ledger", chrome)).toEqual({ profile: "Default", appId: "ponmlkjihgfedcba" });

      expect(findInstalledApp("Work Ledger", join(root, "missing"))).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("default browser", () => {
  it("reads the program out of a registry open command", () => {
    expect(exeFromCommand('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --single-argument %1')).toBe(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    );
    expect(exeFromCommand("%LOCALAPPDATA%\\Browser\\b.exe %1", { LOCALAPPDATA: "C:\\Users\\sam\\AppData\\Local" })).toBe(
      "C:\\Users\\sam\\AppData\\Local\\Browser\\b.exe",
    );
  });

  it("knows where Chromium browsers keep profiles, and treats others as tab-only", () => {
    const env = { LOCALAPPDATA: "L" };
    expect(toBrowser("C:\\x\\chrome.exe", env).userData).toBe(join("L", "Google", "Chrome", "User Data"));
    expect(toBrowser("C:\\x\\MSEDGE.EXE", env).userData).toBe(join("L", "Microsoft", "Edge", "User Data"));
    expect(toBrowser("C:\\x\\firefox.exe", env).userData).toBeNull();
  });
});

describe("launchCommand", () => {
  const url = "http://127.0.0.1:41820";
  const chrome: Browser = { exe: "chrome.exe", userData: "ud" };
  const firefox: Browser = { exe: "firefox.exe", userData: null };
  const base = { url, platform: "win32", installed: null, welcomeDismissed: false };

  it("opens the installed app when there is one", () => {
    expect(launchCommand({ ...base, browser: chrome, installed: { profile: "Default", appId: "abc" } })).toEqual([
      "chrome.exe", "--profile-directory=Default", "--app-id=abc",
    ]);
  });

  it("opens the welcome page in a normal tab on first run", () => {
    expect(launchCommand({ ...base, browser: chrome })).toEqual(["chrome.exe", `${url}/welcome`]);
    expect(launchCommand({ ...base, browser: firefox })).toEqual(["firefox.exe", `${url}/welcome`]);
  });

  it("after 'Not now', uses an app window where the browser supports one", () => {
    expect(launchCommand({ ...base, browser: chrome, welcomeDismissed: true })).toEqual(["chrome.exe", `--app=${url}`]);
    expect(launchCommand({ ...base, browser: firefox, welcomeDismissed: true })).toEqual(["firefox.exe", url]);
  });

  it("falls back to the system's default handler without a known browser", () => {
    expect(launchCommand({ ...base, browser: null })).toEqual(["rundll32", "url.dll,FileProtocolHandler", `${url}/welcome`]);
    expect(launchCommand({ ...base, browser: null, platform: "darwin", welcomeDismissed: true })).toEqual(["open", url]);
  });
});

describe("startOrFind", () => {
  const servers: Server<unknown>[] = [];
  const occupy = (fetch: () => Response) => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch });
    servers.push(server);
    return server.port as number;
  };
  afterEach(() => {
    for (const server of servers.splice(0)) server.stop(true);
  });

  it("skips a port taken by another program", async () => {
    const taken = occupy(() => new Response("someone else"));
    const { url, server } = await startOrFind(taken, () => new Response("ledger"));
    expect(server).not.toBeNull();
    servers.push(server!);
    expect(url).not.toBe(`http://127.0.0.1:${taken}`);
    expect(await (await fetch(url)).text()).toBe("ledger");
  });

  it("finds an already-running copy instead of starting another", async () => {
    const taken = occupy(() => Response.json(HEALTH_BODY));
    expect(await isLedgerRunning(taken)).toBe(true);
    const result = await startOrFind(taken, () => new Response("second copy"));
    expect(result).toEqual({ url: `http://127.0.0.1:${taken}`, server: null });
  });
});
