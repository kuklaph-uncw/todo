import { cycleLabel } from "./cycle";

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

/** The first `length` characters, counting a letter outside the BMP as one, never half of a surrogate pair. */
export function firstCharacters(text: string, length: number): string {
  return Array.from(text).slice(0, Math.max(0, length)).join("");
}

/**
 * Slugs no goal may have: "carry" is the POST /goals/carry route, and Windows
 * treats con, prn, aux, nul, com1-9 and lpt1-9 as devices even with an extension.
 */
export function isReservedSlug(slug: string): boolean {
  return /^(?:carry|con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug);
}

/**
 * A cycle as stored: control characters (tabs, line breaks, C1 controls, line and
 * paragraph separators) become spaces, and the ends are trimmed. Other spacing is
 * kept, so a hand-written cycle like "FY  2027" stays the same cycle. A bare
 * year is the cycle that started that April ("2026" → "26-27").
 */
export function cleanCycle(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
  return cycleLabel(text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").trim());
}

/** "Improve platform reliability!" -> "improve-platform-reliability" */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return firstCharacters(slug, 48).replace(/-+$/, "");
}

/** Only same-origin absolute paths, so a form can't redirect off-site. */
export function safeReturnPath(raw: string | null | undefined, fallback: string): string {
  // Browsers drop tabs and line breaks from URLs, so "/\t/evil" would become "//evil".
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\t\r\n]/.test(raw)) return fallback;
  return raw;
}
