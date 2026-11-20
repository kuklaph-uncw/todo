/**
 * The Goals timeline: one line per goal across the cycle year, with a tick on
 * the day of each piece of linked work. Pure, so it's tested without a page.
 */
import { MONTHS } from "./lib/date";

export interface TimelineMonth {
  /** Linked work in this month, by day of the month. */
  ticks: { day: number; starred: boolean }[];
  /** Later than this month of today. */
  future: boolean;
  /** After the goal was dropped: the line has stopped. */
  off: boolean;
  /** Today's day of the month, in today's month only. */
  nowDay: number | null;
  /** Days in this month, so a day sits at the same place whatever the month's length. */
  days: number;
  /** The day the goal was dropped, in that month only. */
  dropDay: number | null;
}

/** A quiet stretch: `from` is the first month (0 = January). */
export interface TimelineGap {
  from: number;
  span: number;
  label: string;
}

/** Three past months in a row with nothing linked is worth pointing out. */
const GAP_MONTHS = 3;

/** A cycle is usually a year. Any other label shows this year. */
export function cycleYear(cycle: string, today: string): number {
  return /^\d{4}$/.test(cycle) ? Number(cycle) : Number(today.slice(0, 4));
}

export function goalTimeline(opts: {
  year: number;
  today: string;
  items: { date: string; isHighlight: boolean }[];
  droppedOn: string | null;
}): { months: TimelineMonth[]; gaps: TimelineGap[] } {
  const { year, today, droppedOn } = opts;
  const thisMonth = today.slice(0, 7);
  const items = opts.items.filter((item) => droppedOn === null || item.date <= droppedOn);

  const months = MONTHS.map((_name, index): TimelineMonth => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return {
      ticks: items
        .filter((item) => item.date.startsWith(month))
        .map((item) => ({ day: Number(item.date.slice(8, 10)), starred: item.isHighlight }))
        .sort((a, b) => a.day - b.day),
      future: month > thisMonth,
      off: droppedOn !== null && `${month}-01` > droppedOn,
      nowDay: month === thisMonth ? Number(today.slice(8, 10)) : null,
      dropDay: droppedOn?.startsWith(month) ? Number(droppedOn.slice(8, 10)) : null,
      // Day 0 of the next month is the last day of this one.
      days: new Date(year, index + 1, 0).getDate(),
    };
  });

  // Quiet months only count once work has been linked: a goal written in
  // September shouldn't be flagged for January to August.
  const firstLinked = months.findIndex((month) => month.ticks.length > 0);
  const gaps: TimelineGap[] = [];
  let run = 0;
  months.forEach((month, index) => {
    const quiet =
      firstLinked !== -1 &&
      index > firstLinked &&
      !month.future &&
      month.nowDay === null &&
      !month.off &&
      month.ticks.length === 0;
    if (quiet) run++;
    const ends = !quiet || index === months.length - 1;
    if (ends && run >= GAP_MONTHS) {
      const from = (quiet ? index + 1 : index) - run;
      gaps.push({ from, span: run, label: `Nothing linked ${MONTHS[from]} to ${MONTHS[from + run - 1]}` });
    }
    if (!quiet) run = 0;
  });
  return { months, gaps };
}

/** Where the middle of `day` sits across a month of `days`, as a percentage. */
export function dayPosition(day: number, days: number): number {
  return ((day - 0.5) / days) * 100;
}
