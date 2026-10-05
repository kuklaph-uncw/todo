import { describe, expect, it } from "bun:test";
import {
  editableText,
  findTags,
  formatEntryLine,
  formatGoal,
  formatTodo,
  parseEntryLine,
  parseGoal,
  parseTodoBlocks,
  plainText,
  splitFrontmatter,
} from "../../src/vault/format";

describe("journal entry lines", () => {
  it("parses time, text, trailing tags, goal links, minutes, star and id", () => {
    const entry = parseEntryLine("- 09:15 Reviewed the migration plan #review [[reliability]] ⏱ 45m ⭐ ^k3x9qa", "2026-09-28");
    expect(entry).toEqual({
      id: "k3x9qa",
      date: "2026-09-28",
      time: "09:15",
      text: "Reviewed the migration plan",
      tags: ["review"],
      goals: ["reliability"],
      minutes: 45,
      isHighlight: true,
    });
  });

  it("round-trips through format without changing the line", () => {
    const line = "- 09:15 Reviewed the migration plan #review [[reliability]] ⏱ 45m ⭐ ^k3x9qa";
    expect(formatEntryLine(parseEntryLine(line, "2026-09-28")!)).toBe(line);
  });

  it("keeps tags written mid-sentence in the text and does not repeat them when rewriting", () => {
    const entry = parseEntryLine("- Paired on #auth session bugs with Sam #support ^abc123", "2026-09-28")!;
    expect(entry.text).toBe("Paired on #auth session bugs with Sam");
    expect(entry.tags).toEqual(["auth", "support"]);
    expect(formatEntryLine(entry)).toBe("- Paired on #auth session bugs with Sam #support ^abc123");
  });

  it("treats number-only hashtags like 'PR #892' as text, as Obsidian does", () => {
    const entry = parseEntryLine("- Reviewed PR #892", "2026-09-28")!;
    expect(entry.text).toBe("Reviewed PR #892");
    expect(entry.tags).toEqual([]);
  });

  it("ignores task lines and non-list lines", () => {
    expect(parseEntryLine("- [ ] a todo", "2026-09-28")).toBeNull();
    expect(parseEntryLine("Some prose", "2026-09-28")).toBeNull();
  });

  it("tolerates emoji variation selectors written by other editors", () => {
    const entry = parseEntryLine("- Shipped it ⏱️ 30m ⭐️", "2026-09-28")!;
    expect(entry.minutes).toBe(30);
    expect(entry.isHighlight).toBe(true);
    expect(entry.text).toBe("Shipped it");
  });

  it("editableText puts trailing tags and links back after the sentence", () => {
    expect(editableText("Fixed the build", ["ci"], ["reliability"])).toBe("Fixed the build #ci [[reliability]]");
  });
});

describe("todo blocks", () => {
  const lines = [
    "---",
    "type: todos",
    "---",
    "",
    "- [/] Fix flaky auth test #bug ⏫ ⭐ ➕ 2026-09-20 ^t8k2m1",
    "    First note line",
    "    Second note line",
    "- [x] Deploy hotfix 🔼 ➕ 2026-09-25 ✅ 2026-09-28 ^a9d8f7",
    "- [b] Waiting on infra #ops ^b1",
    "- [-] Old idea ^c1",
  ];

  it("reads status, priority, star, dates, notes and line ranges", () => {
    const blocks = parseTodoBlocks(lines);
    expect(blocks.map((b) => b.todo.status)).toEqual(["In Progress", "Done", "Blocked", "Cancelled"]);
    expect(blocks[0].todo).toMatchObject({
      id: "t8k2m1",
      task: "Fix flaky auth test",
      tags: ["bug"],
      priority: "High",
      isHighlight: true,
      createdOn: "2026-09-20",
      completedOn: null,
      notes: "First note line\nSecond note line",
    });
    expect(blocks[0].start).toBe(4);
    expect(blocks[0].end).toBe(7);
    expect(blocks[1].todo).toMatchObject({ priority: "Medium", completedOn: "2026-09-28" });
  });

  it("round-trips a todo with notes", () => {
    const [first] = parseTodoBlocks(lines);
    expect(formatTodo(first.todo)).toEqual(lines.slice(4, 7));
  });
});

describe("frontmatter and goals", () => {
  it("splits simple frontmatter and keeps the body", () => {
    expect(splitFrontmatter("---\ntitle: A\ncycle: 2026\n---\n\nBody text\n")).toEqual({
      data: { title: "A", cycle: "2026" },
      body: "\nBody text\n",
    });
  });

  it("quotes titles that would confuse YAML and reads them back", () => {
    const goal = { slug: "g", title: "Scope: platform reliability", cycle: "FY26", status: "active" as const, body: "Why." };
    const source = formatGoal(goal);
    expect(source).toContain('title: "Scope: platform reliability"');
    expect(parseGoal("g", source)).toEqual(goal);
  });

  it("falls back to active status and the slug as title", () => {
    expect(parseGoal("my-goal", "no frontmatter")).toMatchObject({ title: "my-goal", status: "active", body: "no frontmatter" });
  });
});

describe("helpers", () => {
  it("findTags lowercases and dedupes", () => {
    expect(findTags("#Review then #review and #ops")).toEqual(["review", "ops"]);
  });

  it("plainText flattens wikilinks to their label", () => {
    expect(plainText("Led [[reliability]] work and [[infra|the infra]] review")).toBe("Led reliability work and the infra review");
  });
});
