import { describe, it, expect } from "bun:test";
import { isNonEmptyText, isValidPriority, isValidStatus } from "../../src/lib/validation";

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

  it("accepts Done", () => {
    expect(isValidStatus("Done")).toBe(true);
  });

  it.each(["In Progress", "Blocked", "Cancelled"])("rejects %s, which todos no longer have", (status) => {
    expect(isValidStatus(status)).toBe(false);
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
