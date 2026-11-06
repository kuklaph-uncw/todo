/** Real Electron smoke check, using a disposable appData folder and Markdown vault. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { _electron, type ElectronApplication } from "playwright";

const repo = resolve(import.meta.dir, "..");
const temporaryRoot = resolve(tmpdir());
const root = mkdtempSync(join(temporaryRoot, "todo-mcp-check-"));
const fixture = join(root, "app");
const appData = join(root, "profile");
mkdirSync(join(fixture, "public"), { recursive: true });
mkdirSync(appData, { recursive: true });
copyFileSync(join(repo, "public", "favicon.ico"), join(fixture, "public", "favicon.ico"));
writeFileSync(join(fixture, "package.json"), JSON.stringify({ name: "todo-mcp-check", main: "main.cjs" }));
writeFileSync(
  join(fixture, "main.cjs"),
  `const { app } = require("electron");\napp.setPath("appData", ${JSON.stringify(appData)});\nimport(${JSON.stringify(pathToFileURL(join(repo, "out", "main.js")).href)});\n`,
);
const executable = createRequire(import.meta.url)("electron") as string;
const environment: Record<string, string> = { ...process.env, VAULT_PATH: join(root, "vault") };
mkdirSync(join(root, "vault", "goals"), { recursive: true });
writeFileSync(
  join(root, "vault", "goals", "delivery.md"),
  "---\ntitle: Delivery\ncycle: 2026\nstatus: active\n---\n\nShip carefully.\n",
);
// Electron's launcher must run as an app, even if the invoking editor sets this variable.
delete environment.ELECTRON_RUN_AS_NODE;
let desktop: ElectronApplication | null = null;
let secondInstance: ReturnType<typeof spawn> | null = null;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

async function launch() {
  desktop = await _electron.launch({ executablePath: executable, args: [fixture], env: environment });
  const page = await desktop.firstWindow();
  page.setDefaultTimeout(10000);
  await page.getByRole("link", { name: /^Settings/ }).click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  return page;
}

try {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/mcp`;
  let page = await launch();
  assert.equal(await page.getByLabel("Enable agent access", { exact: true }).isChecked(), false);
  await page.getByRole("button", { name: "Generate access token", exact: true }).click();
  const token = await page.getByLabel("New access token", { exact: true }).inputValue();
  assert.equal(token.length, 64);
  await page.getByLabel("Enable agent access", { exact: true }).check();
  await page.getByLabel("Keep MCP running when the window is closed").check();
  await page.getByLabel("Port", { exact: true }).fill(String(port));
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.getByText("Running. Agents with your token can connect.", { exact: true }).waitFor();

  await desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  assert.equal(await desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()), false);
  const client = new Client({ name: "desktop-smoke", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const added = await client.callTool({
      name: "add_todo",
      arguments: { task: "Created while window closed", requestId: "background-create" },
    });
    assert(!added.isError, "MCP must accept writes while the window is hidden");
    const goals = await client.callTool({ name: "list_goals", arguments: {} });
    assert(!goals.isError);
    assert.equal((goals.structuredContent as { goals: { slug: string }[] }).goals[0]?.slug, "delivery");
    const entry = await client.callTool({
      name: "add_entry",
      arguments: {
        text: "Ledger entry while hidden #mcp [[delivery]]",
        minutes: 45,
        isHighlight: true,
        requestId: "background-ledger-create",
      },
    });
    assert(!entry.isError, "MCP must accept ledger writes while hidden");
    const saved = entry.structuredContent as { id: string; date: string; revision: string };
    const changed = await client.callTool({
      name: "update_entry",
      arguments: {
        id: saved.id,
        date: saved.date,
        expectedRevision: saved.revision,
        minutes: 90,
        requestId: "background-ledger-edit",
      },
    });
    assert(!changed.isError);
    assert.deepEqual((changed.structuredContent as { goals: string[] }).goals, ["delivery"]);
    assert.equal((changed.structuredContent as { minutes: number }).minutes, 90);
  } finally {
    await client.close();
  }

  secondInstance = spawn(executable, [fixture], { env: environment, windowsHide: true, stdio: "ignore" });
  const secondExited = new Promise<void>((done, reject) => {
    const timeout = setTimeout(() => {
      secondInstance?.kill();
      reject(new Error("Second app launch did not exit."));
    }, 10000);
    secondInstance!.once("exit", () => {
      clearTimeout(timeout);
      done();
    });
    secondInstance!.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  await page.waitForFunction(() => document.visibilityState === "visible");
  await secondExited;
  secondInstance = null;
  await page.locator('nav[aria-label="Main"] a[href="/"]').click();
  await page.locator(".entry-text").filter({ hasText: "Ledger entry while hidden" }).waitFor();
  await page.getByRole("link", { name: /^Settings/ }).click();
  await page.getByLabel("Keep MCP running when the window is closed").uncheck();
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.getByText("Settings saved.", { exact: true }).waitFor();
  const closed = desktop!.waitForEvent("close");
  await desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close()).catch(() => {});
  await closed;
  desktop = null;
  await assert.rejects(fetch(url, { signal: AbortSignal.timeout(2000) }));

  page = await launch();
  assert.equal(await page.getByLabel("Enable agent access", { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel("Keep MCP running when the window is closed").isChecked(), false);
  await page.getByLabel("Keep MCP running when the window is closed").check();
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.getByText("Settings saved.", { exact: true }).waitFor();
  await desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  // app.quit is also the tray Quit command's exit action, rather than closing the hidden window.
  await desktop!.close();
  desktop = null;
  await assert.rejects(fetch(url, { signal: AbortSignal.timeout(2000) }));
  console.log(
    "Verified Electron: settings persist; todo and ledger MCP writes while hidden; ledger metadata and goal lookup; second launch restores the written entry; close without background and explicit quit stop MCP.",
  );
} finally {
  secondInstance?.kill();
  await closeRemainingDesktop();
  const resolvedRoot = resolve(root);
  if (
    resolvedRoot.startsWith(`${temporaryRoot}\\todo-mcp-check-`) ||
    resolvedRoot.startsWith(`${temporaryRoot}/todo-mcp-check-`)
  ) {
    rmSync(resolvedRoot, { recursive: true, force: true });
  } else {
    console.error("Refusing to clean up an unexpected directory.");
    process.exitCode = 1;
  }
}

async function closeRemainingDesktop(): Promise<void> {
  await desktop?.close();
}
