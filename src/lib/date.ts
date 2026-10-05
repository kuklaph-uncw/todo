/**
 * Local calendar date as YYYY-MM-DD, zero-padded.
 * Uses local getters (never toISOString) to avoid UTC day-shift near midnight.
 */
export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** UTC ISO timestamp, for audit metadata. */
export function nowUtcIso(): string {
  return new Date().toISOString();
}

/** Local wall-clock time as HH:MM. */
export function localTimeString(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Parses YYYY-MM-DD into a local Date (never via `new Date(str)`, which is UTC). */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Adds (or subtracts, for a negative delta) days to a YYYY-MM-DD string,
 * correctly crossing month/year boundaries. Uses local-date arithmetic
 * (never toISOString) to avoid UTC day-shift near midnight.
 */
export function addDays(dateStr: string, delta: number): string {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + delta);
  return localDateString(date);
}

/**
 * Validates a YYYY-MM-DD string, rejecting malformed formats and
 * impossible calendar dates (e.g. 2026-02-30) by round-tripping through Date.
 */
export function isValidDateString(value: string): boolean {
  if (typeof value !== "string") return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

/** Monday of the week containing dateStr. */
export function startOfWeek(dateStr: string): string {
  const offset = (parseLocalDate(dateStr).getDay() + 6) % 7;
  return addDays(dateStr, -offset);
}

export type RangePreset = "week" | "month" | "quarter" | "lastQuarter" | "ytd" | "lastYear" | "6m" | "year";

/** "Last quarter" and "Last year" are what people reach for right after a review period closes. */
export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "lastQuarter", label: "Last quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "lastYear", label: "Last year" },
  { key: "6m", label: "Last 6 months" },
  { key: "year", label: "Last 12 months" },
];

/** Inclusive date range for a named preset, relative to `today`. */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  const [year, month] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");

  switch (preset) {
    case "week":
      return { from: startOfWeek(today), to: today };
    case "month":
      return { from: `${year}-${pad(month)}-01`, to: today };
    case "quarter": {
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return { from: `${year}-${pad(quarterStartMonth)}-01`, to: today };
    }
    case "lastQuarter": {
      const thisQuarterStart = `${year}-${pad(Math.floor((month - 1) / 3) * 3 + 1)}-01`;
      const to = addDays(thisQuarterStart, -1);
      const [y, m] = to.split("-").map(Number);
      return { from: `${y}-${pad(m - 2)}-01`, to };
    }
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case "6m": {
      const date = parseLocalDate(today);
      date.setMonth(date.getMonth() - 6);
      return { from: addDays(localDateString(date), 1), to: today };
    }
    case "ytd":
      return { from: `${year}-01-01`, to: today };
    case "year":
      return { from: addDays(`${year - 1}${today.slice(4)}`, 1), to: today };
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Monday" */
export function weekdayName(dateStr: string): string {
  return WEEKDAYS[parseLocalDate(dateStr).getDay()];
}

/** "September 28" */
export function monthDay(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/** "Sep 28" */
export function shortMonthDay(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${MONTHS[month - 1].slice(0, 3)} ${day}`;
}

/** "September 2026" from YYYY-MM or YYYY-MM-DD. */
export function monthYear(dateStr: string): string {
  const [year, month] = dateStr.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

/** 90 -> "1h 30m", 45 -> "45m", 0 -> "0m". */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
