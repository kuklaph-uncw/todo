import { escapeHtml } from "../lib/html";
import { addDays, formatMinutes, monthDay, parseLocalDate, weekdayName } from "../lib/date";
import { editableText, type Entry, type Goal, type Todo } from "../vault/format";
import {
  COMPOSER_HINT,
  composerData,
  emptyState,
  goalIndex,
  hidden,
  icon,
  metaChips,
  notice,
  postButton,
  richText,
  subtaskCount,
  subtaskPanel,
  subtaskButton,
  subtaskToggle,
  type GoalIndex,
} from "./components";

export interface TodayViewData {
  date: string;
  today: string;
  entries: Entry[];
  closedTodos: Todo[];
  activeTodos: Todo[];
  week: { date: string; count: number }[];
  goals: Goal[];
  /** Every tag in the vault with its use count, for #tag suggestions. */
  tagCounts: [string, number][];
  editId: string | null;
  error: string | null;
  /** What the user typed, sent back after a validation error so nothing is lost. */
  retry: URLSearchParams | null;
}

function summaryLine(data: TodayViewData): string {
  const starred = data.entries.filter((e) => e.isHighlight).length + data.closedTodos.filter((t) => t.isHighlight).length;
  const minutes = data.entries.reduce((sum, e) => sum + (e.minutes ?? 0), 0);
  const entries = data.entries.length;
  const closed = data.closedTodos.length;
  const parts = [`${entries} ${entries === 1 ? "entry" : "entries"}`, `${closed} ${closed === 1 ? "todo" : "todos"} closed`];
  if (starred) parts.push(`${starred} starred`);
  if (minutes) parts.push(`${formatMinutes(minutes)} logged`);
  return parts.join(" · ");
}

function kicker(date: string, today: string): string {
  if (date === today) return `<p class="kicker">Today</p>`;
  const label = date < today ? "Filling in a past day" : "A future day";
  return `<p class="kicker is-away">${label} · <a href="/">Back to today</a></p>`;
}

function weekStrip(data: TodayViewData): string {
  const cells = data.week
    .map(({ date, count }) => {
      const dow = weekdayName(date).slice(0, 3);
      const day = parseLocalDate(date).getDate();
      const ticks = `<span class="ticks" aria-hidden="true">${"<i></i>".repeat(Math.min(count, 6))}</span>`;
      const label = `${weekdayName(date)} ${monthDay(date)}: ${count} item${count === 1 ? "" : "s"}`;
      const classes = ["week-day", date === data.today ? "is-today" : "", date > data.today ? "is-future" : ""].filter(Boolean).join(" ");
      const current = date === data.date ? ' aria-current="date"' : "";
      return `<li><a class="${classes}" href="/?date=${date}"${current} aria-label="${escapeHtml(label)}"><span class="dow">${dow}</span><span class="num">${day}</span>${ticks}</a></li>`;
    })
    .join("");
  return `<ol class="week" aria-label="This week">${cells}</ol>`;
}

function captureForm(data: TodayViewData, returnTo: string): string {
  const retry = data.retry;
  const isToday = data.date === data.today;
  // On today, send no date: the server uses the real current date, so a
  // window left open overnight logs to the new day, not yesterday.
  return `<form class="capture entry" method="post" action="/journal" data-capture>
      <div class="margin"><span class="capture-mark" aria-hidden="true">new</span></div>
      <div class="entry-body">
      ${hidden("date", isToday ? "" : data.date)}${hidden("return_to", returnTo)}
      <label class="sr-only" for="capture">What did you get done?</label>
      <div class="composer-box">
        <textarea id="capture" name="content" rows="2" required data-draft="draft:${isToday ? "today" : data.date}" data-shortcut="n" data-composer
          placeholder="What did you get done? One line per entry. Type # for tags, / for goals."></textarea>
        <div class="composer-bar">
          <label class="time-field">${icon("clock")}<span class="sr-only">Time spent</span><input name="minutes" placeholder="Add time" autocomplete="off" title="Time spent, like 45m or 1h 30m. Applies to every line you add." value="${escapeHtml(retry?.get("minutes") ?? "")}"></label>
          <label class="star-toggle" title="Star as a highlight. Applies to every line you add."><input class="sr-only" type="checkbox" name="star" value="1"${retry?.get("star") === "1" ? " checked" : ""}>${icon("star")}<span class="sr-only">Star as a highlight</span><span class="star-off" aria-hidden="true">Star</span><span class="star-on" aria-hidden="true">Starred</span></label>
          <span class="spacer"></span>
          <span class="key-hint" aria-hidden="true"><kbd>Ctrl</kbd> <kbd>Enter</kbd></span>
          <button type="button" class="icon-btn" data-focus-mode aria-pressed="false" aria-label="Focus mode" title="Focus mode (Ctrl+Shift+F)" hidden>${icon("expand")}</button>
          <button class="btn primary" type="submit">Add to ledger</button>
        </div>
      </div>
      </div>
    </form>`;
}

function entryEditForm(entry: Entry, returnTo: string, retry: URLSearchParams | null): string {
  const cancel = `${returnTo}#entry-${entry.id}`;
  // After a validation error, show what the user typed rather than the saved version.
  const content = retry?.get("content") ?? editableText(entry.text, entry.tags, entry.goals);
  const minutes = retry?.get("minutes") ?? String(entry.minutes ?? "");
  return `<form class="edit-form" method="post" action="/journal/${entry.id}">
      ${hidden("date", entry.date)}${hidden("return_to", `${returnTo}#entry-${entry.id}`)}
      <label class="sr-only" for="edit-${entry.id}">Entry text</label>
      <textarea id="edit-${entry.id}" name="content" rows="2" required autofocus data-composer>${escapeHtml(content)}</textarea>
      ${COMPOSER_HINT}
      <div class="edit-bar">
        <label class="field field-short"><span>Time spent</span><input name="minutes" value="${escapeHtml(minutes)}" placeholder="45m"></label>
        <span class="spacer"></span>
        <a class="btn ghost" href="${escapeHtml(cancel)}">Cancel</a>
        <button class="btn primary" type="submit">Save</button>
      </div>
    </form>`;
}

function entryRow(entry: Entry, data: TodayViewData, goals: GoalIndex, returnTo: string): string {
  const starred = entry.isHighlight;
  const editing = data.editId === entry.id;
  const body = editing
    ? entryEditForm(entry, returnTo, data.retry)
    : `<p class="entry-text">${richText(entry.text, goals)}</p>${metaChips(entry, goals)}`;

  const actions = editing
    ? ""
    : `<div class="row-actions">
        ${postButton({
          action: `/journal/${entry.id}/star`,
          label: starred ? "Unstar entry" : "Star entry as a highlight",
          body: icon("star", starred),
          returnTo: `${returnTo}#entry-${entry.id}`,
          fields: { date: entry.date },
          className: `icon-btn star-btn${starred ? " is-on" : ""}`,
          pressed: starred,
          id: `star-${entry.id}`,
        })}
        <a class="icon-btn" href="/?date=${entry.date}&amp;edit=${entry.id}#entry-${entry.id}" aria-label="Edit entry" title="Edit">${icon("edit")}</a>
        ${postButton({
          action: `/journal/${entry.id}/delete`,
          label: "Delete entry",
          body: icon("trash"),
          returnTo,
          fields: { date: entry.date },
          className: "icon-btn danger",
          confirm: "Delete this entry? A copy is kept in the notes folder's .trash/deleted.md file.",
        })}
      </div>`;

  return `<li class="entry${starred ? " is-starred" : ""}" id="entry-${entry.id}">
      <div class="margin">${entry.time ? `<time>${entry.time}</time>` : ""}</div>
      <div class="entry-body">${body}</div>
      ${actions}
    </li>`;
}

function closedRow(todo: Todo, goals: GoalIndex, returnTo: string): string {
  return `<li class="entry is-todo${todo.isHighlight ? " is-starred" : ""}" id="todo-${todo.id}">
      <div class="margin"><span class="done-mark" title="Todo completed">${icon("check")}</span></div>
      <div class="entry-body">
        <p class="entry-text">${richText(todo.task, goals)}</p>
        ${metaChips({ ...todo, text: todo.task, minutes: null }, goals)}
      </div>
      <div class="row-actions">
        ${postButton({
          action: `/todos/${todo.id}/star`,
          label: todo.isHighlight ? `Unstar: ${todo.task}` : `Star as a highlight: ${todo.task}`,
          body: icon("star", todo.isHighlight),
          returnTo: `${returnTo}#todo-${todo.id}`,
          className: `icon-btn star-btn${todo.isHighlight ? " is-on" : ""}`,
          pressed: todo.isHighlight,
          id: `star-${todo.id}`,
        })}
        ${postButton({
          action: `/todos/${todo.id}/status`,
          label: `Reopen: ${todo.task}`,
          body: icon("undo"),
          returnTo,
          fields: { status: "Open" },
          className: "icon-btn",
        })}
      </div>
    </li>`;
}

function trayTodo(todo: Todo, goals: GoalIndex, returnTo: string, date: string): string {
  const meta = [
    todo.priority ? `<span class="priority p-${todo.priority.toLowerCase()}">${todo.priority}</span>` : "",
    metaChips({ ...todo, text: todo.task, minutes: null }, goals, subtaskCount(todo)),
  ].join("");
  const editHref = `/todos?edit=${todo.id}&back=${encodeURIComponent(returnTo)}#todo-${todo.id}`;

  return `<li class="todo" id="todo-${todo.id}">
      ${postButton({
        action: `/todos/${todo.id}/status`,
        label: `Mark done: ${todo.task}`,
        body: icon("check"),
        returnTo,
        fields: { status: "Done", on: date },
        className: "check-btn",
        id: `done-${todo.id}`,
      })}
      <div class="todo-body">
        <p class="todo-task"${subtaskToggle(todo)}>${todo.isHighlight ? `<span class="star-inline" title="Starred">${icon("star", true)}</span>` : ""}${richText(todo.task, goals)}</p>
        ${subtaskButton(todo)}
        ${meta ? `<div class="todo-meta">${meta}</div>` : ""}
        ${subtaskPanel(todo, goals, { returnTo, full: false })}
      </div>
      <a class="icon-btn" href="${escapeHtml(editHref)}" aria-label="Edit details: ${escapeHtml(todo.task)}" title="Edit details">${icon("edit")}</a>
    </li>`;
}

function tray(data: TodayViewData, goals: GoalIndex, returnTo: string): string {
  // On today, send no date (like the capture form) so a window left open overnight dates to the new day.
  const doneOn = data.date === data.today ? "" : data.date;
  const list = data.activeTodos.length
    ? `<ul class="todo-list">${data.activeTodos.map((todo) => trayTodo(todo, goals, returnTo, doneOn)).join("")}</ul>`
    : "";

  return `<aside class="tray" aria-labelledby="tray-title">
      <div class="tray-head">
        <h2 id="tray-title">Todos</h2>
        <a class="quiet-link" href="/todos">All todos ${icon("arrow")}</a>
      </div>
      <form class="todo-add" method="post" action="/todos">
        ${hidden("return_to", returnTo)}
        <label class="sr-only" for="tray-task">New todo</label>
        <input id="tray-task" name="task" required placeholder="Add a todo" autocomplete="off" data-shortcut="t" data-composer>
        <button class="btn" type="submit">Add</button>
      </form>
      ${list || emptyState("Nothing open.", "Todos you add here stay until they're done.")}
      <p class="tray-note">Checking one off counts it as done on ${data.date === data.today ? "today" : escapeHtml(monthDay(data.date))}.</p>
    </aside>`;
}

export function renderToday(data: TodayViewData): string {
  const goals = goalIndex(data.goals);
  // "/" always means the current day, so a window left open overnight moves on.
  const returnTo = data.date === data.today ? "/" : `/?date=${data.date}`;
  const [year] = data.date.split("-");

  const entries = data.entries.length
    ? `<ol class="ledger-list">${data.entries.map((entry) => entryRow(entry, data, goals, returnTo)).join("")}</ol>`
    : emptyState(
        data.date === data.today ? "Nothing logged yet today." : "Nothing logged for this day.",
        "Write what you did above. Small things count: reviews, unblocking someone, a fix nobody asked for.",
      );

  const closed = data.closedTodos.length
    ? `<section class="closed" aria-labelledby="closed-title">
        <h2 class="section-title" id="closed-title">Todos closed this day <span class="count">${data.closedTodos.length}</span></h2>
        <ol class="ledger-list">${data.closedTodos.map((todo) => closedRow(todo, goals, returnTo)).join("")}</ol>
      </section>`
    : "";

  return `<div class="today">
    <section class="ledger" aria-labelledby="day-title">
      <header class="day-head">
        <div>
          ${kicker(data.date, data.today)}
          <h1 id="day-title"><span class="weekday">${weekdayName(data.date)}</span> ${monthDay(data.date)} <span class="year">${year}</span></h1>
          <p class="day-summary">${summaryLine(data)}</p>
        </div>
        <nav class="day-nav" aria-label="Change day">
          <a class="icon-btn" href="/?date=${addDays(data.date, -1)}" aria-label="Previous day" title="Previous day" data-shortcut="[">${icon("left")}</a>
          <form method="get" action="/" class="date-jump">
            <label class="sr-only" for="date-jump">Go to date</label>
            <input id="date-jump" type="date" name="date" value="${data.date}" data-autosubmit>
            <noscript><button class="btn" type="submit">Go</button></noscript>
          </form>
          <a class="icon-btn" href="/?date=${addDays(data.date, 1)}" aria-label="Next day" title="Next day" data-shortcut="]">${icon("right")}</a>
        </nav>
      </header>
      ${weekStrip(data)}
      ${notice(data.error)}
      <div class="ruled">
        ${captureForm(data, returnTo)}
        <h2 class="sr-only">Entries</h2>
        ${entries}
        ${closed}
      </div>
    </section>
    ${tray(data, goals, returnTo)}
    ${composerData(data.tagCounts, data.goals)}
  </div>`;
}
