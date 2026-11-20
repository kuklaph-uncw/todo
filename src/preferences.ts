/**
 * Small app preferences, like the Goals view. They belong to this computer's
 * app data, not the Markdown vault, so they're kept in a JSON file whose path
 * the caller chooses (see AppContext.preferencesPath). Without a path nothing
 * is remembered.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type GoalsView = "reader" | "timeline";

function read(path: string): Record<string, unknown> {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function readGoalsView(path: string | undefined): GoalsView {
  return path && read(path).goalsView === "timeline" ? "timeline" : "reader";
}

export function saveGoalsView(path: string | undefined, view: GoalsView): void {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify({ ...read(path), goalsView: view })}\n`, "utf8");
  renameSync(`${path}.tmp`, path);
}
