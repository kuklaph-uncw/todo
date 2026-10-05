/**
 * File-backed store. The vault is a folder of Markdown files that is the
 * single source of truth; back it up by copying the folder.
 *
 *   vault/
 *     journal/2026/2026-09-28.md   one daily note per day with entries
 *     todos.md                     every todo, in creation order
 *     goals/<slug>.md              one file per goal
 *     .trash/deleted.md            append-only log of deleted lines
 *     .workledger/error.log        the desktop app's error log (not notes)
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { isValidDateString, localDateString, nowUtcIso } from "../lib/date";
import type { GoalStatus, Priority, Status } from "../lib/validation";
import { slugify } from "../lib/validation";
import {
  formatEntryLine,
  formatGoal,
  formatTodo,
  parseEntryLine,
  parseGoal,
  parseTodoBlocks,
  type Entry,
  type Goal,
  type Todo,
} from "./format";

export interface NewEntryMeta {
  tags: string[];
  goals: string[];
  minutes: number | null;
  isHighlight: boolean;
  time: string | null;
}

export interface NewTodo {
  task: string;
  priority: Priority | null;
  status: Status;
  tags: string[];
  goals: string[];
  notes: string;
}

export interface TodoPatch {
  task?: string;
  priority?: Priority | null;
  notes?: string;
  status?: Status;
  /** Local date to record if this patch completes the todo. Defaults to today. */
  completedOn?: string;
  isHighlight?: boolean;
  clearCompletion?: boolean;
}

/**
 * Completion dates are evidence: the first move to Done stamps a date, and
 * nothing but an explicit clear removes it (reopening keeps it).
 */
export function applyTodoPatch(todo: Todo, patch: TodoPatch, today: string): Todo {
  const next: Todo = { ...todo };
  if (patch.task !== undefined) Object.assign(next, parseTaskInput(patch.task));
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.isHighlight !== undefined) next.isHighlight = patch.isHighlight;
  if (patch.status !== undefined) {
    next.status = patch.status;
    if (patch.status === "Done" && next.completedOn === null) next.completedOn = patch.completedOn ?? today;
  }
  if (patch.clearCompletion) next.completedOn = null;
  return next;
}

/** Splits user-typed text into the sentence plus any #tags / [[goal]] links it contains. */
export function parseTaskInput(raw: string): { task: string; tags: string[]; goals: string[] } {
  const parsed = parseEntryLine(`- ${raw.replace(/\s+/g, " ").trim()}`, "");
  return { task: parsed?.text ?? "", tags: parsed?.tags ?? [], goals: parsed?.goals ?? [] };
}

function newId(taken: Set<string>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const id = [...bytes].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
    if (!taken.has(id)) return id;
  }
}

function readLines(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

/** Write via temp file + rename so a crash never leaves a half-written note. */
function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

function writeLines(path: string, lines: string[]): void {
  writeAtomic(path, `${lines.join("\n")}\n`);
}

interface DayFile {
  lines: string[];
  items: { entry: Entry; index: number }[];
}

interface TodoFile {
  lines: string[];
  blocks: ReturnType<typeof parseTodoBlocks>;
}

export class Vault {
  constructor(readonly root: string) {}

  private dayPath(date: string): string {
    return join(this.root, "journal", date.slice(0, 4), `${date}.md`);
  }

  private get todosPath(): string {
    return join(this.root, "todos.md");
  }

  private get goalsDir(): string {
    return join(this.root, "goals");
  }

  private trash(source: string, lines: string[]): void {
    const path = join(this.root, ".trash", "deleted.md");
    mkdirSync(dirname(path), { recursive: true });
    const where = relative(this.root, source).replaceAll("\\", "/");
    appendFileSync(path, `- Deleted ${nowUtcIso()} from ${where}\n${lines.map((l) => `    ${l}`).join("\n")}\n`, "utf8");
  }

  // ---- Journal -------------------------------------------------------------

  /** Reads a daily note, giving any hand-written entry lines a block ID. */
  private readDay(date: string): DayFile {
    const path = this.dayPath(date);
    const lines = readLines(path);
    const items: DayFile["items"] = [];
    lines.forEach((line, index) => {
      const entry = parseEntryLine(line, date);
      if (entry && entry.text) items.push({ entry, index });
    });

    const taken = new Set(items.map((item) => item.entry.id).filter(Boolean));
    const missing = items.filter((item) => !item.entry.id);
    if (missing.length > 0) {
      for (const item of missing) {
        item.entry.id = newId(taken);
        taken.add(item.entry.id);
        lines[item.index] = formatEntryLine(item.entry);
      }
      writeLines(path, lines);
    }
    return { lines, items };
  }

  /** Every date that has a daily note, ascending. */
  listDates(): string[] {
    const journal = join(this.root, "journal");
    if (!existsSync(journal)) return [];
    const dates: string[] = [];
    for (const year of readdirSync(journal)) {
      const dir = join(journal, year);
      if (!/^\d{4}$/.test(year)) continue;
      for (const file of readdirSync(dir)) {
        const date = file.replace(/\.md$/, "");
        if (file.endsWith(".md") && isValidDateString(date)) dates.push(date);
      }
    }
    return dates.sort();
  }

  getEntries(date: string): Entry[] {
    return this.readDay(date).items.map((item) => item.entry);
  }

  getEntriesInRange(from: string, to: string): Entry[] {
    return this.listDates()
      .filter((date) => date >= from && date <= to)
      .flatMap((date) => this.getEntries(date));
  }

  getAllEntries(): Entry[] {
    return this.listDates().flatMap((date) => this.getEntries(date));
  }

  /** Appends one entry per text, right after the day's existing entries. */
  addEntries(date: string, texts: string[], meta: NewEntryMeta): Entry[] {
    const path = this.dayPath(date);
    const { lines, items } = this.readDay(date);
    const taken = new Set(items.map((item) => item.entry.id));

    const created = texts.map((raw) => {
      const input = parseTaskInput(raw);
      const entry: Entry = {
        id: newId(taken),
        date,
        time: meta.time,
        text: input.task,
        tags: [...new Set([...input.tags, ...meta.tags])],
        goals: [...new Set([...input.goals, ...meta.goals])],
        minutes: meta.minutes,
        isHighlight: meta.isHighlight,
      };
      taken.add(entry.id);
      return entry;
    });

    const newLines = created.map(formatEntryLine);
    if (lines.length === 0) {
      writeLines(path, [`---`, `date: ${date}`, `---`, ``, ...newLines]);
    } else {
      const at = items.length > 0 ? items[items.length - 1].index + 1 : lines.length;
      lines.splice(at, 0, ...newLines);
      writeLines(path, lines);
    }
    return created;
  }

  updateEntry(date: string, id: string, change: (entry: Entry) => Entry): Entry | null {
    const { lines, items } = this.readDay(date);
    const item = items.find((candidate) => candidate.entry.id === id);
    if (!item) return null;
    const next = change({ ...item.entry });
    lines[item.index] = formatEntryLine(next);
    writeLines(this.dayPath(date), lines);
    return next;
  }

  deleteEntry(date: string, id: string): boolean {
    const path = this.dayPath(date);
    const { lines, items } = this.readDay(date);
    const item = items.find((candidate) => candidate.entry.id === id);
    if (!item) return false;
    this.trash(path, [lines[item.index]]);
    lines.splice(item.index, 1);
    writeLines(path, lines);
    return true;
  }

  // ---- Todos ---------------------------------------------------------------

  private readTodoFile(): TodoFile {
    const lines = readLines(this.todosPath);
    const blocks = parseTodoBlocks(lines).filter((block) => block.todo.task);
    const taken = new Set(blocks.map((block) => block.todo.id).filter(Boolean));
    const missing = blocks.filter((block) => !block.todo.id);
    if (missing.length > 0) {
      for (const block of missing) {
        block.todo.id = newId(taken);
        taken.add(block.todo.id);
        lines[block.start] = formatTodo(block.todo)[0];
      }
      writeLines(this.todosPath, lines);
    }
    return { lines, blocks };
  }

  getTodos(): Todo[] {
    return this.readTodoFile().blocks.map((block) => block.todo);
  }

  getTodo(id: string): Todo | null {
    return this.getTodos().find((todo) => todo.id === id) ?? null;
  }

  addTodo(input: NewTodo, today: string = localDateString()): Todo {
    const { lines, blocks } = this.readTodoFile();
    const parsed = parseTaskInput(input.task);
    const todo: Todo = {
      id: newId(new Set(blocks.map((block) => block.todo.id))),
      status: input.status,
      task: parsed.task,
      tags: [...new Set([...parsed.tags, ...input.tags])],
      goals: [...new Set([...parsed.goals, ...input.goals])],
      priority: input.priority,
      isHighlight: false,
      createdOn: today,
      completedOn: input.status === "Done" ? today : null,
      notes: input.notes,
    };

    const head = lines.length === 0 ? ["---", "type: todos", "---", ""] : lines;
    writeLines(this.todosPath, [...head, ...formatTodo(todo)]);
    return todo;
  }

  updateTodo(id: string, patch: TodoPatch, today: string = localDateString()): Todo | null {
    const { lines, blocks } = this.readTodoFile();
    const block = blocks.find((candidate) => candidate.todo.id === id);
    if (!block) return null;
    const next = applyTodoPatch(block.todo, patch, today);
    lines.splice(block.start, block.end - block.start, ...formatTodo(next));
    writeLines(this.todosPath, lines);
    return next;
  }

  deleteTodo(id: string): boolean {
    const { lines, blocks } = this.readTodoFile();
    const block = blocks.find((candidate) => candidate.todo.id === id);
    if (!block) return false;
    this.trash(this.todosPath, lines.slice(block.start, block.end));
    lines.splice(block.start, block.end - block.start);
    writeLines(this.todosPath, lines);
    return true;
  }

  // ---- Goals ---------------------------------------------------------------

  getGoals(): Goal[] {
    if (!existsSync(this.goalsDir)) return [];
    return readdirSync(this.goalsDir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => {
        const slug = file.slice(0, -3);
        return parseGoal(slug, readFileSync(join(this.goalsDir, file), "utf8"));
      })
      .sort((a, b) => b.cycle.localeCompare(a.cycle) || a.title.localeCompare(b.title));
  }

  getGoal(slug: string): Goal | null {
    // Only plain slugs, so a URL can never point outside the goals folder.
    if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) return null;
    const path = join(this.goalsDir, `${slug}.md`);
    return existsSync(path) ? parseGoal(slug, readFileSync(path, "utf8")) : null;
  }

  createGoal(input: { title: string; cycle: string; body: string }): Goal {
    const base = slugify(input.title) || "goal";
    const taken = (candidate: string) => existsSync(join(this.goalsDir, `${candidate}.md`));
    // Reusing a goal name in a new cycle gets a readable link like
    // [[improve-reliability-2027]] before falling back to -2, -3...
    const withCycle = slugify(`${base} ${input.cycle}`);
    const otherCycle = taken(base) && this.getGoal(base)?.cycle !== input.cycle.trim();
    let slug = otherCycle && withCycle && !taken(withCycle) ? withCycle : base;
    for (let n = 2; taken(slug); n++) slug = `${base}-${n}`;
    const goal: Goal = { slug, title: input.title.trim(), cycle: input.cycle.trim(), status: "active", body: input.body };
    writeAtomic(join(this.goalsDir, `${slug}.md`), formatGoal(goal));
    return goal;
  }

  /** Title/cycle/status/body change in place; the slug (and so every [[link]]) stays stable. */
  saveGoal(slug: string, change: { title: string; cycle: string; status: GoalStatus; body: string }): Goal | null {
    const existing = this.getGoal(slug);
    if (!existing) return null;
    const goal: Goal = { ...existing, ...change, title: change.title.trim(), cycle: change.cycle.trim() };
    writeAtomic(join(this.goalsDir, `${slug}.md`), formatGoal(goal));
    return goal;
  }
}
