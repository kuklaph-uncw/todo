/**
 * The Goals timeline: one line per goal across the review cycle (April to
 * March), with a tick on the day of each piece of linked work. Pure, so it's
 * tested without a page.
 */
import { MONTHS } from "./lib/date";

export interface TimelineMonth {
  /** The month's full name, such as "April". */
  name: string;
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

/** A quiet stretch: `from` is its first month's position in the cycle (0 = the cycle's first month). */
export interface TimelineGap {
  from: number;
  span: number;
  label: string;
}

/** Three past months in a row with nothing linked is worth pointing out. */
const GAP_MONTHS = 3;

/** `months` are the cycle's months as YYYY-MM (see cycleMonths). */
export function goalTimeline(opts: {
  months: string[];
  today: string;
  items: { date: string; isHighlight: boolean }[];
  droppedOn: string | null;
}): { months: TimelineMonth[]; gaps: TimelineGap[] } {
  const { today, droppedOn } = opts;
  const thisMonth = today.slice(0, 7);
  const items = opts.items.filter((item) => droppedOn === null || item.date <= droppedOn);

  const months = opts.months.map((month): TimelineMonth => {
    const [year, number] = month.split("-").map(Number);
    return {
      name: MONTHS[number - 1],
      ticks: items
        .filter((item) => item.date.startsWith(month))
        .map((item) => ({ day: Number(item.date.slice(8, 10)), starred: item.isHighlight }))
        .sort((a, b) => a.day - b.day),
      future: month > thisMonth,
      off: droppedOn !== null && `${month}-01` > droppedOn,
      nowDay: month === thisMonth ? Number(today.slice(8, 10)) : null,
      dropDay: droppedOn?.startsWith(month) ? Number(droppedOn.slice(8, 10)) : null,
      // Day 0 of the next month is the last day of this one.
      days: new Date(year, number, 0).getDate(),
    };
  });

  // Quiet months only count once work has been linked: a goal written in
  // September shouldn't be flagged for April to August.
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
      gaps.push({ from, span: run, label: `Nothing linked ${months[from].name} to ${months[from + run - 1].name}` });
    }
    if (!quiet) run = 0;
  });
  return { months, gaps };
}

/** Where the middle of `day` sits across a month of `days`, as a percentage. */
export function dayPosition(day: number, days: number): number {
  return ((day - 0.5) / days) * 100;
}
