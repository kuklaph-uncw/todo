import { describe, expect, it } from "bun:test";
import { cycleLabel, cycleMonths, cycleOf, nextCycle } from "../../src/lib/cycle";

// UNC SHRA policy 08.530: the performance cycle runs April 1 to March 31.
describe("review cycles", () => {
  it("names the cycle a date falls in, changing over on April 1", () => {
    expect(cycleOf("2026-11-23")).toBe("26-27");
    expect(cycleOf("2026-04-01")).toBe("26-27");
    expect(cycleOf("2027-03-31")).toBe("26-27");
    expect(cycleOf("2026-03-31")).toBe("25-26");
    expect(cycleOf("2099-12-31")).toBe("99-00");
  });

  it("reads a bare year, as older versions wrote, as the cycle starting that April", () => {
    expect(cycleLabel("2026")).toBe("26-27");
    expect(cycleLabel("2025")).toBe("25-26");
    expect(cycleLabel("26-27")).toBe("26-27");
    expect(cycleLabel("FY26")).toBe("FY26");
    expect(cycleLabel("")).toBe("");
  });

  it("follows a cycle with the next one", () => {
    expect(nextCycle("26-27")).toBe("27-28");
    expect(nextCycle("99-00")).toBe("00-01");
    expect(nextCycle("FY26")).toBeNull();
  });

  it("lists a cycle's months from April to March", () => {
    const months = cycleMonths("26-27", "2026-11-23");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-04");
    expect(months[8]).toBe("2026-12");
    expect(months[9]).toBe("2027-01");
    expect(months[11]).toBe("2027-03");
  });

  it("shows the current cycle's months for a label it doesn't understand", () => {
    expect(cycleMonths("FY26", "2027-02-10")[0]).toBe("2026-04");
  });
});
