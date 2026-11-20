import { afterEach, beforeEach, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGoalsView, saveGoalsView } from "../../src/preferences";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prefs-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("remembers the Goals view in its own file, keeping other preferences", () => {
  const path = join(dir, "app", "preferences.json");
  expect(readGoalsView(path)).toBe("reader");
  saveGoalsView(path, "timeline");
  expect(readGoalsView(path)).toBe("timeline");
  writeFileSync(path, JSON.stringify({ other: 1, goalsView: "reader" }));
  saveGoalsView(path, "timeline");
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ other: 1, goalsView: "timeline" });
});

it("falls back to Reader when the file is unreadable, and remembers nothing without a path", () => {
  const path = join(dir, "preferences.json");
  writeFileSync(path, "not json");
  expect(readGoalsView(path)).toBe("reader");
  saveGoalsView(path, "timeline");
  expect(readGoalsView(path)).toBe("timeline");
  saveGoalsView(undefined, "timeline");
  expect(readGoalsView(undefined)).toBe("reader");
});
