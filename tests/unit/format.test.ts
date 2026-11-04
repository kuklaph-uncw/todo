import { describe, expect, it } from "bun:test";
import {
  editableText,
  findTags,
  formatEntry,
  formatEntryLine,
  formatGoal,
  formatTodo,
  parseEntryBlocks,
  parseEntryLine,
  parseGoal,
  parseTodoBlocks,
  plainText,
  splitFrontmatter,
} from "../../src/vault/format";
import { parseEntryInput, parseTaskInput } from "../../src/vault/vault";

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

describe("journal entry blocks", () => {
  const lines = [
    "- 09:15 Shipped the billing cutover #ops [[reliability]] ⏱ 45m ⭐ ^k3x9qa",
    "    Ran the checklist with **Priya**:",
    "",
    "    - migrated the ledger tables #data [[delivery]]",
    "      - verified `row counts`",
    "    - flipped the flag",
    "",
    "    ## Follow-up",
    "    1. Write the *runbook* ⏱ 5m ⭐ ^body-id",
  ];
  const text = "Shipped the billing cutover\nRan the checklist with **Priya**:\n\n- migrated the ledger tables #data [[delivery]]\n  - verified `row counts`\n- flipped the flag\n\n## Follow-up\n1. Write the *runbook* ⏱ 5m ⭐ ^body-id";
  const [block] = parseEntryBlocks(lines, "2026-09-28");

  it("parses first-line metadata and body tags and goals without interpreting body metadata", () => {
    expect(block).toEqual({
      start: 0,
      end: lines.length,
      entry: {
        id: "k3x9qa", date: "2026-09-28", time: "09:15",
        text,
        tags: ["ops", "data"], goals: ["reliability", "delivery"], minutes: 45, isHighlight: true,
      },
    });
  });

  it("round-trips a whole entry block through formatting", () => {
    expect(formatEntry(block.entry)).toEqual(lines);
  });

  it("editableText restores first-line metadata without changing the body", () => {
    const edited = editableText(block.entry.text, block.entry.tags, block.entry.goals);
    expect(edited.split("\n")).toEqual(["Shipped the billing cutover #ops [[reliability]]", ...text.split("\n").slice(1)]);
  });

  it("parses the editable entry text back into text, tags and goals", () => {
    const edited = editableText(block.entry.text, block.entry.tags, block.entry.goals);
    expect(parseEntryInput(edited)).toEqual({ text: block.entry.text, tags: block.entry.tags, goals: block.entry.goals });
  });

  it("keeps a tag in the tag set when it appears in both first-line metadata and the body", () => {
    const withDuplicate = { ...block.entry, text: `${text}\n#ops` };
    expect(parseEntryBlocks(formatEntry(withDuplicate), "2026-09-28")[0].entry.tags).toContain("ops");
  });

  it("keeps blank lines only when another indented line follows", () => {
    const lines = [
      "# Monday", "- First ^a1", "", "    Paragraph", "", " \t", "    Last paragraph",
      "", "", "Free-form notes", "    Outside the entry", "- Next ^a2", "    Last body", "", " \t",
    ];
    expect(parseEntryBlocks(lines, "2026-09-28").map(({ entry, start, end }) => ({ text: entry.text, start, end }))).toEqual([
      { text: "First\n\nParagraph\n\n\nLast paragraph", start: 1, end: 7 },
      { text: "Next\nLast body", start: 11, end: 13 },
    ]);
  });

  it.each([["  ", "    "], ["\t", "\t  "], [" ", "   "], ["\t", "      "], ["  ", "\t"]])("dedents hand-written continuations by their smallest indent (%j, %j)", (indent, nested) => {
    const [block] = parseEntryBlocks([
      "- Hand-written ^a1", `${nested}- Nested first`, `${indent}- Parent`, `${nested}- Child`,
    ], "2026-09-28");
    expect(block.entry.text).toBe("Hand-written\n  - Nested first\n- Parent\n  - Child");
  });
});

describe("entry input", () => {
  it("trims outer blank lines and line ends while keeping inner breaks and indentation", () => {
    const raw = "\r\n \t\r\n   [x] Shipped  the cutover #ops  \r\nRan **checks**: \t\r\n\r\n- tables #data [[delivery]] \r\n  - row counts \r\n \r\n";
    expect(parseEntryInput(raw)).toEqual({
      text: "Shipped the cutover\nRan **checks**:\n\n- tables #data [[delivery]]\n  - row counts",
      tags: ["ops", "data"], goals: ["delivery"],
    });
  });

  it("todos still collapse whitespace", () => {
    expect(parseTaskInput("First\n  second #ops")).toEqual({ task: "First second", tags: ["ops"], goals: [] });
  });

  it.each(["[ ] ", "[x] ", "[X] ", "[-] ", "[/] ", "[!] "])("drops a leading %j checkbox only on the first line", (marker) => {
    expect(parseEntryInput(`${marker}First\n[x] Body checkbox`).text).toBe("First\n[x] Body checkbox");
  });

  it.each(["- list", "* list", "• list"])("keeps leading Markdown list markers (%j)", (text) => {
    expect(parseEntryInput(text).text).toBe(text);
  });

  it("returns empty text for blank or checkbox-only input", () => {
    expect(parseEntryInput(" \r\n\t")).toEqual({ text: "", tags: [], goals: [] });
    expect(parseEntryInput("[x] ").text).toBe("");
    expect(parseEntryInput("[-]").text).toBe("");
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
    // Todos are open or done. Other Obsidian Tasks marks ([/], [b], [-]) read as open.
    expect(blocks.map((b) => b.todo.status)).toEqual(["Open", "Done", "Open", "Open"]);
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

  it("round-trips a todo with notes, writing an old mark as open", () => {
    const [first] = parseTodoBlocks(lines);
    expect(formatTodo(first.todo)).toEqual([lines[4].replace("[/]", "[ ]"), ...lines.slice(5, 7)]);
  });

  it("still ignores task lines with a mark it doesn't know", () => {
    expect(parseTodoBlocks(["- [?] Not a todo ^q1"])).toEqual([]);
  });

  it("reads indented task lines as nested subtasks and other indented lines as notes", () => {
    const [block] = parseTodoBlocks([
      "- [ ] Set up the org ^t1",
      "    A note",
      "    - [x] Pick a name ^s1",
      "    - [ ] Invite team #people ^s2",
      "        - [X] Get the list ^s3",
      "\t\t- [/] Ask the manager ^s4",
      "    - not a task, so a note",
      "- [ ] Next todo ^t2",
    ]);
    expect(block.end).toBe(7);
    expect(block.todo.notes).toBe("A note\n- not a task, so a note");
    expect(block.todo.tags).toEqual([]);
    expect(block.todo.subtasks).toEqual([
      { id: "s1", text: "Pick a name", done: true, children: [] },
      {
        id: "s2",
        text: "Invite team #people",
        done: false,
        children: [
          { id: "s3", text: "Get the list", done: true, children: [] },
          { id: "s4", text: "Ask the manager", done: false, children: [] },
        ],
      },
    ]);
  });

  it("writes notes, then subtasks four spaces deeper per level", () => {
    const lines = [
      "- [ ] Set up the org ^t1",
      "    A note",
      "    - [x] Pick a name ^s1",
      "    - [ ] Invite team ^s2",
      "        - [ ] Get the list ^s3",
    ];
    expect(formatTodo(parseTodoBlocks(lines)[0].todo)).toEqual(lines);
  });

  it("records where each subtask line is, for giving hand-written ones an id", () => {
    const [block] = parseTodoBlocks(["- [ ] Todo ^t1", "  - [ ] No id yet", "    - [ ] Nested, no id"]);
    expect(block.subtaskLines.map(({ index, subtask }) => [index, subtask.text])).toEqual([
      [1, "No id yet"],
      [2, "Nested, no id"],
    ]);
  });

  it("keeps a time typed on a todo line when rewriting it", () => {
    const line = "- [ ] Write the runbook #docs ⏱ 30m ^d1";
    const [block] = parseTodoBlocks([line]);
    expect(block.todo.minutes).toBe(30);
    expect(formatTodo(block.todo)).toEqual([line]);
  });
});

describe("hand-written lines", () => {
  it("keeps a labelled goal link at the end of a line exactly as written", () => {
    const line = "- 09:15 Cut alert noise [[reliability|Platform reliability]] ^a1";
    const entry = parseEntryLine(line, "2026-09-28")!;
    expect(entry.goals).toEqual(["reliability"]);
    expect(formatEntryLine(entry)).toBe(line);
  });

  it("keeps tags written before a labelled link as part of the text", () => {
    const entry = parseEntryLine("- Fixed the pager #ops [[reliability|Reliability]] ^a2", "2026-09-28")!;
    expect(entry).toMatchObject({ text: "Fixed the pager #ops [[reliability|Reliability]]", tags: ["ops"], goals: ["reliability"] });
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
