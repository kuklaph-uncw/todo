import { describe, it, expect } from "bun:test";
import {
  parseTags,
  isNonEmptyText,
  isValidPriority,
  isValidStatus,
} from "../../src/lib/validation";

describe("parseTags", () => {
  it("trims, strips leading #, lowercases, and dedupes", () => {
    expect(parseTags("Support, #Testing, support,  ")).toEqual(["support", "testing"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseTags("")).toEqual([]);
  });

  it("returns empty array for whitespace-and-comma-only input", () => {
    expect(parseTags("  ,  ,")).toEqual([]);
  });

  it("drops empty tokens between commas", () => {
    expect(parseTags("work,,personal")).toEqual(["work", "personal"]);
  });

  it("strips multiple leading # characters is not required but single # stripped", () => {
    expect(parseTags("#urgent")).toEqual(["urgent"]);
  });
});

describe("isNonEmptyText", () => {
  it("rejects whitespace-only strings", () => {
    expect(isNonEmptyText("   ")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isNonEmptyText("")).toBe(false);
  });

  it("accepts valid trimmable text", () => {
    expect(isNonEmptyText("  hello  ")).toBe(true);
  });
});

describe("isValidPriority", () => {
  it("accepts High", () => {
    expect(isValidPriority("High")).toBe(true);
  });

  it("accepts Medium", () => {
    expect(isValidPriority("Medium")).toBe(true);
  });

  it("accepts Low", () => {
    expect(isValidPriority("Low")).toBe(true);
  });

  it("accepts null", () => {
    expect(isValidPriority(null)).toBe(true);
  });

  it("rejects an invalid value", () => {
    expect(isValidPriority("Urgent")).toBe(false);
  });

  it("rejects a lowercase variant", () => {
    expect(isValidPriority("high")).toBe(false);
  });
});

describe("isValidStatus", () => {
  it("accepts Open", () => {
    expect(isValidStatus("Open")).toBe(true);
  });

  it("accepts In Progress", () => {
    expect(isValidStatus("In Progress")).toBe(true);
  });

  it("accepts Blocked", () => {
    expect(isValidStatus("Blocked")).toBe(true);
  });

  it("accepts Done", () => {
    expect(isValidStatus("Done")).toBe(true);
  });

  it("accepts Cancelled", () => {
    expect(isValidStatus("Cancelled")).toBe(true);
  });

  it("rejects an invalid value", () => {
    expect(isValidStatus("Unknown")).toBe(false);
  });

  it("rejects a lowercase variant", () => {
    expect(isValidStatus("open")).toBe(false);
  });
});

import { parseMinutes, safeReturnPath, slugify } from "../../src/lib/validation";

describe("parseMinutes", () => {
  it("accepts minutes and hour forms", () => {
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes("45")).toBe(45);
    expect(parseMinutes("45m")).toBe(45);
    expect(parseMinutes("1h")).toBe(60);
    expect(parseMinutes("1h 30m")).toBe(90);
    expect(parseMinutes("1.5h")).toBe(90);
  });

  it("accepts words people actually type", () => {
    expect(parseMinutes("45 min")).toBe(45);
    expect(parseMinutes("90 minutes")).toBe(90);
    expect(parseMinutes("1hr")).toBe(60);
    expect(parseMinutes("2 hours")).toBe(120);
    expect(parseMinutes("1 hr 30 mins")).toBe(90);
  });

  it("returns undefined for input it can't read", () => {
    expect(parseMinutes("soon")).toBeUndefined();
    expect(parseMinutes("-5")).toBeUndefined();
  });
});

describe("slugify", () => {
  it("makes short, link-safe slugs", () => {
    expect(slugify("Improve platform reliability!")).toBe("improve-platform-reliability");
    expect(slugify("  ---  ")).toBe("");
    expect(slugify("Résumé refresh")).toBe("resume-refresh");
  });
});

describe("safeReturnPath", () => {
  it("only allows same-origin paths", () => {
    expect(safeReturnPath("/todos?tag=bug", "/")).toBe("/todos?tag=bug");
    expect(safeReturnPath("//evil.example", "/")).toBe("/");
    expect(safeReturnPath("https://evil.example", "/")).toBe("/");
    expect(safeReturnPath("/\\evil.example", "/")).toBe("/");
  });
});
