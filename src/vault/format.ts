/**
 * Plain-text formats for the vault. Everything the app stores is a Markdown
 * line or file that reads naturally in Obsidian (or any editor):
 *
 *   Journal entry (journal/YYYY/YYYY-MM-DD.md):
 *     - 09:15 Reviewed the migration plan #review [[reliability]] ⏱ 45m ⭐ ^k3x9qa
 *
 *   Todo (todos.md), using Obsidian Tasks plugin emoji where they exist:
 *     - [/] Fix flaky auth test #bug ⏫ ⭐ ➕ 2026-09-20 ✅ 2026-09-28 ^t8k2m1
 *         Optional notes, indented under the task.
 *
 *   Goal (goals/<slug>.md): frontmatter (title, cycle, status) + Markdown body.
 *
 * The trailing `^id` is an Obsidian block ID; the app uses it to find a line again.
 */
import type { GoalStatus, Priority, Status } from "../lib/validation";
import { isValidGoalStatus } from "../lib/validation";

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
  isHighlight: boolean;
  createdOn: string | null;
  completedOn: string | null;
  notes: string;
}

export interface Goal {
  slug: string;
  title: string;
  cycle: string;
  status: GoalStatus;
  body: string;
}

const STATUS_BY_MARK: Record<string, Status> = {
  " ": "Open",
  "/": "In Progress",
  b: "Blocked",
  x: "Done",
  X: "Done",
  "-": "Cancelled",
};
const MARK_BY_STATUS: Record<Status, string> = {
  Open: " ",
  "In Progress": "/",
  Blocked: "b",
  Done: "x",
  Cancelled: "-",
};

const PRIORITY_BY_EMOJI: Record<string, Priority> = { "🔺": "High", "⏫": "High", "🔼": "Medium", "🔽": "Low", "⏬": "Low" };
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
  const tags = [...text.matchAll(TAG_RE)].map((m) => m[2].toLowerCase()).filter(isTag);
  return [...new Set(tags)];
}

export function findLinks(text: string): string[] {
  return [...new Set([...text.matchAll(LINK_RE)].map((m) => m[1].trim()))];
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
  let text = body;
  for (let match = TRAILING_TOKEN_RE.exec(text); match; match = TRAILING_TOKEN_RE.exec(text)) {
    const token = match[2];
    if (token.startsWith("#") && !isTag(token.slice(1))) break;
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

/** The text a user edits: the sentence plus its trailing #tags and [[links]]. */
export function editableText(text: string, tags: string[], goals: string[]): string {
  return [text, ...trailingMeta(text, tags, goals)].join(" ");
}

const ENTRY_LINE_RE =/^- (?!\[.\] )(.+)$/;

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
  parts.push(entry.text, ...trailingMeta(entry.text, entry.tags, entry.goals));
  if (entry.minutes !== null) parts.push(`⏱ ${entry.minutes}m`);
  if (entry.isHighlight) parts.push("⭐");
  if (entry.id) parts.push(`^${entry.id}`);
  return parts.join(" ");
}

const TODO_LINE_RE = /^- \[(.)\] (.+)$/;
const NOTE_LINE_RE = /^(?: {2,}|\t)(.*)$/;

export interface TodoBlock {
  todo: Todo;
  /** Index of the task line. */
  start: number;
  /** Index after the last note line. */
  end: number;
}

/** Finds every top-level task in a file, along with its indented note lines. */
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
    let end = i + 1;
    while (end < lines.length) {
      const note = NOTE_LINE_RE.exec(lines[end]);
      if (!note || lines[end].trim() === "") break;
      noteLines.push(note[1].trim());
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
        isHighlight: parsed.isHighlight,
        createdOn,
        completedOn,
        notes: noteLines.join("\n"),
      },
      start: i,
      end,
    });
    i = end - 1;
  }

  return blocks;
}

export function formatTodo(todo: Todo): string[] {
  const parts = [`- [${MARK_BY_STATUS[todo.status]}]`, todo.task, ...trailingMeta(todo.task, todo.tags, todo.goals)];
  if (todo.priority) parts.push(EMOJI_BY_PRIORITY[todo.priority]);
  if (todo.isHighlight) parts.push("⭐");
  if (todo.createdOn) parts.push(`➕ ${todo.createdOn}`);
  if (todo.completedOn) parts.push(`✅ ${todo.completedOn}`);
  if (todo.id) parts.push(`^${todo.id}`);

  const notes = todo.notes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `    ${line}`);
  return [parts.join(" "), ...notes];
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
