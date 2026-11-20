export const PRIORITIES = ["High", "Medium", "Low"] as const;
export const STATUSES = ["Open", "Done"] as const;
export const GOAL_STATUSES = ["draft", "agreed", "dropped"] as const;
export const GOAL_KINDS = ["goal", "activity"] as const;

export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export type GoalKind = (typeof GOAL_KINDS)[number];

/** Rejects empty and whitespace-only strings. */
export function isNonEmptyText(value: string): boolean {
  return value.trim().length > 0;
}

/** Accepts exactly "High" | "Medium" | "Low" | null. */
export function isValidPriority(value: string | null): value is Priority | null {
  return value === null || (PRIORITIES as readonly string[]).includes(value);
}

/** Accepts exactly "Open" | "Done". */
export function isValidStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isValidGoalStatus(value: string): value is GoalStatus {
  return (GOAL_STATUSES as readonly string[]).includes(value);
}

export function isValidGoalKind(value: string): value is GoalKind {
  return (GOAL_KINDS as readonly string[]).includes(value);
}

/**
 * Parses an optional minutes field. Accepts "", "45", "45m", "45 min",
 * "90 minutes", "1h", "1 hr", "2 hours", "1h30m", "1.5h". Returns null for
 * empty input and undefined for invalid input.
 */
export function parseMinutes(raw: string): number | null | undefined {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(?:minutes|minute|mins|min)\b/g, "m")
    .replace(/(?:hours|hour|hrs|hr)/g, "h");
  if (value === "") return null;
  if (/^\d+m?$/.test(value)) return Number.parseInt(value, 10);
  const match = /^(\d+(?:\.\d+)?)h(?:(\d+)m?)?$/.exec(value);
  if (!match) return undefined;
  return Math.round(Number(match[1]) * 60) + Number(match[2] ?? 0);
}

/** A goal link the app can open: letters and numbers joined by single hyphens. */
export function isGoalSlug(value: string): boolean {
  return /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(value);
}

/** "Improve platform reliability!" -> "improve-platform-reliability" */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/** Only same-origin absolute paths, so a form can't redirect off-site. */
export function safeReturnPath(raw: string | null | undefined, fallback: string): string {
  // Browsers drop tabs and line breaks from URLs, so "/\t/evil" would become "//evil".
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\t\r\n]/.test(raw)) return fallback;
  return raw;
}
