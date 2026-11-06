/**
 * Plain-text formats for the vault. Everything the app stores is a Markdown
 * block or file that reads naturally in Obsidian (or any editor):
 *
 *   Journal entry (journal/YYYY/YYYY-MM-DD.md):
 *     - 09:15 Reviewed the migration plan #review [[reliability]] ⏱ 45m ⭐ ^k3x9qa
 *         Ran the checklist with **Priya**:
 *
 *         - migrated the tables
 *           - verified row counts
 *
 *   Entry metadata lives on the first line. Continuations are indented four
 *   spaces; internal blank lines are empty. Reading accepts any indentation,
 *   removes the smallest indent (up to four columns) and keeps blank lines only before continuations.
 *
 *   Todo (todos.md), using Obsidian Tasks plugin emoji where they exist:
 *     - [x] Fix flaky auth test #bug ⏫ ⭐ ➕ 2026-09-20 ✅ 2026-09-28 ^t8k2m1
 *         Optional notes, indented under the task.
 *         - [x] Subtasks are indented task lines, nested by indent ^q7d3hn
 *
 *   Goal (goals/<slug>.md): frontmatter (title, cycle, status) + Markdown body.
 *
 * The trailing `^id` is an Obsidian block ID; the app uses it to find a line again.
 */
import type { GoalStatus, Priority, Status } from "../lib/validation";
import { continuationEnd, mapOutsideFences } from "../lib/lines";
import { isValidGoalStatus } from "../lib/validation";
import { renderEntryMarkdown } from "../lib/markdown";

export interface Entry {
  id: string;
  date: string;
  time: string | null;
  text: string;
  tags: string[];
  goals: string[];
  minutes: number | null;
  isHighlight: boolean;
}

export interface Todo {
  id: string;
  status: Status;
  task: string;
  tags: string[];
  goals: string[];
  priority: Priority | null;
  /** A ⏱ time typed on the line by hand. Only kept so rewriting the line doesn't drop it; time logged counts entries. */
  minutes: number | null;
  isHighlight: boolean;
  createdOn: string | null;
  completedOn: string | null;
  notes: string;
  subtasks: Subtask[];
}

/** A checklist item under a todo. Its id shares the todo file's id space. */
export interface Subtask {
  id: string;
  text: string;
  done: boolean;
  children: Subtask[];
}

export interface Goal {
  slug: string;
  title: string;
  cycle: string;
  status: GoalStatus;
  body: string;
}

// Todos are open or done. Obsidian Tasks' in-progress, blocked and cancelled marks read as open.
const STATUS_BY_MARK: Record<string, Status> = {
  " ": "Open",
  "/": "Open",
  b: "Open",
  "-": "Open",
  x: "Done",
  X: "Done",
};
const MARK_BY_STATUS: Record<Status, string> = {
  Open: " ",
  Done: "x",
};

const PRIORITY_BY_EMOJI: Record<string, Priority> = {
  "🔺": "High",
  "⏫": "High",
  "🔼": "Medium",
  "🔽": "Low",
  "⏬": "Low",
};
const EMOJI_BY_PRIORITY: Record<Priority, string> = { High: "⏫", Medium: "🔼", Low: "🔽" };

const TAG_RE = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;
const LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const ID_RE = /\s*\^([A-Za-z0-9-]+)\s*$/;
const TRAILING_TOKEN_RE = /^(.*\S)\s+(#[\p{L}\p{N}_/-]+|\[\[[^\]]+\]\])$/u;

/** Obsidian ignores pure-number hashtags (e.g. "PR #892"), so we do too. */
function isTag(name: string): boolean {
  return !/^\d+$/.test(name);
}

export function findTags(text: string): string[] {
  const tags = [...metadataText(text).matchAll(TAG_RE)].map((m) => m[2].toLowerCase()).filter(isTag);
  return [...new Set(tags)];
}

export function findLinks(text: string): string[] {
  return [...new Set([...metadataText(text).matchAll(LINK_RE)].map((m) => m[1].trim()))];
}

// Match the displayed Markdown text, excluding literal code. Formatting a tag
// must not remove it from filters or count emphasis markers as part of its name.
function metadataText(text: string): string {
  return renderEntryMarkdown(text)
    .replace(/<code>[\s\S]*?<\/code>/g, " ")
    .replace(/<\/?(?:p|h[1-6]|li|ul|ol)(?: [^>]*)?>|<br>/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:amp|lt|gt|quot|#39);/g,
      (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]!,
    );
}

/**
 * Text with wikilinks flattened for exports: a link's own label, else the
 * goal's title (via `titleOf`), else the raw link. Tags are kept.
 */
export function plainText(text: string, titleOf: (slug: string) => string | undefined = () => undefined): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, target: string, label?: string) =>
    (label ?? titleOf(target.trim()) ?? target).trim(),
  );
}

interface ParsedBody {
  id: string;
  text: string;
  tags: string[];
  goals: string[];
  minutes: number | null;
  isHighlight: boolean;
}

/** Pulls the shared metadata tokens out of a line body. `rest` gets todo-only tokens removed first. */
function parseBody(raw: string): ParsedBody {
  let body = raw.replace(/️/g, "");

  let id = "";
  body = body.replace(ID_RE, (_m, found) => {
    id = found;
    return "";
  });

  const isHighlight = body.includes("⭐");
  body = body.replace(/⭐/g, " ");

  let minutes: number | null = null;
  body = body.replace(/⏱\s*(\d+)\s*m\b/, (_m, found) => {
    minutes = Number(found);
    return " ";
  });

  body = body.replace(/\s+/g, " ").trim();
  const tags = findTags(body);
  const goals = findLinks(body);

  // Trailing tags/links are metadata; ones inside the sentence stay part of the text.
  // A link with its own label ([[slug|label]]) also stays, so rewriting the line keeps the label.
  let text = body;
  for (let match = TRAILING_TOKEN_RE.exec(text); match; match = TRAILING_TOKEN_RE.exec(text)) {
    const token = match[2];
    if (token.startsWith("#") && !isTag(token.slice(1))) break;
    if (token.includes("|")) break;
    text = match[1];
  }

  return { id, text, tags, goals, minutes, isHighlight };
}

/** Tags/links not already written inline in the text, so rewriting never duplicates them. */
function trailingMeta(text: string, tags: string[], goals: string[]): string[] {
  const inlineTags = findTags(text);
  const inlineLinks = findLinks(text);
  return [
    ...tags.filter((tag) => !inlineTags.includes(tag)).map((tag) => `#${tag}`),
    ...goals.filter((goal) => !inlineLinks.includes(goal)).map((goal) => `[[${goal}]]`),
  ];
}

/** The text a user edits, with trailing #tags and [[links]] on its first line. */
export function editableText(text: string, tags: string[], goals: string[]): string {
  const [first, ...body] = text.split("\n");
  return [[first, ...trailingMeta(text, tags, goals)].join(" "), ...body].join("\n");
}

const ENTRY_LINE_RE = /^- (?!\[.\] )(.+)$/;

export function parseEntryLine(line: string, date: string): Entry | null {
  const match = ENTRY_LINE_RE.exec(line);
  if (!match) return null;

  let body = match[1];
  let time: string | null = null;
  const timeMatch = /^(\d{2}:\d{2})\s+/.exec(body);
  if (timeMatch) {
    time = timeMatch[1];
    body = body.slice(timeMatch[0].length);
  }

  const parsed = parseBody(body);
  return {
    id: parsed.id,
    date,
    time,
    text: parsed.text,
    tags: parsed.tags,
    goals: parsed.goals,
    minutes: parsed.minutes,
    isHighlight: parsed.isHighlight,
  };
}

export function formatEntryLine(entry: Entry): string {
  const parts = ["-"];
  if (entry.time) parts.push(entry.time);
  parts.push(entry.text.split("\n")[0], ...trailingMeta(entry.text, entry.tags, entry.goals));
  if (entry.minutes !== null) parts.push(`⏱ ${entry.minutes}m`);
  if (entry.isHighlight) parts.push("⭐");
  if (entry.id) parts.push(`^${entry.id}`);
  return parts.join(" ");
}

export interface EntryBlock {
  entry: Entry;
  /** Index of the entry's first line. */
  start: number;
  /** Index after its last continuation line. */
  end: number;
}

/** Removes the smallest indent up to four columns, counting tabs as four spaces; blank lines stay blank. */
function dedent(lines: string[]): string[] {
  const indents = lines.filter((line) => line.trim()).map((line) => indentWidth(/^[ \t]*/.exec(line)![0]));
  const indent = indents.length > 0 ? Math.min(4, ...indents) : 0;
  return lines.map((line) => {
    let offset = 0;
    let width = 0;
    while (width < indent && offset < line.length) width += line[offset++] === "\t" ? 4 : 1;
    return " ".repeat(Math.max(0, width - indent)) + line.slice(offset);
  });
}

/** Combines first-line metadata with body text, counting every tag and goal link in the body. */
export function entryContent(
  first: Pick<Entry, "text" | "tags" | "goals">,
  body: string[],
): Pick<Entry, "text" | "tags" | "goals"> {
  // The whole text, so a code fence opened on the first line still hides its contents.
  const text = [first.text, ...body].join("\n");
  return {
    text,
    tags: [...new Set([...first.tags, ...findTags(text)])],
    goals: [...new Set([...first.goals, ...findLinks(text)])],
  };
}

/** Finds entries with their indented continuations, following the daily-note format above. */
export function parseEntryBlocks(lines: string[], date: string): EntryBlock[] {
  const blocks: EntryBlock[] = [];
  for (let start = 0; start < lines.length; start++) {
    const entry = parseEntryLine(lines[start], date);
    if (!entry) continue;

    const end = continuationEnd(lines, start + 1, 0);

    const body = mapOutsideFences([entry.text, ...dedent(lines.slice(start + 1, end))], (line) =>
      line.trim() ? line : "",
    ).slice(1);
    Object.assign(entry, entryContent(entry, body));
    blocks.push({ entry, start, end });
    start = end - 1;
  }
  return blocks;
}

/** Writes an entry with first-line metadata and four-space continuations, as in the daily-note format above. */
export function formatEntry(entry: Entry): string[] {
  return [
    formatEntryLine(entry),
    ...entry.text
      .split("\n")
      .slice(1)
      .map((line) => (line ? `    ${line}` : "")),
  ];
}

const TODO_LINE_RE = /^- \[(.)\] (.+)$/;
const NOTE_LINE_RE = /^(?: {2,}|\t)(.*)$/;
const SUBTASK_LINE_RE = /^([ \t]+)- \[(.)\] (.*\S.*)$/;

export interface TodoBlock {
  todo: Todo;
  /** Index of the task line. */
  start: number;
  /** Index after the last note or subtask line. */
  end: number;
  /** Where each subtask was written, so a hand-written one can get an id without touching other lines. */
  subtaskLines: { subtask: Subtask; index: number }[];
}

/** Indent width with a tab counted as four spaces, so mixed indents still nest sensibly. */
function indentWidth(indent: string): number {
  return indent.replace(/\t/g, "    ").length;
}

/** Finds every top-level task in a file, along with its indented notes and subtasks. */
export function parseTodoBlocks(lines: string[]): TodoBlock[] {
  const blocks: TodoBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = TODO_LINE_RE.exec(lines[i]);
    if (!match) continue;
    const status = STATUS_BY_MARK[match[1]];
    if (!status) continue;

    let body = match[2].replace(/️/g, "");
    let priority: Priority | null = null;
    body = body.replace(/[🔺⏫🔼🔽⏬]/u, (emoji) => {
      priority = PRIORITY_BY_EMOJI[emoji];
      return " ";
    });
    let createdOn: string | null = null;
    body = body.replace(/➕\s*(\d{4}-\d{2}-\d{2})/, (_m, date) => {
      createdOn = date;
      return " ";
    });
    let completedOn: string | null = null;
    body = body.replace(/✅\s*(\d{4}-\d{2}-\d{2})/, (_m, date) => {
      completedOn = date;
      return " ";
    });
    const parsed = parseBody(body);

    const noteLines: string[] = [];
    const subtasks: Subtask[] = [];
    const subtaskLines: TodoBlock["subtaskLines"] = [];
    // Open subtasks by indent, so a deeper line becomes a child of the nearest shallower one.
    const parents: { width: number; subtask: Subtask }[] = [];
    let end = i + 1;
    while (end < lines.length) {
      // A marked Markdown block keeps blank lines/indentation and literal
      // checkboxes separate from the todo's actual subtasks. Old notes still read.
      const notesStart = /^ {4}<!-- todo-notes(?::(\d+))? -->$/.exec(lines[end]);
      const notesEnd = notesStart && `    <!-- /todo-notes${notesStart[1] ? `:${notesStart[1]}` : ""} -->`;
      const close = notesEnd ? lines.indexOf(notesEnd, end + 1) : -1;
      if (close !== -1 && lines.slice(end + 1, close).every((line) => line.startsWith("    "))) {
        noteLines.push(...lines.slice(end + 1, close).map((line) => line.slice(4)));
        end = close + 1;
        continue;
      }
      const note = NOTE_LINE_RE.exec(lines[end]);
      if (!note || lines[end].trim() === "") break;
      const sub = SUBTASK_LINE_RE.exec(lines[end]);
      if (sub) {
        const subtask: Subtask = {
          id: ID_RE.exec(sub[3])?.[1] ?? "",
          text: sub[3].replace(ID_RE, "").trim(),
          done: sub[2] === "x" || sub[2] === "X",
          children: [],
        };
        const width = indentWidth(sub[1]);
        while (parents.length > 0 && parents[parents.length - 1].width >= width) parents.pop();
        (parents.length > 0 ? parents[parents.length - 1].subtask.children : subtasks).push(subtask);
        parents.push({ width, subtask });
        subtaskLines.push({ subtask, index: end });
      } else {
        noteLines.push(note[1].trim());
      }
      end++;
    }

    blocks.push({
      todo: {
        id: parsed.id,
        status,
        task: parsed.text,
        tags: parsed.tags,
        goals: parsed.goals,
        priority,
        minutes: parsed.minutes,
        isHighlight: parsed.isHighlight,
        createdOn,
        completedOn,
        notes: noteLines.join("\n"),
        subtasks,
      },
      start: i,
      end,
      subtaskLines,
    });
    i = end - 1;
  }

  return blocks;
}

export function formatTodo(todo: Todo): string[] {
  const parts = [`- [${MARK_BY_STATUS[todo.status]}]`, todo.task, ...trailingMeta(todo.task, todo.tags, todo.goals)];
  if (todo.minutes !== null) parts.push(`⏱ ${todo.minutes}m`);
  if (todo.priority) parts.push(EMOJI_BY_PRIORITY[todo.priority]);
  if (todo.isHighlight) parts.push("⭐");
  if (todo.createdOn) parts.push(`➕ ${todo.createdOn}`);
  if (todo.completedOn) parts.push(`✅ ${todo.completedOn}`);
  if (todo.id) parts.push(`^${todo.id}`);

  const noteLines = todo.notes.split("\n");
  let notes = noteLines.filter((line) => line.length > 0).map((line) => `    ${line}`);
  if (todo.notes && noteLines.some((line) => !line.trim() || /^\s|^- \[.\] |^<!-- \/?todo-notes/.test(line))) {
    let suffix = "";
    for (let n = 1; noteLines.includes(`<!-- /todo-notes${suffix} -->`); n++) suffix = `:${n}`;
    notes = [
      `    <!-- todo-notes${suffix} -->`,
      ...noteLines.map((line) => `    ${line}`),
      `    <!-- /todo-notes${suffix} -->`,
    ];
  }
  return [parts.join(" "), ...notes, ...formatSubtasks(todo.subtasks, "    ")];
}

/** A subtask line without its indent. */
function formatSubtaskLine(subtask: Subtask): string {
  return [`- [${subtask.done ? "x" : " "}]`, subtask.text, subtask.id ? `^${subtask.id}` : ""]
    .filter(Boolean)
    .join(" ");
}

export function formatSubtasks(subtasks: Subtask[], indent: string): string[] {
  return subtasks.flatMap((subtask) => [
    `${indent}${formatSubtaskLine(subtask)}`,
    ...formatSubtasks(subtask.children, `${indent}    `),
  ]);
}

/** A subtask and everything under it, in file order. */
export function allSubtasks(subtasks: Subtask[]): Subtask[] {
  return subtasks.flatMap((subtask) => [subtask, ...allSubtasks(subtask.children)]);
}

/** Minimal `key: value` frontmatter. Values may be JSON-quoted. */
export function splitFrontmatter(source: string): { data: Record<string, string>; body: string } {
  const text = source.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { data: {}, body: text };

  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        // Leave malformed quoting as written.
      }
    }
    data[key] = value;
  }
  return { data, body: text.slice(match[0].length) };
}

function frontmatterValue(value: string): string {
  return /^[\s"'#&*!|>%@`[{]|:\s|\s$/.test(value) ? JSON.stringify(value) : value;
}

export function formatFrontmatter(data: Record<string, string>): string {
  const lines = Object.entries(data).map(([key, value]) => `${key}: ${frontmatterValue(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

export function parseGoal(slug: string, source: string): Goal {
  const { data, body } = splitFrontmatter(source);
  const status = data.status && isValidGoalStatus(data.status) ? data.status : "active";
  return {
    slug,
    title: data.title || slug,
    cycle: data.cycle || "",
    status,
    body: body.trim(),
  };
}

export function formatGoal(goal: Goal): string {
  const head = formatFrontmatter({ title: goal.title, cycle: goal.cycle, status: goal.status });
  return goal.body.trim() ? `${head}\n${goal.body.trim()}\n` : head;
}
