import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { logErrorsTo, resolveVaultPath } from "../../src/launch";

describe("resolveVaultPath", () => {
  const base = { home: "/home/sam", cwd: "/work/app" };

  it("uses VAULT_PATH when set, relative to where the app was started", () => {
    expect(resolveVaultPath({ ...base, envPath: "notes", standalone: true })).toBe(resolve("/work/app", "notes"));
  });

  it("keeps notes in the user's home folder for the installed app", () => {
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

  it("never throws when the log can't be written", () => {
    const dir = mkdtempSync(join(tmpdir(), "log-test-"));
    const original = console.error;
    try {
      // A file where the .workledger folder should be makes the folder impossible to create.
      writeFileSync(join(dir, ".workledger"), "");
      logErrorsTo(join(dir, ".workledger", "error.log"));
      expect(() => console.error("lost")).not.toThrow();
    } finally {
      console.error = original;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
