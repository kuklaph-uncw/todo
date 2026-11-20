import { describe, expect, it } from "bun:test";
import { cycleYear, dayPosition, goalTimeline } from "../../src/timeline";

const item = (date: string, isHighlight = false) => ({ date, isHighlight });

describe("goal timeline", () => {
  it("reads the cycle as a year, else uses this year", () => {
    expect(cycleYear("2025", "2026-10-07")).toBe(2025);
    expect(cycleYear("FY26", "2026-10-07")).toBe(2026);
  });

  it("places linked work on its day, starred apart, and only in the cycle year", () => {
    const { months } = goalTimeline({
      year: 2026,
      today: "2026-10-07",
      items: [item("2026-01-14"), item("2026-04-16", true), item("2026-04-07"), item("2025-12-31")],
      droppedOn: null,
    });
    expect(months[0].ticks).toEqual([{ day: 14, starred: false }]);
    expect(months[3].ticks).toEqual([
      { day: 7, starred: false },
      { day: 16, starred: true },
    ]);
    expect(months.flatMap((month) => month.ticks)).toHaveLength(3);
  });

  it("marks today and the months still ahead", () => {
    const { months } = goalTimeline({ year: 2026, today: "2026-10-07", items: [], droppedOn: null });
    expect(months.map((month) => month.nowDay)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      7,
      null,
      null,
    ]);
    expect(months.map((month) => month.future)).toEqual([...Array(10).fill(false), true, true]);

    const past = goalTimeline({ year: 2025, today: "2026-10-07", items: [], droppedOn: null }).months;
    expect(past.some((month) => month.future || month.nowDay)).toBe(false);
    const ahead = goalTimeline({ year: 2027, today: "2026-10-07", items: [], droppedOn: null }).months;
    expect(ahead.every((month) => month.future && !month.nowDay)).toBe(true);
  });

  it("names runs of three or more past months with nothing linked", () => {
    const linked = ["01-21", "02-17", "03-04", "04-10", "05-06", "09-11", "10-02"].map((d) => item(`2026-${d}`));
    expect(goalTimeline({ year: 2026, today: "2026-10-07", items: linked, droppedOn: null }).gaps).toEqual([
      { from: 5, span: 3, label: "Nothing linked June to August" },
    ]);
    // Two quiet months is not a gap, and the current month never counts.
    const short = linked.filter((i) => !i.date.startsWith("2026-05") && !i.date.startsWith("2026-09"));
    expect(goalTimeline({ year: 2026, today: "2026-10-07", items: short, droppedOn: null }).gaps).toEqual([
      { from: 4, span: 5, label: "Nothing linked May to September" },
    ]);
    expect(goalTimeline({ year: 2026, today: "2026-03-07", items: [], droppedOn: null }).gaps).toEqual([]);
    expect(goalTimeline({ year: 2027, today: "2026-10-07", items: [], droppedOn: null }).gaps).toEqual([]);
    expect(goalTimeline({ year: 2025, today: "2026-10-07", items: [], droppedOn: null }).gaps).toEqual([]);
  });

  it("only counts quiet months after the first linked work", () => {
    const late = [item("2026-09-05")];
    expect(goalTimeline({ year: 2026, today: "2026-11-20", items: late, droppedOn: null }).gaps).toEqual([]);
    const past = [item("2025-02-10")];
    expect(goalTimeline({ year: 2025, today: "2026-10-07", items: past, droppedOn: null }).gaps).toEqual([
      { from: 2, span: 10, label: "Nothing linked March to December" },
    ]);
  });

  it("stops a dropped goal's line at the drop date", () => {
    const { months, gaps } = goalTimeline({
      year: 2026,
      today: "2026-10-07",
      items: [item("2026-01-16"), item("2026-05-10"), item("2026-05-20"), item("2026-08-01")],
      droppedOn: "2026-05-12",
    });
    expect(months[4]).toMatchObject({ dropDay: 12, off: false, ticks: [{ day: 10, starred: false }] });
    expect(months.slice(5).every((month) => month.off && month.ticks.length === 0)).toBe(true);
    // Feb to Apr is quiet; nothing after the drop is called a gap.
    expect(gaps).toEqual([{ from: 1, span: 3, label: "Nothing linked February to April" }]);
  });

  it("uses each month's real length, leap years included", () => {
    const days = (year: number) =>
      goalTimeline({ year, today: "2026-10-07", items: [], droppedOn: null }).months.map((month) => month.days);
    expect(days(2026)).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(days(2028)[1]).toBe(29);
  });

  it("places the last day of any month at its end and day 1 at its start", () => {
    for (const [day, days] of [
      [28, 28],
      [29, 29],
      [30, 30],
      [31, 31],
    ]) {
      expect(dayPosition(day, days)).toBeGreaterThan(97);
      expect(dayPosition(day, days)).toBeLessThan(100);
    }
    expect(dayPosition(1, 28)).toBeGreaterThan(0);
    expect(dayPosition(1, 28)).toBeLessThan(2);
    // Mid-month sits mid-cell whatever the month's length.
    expect(dayPosition(15, 30)).toBeCloseTo(48.33, 1);
  });
});
