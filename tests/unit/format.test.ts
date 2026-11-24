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
  renameEntryLinks,
  renameTodoLinks,
  renderWithRenamedLinks,
  splitFrontmatter,
} from "../../src/vault/format";
import { parseEntryInput, parseTaskInput } from "../../src/vault/vault";
import { renderEntryMarkdown } from "../../src/lib/markdown";

describe("journal entry lines", () => {
  it("parses time, text, trailing tags, goal links, minutes, star and id", () => {
    const entry = parseEntryLine(
      "- 09:15 Reviewed the migration plan #review [[reliability]] ⏱ 45m ⭐ ^k3x9qa",
      "2026-09-28",
    );
    expect(entry).toEqual({
      id: "k3x9qa",
      date: "2026-09-28",
      time: "09:15",
      text: "Reviewed the migration plan",
      tags: ["review"],
      goals: ["reliability"],
      minutes: 45,
      isHighlight: true,
      references: [],
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
  const text =
    "Shipped the billing cutover\nRan the checklist with **Priya**:\n\n- migrated the ledger tables #data [[delivery]]\n  - verified `row counts`\n- flipped the flag\n\n## Follow-up\n1. Write the *runbook* ⏱ 5m ⭐ ^body-id";
  const [block] = parseEntryBlocks(lines, "2026-09-28");

  it("parses first-line metadata and body tags and goals without interpreting body metadata", () => {
    expect(block).toEqual({
      start: 0,
      end: lines.length,
      entry: {
        id: "k3x9qa",
        date: "2026-09-28",
        time: "09:15",
        text,
        tags: ["ops", "data"],
        goals: ["reliability", "delivery"],
        minutes: 45,
        isHighlight: true,
        references: [],
      },
    });
  });

  it("round-trips a whole entry block through formatting", () => {
    expect(formatEntry(block.entry)).toEqual(lines);
  });

  it("editableText restores first-line metadata without changing the body", () => {
    const edited = editableText(block.entry.text, block.entry.tags, block.entry.goals);
    expect(edited.split("\n")).toEqual([
      "Shipped the billing cutover #ops [[reliability]]",
      ...text.split("\n").slice(1),
    ]);
  });

  it("parses the editable entry text back into text, tags and goals", () => {
    const edited = editableText(block.entry.text, block.entry.tags, block.entry.goals);
    expect(parseEntryInput(edited)).toEqual({
      text: block.entry.text,
      tags: block.entry.tags,
      goals: block.entry.goals,
    });
  });

  it("keeps a tag in the tag set when it appears in both first-line metadata and the body", () => {
    const withDuplicate = { ...block.entry, text: `${text}\n#ops` };
    expect(parseEntryBlocks(formatEntry(withDuplicate), "2026-09-28")[0].entry.tags).toContain("ops");
  });

  it("keeps blank lines only when another indented line follows", () => {
    const lines = [
      "# Monday",
      "- First ^a1",
      "",
      "    Paragraph",
      "",
      " \t",
      "    Last paragraph",
      "",
      "",
      "Free-form notes",
      "    Outside the entry",
      "- Next ^a2",
      "    Last body",
      "",
      " \t",
    ];
    expect(
      parseEntryBlocks(lines, "2026-09-28").map(({ entry, start, end }) => ({ text: entry.text, start, end })),
    ).toEqual([
      { text: "First\n\nParagraph\n\n\nLast paragraph", start: 1, end: 7 },
      { text: "Next\nLast body", start: 11, end: 13 },
    ]);
  });

  it.each([
    ["  ", "    "],
    ["\t", "\t  "],
    [" ", "   "],
    ["\t", "      "],
    ["  ", "\t"],
  ])("dedents hand-written continuations by their smallest indent (%j, %j)", (indent, nested) => {
    const [block] = parseEntryBlocks(
      ["- Hand-written ^a1", `${nested}- Nested first`, `${indent}- Parent`, `${nested}- Child`],
      "2026-09-28",
    );
    expect(block.entry.text).toBe("Hand-written\n  - Nested first\n- Parent\n  - Child");
  });
});

describe("entry input", () => {
  it("trims outer blank lines and line ends while keeping inner breaks and indentation", () => {
    const raw =
      "\r\n \t\r\n   [x] Shipped  the cutover #ops  \r\nRan **checks**: \t\r\n\r\n- tables #data [[delivery]] \r\n  - row counts \r\n \r\n";
    expect(parseEntryInput(raw)).toEqual({
      text: "Shipped the cutover\nRan **checks**:\n\n- tables #data [[delivery]]\n  - row counts",
      tags: ["ops", "data"],
      goals: ["delivery"],
    });
  });

  it("todos still collapse whitespace", () => {
    expect(parseTaskInput("First\n  second #ops")).toEqual({ task: "First second", tags: ["ops"], goals: [] });
  });

  it.each(["[ ] ", "[x] ", "[X] ", "[-] ", "[/] ", "[!] "])(
    "drops a leading %j checkbox only on the first line",
    (marker) => {
      expect(parseEntryInput(`${marker}First\n[x] Body checkbox`).text).toBe("First\n[x] Body checkbox");
    },
  );

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

  it("reads and writes a due date in Obsidian Tasks order", () => {
    const line = "- [ ] Renew badge 🔼 ➕ 2026-09-20 📅 2026-10-15 ✅ 2026-09-28 ^d4e5f6";
    const [block] = parseTodoBlocks([line]);
    expect(block.todo).toMatchObject({ task: "Renew badge", createdOn: "2026-09-20", dueOn: "2026-10-15" });
    expect(formatTodo(block.todo)).toEqual([line]);
    expect(parseTodoBlocks(lines)[0].todo.dueOn).toBeNull();
  });

  it("keeps an impossible or typed-in due date as task text", () => {
    const [bad] = parseTodoBlocks(["- [ ] Pay rent 📅 2026-13-01 ^d1"]);
    expect(bad.todo).toMatchObject({ task: "Pay rent 📅 2026-13-01", dueOn: null });
    const [typed] = parseTodoBlocks(["- [ ] Pay rent 📅 2026-10-01 ➕ 2026-09-20 📅 2026-10-05 ^d2"]);
    expect(typed.todo).toMatchObject({ task: "Pay rent 📅 2026-10-01", dueOn: "2026-10-05" });
  });

  it("still ignores task lines with a mark it doesn't know", () => {
    expect(parseTodoBlocks(["- [?] Not a todo ^q1"])).toEqual([]);
  });

  it("preserves rich notes separately from real subtasks", () => {
    const todo = parseTodoBlocks(["- [ ] Task ^t1", "    - [ ] Real subtask ^s1"])[0].todo;
    todo.notes = "# Plan\n\nFirst paragraph.\n\n- Parent\n  - Child\n- [ ] Literal checkbox in notes";
    const saved = formatTodo(todo);
    const restored = parseTodoBlocks(saved)[0].todo;
    expect(restored.notes).toBe(todo.notes);
    expect(restored.subtasks).toEqual(todo.subtasks);
    expect(formatTodo(restored)).toEqual(saved);
  });

  it("keeps note-block marker text literal and does not consume the next todo", () => {
    const todo = parseTodoBlocks(["- [ ] Task ^t1"])[0].todo;
    todo.notes = "First\n\n<!-- /todo-notes -->\n<!-- /todo-notes:1 -->\nLast";
    const blocks = parseTodoBlocks([...formatTodo(todo), "- [ ] Next ^t2"]);
    expect(blocks[0].todo.notes).toBe(todo.notes);
    expect(blocks[1].todo.task).toBe("Next");
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
    expect(entry).toMatchObject({
      text: "Fixed the pager #ops [[reliability|Reliability]]",
      tags: ["ops"],
      goals: ["reliability"],
    });
  });
});

describe("frontmatter and goals", () => {
  it("splits simple frontmatter and keeps the body", () => {
    expect(splitFrontmatter("---\ntitle: A\ncycle: 2026\n---\n\nBody text\n")).toEqual({
      data: { title: "A", cycle: "2026" },
      body: "\nBody text\n",
    });
  });

  const goal = {
    slug: "g",
    title: "Scope: platform reliability",
    cycle: "FY26",
    status: "agreed" as const,
    kind: "goal" as const,
    order: 2,
    droppedOn: null,
    description: "Why it matters.",
    meeting: "Meeting expectations may include runbooks.",
    exceeding: "Exceeding expectations may include\n\nadopted standards.",
    notes: "Ask about **owners**.",
  };

  it("quotes titles that would confuse YAML and round-trips every field", () => {
    const source = formatGoal(goal);
    expect(source).toContain('title: "Scope: platform reliability"');
    expect(parseGoal("g", source)).toEqual(goal);
  });

  it("keeps a line break in a value inside that value", () => {
    const forged = { ...goal, cycle: "2026\nstatus: agreed\nkind: activity\n---", status: "draft" as const };
    const source = formatGoal(forged);
    expect(parseGoal("g", source)).toEqual(forged);
  });

  it("writes the FCP parts as Markdown sections and leaves empty ones out", () => {
    const source = formatGoal({ ...goal, meeting: "", notes: "" });
    expect(source).toBe(
      '---\ntitle: "Scope: platform reliability"\ncycle: FY26\nstatus: agreed\nkind: goal\norder: 2\n---\n\n## Description\n\nWhy it matters.\n\n## Exceeding expectations\n\nExceeding expectations may include\n\nadopted standards.\n',
    );
  });

  it("round-trips a dropped activity with its drop date", () => {
    const activity = {
      ...goal,
      status: "dropped" as const,
      kind: "activity" as const,
      droppedOn: "2026-05-12",
      meeting: "",
      exceeding: "",
    };
    const source = formatGoal(activity);
    expect(source).toContain("dropped: 2026-05-12\n");
    expect(source).not.toContain("## Meeting");
    expect(parseGoal("g", source)).toEqual(activity);
  });

  // A line of field text that reads like one of the section headings is written
  // with a leading backslash, so it stays text (Markdown shows "## Notes").
  it("keeps heading-like lines inside a field as text", () => {
    const tricky = {
      ...goal,
      description: "Intro\n## Notes\nstill the description\n\\## Notes",
      notes: "## Meeting expectations",
    };
    const source = formatGoal(tricky);
    expect(source).toContain("\nIntro\n\\## Notes\nstill the description\n\\\\## Notes\n");
    expect(source).toContain("## Notes\n\n\\## Meeting expectations\n");
    expect(parseGoal("g", source)).toEqual(tricky);
  });

  it("reads legacy goals: old statuses, no kind or order, and a free-form body as notes", () => {
    const legacy = (status: string) =>
      parseGoal(
        "old",
        `---\ntitle: Old\ncycle: 2025\nstatus: ${status}\n---\n\nSuccess criteria.\n\n## Self-assessment\n\nMet it.\n`,
      );
    expect(legacy("active")).toEqual({
      slug: "old",
      title: "Old",
      cycle: "25-26",
      status: "agreed",
      kind: "goal",
      order: Number.POSITIVE_INFINITY,
      droppedOn: null,
      description: "",
      meeting: "",
      exceeding: "",
      notes: "Success criteria.\n\n## Self-assessment\n\nMet it.",
    });
    expect(legacy("achieved").status).toBe("agreed");
    expect(legacy("dropped").status).toBe("dropped");
    expect(legacy("someday").status).toBe("draft");
  });

  it("keeps frontmatter keys it doesn't know, exactly as written, after its own", () => {
    const source = [
      "---",
      "# written in Obsidian",
      "aliases: hand-goal",
      "title: Hand",
      "tags: [work]",
      "related:",
      "  - first",
      "  - second",
      "status: active",
      "created: 2020-01-01",
      "---",
      "",
      "Body.",
      "",
    ].join("\n");
    const goal = parseGoal("hand", source);
    expect(goal).toMatchObject({ title: "Hand", status: "agreed", notes: "Body." });
    const written = formatGoal({ ...goal, order: 1 });
    expect(written).toBe(
      [
        "---",
        "title: Hand",
        "cycle: ",
        "status: agreed",
        "kind: goal",
        "order: 1",
        "# written in Obsidian",
        "aliases: hand-goal",
        "tags: [work]",
        "related:",
        "  - first",
        "  - second",
        "created: 2020-01-01",
        "---",
        "",
        "## Notes",
        "",
        "Body.",
        "",
      ].join("\n"),
    );
    expect(parseGoal("hand", written)).toEqual({ ...goal, order: 1 });
    expect(formatGoal(parseGoal("hand", written))).toBe(written);
  });

  it("keeps text written above the first section by moving it into notes", () => {
    const parsed = parseGoal(
      "g",
      "---\ntitle: G\n---\nStray line.\n\n## Description\n\nThe goal.\n\n## Notes\n\nTalk points.\n",
    );
    expect(parsed).toMatchObject({ description: "The goal.", notes: "Stray line.\n\nTalk points." });
  });

  it("falls back to draft status and the slug as title", () => {
    expect(parseGoal("my-goal", "no frontmatter")).toMatchObject({
      title: "my-goal",
      status: "draft",
      kind: "goal",
      notes: "no frontmatter",
    });
  });
});

describe("helpers", () => {
  it("keeps tags and links inside inline formatting as metadata", () => {
    expect(findTags("**#ops** *#team* **#on_call** #_leading_")).toEqual(["ops", "team", "on_call", "_leading_"]);
    expect(findTags("_#ops_ _Completed #team_ #_literal_")).toEqual(["ops", "team", "_literal_"]);
    expect(parseEntryInput("**#ops** *[[goal]]*").goals).toEqual(["goal"]);
  });
  it("does not extract tags or goals from inline code", () => {
    expect(findTags("#real `#literal` ``#also-literal``")).toEqual(["real"]);
    const entry = parseEntryInput("Entry `[[literal]]` [[real]]");
    expect(entry.goals).toEqual(["real"]);
  });
  it("does not extract tags or goals from fenced code", () => {
    const entry = parseEntryInput("```sh\n#literal [[literal]]\n```\n#real [[real]]");
    expect(entry.tags).toEqual(["real"]);
    expect(entry.goals).toEqual(["real"]);
  });
  it("findTags lowercases and dedupes", () => {
    expect(findTags("#Review then #review and #ops")).toEqual(["review", "ops"]);
  });

  it("plainText flattens wikilinks to their label", () => {
    expect(plainText("Led [[reliability]] work and [[infra|the infra]] review")).toBe(
      "Led reliability work and the infra review",
    );
  });
});

describe("renaming goal links", () => {
  const date = "2026-09-01";
  const entryOf = (lines: string[]) => parseEntryBlocks(lines, date)[0].entry;
  /** Every code block (with its fence and info string) and code span, as the app renders the entry. */
  const codeOf = (lines: string[]) =>
    renderEntryMarkdown(entryOf(lines).text).match(/<pre[^>]*>|<code>[\s\S]*?<\/code>/g) ?? [];

  /**
   * The rename changes exactly what the renderer counts as a link: every
   * rendered link to `old` now points at `new`, nothing else in the rendered
   * entry changed, its goals changed only by old → new, and code reads the same.
   */
  function expectRenamed(lines: string[]) {
    const after = renameEntryLinks(lines, date, "old", "new");
    expect(after).toHaveLength(lines.length);
    expect(renderEntryMarkdown(entryOf(after).text)).toBe(renderWithRenamedLinks(entryOf(lines).text, "old", "new"));
    const goals = entryOf(lines).goals.map((goal) => (goal === "old" ? "new" : goal));
    expect(entryOf(after).goals.sort()).toEqual([...new Set(goals)].sort());
    expect(codeOf(after)).toEqual(codeOf(lines));
    return after;
  }

  it("renames links the renderer counts and leaves code, prefixes and other slugs alone", () => {
    const after = expectRenamed([
      "- Escaped \\` [[old]] then `code [[old]]` [[old|label]] [[ old ]] ^aaaaaa",
      "    Empty `` pair [[old]] then ``[[old]]``, unclosed ` [[old]]",
      "    [[old-2]] [[older]] [[Old]] ~~~ [[old]]",
    ]);
    expect(after).toEqual([
      "- Escaped \\` [[new]] then `code [[old]]` [[new|label]] [[ new ]] ^aaaaaa",
      // As the renderer reads it, "`` pair [[old]] then ``" is the code span.
      "    Empty `` pair [[old]] then ``[[new]]``, unclosed ` [[new]]",
      "    [[old-2]] [[older]] [[Old]] ~~~ [[new]]",
    ]);
  });

  // Hand-written layouts where a simpler set of rules disagreed with the renderer.
  it.each([
    ["a tab after the clock time", ["- 09:00\t```", "    [[old]] in code", "    ```", "    after [[old]]"], ["new"]],
    [
      "two spaces after the clock time",
      ["- 09:00  ```", "    [[old]] in code", "    ```", "    after [[old]]"],
      ["new"],
    ],
    [
      "a fence indented past the entry body, which is text",
      ["- Note ^aaaaaa", "    para", "", "        ```", "        [[old]]", "        ```"],
      ["new"],
    ],
    [
      "an over-indented closing fence, which doesn't close",
      ["- Code ^aaaaaa", "    ```", "    [[old]] in code", "        ```", "    [[old]] still code"],
      [],
    ],
    [
      "a nested fence closed at the parent's indent",
      ["- List ^aaaaaa", "    - item", "      ```", "      code", "    ```", "    [[old]] after"],
      [],
    ],
    ["a backtick inside an earlier link", ["- see [[x`y]] and [[old]] and `z` ^aaaaaa"], ["new", "x`y"]],
    ["a link in a fence's info string", ["- 09:00 ```[[old]] ^aaaaaa", "    code [[old]]", "    ```"], []],
    [
      "trailing metadata after a fenced first line",
      ["- 09:00 ```js [[old]] ^aaaaaa", "    x = [[old]]", "    ```", "    After [[old]]"],
      ["new"],
    ],
  ])("handles %s", (_name, lines, goalsAfter) => {
    const after = expectRenamed(lines);
    expect(entryOf(after).goals.sort()).toEqual(goalsAfter.sort());
    // Lines holding only code come through byte for byte.
    for (const [i, line] of lines.entries()) if (!after[i].includes("[[new")) expect(after[i]).toBe(line);
  });

  it("renames todo task, notes and subtask links the same way", () => {
    const lines = [
      "- [ ] Call [[old]] about `[[old]]` ^dddddd",
      "    <!-- todo-notes -->",
      "    ```",
      "    [[old]] in a note's code",
      "    ```",
      "    Real [[old]]",
      "    <!-- /todo-notes -->",
      "    - [ ] Sub [[old|label]] ^eeeeee",
    ];
    expect(renameTodoLinks(lines, "old", "new")).toEqual([
      "- [ ] Call [[new]] about `[[old]]` ^dddddd",
      "    <!-- todo-notes -->",
      "    ```",
      "    [[old]] in a note's code",
      "    ```",
      "    Real [[new]]",
      "    <!-- /todo-notes -->",
      "    - [ ] Sub [[new|label]] ^eeeeee",
    ]);
  });
});
