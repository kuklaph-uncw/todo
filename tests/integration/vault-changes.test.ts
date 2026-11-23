import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleRequest } from "../../src/server";
import { VaultChanges } from "../../src/vault/changes";
import { vaultRevision } from "../../src/vault/revision";
import { Vault } from "../../src/vault/vault";
import { createTestContext } from "../helpers/test-vault";

let ctx: ReturnType<typeof createTestContext>;
let changes: VaultChanges;

beforeEach(() => {
  ctx = createTestContext();
  changes = new VaultChanges(ctx.vault, ctx.vaultPath);
  ctx.changes = changes;
});

afterEach(() => {
  changes.close();
  ctx.cleanup();
});

const todo = { task: "Call the vendor", priority: null, status: "Open" as const, tags: [], goals: [], notes: "" };

describe("VaultChanges", () => {
  it("answers at once when the page's revision is already out of date", async () => {
    const started = Date.now();
    expect(await changes.next("stale", 5000)).toBe(vaultRevision(ctx.vault));
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("wakes a waiting request soon after the app or an agent saves", async () => {
    const known = vaultRevision(ctx.vault);
    const started = Date.now();
    const waiting = changes.next(known, 5000);
    setTimeout(() => ctx.vault.addTodo(todo, "2026-09-28"), 50);
    const revision = await waiting;
    expect(revision).not.toBe(known);
    expect(revision).toBe(vaultRevision(ctx.vault));
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("notices a goal file written by another program", async () => {
    const known = vaultRevision(ctx.vault);
    const started = Date.now();
    const waiting = changes.next(known, 5000);
    setTimeout(() => {
      mkdirSync(join(ctx.vaultPath, "goals"), { recursive: true });
      writeFileSync(join(ctx.vaultPath, "goals", "written-elsewhere.md"), "---\ntitle: Written elsewhere\n---\n");
    }, 50);
    expect(await waiting).not.toBe(known);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("ignores other files in the folder, such as an editor's settings", async () => {
    const known = vaultRevision(ctx.vault);
    mkdirSync(join(ctx.vaultPath, ".obsidian"), { recursive: true });
    const reads = spyOn(ctx.vault, "peekTodos");
    const writing = setInterval(
      () => writeFileSync(join(ctx.vaultPath, ".obsidian", "workspace.json"), String(Date.now())),
      10,
    );
    try {
      expect(await changes.next(known, 600)).toBe(known);
    } finally {
      clearInterval(writing);
    }
    // Once at the start and once when the wait ends, not once per write.
    expect(reads.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("starts watching a vault folder that didn't exist yet", async () => {
    const later = join(ctx.vaultPath, "later");
    const vault = new Vault(later);
    const lateChanges = new VaultChanges(vault, later);
    try {
      mkdirSync(later);
      const known = vaultRevision(vault);
      const started = Date.now();
      const waiting = lateChanges.next(known, 5000);
      setTimeout(() => vault.addTodo(todo, "2026-09-28"), 50);
      expect(await waiting).not.toBe(known);
      expect(Date.now() - started).toBeLessThan(1500);
    } finally {
      lateChanges.close();
    }
  });

  it("gives up after the wait with the unchanged revision", async () => {
    const known = vaultRevision(ctx.vault);
    expect(await changes.next(known, 100)).toBe(known);
  });

  it("stops waiting when the request goes away", async () => {
    const known = vaultRevision(ctx.vault);
    const gone = new AbortController();
    const started = Date.now();
    const waiting = changes.next(known, 5000, gone.signal);
    setTimeout(() => gone.abort(), 50);
    expect(await waiting).toBe(known);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("GET /todo-version?after=", () => {
  it("holds the request until the vault changes", async () => {
    const known = vaultRevision(ctx.vault);
    const response = handleRequest(
      new Request(`http://127.0.0.1/todo-version?after=${encodeURIComponent(known)}`),
      ctx,
    );
    setTimeout(() => ctx.vault.addTodo(todo, "2026-09-28"), 50);
    const res = await response;
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { revision } = await res.json();
    expect(revision).toBe(vaultRevision(ctx.vault));
    expect(revision).not.toBe(known);
  });

  it("answers at once without after=, as before", async () => {
    const res = await handleRequest(new Request("http://127.0.0.1/todo-version"), ctx);
    expect((await res.json()).revision).toBe(vaultRevision(ctx.vault));
  });
});
