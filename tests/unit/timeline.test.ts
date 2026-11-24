import { describe, expect, it } from "bun:test";
import { cycleMonths } from "../../src/lib/cycle";
import { dayPosition, goalTimeline } from "../../src/timeline";

const item = (date: string, isHighlight = false) => ({ date, isHighlight });
const months = (cycle: string, today = "2026-10-07") => cycleMonths(cycle, today);

describe("goal timeline", () => {
  it("runs April to March, placing linked work on its day, starred apart, and only in the cycle", () => {
    const { months: shown } = goalTimeline({
      months: months("26-27"),
      today: "2026-10-07",
      items: [item("2026-04-16", true), item("2026-04-07"), item("2027-01-14"), item("2026-03-31"), item("2027-04-01")],
      droppedOn: null,
    });
    expect(shown.map((month) => month.name.slice(0, 3))).toEqual([
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
      "Jan",
      "Feb",
      "Mar",
    ]);
    expect(shown[0].ticks).toEqual([
      { day: 7, starred: false },
      { day: 16, starred: true },
    ]);
    expect(shown[9].ticks).toEqual([{ day: 14, starred: false }]);
    expect(shown.flatMap((month) => month.ticks)).toHaveLength(3);
  });

  it("marks today and the months still ahead", () => {
    const shown = goalTimeline({ months: months("26-27"), today: "2026-10-07", items: [], droppedOn: null }).months;
    expect(shown.map((month) => month.nowDay)).toEqual([null, null, null, null, null, null, 7, ...Array(5).fill(null)]);
    expect(shown.map((month) => month.future)).toEqual([...Array(7).fill(false), ...Array(5).fill(true)]);

    const past = goalTimeline({ months: months("25-26"), today: "2026-10-07", items: [], droppedOn: null }).months;
    expect(past.some((month) => month.future || month.nowDay)).toBe(false);
    const ahead = goalTimeline({ months: months("27-28"), today: "2026-10-07", items: [], droppedOn: null }).months;
    expect(ahead.every((month) => month.future && !month.nowDay)).toBe(true);
  });

  it("names runs of three or more past months with nothing linked, across the new year", () => {
    const linked = [item("2026-04-10"), item("2026-05-06"), item("2027-02-11")];
    expect(goalTimeline({ months: months("26-27"), today: "2027-03-10", items: linked, droppedOn: null }).gaps).toEqual(
      [{ from: 2, span: 8, label: "Nothing linked June to January" }],
    );
    // Two quiet months is not a gap, and the current month never counts.
    const short = [item("2026-04-10"), item("2026-07-02")];
    expect(goalTimeline({ months: months("26-27"), today: "2026-09-07", items: short, droppedOn: null }).gaps).toEqual(
      [],
    );
    expect(goalTimeline({ months: months("27-28"), today: "2026-10-07", items: [], droppedOn: null }).gaps).toEqual([]);
  });

  it("only counts quiet months after the first linked work", () => {
    const late = [item("2026-09-05")];
    expect(goalTimeline({ months: months("26-27"), today: "2026-11-20", items: late, droppedOn: null }).gaps).toEqual(
      [],
    );
    const past = [item("2025-05-10")];
    expect(goalTimeline({ months: months("25-26"), today: "2026-10-07", items: past, droppedOn: null }).gaps).toEqual([
      { from: 2, span: 10, label: "Nothing linked June to March" },
    ]);
  });

  it("stops a dropped goal's line at the drop date", () => {
    const { months: shown, gaps } = goalTimeline({
      months: months("26-27"),
      today: "2026-12-07",
      items: [item("2026-04-16"), item("2026-08-10"), item("2026-08-20"), item("2026-10-01")],
      droppedOn: "2026-08-12",
    });
    expect(shown[4]).toMatchObject({ dropDay: 12, off: false, ticks: [{ day: 10, starred: false }] });
    expect(shown.slice(5).every((month) => month.off && month.ticks.length === 0)).toBe(true);
    // May to July is quiet; nothing after the drop is called a gap.
    expect(gaps).toEqual([{ from: 1, span: 3, label: "Nothing linked May to July" }]);
  });

  it("uses each month's real length, leap years included", () => {
    const days = (cycle: string) =>
      goalTimeline({ months: months(cycle), today: "2026-10-07", items: [], droppedOn: null }).months.map(
        (month) => month.days,
      );
    expect(days("26-27")).toEqual([30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31]);
    expect(days("27-28")[10]).toBe(29);
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
