import * as z from "zod/v4";
import { isValidDateString, localDateString, localTimeString } from "../lib/date";
import { contentRevision } from "../vault/revision";
import { parseEntryInput, type Vault } from "../vault/vault";

export const entryDate = z.string().refine(isValidDateString, "Use a valid local YYYY-MM-DD date.");
export const entryKey = z.object({ date: entryDate, id: z.string().min(1).max(128) });
export const entryFilters = z.object({
  from: entryDate.optional(),
  to: entryDate.optional(),
  q: z.string().max(1000).optional(),
  tag: z.string().max(100).optional(),
  goal: z.string().max(128).optional(),
  isHighlight: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const requestId = z.string().min(1).max(128);
const entryText = z
  .string()
  .max(128000)
  .refine((text) => Boolean(parseEntryInput(text).text), "Entry text cannot be empty.");
const metadata = {
  tags: z
    .array(
      z
        .string()
        .regex(/^(?!\d+$)[\p{L}\p{N}_/-]+$/u)
        .max(100)
        .transform((tag) => tag.toLowerCase()),
    )
    .max(100)
    .optional(),
  goals: z
    .array(
      z
        .string()
        .max(128)
        .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u),
    )
    .max(100)
    .optional(),
  minutes: z.number().int().nonnegative().nullable().optional(),
  isHighlight: z.boolean().optional(),
  time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
};
export const newEntry = z.object({ text: entryText, date: entryDate.optional(), ...metadata, requestId }).strict();
export const entryTarget = entryKey
  .extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), requestId })
  .strict();
export const entryPatch = entryTarget.extend({ text: entryText.optional(), ...metadata }).strict();

/** Ledger operations share the app's Markdown store; discovery never changes files. */
export class LedgerService {
  private readonly requests = new Map<string, { fingerprint: string; result: object }>();
  constructor(
    private readonly vault: Vault,
    private readonly clock: () => Date,
  ) {}

  list(input: z.input<typeof entryFilters>) {
    const filters = entryFilters.parse(input);
    const today = localDateString(this.clock());
    const from = filters.from ?? filters.to ?? today;
    const to = filters.to ?? from;
    if (from > to) throw new Error("from must be on or before to.");
    const q = filters.q?.toLowerCase() ?? "";
    const entries = this.vault
      .listDates()
      .filter((date) => date >= from && date <= to)
      .flatMap((date) => this.vault.peekEntries(date))
      .filter(
        (entry) =>
          (!filters.tag || entry.tags.includes(filters.tag.toLowerCase())) &&
          (!filters.goal || entry.goals.includes(filters.goal)) &&
          (filters.isHighlight === undefined || entry.isHighlight === filters.isHighlight) &&
          (!q || [entry.text, ...entry.tags, ...entry.goals].join(" ").toLowerCase().includes(q)),
      );
    return {
      today,
      from,
      to,
      total: entries.length,
      entries: entries
        .slice(filters.offset, filters.offset + filters.limit)
        .map((entry) => ({ ...entry, revision: contentRevision(entry) })),
      nextOffset: filters.offset + filters.limit < entries.length ? filters.offset + filters.limit : null,
    };
  }

  get(input: z.input<typeof entryKey>) {
    const { date, id } = entryKey.parse(input);
    const entry = this.vault.peekEntries(date).find((entry) => entry.id === id);
    if (!entry) throw new Error("Entry not found. Refresh the ledger. Open its day in ToDo to assign missing IDs.");
    return { ...entry, revision: contentRevision(entry) };
  }

  goals() {
    return { goals: this.vault.getGoals().map(({ slug, title, cycle, status }) => ({ slug, title, cycle, status })) };
  }

  tags() {
    const counts = new Map<string, number>();
    const items = [
      ...this.vault.peekTodos(),
      ...this.vault.listDates().flatMap((date) => this.vault.peekEntries(date)),
    ];
    for (const item of items) for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return {
      tags: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count })),
    };
  }

  execute(name: string, raw: unknown): object {
    const command =
      name === "add_entry"
        ? ({ name, input: newEntry.parse(raw) } as const)
        : name === "update_entry"
          ? ({ name, input: entryPatch.parse(raw) } as const)
          : name === "delete_entry"
            ? ({ name, input: entryTarget.parse(raw) } as const)
            : (() => {
                throw new Error("Unknown ledger operation.");
              })();
    const { input } = command;
    const fingerprint = contentRevision({ name, input });
    const previous = this.requests.get(input.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new Error("This requestId was already used for a different operation.");
      return previous.result;
    }
    let result: object;
    if (command.name === "add_entry") {
      const value = command.input;
      const now = this.clock();
      const date = value.date ?? localDateString(now);
      const [created] = this.vault.addEntries(date, [value.text], {
        tags: value.tags ?? [],
        goals: value.goals ?? [],
        minutes: value.minutes ?? null,
        isHighlight: value.isHighlight ?? false,
        time: value.time !== undefined ? value.time : date === localDateString(now) ? localTimeString(now) : null,
      });
      result = this.get({ date, id: created.id });
    } else {
      const value = command.input;
      const current = this.get(value);
      if (current.revision !== value.expectedRevision)
        throw new Error("This entry changed. Read it again before editing.");
      if (command.name === "delete_entry") {
        this.vault.deleteEntry(value.date, value.id);
        result = { deleted: value.id, date: value.date };
      } else {
        const value = command.input;
        const parsed = value.text === undefined ? null : parseEntryInput(value.text);
        this.vault.updateEntry(value.date, value.id, (entry) => ({
          ...entry,
          text: parsed?.text ?? entry.text,
          tags: [...new Set([...(parsed?.tags ?? []), ...(value.tags ?? entry.tags)])],
          goals: [...new Set([...(parsed?.goals ?? []), ...(value.goals ?? entry.goals)])],
          minutes: value.minutes === undefined ? entry.minutes : value.minutes,
          isHighlight: value.isHighlight ?? entry.isHighlight,
          time: value.time === undefined ? entry.time : value.time,
        }));
        result = this.get(value);
      }
    }
    if (this.requests.size >= 1024) this.requests.delete(this.requests.keys().next().value!);
    this.requests.set(input.requestId, { fingerprint, result });
    return result;
  }
}
