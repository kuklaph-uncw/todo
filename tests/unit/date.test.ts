import { describe, it, expect } from "bun:test";
import { localDateString, nowUtcIso, isValidDateString, addDays } from "../../src/lib/date";

describe("localDateString", () => {
  it("returns YYYY-MM-DD for a fixed local date", () => {
    const date = new Date(2026, 6, 1); // July 1, 2026 (month is 0-indexed)
    expect(localDateString(date)).toBe("2026-07-01");
  });

  it("zero-pads single-digit month and day", () => {
    const date = new Date(2026, 0, 5); // January 5, 2026
    expect(localDateString(date)).toBe("2026-01-05");
  });

  it("defaults to current date when called with no argument", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(localDateString()).toBe(expected);
  });
});

describe("nowUtcIso", () => {
  it("returns a string ending in Z that Date.parse accepts", () => {
    const result = nowUtcIso();
    expect(result.endsWith("Z")).toBe(true);
    expect(Number.isNaN(Date.parse(result))).toBe(false);
  });
});

describe("isValidDateString", () => {
  it("accepts a valid date string", () => {
    expect(isValidDateString("2026-01-08")).toBe(true);
  });

  it("rejects an impossible calendar date", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
  });

  it("rejects a wrong-order date format", () => {
    expect(isValidDateString("01-08-2026")).toBe(false);
  });

  it("rejects a slash-separated date format", () => {
    expect(isValidDateString("2026/01/08")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidDateString("")).toBe(false);
  });

  it("rejects a non-string input", () => {
    // @ts-expect-error deliberately passing wrong type to verify runtime guard
    expect(isValidDateString(20260108)).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses a year boundary going backward", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("crosses a month boundary going forward", () => {
    expect(addDays("2026-01-15", 20)).toBe("2026-02-04");
  });

  it("is a no-op when delta is 0", () => {
    expect(addDays("2026-07-01", 0)).toBe("2026-07-01");
  });
});

import { formatMinutes, presetRange, startOfWeek } from "../../src/lib/date";

describe("startOfWeek", () => {
  it("returns the Monday of the week, crossing a month boundary", () => {
    expect(startOfWeek("2026-10-01")).toBe("2026-09-28"); // Thursday
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21"); // Sunday
  });
});

describe("presetRange", () => {
  const today = "2026-09-28";
  it("computes each preset ending today", () => {
    expect(presetRange("week", today)).toEqual({ from: "2026-09-28", to: today });
    expect(presetRange("month", today)).toEqual({ from: "2026-09-01", to: today });
    expect(presetRange("quarter", today)).toEqual({ from: "2026-07-01", to: today });
    expect(presetRange("6m", today)).toEqual({ from: "2026-03-29", to: today });
    expect(presetRange("ytd", today)).toEqual({ from: "2026-01-01", to: today });
    expect(presetRange("year", today)).toEqual({ from: "2025-09-29", to: today });
    expect(presetRange("lastQuarter", today)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(presetRange("lastYear", today)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("finds last quarter across a year boundary", () => {
    expect(presetRange("lastQuarter", "2026-02-10")).toEqual({ from: "2025-10-01", to: "2025-12-31" });
  });
});

describe("formatMinutes", () => {
  it("formats minutes as hours and minutes", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(90)).toBe("1h 30m");
  });
});
