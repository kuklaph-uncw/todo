import { afterEach, beforeEach, expect, it } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LedgerService } from "../../src/mcp/ledger";
import { createTestContext } from "../helpers/test-vault";

let ctx: ReturnType<typeof createTestContext>;
beforeEach(() => (ctx = createTestContext()));
afterEach(() => ctx.cleanup());

it("reads ledger entries and discovers goals/tags without assigning missing IDs", () => {
  const dir = join(ctx.root, "journal", "2026");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "2026-09-28.md");
  const source = "- 09:00 Hand written #ops [[delivery]]\n    Keep **Markdown**\n";
  writeFileSync(path, source);
  writeFileSync(join(ctx.root, "todos.md"), "- [ ] Follow up #ops #support\n");
  const goal = ctx.vault.createGoal({ title: "Delivery", cycle: "2026", body: "Ship carefully" });
  const service = new LedgerService(ctx.vault, ctx.clock);
  const listed = service.list({});
  expect(listed.today).toBe("2026-09-28");
  expect(listed.entries).toHaveLength(1);
  expect(listed.entries[0]).toMatchObject({ id: "", date: "2026-09-28", text: "Hand written\nKeep **Markdown**" });
  expect(service.goals().goals).toContainEqual({ slug: goal.slug, title: "Delivery", cycle: "2026", status: "active" });
  expect(service.tags().tags).toEqual([
    { tag: "ops", count: 2 },
    { tag: "support", count: 1 },
  ]);
  expect(readFileSync(path, "utf8")).toBe(source);
  expect(readFileSync(join(ctx.root, "todos.md"), "utf8")).toBe("- [ ] Follow up #ops #support\n");
  expect(() => service.get({ date: "2026-09-28", id: "" })).toThrow();
});

it("creates entries with inline and structured metadata and returns the persisted revision", () => {
  const service = new LedgerService(ctx.vault, ctx.clock);
  const goal = ctx.vault.createGoal({ title: "Delivery", cycle: "2026", body: "" });
  const added = service.execute("add_entry", {
    text: "Shipped #ops [[delivery]]\n\n```sh\necho done  \n```",
    tags: ["Support"],
    goals: [goal.slug],
    minutes: 90,
    isHighlight: true,
    requestId: "entry-one",
  });
  expect(added).toMatchObject({
    date: "2026-09-28",
    time: "14:05",
    tags: ["ops", "support"],
    goals: [goal.slug],
    minutes: 90,
    isHighlight: true,
  });
  expect(added).toEqual(service.list({}).entries[0]);
  const past = service.execute("add_entry", {
    date: "2026-09-27",
    text: "```\ncode\n```",
    tags: ["ops"],
    goals: [goal.slug],
    requestId: "past",
  });
  expect(past).toMatchObject({ date: "2026-09-27", time: null, tags: ["ops"], goals: [goal.slug] });
  expect(service.list({ from: "2026-09-27", to: "2026-09-28", tag: "OPS", goal: goal.slug }).total).toBe(2);
  expect([added]).toEqual(service.list({ isHighlight: true }).entries);
  expect(service.list({ from: "2026-09-27", to: "2026-09-28", limit: 1 }).nextOffset).toBe(1);
});

it("patches only supplied fields, protects stale edits, deduplicates writes and trashes deletions", () => {
  const service = new LedgerService(ctx.vault, ctx.clock);
  const create = { text: "Original #ops [[delivery]]", minutes: 45, isHighlight: true, requestId: "create" };
  const first = service.execute("add_entry", create);
  expect(service.execute("add_entry", create)).toEqual(first);
  expect(service.list({}).total).toBe(1);
  expect(() => service.execute("add_entry", { ...create, text: "Different" })).toThrow("requestId");
  const current = service.list({}).entries[0];
  const edit = {
    date: current.date,
    id: current.id,
    expectedRevision: current.revision,
    minutes: 90,
    requestId: "edit",
  };
  const changed = service.execute("update_entry", edit);
  expect(changed).toMatchObject({
    text: "Original",
    tags: ["ops"],
    goals: ["delivery"],
    isHighlight: true,
    minutes: 90,
  });
  expect(service.execute("update_entry", edit)).toEqual(changed);
  expect(() => service.execute("update_entry", { ...edit, text: "Stale", requestId: "stale" })).toThrow("changed");
  const latest = service.get(current);
  service.execute("update_entry", {
    date: latest.date,
    id: latest.id,
    expectedRevision: latest.revision,
    tags: [],
    goals: [],
    minutes: null,
    isHighlight: false,
    time: null,
    requestId: "clear",
  });
  const cleared = service.get(current);
  expect(cleared).toMatchObject({
    text: "Original",
    tags: [],
    goals: [],
    minutes: null,
    time: null,
    isHighlight: false,
  });
  const remove = { date: cleared.date, id: cleared.id, expectedRevision: cleared.revision, requestId: "delete" };
  expect(service.execute("delete_entry", remove)).toEqual({ deleted: cleared.id, date: cleared.date });
  expect(service.execute("delete_entry", remove)).toEqual({ deleted: cleared.id, date: cleared.date });
  expect(service.list({}).entries).toEqual([]);
  expect(readFileSync(join(ctx.root, ".trash", "deleted.md"), "utf8")).toContain("Original");
});

it("validates dates, text and metadata before touching files and allows correction of failed requests", () => {
  const service = new LedgerService(ctx.vault, ctx.clock);
  for (const value of [
    { date: "../../outside" },
    { date: "2026-02-30" },
    { text: "[ ]" },
    { minutes: -1 },
    { minutes: 1.5 },
    { time: "24:30" },
    { tags: ["space tag"] },
    { goals: ["../outside"] },
  ]) {
    expect(() => service.execute("add_entry", { text: "Entry", requestId: "bad", ...value })).toThrow();
    expect(ctx.vault.listDates()).toEqual([]);
  }
  service.execute("add_entry", { text: "Corrected", requestId: "bad" });
  expect(service.list({}).total).toBe(1);
  expect(() => service.list({ from: "2026-09-29", to: "2026-09-28" })).toThrow();
  expect(() => service.get({ date: "../../outside", id: "abc" })).toThrow();
});
