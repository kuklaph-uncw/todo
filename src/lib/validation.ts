export const PRIORITIES = ["High", "Medium", "Low"] as const;
export const STATUSES = ["Open", "In Progress", "Blocked", "Done", "Cancelled"] as const;
export const GOAL_STATUSES = ["active", "achieved", "dropped"] as const;

export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/**
 * Splits comma- or space-separated tag input, trimming whitespace, stripping
 * leading "#", lowercasing, dropping empty tokens, and removing duplicates.
 */
export function parseTags(raw: string): string[] {
  const tokens = raw
    .split(/[,\s]+/)
    .map((token) => token.trim().replace(/^#+/, "").toLowerCase())
    .filter((token) => token.length > 0);

  return [...new Set(tokens)];
}

/** Rejects empty and whitespace-only strings. */
export function isNonEmptyText(value: string): boolean {
  return value.trim().length > 0;
}

/** Accepts exactly "High" | "Medium" | "Low" | null. */
export function isValidPriority(value: string | null): value is Priority | null {
  return value === null || (PRIORITIES as readonly string[]).includes(value);
}

/** Accepts exactly "Open" | "In Progress" | "Blocked" | "Done" | "Cancelled". */
export function isValidStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isValidGoalStatus(value: string): value is GoalStatus {
  return (GOAL_STATUSES as readonly string[]).includes(value);
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
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
