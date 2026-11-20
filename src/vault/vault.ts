/**
 * File-backed store. The vault is a folder of Markdown files that is the
 * single source of truth; back it up by copying the folder.
 *
 *   vault/
 *     journal/2026/2026-09-28.md   one daily note per day with entries
 *     todos.md                     every todo and its subtasks, in the user's order
 *     goals/<slug>.md              one file per goal
 *     .trash/deleted.md            append-only log of deleted lines
 *     .workledger/error.log        the desktop app's error log (not notes)
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { isValidDateString, localDateString, nowUtcIso } from "../lib/date";
import { mapOutsideFences } from "../lib/lines";
import type { Priority, Status } from "../lib/validation";
import {
  cleanCycle,
  firstCharacters,
  isGoalSlug,
  isReservedSlug,
  isValidPriority,
  isValidStatus,
  slugify,
} from "../lib/validation";
import {
  allSubtasks,
  compareGoals,
  entryContent,
  formatEntry,
  formatGoal,
  formatSubtasks,
  formatTodo,
  parseEntryBlocks,
  parseEntryLine,
  parseGoal,
  parseTodoBlocks,
  renameEntryLinks,
  renameTodoLinks,
  entryView,
  todoView,
  type Entry,
  type EntryBlock,
  type Goal,
  type Subtask,
  type Todo,
  type TodoBlock,
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
  dueOn?: string | null;
}

export type GoalText = Pick<Goal, "description" | "meeting" | "exceeding" | "notes">;

export type NewGoal = Pick<Goal, "title" | "cycle"> & Partial<Pick<Goal, "kind" | "status"> & GoalText>;

export type GoalChange = Pick<Goal, "title" | "status"> & GoalText;

export const DUE_DATE_ERROR = "Due date must be a valid date.";

export interface TodoPatch {
  task?: string;
  priority?: Priority | null;
  notes?: string;
  /** null clears the due date. */
  dueOn?: string | null;
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
  if (patch.dueOn !== undefined) next.dueOn = patch.dueOn;
  if (patch.isHighlight !== undefined) next.isHighlight = patch.isHighlight;
  if (patch.status !== undefined) {
    next.status = patch.status;
    if (patch.status === "Done" && next.completedOn === null) next.completedOn = patch.completedOn ?? today;
    // Only on the move to Done: saving a todo that's already done keeps any subtask the user unchecked.
    if (patch.status === "Done" && todo.status !== "Done") next.subtasks = checkAll(next.subtasks);
  }
  if (patch.clearCompletion) next.completedOn = null;
  return next;
}

/** Splits user-typed text into the sentence plus any #tags / [[goal]] links it contains. */
export function parseTaskInput(raw: string): { task: string; tags: string[]; goals: string[] } {
  const parsed = parseEntryLine(`- ${raw.replace(/\s+/g, " ").trim()}`, "");
  return { task: parsed?.text ?? "", tags: parsed?.tags ?? [], goals: parsed?.goals ?? [] };
}

/** Trims prose line ends and outer blank lines, preserving whitespace inside fenced code. */
export function parseEntryInput(raw: string): { text: string; tags: string[]; goals: string[] } {
  const lines = mapOutsideFences(raw.replace(/\r\n/g, "\n").split("\n"), (line) => line.trimEnd());
  while (lines.length > 0 && !lines[0]) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
  if (lines.length === 0) return { text: "", tags: [], goals: [] };

  lines[0] = lines[0].trimStart().replace(/^\[.\](?:[ \t]+|$)/, "");
  const first = parseEntryLine(`- ${lines[0]}`, "");
  return entryContent(first ?? { text: "", tags: [], goals: [] }, lines.slice(1));
}

/** Done is done all the way down: checking an item checks everything under it. */
function checkAll(subtasks: Subtask[]): Subtask[] {
  return subtasks.map((subtask) => ({ ...subtask, done: true, children: checkAll(subtask.children) }));
}

/** Where to put a moved item, relative to another one. */
export interface MoveTarget {
  before?: string;
  after?: string;
  /** Subtasks only: become the last child of this todo or subtask. */
  into?: string;
}

/** A subtask, the list it sits in, and the block of the todo it belongs to. */
interface FoundSubtask {
  subtask: Subtask;
  siblings: Subtask[];
  block: TodoBlock;
}

function findSubtask(blocks: TodoBlock[], id: string): FoundSubtask | null {
  for (const block of blocks) {
    const search = (siblings: Subtask[]): FoundSubtask | null => {
      for (const subtask of siblings) {
        if (subtask.id === id) return { subtask, siblings, block };
        const found = search(subtask.children);
        if (found) return found;
      }
      return null;
    };
    const found = search(block.todo.subtasks);
    if (found) return found;
  }
  return null;
}

/** Todos and subtasks share one id space per file. */
function takenIds(blocks: TodoBlock[]): Set<string> {
  return new Set(
    blocks.flatMap((block) => [block.todo.id, ...allSubtasks(block.todo.subtasks).map((s) => s.id)]).filter(Boolean),
  );
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
  blocks: EntryBlock[];
}

interface TodoFile {
  lines: string[];
  blocks: TodoBlock[];
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
    appendFileSync(
      path,
      `- Deleted ${nowUtcIso()} from ${where}\n${lines.map((l) => `    ${l}`).join("\n")}\n`,
      "utf8",
    );
  }

  // ---- Journal -------------------------------------------------------------

  /** Reads a daily note, assigning missing IDs by rewriting only each entry's first line. */
  private readDay(date: string): DayFile {
    const path = this.dayPath(date);
    const lines = readLines(path);
    const blocks = parseEntryBlocks(lines, date).filter((block) => block.entry.text);

    const taken = new Set(blocks.map((block) => block.entry.id).filter(Boolean));
    const missing = blocks.filter((block) => !block.entry.id);
    if (missing.length > 0) {
      for (const block of missing) {
        block.entry.id = newId(taken);
        taken.add(block.entry.id);
        lines[block.start] = `${lines[block.start].trimEnd()} ^${block.entry.id}`;
      }
      writeLines(path, lines);
    }
    return { lines, blocks };
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
    return this.readDay(date).blocks.map((block) => block.entry);
  }

  /** MCP reads must not assign IDs or rewrite hand-written daily notes. */
  peekEntries(date: string): Entry[] {
    return parseEntryBlocks(readLines(this.dayPath(date)), date)
      .map((block) => block.entry)
      .filter((entry) => entry.text);
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
    const { lines, blocks } = this.readDay(date);
    const taken = new Set(blocks.map((block) => block.entry.id));

    const created = texts.map((raw) => {
      const input = parseEntryInput(raw);
      const entry: Entry = {
        id: newId(taken),
        date,
        time: meta.time,
        text: input.text,
        tags: [...new Set([...input.tags, ...meta.tags])],
        goals: [...new Set([...input.goals, ...meta.goals])],
        minutes: meta.minutes,
        isHighlight: meta.isHighlight,
      };
      taken.add(entry.id);
      return entry;
    });

    const newLines = created.flatMap(formatEntry);
    if (lines.length === 0) {
      writeLines(path, [`---`, `date: ${date}`, `---`, ``, ...newLines]);
    } else {
      const at = blocks.length > 0 ? blocks[blocks.length - 1].end : lines.length;
      lines.splice(at, 0, ...newLines);
      writeLines(path, lines);
    }
    return created;
  }

  updateEntry(date: string, id: string, change: (entry: Entry) => Entry): Entry | null {
    const { lines, blocks } = this.readDay(date);
    const block = blocks.find((candidate) => candidate.entry.id === id);
    if (!block) return null;
    const next = change({ ...block.entry });
    lines.splice(block.start, block.end - block.start, ...formatEntry(next));
    writeLines(this.dayPath(date), lines);
    return next;
  }

  deleteEntry(date: string, id: string): boolean {
    const path = this.dayPath(date);
    const { lines, blocks } = this.readDay(date);
    const block = blocks.find((candidate) => candidate.entry.id === id);
    if (!block) return false;
    this.trash(path, lines.slice(block.start, block.end));
    lines.splice(block.start, block.end - block.start);
    writeLines(path, lines);
    return true;
  }

  // ---- Todos ---------------------------------------------------------------

  /** Reads todos.md, giving any hand-written todo or subtask line an id (only those lines change). */
  private readTodoFile(): TodoFile {
    const lines = readLines(this.todosPath);
    const blocks = parseTodoBlocks(lines).filter((block) => block.todo.task);
    const taken = takenIds(blocks);
    let changed = false;
    for (const block of blocks) {
      if (!block.todo.id) {
        block.todo.id = newId(taken);
        taken.add(block.todo.id);
        lines[block.start] = formatTodo(block.todo)[0];
        changed = true;
      }
      for (const { subtask, index } of block.subtaskLines) {
        if (subtask.id) continue;
        subtask.id = newId(taken);
        taken.add(subtask.id);
        // Just add the id, so the line keeps its mark and spacing as written.
        lines[index] = `${lines[index].trimEnd()} ^${subtask.id}`;
        changed = true;
      }
    }
    if (changed) writeLines(this.todosPath, lines);
    return { lines, blocks };
  }

  /** Rewrites these todos' blocks, last first so earlier line numbers stay valid. */
  private writeTodoBlocks(lines: string[], blocks: TodoBlock[]): void {
    for (const block of [...new Set(blocks)].sort((a, b) => b.start - a.start)) {
      lines.splice(block.start, block.end - block.start, ...formatTodo(block.todo));
    }
    writeLines(this.todosPath, lines);
  }

  getTodos(): Todo[] {
    return this.readTodoFile().blocks.map((block) => block.todo);
  }

  /** A true read: MCP reads must not assign IDs or rewrite hand-written tasks. */
  peekTodos(): Todo[] {
    return parseTodoBlocks(readLines(this.todosPath))
      .map((block) => block.todo)
      .filter((todo) => todo.task);
  }

  /** Every tag on an entry or todo with how often it's used, most used first. */
  getTagCounts(): [string, number][] {
    const counts = new Map<string, number>();
    for (const item of [...this.getAllEntries(), ...this.getTodos()]) {
      for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  getTodo(id: string): Todo | null {
    return this.getTodos().find((todo) => todo.id === id) ?? null;
  }

  getSubtask(id: string): Subtask | null {
    return findSubtask(this.readTodoFile().blocks, id)?.subtask ?? null;
  }

  addTodo(input: NewTodo, today: string = localDateString()): Todo {
    if (!parseTaskInput(input.task).task) throw new Error("A todo needs a task.");
    if (!isValidPriority(input.priority)) throw new Error("Pick High, Medium, Low or no priority.");
    if (!isValidStatus(input.status)) throw new Error("That status isn't one the app knows.");
    if (input.dueOn && !isValidDateString(input.dueOn)) throw new Error(DUE_DATE_ERROR);
    const { lines, blocks } = this.readTodoFile();
    const parsed = parseTaskInput(input.task);
    const todo: Todo = {
      id: newId(takenIds(blocks)),
      status: input.status,
      task: parsed.task,
      tags: [...new Set([...parsed.tags, ...input.tags])],
      goals: [...new Set([...parsed.goals, ...input.goals])],
      priority: input.priority,
      minutes: null,
      isHighlight: false,
      createdOn: today,
      dueOn: input.dueOn || null,
      completedOn: input.status === "Done" ? today : null,
      notes: input.notes,
      subtasks: [],
    };

    // Newest on top, above the first todo; the user reorders from there.
    if (blocks.length > 0) {
      lines.splice(blocks[0].start, 0, ...formatTodo(todo));
      writeLines(this.todosPath, lines);
    } else {
      const head = lines.length === 0 ? ["---", "type: todos", "---", ""] : lines;
      writeLines(this.todosPath, [...head, ...formatTodo(todo)]);
    }
    return todo;
  }

  updateTodo(id: string, patch: TodoPatch, today: string = localDateString()): Todo | null {
    if (patch.task !== undefined && !parseTaskInput(patch.task).task) throw new Error("A todo needs a task.");
    if (patch.priority !== undefined && !isValidPriority(patch.priority))
      throw new Error("Pick High, Medium, Low or no priority.");
    if (patch.status !== undefined && !isValidStatus(patch.status))
      throw new Error("That status isn't one the app knows.");
    if (patch.completedOn !== undefined && (!isValidDateString(patch.completedOn) || patch.completedOn > today)) {
      throw new Error("Completion date must be a valid date on or before today.");
    }
    if (patch.dueOn && !isValidDateString(patch.dueOn)) throw new Error(DUE_DATE_ERROR);
    const { lines, blocks } = this.readTodoFile();
    const block = blocks.find((candidate) => candidate.todo.id === id);
    if (!block) return null;
    block.todo = applyTodoPatch(block.todo, patch, today);
    this.writeTodoBlocks(lines, [block]);
    return block.todo;
  }

  /** Moves a todo, with its notes and subtasks, to just before or after another todo. */
  moveTodo(id: string, target: MoveTarget): boolean {
    const { lines, blocks } = this.readTodoFile();
    const block = blocks.find((candidate) => candidate.todo.id === id);
    const anchorId = target.before ?? target.after;
    const anchor = blocks.find((candidate) => candidate.todo.id === anchorId);
    if (!block || !anchor || anchor === block) return false;
    const moved = lines.splice(block.start, block.end - block.start);
    const shift = anchor.start > block.start ? moved.length : 0;
    lines.splice((target.before ? anchor.start : anchor.end) - shift, 0, ...moved);
    writeLines(this.todosPath, lines);
    return true;
  }

  /** Adds a subtask at the end of a todo's list. */
  addSubtask(todoId: string, text: string): Subtask | null {
    if (!text.trim()) throw new Error("A subtask needs some text.");
    const { lines, blocks } = this.readTodoFile();
    const block = blocks.find((candidate) => candidate.todo.id === todoId);
    if (!block) return null;
    const subtask: Subtask = {
      id: newId(takenIds(blocks)),
      text: text.replace(/\s+/g, " ").trim(),
      done: false,
      children: [],
    };
    block.todo.subtasks.push(subtask);
    this.writeTodoBlocks(lines, [block]);
    return subtask;
  }

  /** Checking a subtask checks everything under it. Unchecking changes only that one. */
  setSubtaskDone(id: string, done: boolean): boolean {
    const { lines, blocks } = this.readTodoFile();
    const found = findSubtask(blocks, id);
    if (!found) return false;
    found.subtask.done = done;
    if (done) found.subtask.children = checkAll(found.subtask.children);
    this.writeTodoBlocks(lines, [found.block]);
    return true;
  }

  editSubtask(id: string, text: string): boolean {
    if (!text.trim()) throw new Error("A subtask needs some text.");
    const { lines, blocks } = this.readTodoFile();
    const found = findSubtask(blocks, id);
    if (!found) return false;
    found.subtask.text = text.replace(/\s+/g, " ").trim();
    this.writeTodoBlocks(lines, [found.block]);
    return true;
  }

  /** Deletes a subtask and everything under it, keeping a copy in the trash. */
  deleteSubtask(id: string): boolean {
    const { lines, blocks } = this.readTodoFile();
    const found = findSubtask(blocks, id);
    if (!found) return false;
    this.trash(this.todosPath, formatSubtasks([found.subtask], ""));
    found.siblings.splice(found.siblings.indexOf(found.subtask), 1);
    this.writeTodoBlocks(lines, [found.block]);
    return true;
  }

  /**
   * Moves a subtask (and everything under it) next to another subtask, or to the
   * end of a todo's or subtask's list. It can't go inside itself, and it stays a
   * subtask: a todo is never an anchor for before/after.
   */
  moveSubtask(id: string, target: MoveTarget): boolean {
    const { lines, blocks } = this.readTodoFile();
    const found = findSubtask(blocks, id);
    if (!found) return false;
    // Take it out first, so it (and its children) can't be found as the destination.
    found.siblings.splice(found.siblings.indexOf(found.subtask), 1);

    let destination: TodoBlock;
    if (target.into) {
      const todoBlock = blocks.find((candidate) => candidate.todo.id === target.into);
      const parent = findSubtask(blocks, target.into);
      if (todoBlock) {
        todoBlock.todo.subtasks.push(found.subtask);
        destination = todoBlock;
      } else if (parent) {
        parent.subtask.children.push(found.subtask);
        destination = parent.block;
      } else {
        return false;
      }
    } else {
      const anchorId = target.before ?? target.after;
      const anchor = anchorId ? findSubtask(blocks, anchorId) : null;
      if (!anchor) return false;
      anchor.siblings.splice(anchor.siblings.indexOf(anchor.subtask) + (target.before ? 0 : 1), 0, found.subtask);
      destination = anchor.block;
    }
    this.writeTodoBlocks(lines, [found.block, destination]);
    return true;
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
      .sort((a, b) => b.cycle.localeCompare(a.cycle) || compareGoals(a, b));
  }

  getGoal(slug: string): Goal | null {
    // Only plain slugs, so a URL can never point outside the goals folder.
    if (!isGoalSlug(slug)) return null;
    const path = join(this.goalsDir, `${slug}.md`);
    return existsSync(path) ? parseGoal(slug, readFileSync(path, "utf8")) : null;
  }

  /** A new goal starts as a draft at the end of its cycle and kind. */
  createGoal(input: NewGoal): Goal {
    const cycle = cleanCycle(input.cycle);
    const kind = input.kind ?? "goal";
    // Every candidate is checked, so the file is always one the app can open.
    const base = [slugify(input.title), "goal"].find(isGoalSlug)!;
    // Reserved slugs: a route, or a name Windows won't open as a file.
    const taken = (candidate: string) =>
      isReservedSlug(candidate) || existsSync(join(this.goalsDir, `${candidate}.md`));
    // Reusing a goal name in a new cycle gets a readable link like
    // [[improve-reliability-2027]] before falling back to -2, -3...
    // Long FCP names fill slugify's 48 characters, so make room for the cycle;
    // with no room left for the name, skip the cycle link.
    const suffix = slugify(cycle);
    const shortBase = firstCharacters(base, 47 - Array.from(suffix).length).replace(/-+$/, "");
    const withCycle = suffix && shortBase ? `${shortBase}-${suffix}` : "";
    const sameName = isReservedSlug(base) ? null : this.getGoal(base);
    const otherCycle = sameName !== null && sameName.cycle !== cycle;
    let slug = otherCycle && isGoalSlug(withCycle) && !taken(withCycle) ? withCycle : base;
    for (let n = 2; taken(slug); n++) slug = `${base}-${n}`;
    if (!isGoalSlug(slug)) throw new Error("Could not make a link for this goal. Try another name.");

    // Goals written before ordering sort last, so number them first, in sheet
    // order; otherwise the new goal would jump ahead of them.
    const peers = this.getGoals().filter((goal) => goal.cycle === cycle && goal.kind === kind);
    let last = Math.max(0, ...peers.filter((goal) => Number.isFinite(goal.order)).map((goal) => goal.order));
    for (const peer of peers.filter((goal) => !Number.isFinite(goal.order))) {
      writeAtomic(join(this.goalsDir, `${peer.slug}.md`), formatGoal({ ...peer, order: ++last }));
    }
    const goal: Goal = {
      slug,
      title: oneLine(input.title),
      cycle,
      status: input.status ?? "draft",
      kind,
      order: last + 1,
      droppedOn: null,
      description: cleanText(input.description),
      meeting: cleanText(input.meeting),
      exceeding: cleanText(input.exceeding),
      notes: cleanText(input.notes),
    };
    writeAtomic(join(this.goalsDir, `${slug}.md`), formatGoal(goal));
    return goal;
  }

  /**
   * Name, status and text change in place; the slug (and so every [[link]]),
   * cycle, kind and order stay. Dropping stamps today's date once; any other
   * status clears it.
   */
  saveGoal(slug: string, change: GoalChange, today: string = localDateString()): Goal | null {
    const existing = this.getGoal(slug);
    if (!existing) return null;
    const goal: Goal = {
      ...existing,
      title: oneLine(change.title),
      status: change.status,
      droppedOn: change.status !== "dropped" ? null : existing.status === "dropped" ? existing.droppedOn : today,
      description: cleanText(change.description),
      meeting: cleanText(change.meeting),
      exceeding: cleanText(change.exceeding),
      notes: cleanText(change.notes),
    };
    writeAtomic(join(this.goalsDir, `${slug}.md`), formatGoal(goal));
    return goal;
  }

  /** Why `to` can't be a goal's new link, or null if it can. */
  goalLinkProblem(from: string, to: string): string | null {
    if (!to) return "A link needs at least one letter or number.";
    // slugify cuts at 48 characters, which can split a rare character in two.
    if (!isGoalSlug(to)) return "Use letters and numbers, joined by single hyphens.";
    if (isReservedSlug(to)) return "That link is reserved. Pick another.";
    // Exact names, so a case-only change of this goal's own file isn't "taken"
    // on Windows, and existsSync for another goal that differs only in case.
    const exact = existsSync(this.goalsDir) && readdirSync(this.goalsDir).includes(`${to}.md`);
    const caseOnly = to.toLowerCase() === from.toLowerCase();
    if (to !== from && (exact || (!caseOnly && existsSync(join(this.goalsDir, `${to}.md`)))))
      return `Another goal already uses [[${to}]].`;
    return null;
  }

  /**
   * Changes a goal's link to `to`, an already checked slug (see
   * goalLinkProblem): renames its file, then points `[[from]]` links in
   * journal entries and todos (task, notes and subtasks) at it. Every file is
   * read and changed first. An entry or todo keeps its text as it was, and
   * counted in `failed`, when the change wouldn't read the same with only the
   * link renamed, or its file can't be written (another app has it locked).
   */
  renameGoal(from: string, to: string): { slug: string; entries: number; todos: number; failed: number } | null {
    if (!this.getGoal(from)) return null;
    const problem = this.goalLinkProblem(from, to);
    if (problem) throw new Error(problem);

    const writes: { path: string; lines: string[]; changed: number; kind: "entries" | "todos" }[] = [];
    const counts = { entries: 0, todos: 0, failed: 0 };
    for (const date of this.listDates()) {
      const lines = readLines(this.dayPath(date));
      const result = renameInBlocks(
        lines,
        parseEntryBlocks(lines, date),
        (block) => renameEntryLinks(block, date, from, to),
        (block, renamed) => (renamed ? entryView(block, date, from, to) : entryView(block, date)),
      );
      counts.failed += result.failed;
      if (result.changed) writes.push({ path: this.dayPath(date), lines, changed: result.changed, kind: "entries" });
    }
    const todoLines = readLines(this.todosPath);
    const todoResult = renameInBlocks(
      todoLines,
      parseTodoBlocks(todoLines),
      (block) => renameTodoLinks(block, from, to),
      (block, renamed) => (renamed ? todoView(block, from, to) : todoView(block)),
    );
    counts.failed += todoResult.failed;
    if (todoResult.changed)
      writes.push({ path: this.todosPath, lines: todoLines, changed: todoResult.changed, kind: "todos" });

    renameSync(join(this.goalsDir, `${from}.md`), join(this.goalsDir, `${to}.md`));
    for (const { path, lines, changed, kind } of writes) {
      try {
        writeLines(path, lines);
        counts[kind] += changed;
      } catch (error) {
        console.error(error);
        counts.failed += changed;
      }
    }
    return { slug: to, ...counts };
  }

  /**
   * Swaps a goal with its live neighbour in the same cycle and kind, then
   * numbers them 1..n, dropped ones after. False at either end, or if dropped.
   */
  moveGoal(slug: string, direction: "up" | "down"): boolean {
    const goal = this.getGoal(slug);
    if (!goal || goal.status === "dropped") return false;
    const peers = this.getGoals().filter((other) => other.cycle === goal.cycle && other.kind === goal.kind);
    const live = peers.filter((other) => other.status !== "dropped");
    const index = live.findIndex((other) => other.slug === slug);
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= live.length) return false;
    [live[index], live[target]] = [live[target], live[index]];

    const ordered = [...live, ...peers.filter((other) => other.status === "dropped")];
    ordered.forEach((other, position) => {
      if (other.order === position + 1) return;
      writeAtomic(join(this.goalsDir, `${other.slug}.md`), formatGoal({ ...other, order: position + 1 }));
    });
    return true;
  }
}

/**
 * Renames links block by block, in place. `view(block, true)` is how the old
 * block should read once renamed; a block whose new text doesn't read exactly
 * like that is left as it was and counted as failed. Blocks that don't link
 * to the goal are skipped.
 */
export function renameInBlocks(
  lines: string[],
  blocks: { start: number; end: number }[],
  rename: (block: string[]) => string[],
  view: (block: string[], renamed: boolean) => string,
): { changed: number; failed: number } {
  const result = { changed: 0, failed: 0 };
  for (const { start, end } of blocks) {
    const before = lines.slice(start, end);
    const expected = view(before, true);
    if (expected === view(before, false)) continue;
    const after = rename(before);
    if (after.length !== before.length || view(after, false) !== expected) {
      result.failed++;
      continue;
    }
    lines.splice(start, end - start, ...after);
    result.changed++;
  }
  return result;
}

/**
 * Goal names are one line of plain text, so they stay valid frontmatter: line
 * breaks, other control characters and runs of spaces become one space. Cycles
 * use cleanCycle, which keeps their spacing.
 */
function oneLine(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
  return text.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ").trim();
}

/** Form posts send CRLF line endings; files use LF. */
function cleanText(text = ""): string {
  return text.replace(/\r\n?/g, "\n").trim();
}
