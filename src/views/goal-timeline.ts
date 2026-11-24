import { escapeHtml } from "../lib/html";
import { shortMonthDay } from "../lib/date";
import { dayPosition, goalTimeline, type TimelineMonth } from "../timeline";
import type { Goal } from "../vault/format";
import { icon } from "./components";

/**
 * Rows of the Goals timeline: a label column, Jan to Dec, and a tally. Ticks
 * are drawn in SVG because the page's content security policy blocks inline
 * styles; SVG positions come from attributes, as percentages of the month.
 */

/** Where day `day` sits across its month, as a percentage. */
function dayX(day: number, month: TimelineMonth): string {
  return `${dayPosition(day, month.days).toFixed(2)}%`;
}

/** Today's line sits at the end of today. */
function nowX(month: TimelineMonth): string {
  return `${(((month.nowDay ?? 0) / month.days) * 100).toFixed(2)}%`;
}

function nowLine(month: TimelineMonth, top: string): string {
  if (month.nowDay === null) return "";
  const x = nowX(month);
  return `<line class="now" x1="${x}" x2="${x}" y1="${top}" y2="100%"></line>`;
}

function marks(month: TimelineMonth): string {
  const ticks = month.ticks.map(
    (tick) =>
      `<line class="tick${tick.starred ? " s" : ""}" x1="${dayX(tick.day, month)}" x2="${dayX(tick.day, month)}" y1="100%" y2="${tick.starred ? "55%" : "75%"}"></line>`,
  );
  const drop =
    month.dropDay === null
      ? ""
      : `<text class="drop-mark" x="${dayX(month.dropDay, month)}" y="100%" dy="0.35em" text-anchor="middle">×</text>`;
  return `<svg class="tick-marks" aria-hidden="true" focusable="false">${ticks.join("")}${nowLine(month, "0")}${drop}</svg>`;
}

function monthClass(month: TimelineMonth, base: string): string {
  return [base, month.future && "is-future", month.off && "is-off", month.nowDay !== null && "is-now"]
    .filter(Boolean)
    .join(" ");
}

function monthLabel(month: TimelineMonth): string {
  if (month.off) return "";
  const name = `${month.name}${month.nowDay === null ? "" : " so far"}`;
  if (month.future) return `${name}: still ahead`;
  const starred = month.ticks.filter((tick) => tick.starred).length;
  const parts = [month.ticks.length ? String(month.ticks.length) : "none"];
  if (starred) parts.push(`${starred} starred`);
  if (month.dropDay !== null) parts.push(`dropped on the ${month.dropDay}${ordinal(month.dropDay)}`);
  return `${name}: ${parts.join(", ")}`;
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][day % 10] ?? "th";
}

/** The month header row, with today's date flagged. */
export function timelineHead(opts: { months: string[]; today: string; label: string }): string {
  const { months } = goalTimeline({ months: opts.months, today: opts.today, items: [], droppedOn: null });
  const cells = months.map((month) => {
    const flag =
      month.nowDay === null
        ? ""
        : // Late in the month the date goes before the line, so it stays in its month.
          `<svg class="tick-marks" aria-hidden="true" focusable="false"><text class="now-flag" x="${nowX(month)}" ${month.nowDay > 20 ? 'dx="-4" text-anchor="end"' : 'dx="4"'} y="92%">${month.nowDay}</text>${nowLine(month, "60%")}</svg>`;
    return `<li class="${monthClass(month, "mh")}">${month.name.slice(0, 3)}${flag}</li>`;
  });
  return `<div class="map-head">
      <div class="head-label">${opts.label}</div>
      <ol class="strip" aria-hidden="true">${cells.join("")}</ol>
      <div class="head-tally">Linked</div>
    </div>`;
}

/**
 * One goal's line across the cycle's months (see cycleMonths). `label` is the row's name cell (HTML);
 * `detail` unfolds under the row (HTML). `items` are the goal's linked work.
 */
export function timelineRow(opts: {
  goal: Goal;
  months: string[];
  today: string;
  items: { date: string; isHighlight: boolean }[];
  label: string;
  detail?: string;
  id?: string;
}): string {
  const { goal } = opts;
  const { months, gaps } = goalTimeline({
    months: opts.months,
    today: opts.today,
    items: opts.items,
    droppedOn: goal.status === "dropped" ? goal.droppedOn : null,
  });
  const cells = months.map((month, index) => {
    const gap = gaps.find((g) => g.from === index);
    const note = gap ? `<span class="gap-note" data-span="${gap.span}" aria-hidden="true">${gap.label}</span>` : "";
    const label = monthLabel(month);
    return `<li class="${monthClass(month, "m")}">${label ? `<span class="sr-only">${label}</span>` : ""}${marks(month)}${note}</li>`;
  });

  const starred = opts.items.filter((item) => item.isHighlight).length;
  const last = opts.items.reduce<string | null>(
    (max, item) => (max === null || item.date > max ? item.date : max),
    null,
  );
  const tally = opts.items.length
    ? [
        `<span class="t-total">${opts.items.length} linked</span>`,
        starred
          ? `<span class="t-star">${icon("star", true)}${starred}<span class="sr-only"> starred</span></span>`
          : "",
        last ? `<span>last ${shortMonthDay(last)}</span>` : "",
      ].join("")
    : "<span>none yet</span>";

  return `<li class="map-row is-${goal.status}"${opts.id ? ` id="${escapeHtml(opts.id)}" data-goal` : ""}>
      <div class="row-head">
        <div class="row-label">${opts.label}</div>
        <ol class="strip" aria-label="Linked work by month">${cells.join("")}</ol>
        <p class="row-tally">${tally}</p>
      </div>
      ${opts.detail ?? ""}
    </li>`;
}

/** How to read the map. */
export function timelineLegend(today: string, months: string[]): string {
  const todayKey = months.includes(today.slice(0, 7))
    ? `<li><span class="key k-now" aria-hidden="true"></span>Today, ${shortMonthDay(today)}</li>`
    : "";
  const tick = (extra = "") =>
    `<svg class="tick-marks" aria-hidden="true" focusable="false"><line class="tick${extra}" x1="50%" x2="50%" y1="100%" y2="${extra ? "10%" : "40%"}"></line></svg>`;
  return `<ul class="legend" aria-label="How to read the timeline">
      <li><span class="key" aria-hidden="true">${tick()}</span>Linked entry or done todo, placed on its day</li>
      <li><span class="key" aria-hidden="true">${tick(" s")}</span>Starred</li>
      <li><span class="key k-draft is-draft" aria-hidden="true">${tick()}</span>Draft, not agreed yet</li>
      <li><span class="key k-dropped" aria-hidden="true">Goal</span>Dropped</li>
      ${todayKey}
      <li><span class="key k-future" aria-hidden="true"></span>Still ahead</li>
    </ul>`;
}
