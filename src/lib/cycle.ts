/**
 * Review cycles, named the way Full Cycle Performance names them ("26-27").
 * UNC System SHRA policy (UNCW 08.530) runs a cycle from April 1 to March 31.
 */

/** The month a cycle starts in (1 = January). */
const START_MONTH = 4;

const RANGE = /^(\d{2})-(\d{2})$/;
const twoDigits = (year: number) => String(year % 100).padStart(2, "0");
const label = (startYear: number) => `${twoDigits(startYear)}-${twoDigits(startYear + 1)}`;

/** The cycle a YYYY-MM-DD date falls in, such as "26-27" for November 2026. */
export function cycleOf(date: string): string {
  const year = Number(date.slice(0, 4));
  return label(Number(date.slice(5, 7)) >= START_MONTH ? year : year - 1);
}

/** A bare year, as versions before 1.8 wrote, is the cycle that started that April. Other labels stay. */
export function cycleLabel(text: string): string {
  return /^20\d{2}$/.test(text) ? label(Number(text)) : text;
}

/** "26-27" → "27-28". Null for a label the app doesn't understand, such as "FY26". */
export function nextCycle(cycle: string): string | null {
  const match = RANGE.exec(cycle);
  return match ? `${match[2]}-${twoDigits(Number(match[2]) + 1)}` : null;
}

/**
 * A cycle's twelve months as YYYY-MM, April to March. Any other label shows the
 * months of the cycle `today` is in. Two-digit years are read as 2000 to 2099.
 */
export function cycleMonths(cycle: string, today: string): string[] {
  const match = RANGE.exec(cycle) ?? RANGE.exec(cycleOf(today));
  const startYear = 2000 + Number(match![1]);
  return Array.from({ length: 12 }, (_, i) => {
    const month = START_MONTH - 1 + i;
    return `${startYear + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}`;
  });
}
