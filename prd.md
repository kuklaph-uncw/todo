# Work Ledger: Product Requirements

**Author:** [you]
**Date:** 2026-10-05
**Status:** v1 built. This document describes the product as it exists, plus open items.
**Stack:** Electron desktop app, Markdown files on disk, server-rendered HTML, a small progressive-enhancement script
**Product type:** Personal, private desktop app (Windows)

---

## 1. Summary

Work Ledger is a private desktop app for recording daily work, keeping lightweight TODOs, tracking review-cycle goals, and producing review evidence.

The app has three related purposes:

1. **Daily accomplishment logging.** A fast, freeform way to capture what actually happened during the day.
2. **Lightweight TODO tracking.** A simple list for things that need to be remembered or completed.
3. **Goal tracking.** The goals a review cycle is measured against, with the work linked to each one.

The primary use case is performance review preparation. Over weeks or months, the user builds a reliable record of meaningful work and later generates a clean, copy-paste-ready summary for any date range or goal.

The app should feel closer to a private work ledger than a project management tool or generic TODO app.

---

## 2. Problem Statement

Performance reviews require recalling meaningful work over long periods of time. Memory is unreliable, and reconstructing accomplishments from calendar events, chats, emails, tickets, and scattered notes is tedious.

The user needs a low-friction system that answers:

> "What did I accomplish during this period, and how does it map to my goals?"

The system should make daily capture easy enough to become a habit and make historical review fast enough that preparing a review does not require manual reconstruction.

---

## 3. Product Goals

| Goal                | Description                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Fast capture        | Add a daily accomplishment in under 10 seconds.                                              |
| Freeform journaling | Let the user describe work naturally, without forcing everything into rigid fields.          |
| Lightweight TODOs   | Support simple TODO tracking without turning the app into project management software.       |
| Goal evidence       | Link work to the goals of a review cycle, so each goal collects its own evidence.             |
| Review-ready output | Generate a readable document for a selected date range, as Markdown or formatted text.        |
| AI-readable export  | Export review-range JSON and JSONL so an agent can summarize long periods of work.           |
| Local and readable  | Store data as plain Markdown files in a local folder that a person can read and edit.        |
| Durable history     | Completion dates and historical entries should be trustworthy over time.                     |
| Low maintenance     | Use a simple stack with no cloud service. The only build step packages the desktop app.       |
| Keyboard-friendly   | Common actions should be quick from the keyboard.                                            |

---

## 4. Non-Goals

| Non-goal                    | Reason                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Multi-user support          | This is a personal tool.                                                            |
| Authentication              | Not needed. The desktop app has no network port and one user.                       |
| Mobile or other platforms   | Windows desktop only. The layout adapts to narrow windows, but there is no mobile app. |
| Cloud sync                  | The notes folder is local. The app never uploads or syncs it.                       |
| Notifications/reminders     | The app is for capture and review, not reminders.                                   |
| Rich attachments            | Text is the core medium.                                                            |
| Advanced tag management     | Simple `#tags` are enough.                                                          |
| In-app AI summaries         | Capture and export work without AI. Exports are shaped for an outside AI tool.      |
| Project/OKR hierarchy       | Goals are one flat list per review cycle. No projects, key results, or nested goals. |
| Recurring TODOs             | Useful later, not needed now.                                                       |
| Obsidian dependency         | The files read well in Obsidian, but the app needs neither Obsidian nor its plugins. |
| Code signing                | The build is unsigned. Windows or organization policy may warn or block it.        |

---

## 5. Product Principles

### 5.1 Capture First

The app should make it easier to record something than to ignore it.

The default interaction should be:

```txt
Open app → type what happened → save → close app
```

Optional metadata should not slow down basic capture.

---

### 5.2 The Journal Is the Main Artifact

TODOs are useful, but the daily accomplishment journal is the main source of truth for performance review prep.

A completed TODO can provide context, but not all meaningful work begins as a TODO.

Examples of meaningful journal entries:

- Helped a teammate debug a production issue.
- Reviewed a proposal and identified risks.
- Investigated an unclear customer report.
- Improved documentation after onboarding feedback.
- Resolved a flaky test.
- Coordinated with support on an escalation.

---

### 5.3 Structure Should Be Optional

The user should be able to write a plain sentence and move on.

Metadata like tags, goal links, time spent, and highlight status should be useful but not required. Tags and goal links can be typed straight into the sentence.

---

### 5.4 Review Should Produce a Document

The review page should prioritize readable output over analytics.

The main artifact is a clean accomplishment summary that can be pasted into a review document. Stats are useful, but secondary.

---

### 5.5 Dates Must Be Trustworthy

If a TODO was completed on a date, that date should not silently change because the TODO was edited or reopened later.

Completion dates are frozen once set, unless explicitly cleared by the user.

---

### 5.6 Local and Private by Default

The app runs as a desktop window on the user's machine and stores data in a local folder. It opens no network port. Installed builds contact GitHub for updates; notes stay local, and the app works offline.

No telemetry. No cloud dependency. No account.

---

### 5.7 The Files Are the Truth

The notes folder (the "vault") is the source of truth. Everything the app writes is a Markdown block or file that reads naturally in a text editor or Obsidian. Hand edits made outside the app should survive, and backing up means copying the folder.

---

## 6. Primary User

**User:** One person using the app on their own computer to track work and prepare performance reviews.

The app is intentionally optimized for a single-user workflow.

---

## 7. Core User Flows

### 7.1 Daily Capture

The user opens the app, writes a journal entry, saves it, and closes the window.

Example input:

```txt
Reviewed API migration proposal #review

Two things to follow up:
- Check the rollback plan
- Ask Alex about staging auth [[improve-reliability]]
```

One submit becomes one journal entry for the selected date, with paragraphs and Markdown kept. Entries logged for today get the current clock time.

---

### 7.2 Backfill a Previous Day

The user can switch to a previous date and add entries for that day. The page says "Filling in a past day" so it is clear which day is being edited.

This matters because daily logging will not always happen in real time.

---

### 7.3 TODO Tracking

The user can add simple TODOs and mark them done. A TODO is either open or done. A TODO can hold a checklist of subtasks, nested to any depth, and the user sets the order of TODOs and subtasks by hand.

When a TODO is marked done, it becomes part of that day's review evidence. Checking one off while viewing a past day dates it to that day.

---

### 7.4 End-of-Day Review

The user can review the selected day, add missed accomplishments, mark TODOs done, and star important entries.

---

### 7.5 Goal Tracking

At the start of a review cycle, the user adds the goals they agreed on. While logging, they type `/` to pick a goal, or type its `[[goal-link]]`. Each goal page collects the linked entries and completed TODOs as evidence. At review time, the user writes their self-assessment in the goal's description and opens a review filtered to that goal.

---

### 7.6 Performance Review Prep

The user picks a period and gets a readable accomplishment document containing:

- Highlights (starred work).
- Work grouped by goal.
- Journal entries and completed TODOs, day by day.
- Summary counts, time totals, and tag counts.

They copy it as formatted text, download Markdown, JSON or JSONL, or print it to PDF.

---

### 7.7 Working with the Files Directly

The user can open the vault in any editor or Obsidian, read it, and add or change lines by hand. The app re-reads the files on every page load, so hand edits show up immediately.

---

## 8. Information Architecture

| Route                                | Page        | Purpose                                                     |
| ------------------------------------ | ----------- | ----------------------------------------------------------- |
| `/`                                  | Today       | Day view. Main daily capture surface. `?date=` for any day. |
| `/todos`                             | Todos       | Full task list with filters and search.                     |
| `/goals`                             | Goals       | Goals for one review cycle, with evidence counts.           |
| `/goals/:slug`                       | Goal        | One goal's description, status, and evidence feed.          |
| `/review`                            | Review      | Date-range accomplishment document, filters, exports.       |
| `/review/export.{md,json,jsonl}`     | Downloads   | Review export in Markdown, JSON, or JSONL.                  |

Every page shares a left rail with:

- Nav links (Today, Todos, Goals, Review) with their `g` shortcut. Todos shows the count of open TODOs.
- The vault path, with the note "Plain Markdown files. Back up by copying the folder."
- A "Keyboard shortcuts" button that opens the shortcut list.

Today is the main page. Todos and Goals support the workflow but should not dominate it.

---

## 9. Page Requirements

### 9.1 `/` Today

The default landing page. It answers:

> "What happened on this day, and what am I working on?"

**URL.** `/` shows today. `/?date=2026-05-27` shows a specific date. An invalid date falls back to today. `/` always means the current day, so a window left open overnight moves to the new day on the next load.

**Layout.** Wide windows show the ledger (journal) on the left and the TODO tray on the right. Below 1180px the tray stacks under the ledger. Below 860px the rail becomes a top bar.

```txt
┌───────────────────────────────┬───────────────────────────────┐
│ Day header, day nav           │ Todos                         │
│ Week strip                    │ Quick add                     │
│ Capture form                  │ Open todos, in your order     │
│ Entries for the day           │                               │
│ Todos closed this day         │                               │
└───────────────────────────────┴───────────────────────────────┘
```

**Day header.**

- Kicker: "Today", or "Filling in a past day · Back to today", or "A future day · Back to today".
- Title: weekday, month, day, year.
- Summary line (see 9.4).

**Day navigation.**

- Previous day and next day buttons (`[` and `]`).
- Date picker. With the script it jumps after a short pause; without it, a "Go" button submits.
- The nav "Today" link and the kicker's "Back to today" link return to today.

**Week strip.** Monday to Sunday of the selected week. Each day links to itself and shows one tick per item (entries plus TODOs completed that day, up to 6). Today and future days are marked.

---

### 9.2 Today: Journal

| ID   | Requirement                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| J-1  | One submit adds one entry for the selected date. An entry can contain several paragraphs of Markdown.      |
| J-2  | Markdown list markers and body checkboxes are kept. A leading single-character checkbox marker on the first line (`[ ]`, `[x]`, `[-]`, `[/]`, `[!]`, etc.) is dropped. |
| J-3  | User can edit an entry inline (`?edit=<id>`): its text, trailing `#tags` and `[[links]]`, and time spent.     |
| J-4  | User can delete an entry after confirming. The whole block is appended to `.trash/deleted.md`.             |
| J-5  | User can star or unstar an entry as a highlight.                                                              |
| J-6  | User can add tags by typing `#` (suggests existing tags, most used first) or typing `#tag` in full.          |
| J-7  | User can link goals by typing `/` (suggests active goals) or typing `[[goal-slug]]` in full.                  |
| J-8  | User can enter time spent: `45m`, `1h`, `1h 30m`, `90 minutes`, `1.5h`.                                        |
| J-9  | Entries display in file order. New entries go right after the day's last entry.                              |
| J-10 | Empty capture is rejected with a message. Time and star are put back; the text survives as a draft.          |
| J-11 | Past and future dates are editable. Entries added to today get an `HH:MM` clock time; other days get none.    |
| J-12 | On today, the capture form sends no date, so the server uses the real current day.                           |

**Quick capture.** One bordered box with formatting controls, time spent ("Add time"), a star toggle, and "Add to ledger". Time and star apply to the entry. The box grows with the text up to 75% of the window. Focus mode (the expand button or `Ctrl + Shift + F`) fills the window with the box; `Esc` or saving leaves it.

**Rich-text writing.** Every editable multiline field uses the same visual editor: journal capture and edits, goal descriptions, and TODO notes. The toolbar provides bold, italic, inline code, heading, subheading, normal text, bulleted and numbered lists, and Markdown source. Text remains Markdown on disk and in journal drafts. Existing text that cannot round-trip exactly opens in source mode, where its syntax is preserved. Pasted HTML keeps supported text structure; scripts, images, styling, and unsupported formatting are discarded. `Ctrl+Shift+V` pastes literal text. Single-line titles keep their existing behavior. Without the script, multiline fields remain ordinary textareas.

**Inline tags and goals.** With the script, each field that takes `#tags` (capture, entry edit, TODO add and edit) becomes an editor where tags and goal links show as pills; goal pills show the goal's title. Typing `#` or `/` at the start of a word opens suggestions at the caret (arrows move, `Tab`/`Enter` pick, `Esc` closes). When nothing matches, the list says why (no goals yet, no match). The hidden original field always holds the plain text that is saved (`#tag`, `[[slug]]`), so drafts and the server see no difference.

**Draft protection.** Unsent capture text is saved in `localStorage` (key `draft:today` on today, `draft:YYYY-MM-DD` on other days). It restores after a reload and clears after a successful save.

**Display.** On Today, goal evidence and Review, entries render paragraphs (single line breaks become `<br>`), `-`, `*` or `+` bullets and `1.` numbered lists nested by indent, `#` headings shifted down two levels (at most `h6`), `**bold**`, `*italic*` or `_italic_`, and backtick code spans. Underscores inside words stay literal; asterisks can emphasize part of a word. Other Markdown, including ordinary links, images, HTML, fenced code and checkboxes, stays literal. All text is HTML-escaped first. Inline `#tags` and `[[links]]` are styled outside code spans. Tags and links not written inline, and time spent, show as chips under the entry. A `[[link]]` that matches no goal is dimmed with a hint to check the spelling. TODO text keeps its inline tags and links without Markdown formatting.

---

### 9.3 Today: TODO Tray

Shows open TODOs in the user's order (see 9.5). TODOs completed on the selected day appear in the ledger column under "Todos closed this day", with star and reopen buttons.

| ID  | Requirement                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------- |
| T-1 | User can add a TODO with just a task. It starts `Open`, with no priority, and a created date of today.         |
| T-2 | `#tags` and `[[goal-links]]` typed in the task are picked up.                                                  |
| T-3 | The check button marks a TODO done, dated the selected day, or today if the selected day is in the future.     |
| T-4 | Each TODO has an Edit details button.                                                                          |
| T-5 | Edit details opens the TODO's editor on the Todos page and returns to the day afterwards.                      |
| T-6 | A note under the tray says which day checking a TODO off will count for.                                       |
| T-7 | A TODO with subtasks shows its progress (`3/5`, every level) on its tag line. Clicking its title opens its subtasks to check off or quick-add. |

Delete and clear-completion live on the Todos page.

---

### 9.4 Day Summary

Shown under the day title:

```txt
4 entries · 2 todos closed · 1 starred · 1h 30m logged
```

"starred" and "logged" parts are omitted when zero. Time comes from journal entries only.

---

### 9.5 `/todos` Todos

| ID   | Requirement                                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| TM-1 | User can view all TODOs in two groups: Open and Done.                                                            |
| TM-2 | Done starts collapsed, unless a filter is active or one of its TODOs is being edited.                            |
| TM-3 | User can filter by priority (High, Medium, Low, None), tag, and goal.                                            |
| TM-4 | User can search task, notes, `#tags`, and goal links (`/` focuses search).                                       |
| TM-5 | User can add a TODO with a priority and goal checkboxes. If the filters hide it, a notice says so.               |
| TM-6 | User can edit task, priority, and rich-text notes. Notes retain paragraphs and nested-list indentation separately from subtasks. On a validation error the editor reopens with the typed values. |
| TM-7 | User can check a TODO off or reopen it, star or unstar it, and delete it with confirmation (copy kept in trash). |
| TM-8 | User can clear a completion date with confirmation. The option shows in the editor when a date exists.           |
| TM-9 | Rows show priority, "Added" date, and "Done Sep 28", or "Kept: done Sep 28" for a reopened TODO.                 |
| TM-10 | User can add, check, edit, and delete subtasks at any depth. Deleting one removes everything under it (copy kept in trash). |
| TM-11 | A TODO with subtasks shows its progress (`3/5`, every level) on its tag line. Clicking its title opens its subtasks. Search also matches subtask text. |
| TM-12 | User can reorder open TODOs, and move, indent, and outdent subtasks, by dragging a grip handle or with hotkeys (20.2). A TODO can't become a subtask, and a subtask can't become a TODO. |

The header shows counts per status, plus "showing N" when filtering.

With `app.js`, search updates as the user types and the priority, tag and goal selects apply in place (section 16). Without it, the filter form's Apply button submits normally.

**Sort.**

1. Groups in the order Open, Done.
2. Open: the user's order (file order). New TODOs go to the top. Priority is shown, not sorted on.
3. Done: most recent completion date first.
4. Subtasks: the user's order.

Marking a TODO done from this page records today.

---

### 9.6 `/goals` Goals

| ID   | Requirement                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------- |
| GL-1 | User sees goals for one review cycle (`?cycle=`, default the current year).                                         |
| GL-2 | A cycle switcher lists the current year and every cycle used by a goal.                                             |
| GL-3 | Each goal shows title, status, first line of its description, an evidence line, and its `[[slug]]`.                 |
| GL-4 | The evidence line reads like "3 entries · 1 todo · 2 starred · last Sep 28", or "No linked work yet".                |
| GL-5 | User can add a goal: name, review cycle (free text, defaults to the viewed cycle), and "What does success look like?". |

A review cycle is a free-text label, usually a year.

---

### 9.7 `/goals/:slug` Goal

| ID    | Requirement                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| GL-6  | Shows the goal's status, evidence line, and `[[slug]]`.                                                        |
| GL-7  | Evidence feed: every linked journal entry and done TODO, all time, newest month first. Each links to its day.  |
| GL-8  | Shows how many linked TODOs are still open, linking to `/todos?goal=<slug>`. They aren't evidence until done.   |
| GL-9  | User can edit name, cycle, status (Active, Achieved, Dropped), and the description.                           |
| GL-10 | The description holds success criteria, progress notes, and the self-assessment. It uses the shared rich-text editor and safe Markdown display. |
| GL-11 | The slug never changes on edit, so existing `[[links]]` keep working. A blank name or cycle keeps the old one.  |
| GL-12 | "Review this goal" opens `/review` filtered to the goal, from the first to the last evidence date.             |

Achieved and dropped goals still collect evidence but drop out of the capture form's goal checkboxes and the "Link a goal by typing its link" hint.

---

### 9.8 `/review` Review

The payoff surface. It should feel like a generated accomplishment document, not a data dashboard.

**URL parameters.**

| Param          | Meaning                                                              |
| -------------- | -------------------------------------------------------------------- |
| `preset`       | One of the preset keys below.                                        |
| `from`, `to`   | Custom range (`YYYY-MM-DD`). Used when no preset is given.           |
| `highlights=1` | Starred only.                                                        |
| `sort=desc`    | Newest first. Default is oldest first.                               |
| `tag`          | One tag (leading `#` and case are ignored).                          |
| `goal`         | One goal slug.                                                       |
| `q`            | Text the item must contain.                                          |

**Presets.** Weeks start on Monday. All ranges are inclusive and end today unless stated.

| Key           | Label          | Range                                                |
| ------------- | -------------- | ---------------------------------------------------- |
| `week`        | This week      | Monday of this week to today.                        |
| `month`       | This month     | First of this month to today.                        |
| `quarter`     | This quarter   | First day of this quarter to today.                  |
| `lastQuarter` | Last quarter   | The whole previous calendar quarter.                 |
| `ytd`         | Year to date   | January 1 to today.                                  |
| `lastYear`    | Last year      | January 1 to December 31 of the previous year.       |
| `6m`          | Last 6 months  | Rolling six months ending today.                     |
| `year`        | Last 12 months | Rolling twelve months ending today. **Default.**     |

A custom range given in reverse is swapped. If submitted dates match a preset, that preset stays highlighted.

**Page order.**

1. Preset buttons and the filter bar (From, To, Tag, Goal, Contains, Starred only, Newest first).
2. The document ("Accomplishments"): range, summary line, a "Filtered: …" line when filters apply, then Highlights, By goal, and Day by day (grouped by month, then day).
3. Side panel: "Take it with you" (copy, downloads, print), tag tally, goal tally, Markdown source.

**Summary line.**

```txt
12 journal entries · 3 todos completed · 4 starred · 9 active days · 6h 15m logged
```

| ID   | Requirement                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------- |
| R-1  | User can pick a preset or a custom date range.                                                  |
| R-2  | User sees journal entries and completed TODOs grouped by date.                                  |
| R-3  | User can filter to starred only, one tag, one goal, or text that an item contains.              |
| R-4  | User can switch to newest first.                                                                |
| R-5  | Clicking a tag or goal in the side tallies filters to it. Clicking again clears it.             |
| R-6  | "Copy the document" copies the document as formatted HTML and as Markdown.                      |
| R-7  | User can download Markdown, JSON, or JSONL with the same filters as the page.                   |
| R-8  | "Print or save as PDF" prints the document alone, with `accomplishments-FROM-to-TO` as the title. |
| R-9  | Empty dates are hidden. An empty period or filter result says so.                               |
| R-10 | A filtered document says it is filtered, so it can't pass for the whole period.                 |
| R-11 | Starred items are marked in every list, not only under Highlights.                              |

---

### 9.9 Review Export

The export surface lets the user paste human-readable review output and hand structured date-range data to an AI tool. See section 14 for formats.

| ID  | Requirement                                                                     |
| --- | ------------------------------------------------------------------------------- |
| D-1 | User can download review output as Markdown.                                    |
| D-2 | User can download review-range data as structured JSON.                         |
| D-3 | User can download review-range data as JSONL.                                   |
| D-4 | Exports include tags, goals, highlights, completed TODOs, priority, and minutes. |
| D-5 | Filtered downloads have `-filtered` in the file name.                           |

**Not yet built** (from the original plan):

| ID  | Requirement                                |
| --- | ------------------------------------------ |
| D-6 | Download journal entries as CSV.           |
| D-7 | Download TODOs as CSV.                     |
| D-8 | Download all data as one JSON file.        |
| D-9 | A `/data` page with simple raw tables.     |

The vault itself already gives full raw access, which makes these less pressing.

---

## 10. Data Model: The Vault

All data lives in one folder of Markdown files. There is no database and no cache. The app reads the files on every request.

### 10.1 Folder Layout

```txt
<vault>/
├── journal/
│   └── 2026/
│       └── 2026-09-28.md      one daily note per day with entries
├── todos.md                    every TODO and its subtasks, in the user's order
├── goals/
│   └── <slug>.md               one file per goal
├── .trash/
│   └── deleted.md              append-only log of deleted items
└── .workledger/
    └── error.log               the installed app's error log (not notes)
```

Files and folders are created on first write.

### 10.2 Journal Note

`journal/YYYY/YYYY-MM-DD.md`. The app creates it with `date` frontmatter. Every top-level `- ` line that is not a task (`- [ ] `) starts an entry. Text outside entry blocks is left alone.

```md
---
date: 2026-09-28
---

- 09:15 Reviewed the migration plan #review [[improve-reliability]] ⏱ 45m ⭐ ^k3x9qa
    Two things to follow up:

    - Check the **rollback plan**
      - Verify the staging checklist
    - Ask Alex about staging auth
- Helped support with an escalation ^m7p2rd
```

Metadata is parsed only on the first line. The app writes non-blank continuation lines with four spaces added to their typed indentation; internal blank lines stay empty. The reader accepts any space or tab indentation and ends an entry at the next non-blank, unindented line or end of file. Blank lines belong to the entry only when another indented line follows. It removes the smallest indent across non-blank body lines, but never more than four columns, counting a tab as four spaces. Indentation relative to the first line survives; hand-written two-space or tab-indented notes still dedent to zero. Tags and goal links anywhere in the body count alongside the first line's metadata, but remain in the body text.

### 10.3 `todos.md`

Every top-level task line is a TODO. Indented lines (2+ spaces or a tab) directly under it belong to it: an indented task line is a subtask, and any other indented line is a note on the TODO. A subtask indented under another subtask is its child. The app writes four more spaces per level. Other lines are ignored. File order is display order.

```md
---
type: todos
---

- [ ] Fix flaky auth test #bug ⏫ ⭐ ➕ 2026-09-20 ^t8k2m4
    Repro only on CI. Check the clock mock.
    - [x] Reproduce locally ^q7d3hn
    - [ ] Replace the clock mock ^w2c8rv
        - [ ] Check the other suites that use it ^e5j9tb
- [x] Write incident follow-up [[improve-reliability]] 🔼 ➕ 2026-09-21 ✅ 2026-09-28 ^h4w9ze
```

A subtask is a checklist item: text, done or not, and an `^id`. `[x]` or `[X]` is done; any other mark reads as not done. Subtasks have no priority, star, goals, or dates. `#tags` and `[[links]]` in their text are shown but don't count toward tags, goals, or filters. A hand-written subtask without `^id` gets one on first read, changing only that line. When the app rewrites a TODO, it writes the notes first and then the subtasks, and a subtask mark other than `x` is written back as `[ ]`.

Notes needing blank lines, indentation, or literal checkboxes use a four-space-indented block between `<!-- todo-notes -->` and `<!-- /todo-notes -->`. Every content line has four spaces added, including empty lines. The reader removes exactly those four spaces and does not interpret checkboxes inside the block as subtasks. If a closing marker occurs in the notes, both delimiters receive an unused numeric suffix such as `:1`. Simple notes keep the legacy format. These blocks require ToDo 1.3.0 or newer; older versions can lose formatting when rewriting them.

### 10.4 Goal File

`goals/<slug>.md`. Frontmatter holds `title`, `cycle`, and `status`. The body is the description in the user's own Markdown.

```md
---
title: Improve platform reliability
cycle: 2026
status: active
---

Cut pages per week in half and get every service an owner and a runbook.
```

A missing title falls back to the slug. A missing or unknown status reads as `active`. Values that would confuse YAML are written JSON-quoted.

### 10.5 Trash

`.trash/deleted.md`. Each delete appends the whole entry block, or the task line with its notes and subtasks, or a subtask with its children, with a UTC timestamp and the source file. Nothing is lost, but there is no restore button.

```md
- Deleted 2026-09-28T18:42:15.123Z from journal/2026/2026-09-28.md
    - 10:02 Draft notes nobody needed ^q2b8nm
```

### 10.6 Line Grammar

Entry first line: `- [HH:MM] text [#tags] [[[links]]] [⏱ Nm] [⭐] ^id`. Continuations follow the block rules in 10.2.

TODO line: `- [mark] task [#tags] [[[links]]] [⏱ Nm] [priority] [⭐] [➕ created] [✅ completed] ^id`

Subtask line: `<indent>- [mark] text ^id`

| Token              | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `[ ]`              | Open                                                                                          |
| `[x]` (or `[X]`)   | Done                                                                                          |
| `[/]`, `[b]`, `[-]` | Read as Open (Obsidian Tasks' in progress, blocked, cancelled). Written back as `[ ]` when the app rewrites the line. |
| `⏫` `🔼` `🔽`     | Priority High, Medium, Low (Obsidian Tasks). `🔺` reads as High and `⏬` as Low; never written. |
| `➕ YYYY-MM-DD`    | Created date (Obsidian Tasks).                                                                |
| `✅ YYYY-MM-DD`    | Completion date (Obsidian Tasks).                                                             |
| `⭐`               | Starred highlight (app-specific).                                                             |
| `⏱ Nm`             | Time spent in minutes (app-specific). Counted for entries. On a TODO line it is kept but not shown or counted. |
| `#tag`             | Tag. Letters, numbers, `_`, `/`, `-`. Lowercased. Number-only tags like `#892` are plain text, as in Obsidian. |
| `[[slug]]`, `[[slug\|label]]` | Goal link (wikilink).                                                              |
| `^id`              | Obsidian block ID. The app uses it to find the entry or task again.                           |
| `HH:MM`            | Local clock time, entries only.                                                               |

Rules:

- `#tags` and `[[links]]` at the end of an entry's first line or a TODO line are metadata and are not shown as part of the text. Ones mid-sentence stay in the text and still count. A labeled link `[[slug|label]]` always stays in the text, and so does anything written before it.
- When the app rewrites an item, it never duplicates a tag or link already written inline, including in an entry's body.
- Emoji variation selectors written by other editors are ignored.

### 10.7 IDs and Hand Edits

- IDs are 6 random characters from `a-z` and `2-9`, excluding look-alikes (`l`, `o`, `0`, `1`), unique within the file.
- A hand-written entry without `^id` gets one appended to its first line on first read; its body and existing token order are untouched. A TODO without `^id` gets one by rewriting its task line in canonical token order.
- Lines the app doesn't recognize are preserved as written.
- Rewrites happen on first read (missing ID), star, edit, and status change. Entry edits and star changes rewrite the whole block. They keep a trailing labeled link `[[slug|label]]` as written, and any `⏱ Nm` on a TODO line.

### 10.8 Writes

- Every write goes to `<file>.tmp` and is renamed over the original, so a crash never leaves a half-written note.
- The trash log is appended to.
- Goal slugs must match `^[\p{L}\p{N}]+(-[\p{L}\p{N}]+)*$`, so a URL can never point outside `goals/`.

---

## 11. Date and Time Rules

| Value          | Format       | Used for                                                                         |
| -------------- | ------------ | -------------------------------------------------------------------------------- |
| Local date     | `YYYY-MM-DD` | Journal file names, TODO created and completed dates, review ranges.             |
| Local time     | `HH:MM`      | Clock time on entries logged to today.                                           |
| UTC timestamp  | ISO string   | Trash log, `generatedAt` in JSON export, error log.                              |

There are no `created_at`/`updated_at` audit timestamps. A journal entry's date is its file.

Local dates come from local getters, never `toISOString()`, which returns a UTC date and can be wrong near midnight:

```ts
export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

Date strings are parsed as local dates. Impossible dates such as `2026-02-30` are invalid. Weeks start on Monday.

---

## 12. Core Business Logic

### 12.1 Creating Journal Entries

1. Use the form's date, or today if blank. Reject an invalid date.
2. Parse the whole input as one entry: normalize line endings, trim outer blank lines and line ends, and drop a leading first-line checkbox (J-2). Normalize whitespace on the first line; keep body line breaks and indentation as typed, without dedenting. Reject empty parsed text, including a lone checkbox marker.
3. Parse time spent. Reject unreadable input.
4. Collect tags and goal links under the entry metadata rules (10.2).
5. Add the clock time only when the date is today.
6. Write one block after the day's last entry (or create the note with frontmatter).
7. Redirect back (303).

### 12.2 Updating Journal Entries

- Editable: text (including trailing tags and links) and time spent. Edits use the same input normalization as capture and keep the entry's line breaks.
- Star and unstar are a separate action.
- Empty text is rejected: "An entry can't be empty. Delete it instead."
- Moving an entry to another date is not supported.

### 12.3 Deleting Journal Entries

The whole entry block is appended to `.trash/deleted.md`, then removed from the note. Neighboring entries and other notes stay untouched.

### 12.4 Creating TODOs

| Field      | Rule                                                      |
| ---------- | --------------------------------------------------------- |
| `task`     | Required after trim. Typed `#tags` and `[[links]]` parsed. |
| `priority` | Optional: `High`, `Medium`, `Low`, or blank.              |
| `status`   | Optional: `Open` or `Done`. Defaults to `Open`.           |
| `goals`    | Optional checked goal slugs.                              |
| `notes`    | Optional.                                                 |

The created date is today. A TODO created as `Done` also gets today as its completion date. New TODOs are written at the top of `todos.md`, after the frontmatter.

### 12.5 Marking a TODO Done

```ts
if (patch.status === "Done" && next.completedOn === null) {
  next.completedOn = patch.completedOn ?? today;
}
```

- The completion date is the local date used for grouping. There is no completion timestamp.
- From a past day on Today, the form sends that day as `on`. On today it sends no date, so a window left open overnight uses the new day. The server uses `on` only if it is valid and not after today. Otherwise it uses today.
- From the Todos page, the date is today.
- Once set, the date is never overwritten automatically.
- Marking a TODO done, or checking a subtask, checks every subtask under it. Reopening a TODO or unchecking a subtask changes nothing else. Checking the last subtask does not complete the TODO.

### 12.6 Reopening and Re-closing

- Reopening keeps the completion date. The Todos page shows "Kept: done Sep 28".
- A reopened TODO drops out of review evidence until it is done again.
- Re-closing reuses the original date.

### 12.7 Dropping a TODO

There is no cancelled state. A TODO that's no longer needed is deleted (12.9), and a copy stays in the trash.

### 12.8 Clearing a Completion Date

Only by explicit user action, with confirmation. The TODO leaves every review until it is marked done again, which dates it anew.

### 12.9 Deleting TODOs

The task line, its notes, and its subtasks are appended to `.trash/deleted.md`, then removed from `todos.md`. Deleting a subtask does the same for it and the subtasks under it.

### 12.10 Goals

- The slug comes from the title: lowercase, accents stripped, non-alphanumerics to `-`, max 48 characters.
- If the title's slug is taken by a goal in another cycle, the new goal gets `<slug>-<cycle>` (for example `improve-reliability-2027`). Otherwise duplicates get `-2`, `-3`, and so on.
- Title, cycle, status, and description can change. The slug and file name never do.
- New goals start `active`.
- There is no delete in the app. Remove the file by hand.

---

## 13. Review Query Model

All review output comes from one model in `src/review.ts`. The Review page, goal pages, and all three exports read from it, so they can't disagree.

**Collect.** Review items are:

- Journal entries whose date is in range.
- TODOs with status `Done` and a completion date in range, dated by that completion date.

**Filter.** Starred only, tag, goal, and a case-insensitive text match.

**Order.** By date. Within a day, entries come before TODOs, each in file order. `sort=desc` reverses the days, not the items within a day.

**Group.**

- Days: each date with its entries and TODOs. Days with nothing are left out.
- Highlights: starred items in document order.
- By goal: for each goal with linked items in the result, those items.

**Stats.** Entry count, completed TODO count, starred count, active days (dates with any item), total minutes, and tag counts sorted by count then name. Stats reflect the active filters.

Goal pages use the same collection with an all-time range.

---

## 14. Export Formats

### 14.1 Routes

```txt
GET /review/export.md?preset=lastQuarter
GET /review/export.json?from=2026-01-01&to=2026-03-31&goal=improve-reliability
GET /review/export.jsonl?preset=year&highlights=1
```

Exports take the same parameters as `/review`. Downloads are named `accomplishments-FROM-to-TO[-filtered].{md,json,jsonl}`.

### 14.2 Markdown

```md
# Accomplishments: 2026-09-01 to 2026-09-30

## Summary

- Journal entries: 2
- TODOs completed: 1
- Highlights: 1
- Active logging days: 2
- Time logged: 1h 30m
- Top tags: #review (2), #bug (1)

## Highlights

- 2026-09-01 — Fixed flaky test

## By goal

### Improve reliability

- 2026-09-02 — Reviewed Improve reliability plan

## Daily Accomplishments

### 2026-09-01

#### Journal

- ★ Fixed flaky test

#### Completed TODOs

- [High] Deploy hotfix

### 2026-09-02

#### Journal

- Reviewed Improve reliability plan
```

- "Time logged" is omitted when zero. "Top tags" lists up to 8.
- A `- Filters: …` line is added when filters apply.
- Highlights is omitted in starred-only mode.
- `★` marks starred items in By goal and the daily lists. TODOs show `[Priority]`.
- `[[links]]` become their label, else the goal's title, else the slug.
- In Highlights, By goal and the daily journal list, an entry's continuation lines are indented two spaces under its bullet, preserving relative indentation. Blank lines stay empty.
- An empty result ends with `_Nothing recorded in this range._`

### 14.3 Copy the Document

The server puts the same Markdown in the collapsed "Markdown source" textarea, and a minimal HTML version in a `<template>`. List blocks use the entry renderer (9.2), including indented continuations; each item's first paragraph has no extra `<p>` wrapper inside its `<li>`. The copy button writes both to the clipboard, so it pastes as formatted text in Word or Google Docs and as Markdown in plain text boxes. If the clipboard API fails, it falls back to plain text. If that fails too, it opens the Markdown source, selects it, and asks the user to press Ctrl+C.

### 14.4 JSON

```json
{
  "range": { "from": "2026-09-01", "to": "2026-09-30" },
  "generatedAt": "2026-09-28T12:00:00.000Z",
  "filters": { "highlightsOnly": false, "sort": "asc", "tag": null, "goal": null, "q": null },
  "stats": { "journalEntries": 2, "completedTodos": 1, "highlights": 1, "activeDays": 2, "minutesLogged": 90 },
  "tagCounts": [{ "name": "review", "count": 2 }, { "name": "bug", "count": 1 }],
  "goals": [{ "slug": "reliability", "title": "Improve reliability", "cycle": "2026", "status": "active" }],
  "items": [
    {
      "type": "journal",
      "id": "b",
      "date": "2026-09-01",
      "text": "Fixed flaky test",
      "tags": ["bug", "review"],
      "goals": [],
      "highlight": true,
      "minutes": 60,
      "priority": null,
      "status": null
    }
  ]
}
```

`goals` lists every goal, not only those in range. Item `type` is `journal` or `todo`. Item goals carry `{ slug, title }`. Entry `text` keeps its line breaks in JSON and JSONL, encoded as `\n` within the string.

### 14.5 JSONL

One item per line, in document order, each with the range so it stands alone when chunked:

```json
{"type":"todo","id":"c","date":"2026-09-01","text":"Deploy hotfix","tags":[],"goals":[],"highlight":false,"minutes":null,"priority":"High","status":"Done","range":{"from":"2026-09-01","to":"2026-09-30"}}
```

An empty result is an empty file.

---

## 15. Routes

Every page and form goes through `handleRequest` in `src/server.ts`. `HEAD` is treated like `GET`.

### 15.1 GET

| Path                          | Purpose                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `/`                           | Today. `?date=`, `?edit=<entry id>`, `?error=`.            |
| `/todos`                      | Todos. `?q`, `priority`, `tag`, `goal`, `edit`, `back`, `added`, `error`. |
| `/goals`                      | Goals. `?cycle=`, `?error=`.                               |
| `/goals/:slug`                | Goal page. `?edit=1`, `?error=`.                           |
| `/review`                     | Review page. Parameters in 9.8.                            |
| `/review/export.md`           | Markdown download.                                         |
| `/review/export.json`         | JSON download.                                             |
| `/review/export.jsonl`        | JSONL download.                                            |
| `/settings`                   | Desktop agent access settings, status, and connection examples. |
| `/todo-version`               | Read-only todo revision for a draft-safe change notice.    |
| `/styles.css`, `/app.js`, `/rich-text.js`, `/icon.svg` | Bundled assets (exact paths only).                 |

Anything else, including a path with a malformed `%` escape, returns the "Not found" page (404).

### 15.2 POST

| Path                              | Fields                                                     | Action                                  |
| --------------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| `/journal`                        | `date`, `content`, `tags`, `minutes`, `star`, `goals`*, `return_to` | Add one entry.                |
| `/journal/:id`                    | `date`, `content`, `minutes`, `return_to`                  | Edit entry.                             |
| `/journal/:id/star`               | `date`, `return_to`                                        | Toggle star.                            |
| `/journal/:id/delete`             | `date`, `return_to`                                        | Delete entry to trash.                  |
| `/todos`                          | `task`, `priority`, `status`, `goals`*, `notes`, `return_to` | Add TODO.                             |
| `/settings`                       | `intent=save`, `enabled`, `background`, `port`; or `intent=token` | Save desktop preferences or replace access token. |
| `/todos/:id`                      | `task`, `priority`, `notes`, `return_to`                   | Edit TODO.                              |
| `/todos/:id/status`               | `status` (`Open` or `Done`), `on`, `return_to`             | Mark done or reopen.                    |
| `/todos/:id/star`                 | `return_to`                                                | Toggle star.                            |
| `/todos/:id/clear-completion`     | `return_to`                                                | Clear completion date.                  |
| `/todos/:id/delete`               | `return_to`                                                | Delete TODO to trash.                   |
| `/todos/:id/subtasks`             | `text`, `return_to`                                        | Add a subtask at the end of the TODO.   |
| `/todos/:id/move`                 | `before` or `after` (a TODO id), `return_to`               | Move the TODO.                          |
| `/subtasks/:id`                   | `text`, `return_to`                                        | Edit subtask text.                      |
| `/subtasks/:id/done`              | `done` (`1` or blank), `return_to`                         | Check (and everything under it) or uncheck. |
| `/subtasks/:id/delete`            | `return_to`                                                | Delete subtask and its children to trash. |
| `/subtasks/:id/move`              | `before`, `after` (a subtask id) or `into` (a TODO or subtask id), `return_to` | Move the subtask. |
| `/goals`                          | `title`, `cycle`, `body`                                   | Create goal, go to its page.            |
| `/goals/:slug`                    | `title`, `cycle`, `status`, `body`                         | Save goal.                              |

\* repeated field.

A successful POST, or one with a validation error, answers with a 303 redirect (post/redirect/get). A missing entry, TODO, or goal gets the 404 page. `return_to` must be a same-origin path (starts with one `/`, not `//` or `/\`), otherwise a default is used. On a validation error, the redirect adds `?error=<message>` and the page shows it. The capture form and the entry and TODO editors also get the typed values back. Adding a TODO and the goal forms do not (their `required` fields catch most cases in the browser).

---

## 16. Progressive Enhancement

There is no HTMX and no client framework. The server renders full HTML pages, and plain forms post and redirect. Everything works without `public/app.js`. With it:

| Behavior               | Detail                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| In-place form posts    | POST forms are sent with `fetch`. The redirected page's `<main>` and nav replace the current ones, and the URL updates. Focus stays on the same control, or the same or a nearby row. New entries are briefly marked. On a network error it falls back to a normal submit. |
| Live TODO filters      | The `data-live-search` form waits 250ms after the last committed keystroke, then fetches its GET URL. Only `.page-sub`, `.filter-actions` and `#todo-results` are replaced and initialized, leaving unsent add-TODO text and the search field intact. Typing pauses live search while a `.todo-edit` is open; Enter or a select change still submits. Composing input is ignored; composition end schedules the committed text. Unchanged filters skip the fetch; new input aborts pending requests so stale responses cannot swap. Debounced typing uses `replaceState`; explicit submits use `pushState`. Apply is hidden. Network errors fall back to a normal submit. |
| Confirmations          | Forms with `data-confirm` ask before posting (delete, clear completion).                     |
| Drafts                 | Capture text saved in `localStorage` per day. Cleared after a successful save.                            |
| Rich-text editor       | All editable multiline fields use the same toolbar and Markdown serializer. Source mode protects existing syntax that cannot round-trip. Dirty multiline edits survive Escape; unchanged edits can still be cancelled with it. |
| Auto-submit            | Filter selects and checkboxes submit on change. The date picker waits 900ms for typing to stop.           |
| Copy                   | Writes HTML + Markdown to the clipboard, with fallbacks (14.3). Status is announced to screen readers.    |
| Print                  | Sets the page title to the suggested PDF name, prints, restores the title.                                |
| Reordering             | Drag a TODO or subtask by its grip handle, or use the hotkeys in 20.2. Needs the script.                  |
| Keyboard shortcuts     | See 20.2.                                                                                                 |

Without the script, the date picker shows a "Go" button and TODO filters keep their Apply button. Destructive actions then post without a confirmation prompt (see 28.3).

---

## 17. Technical Architecture

### 17.1 Stack

| Layer               | Choice                                                                               |
| ------------------- | ------------------------------------------------------------------------------------ |
| Desktop shell       | Electron 44 (pinned `44.9.1`)                                                        |
| Packaging           | electron-builder `26.18.0`: per-user NSIS installer and zip, Windows only            |
| Main process build  | `bun build src/electron/main.ts --target=node --format=esm --external electron --external electron-updater` to `out/main.js` |
| Dev server, tests   | Bun (`Bun.serve()`, `bun test`). Bun is also the package manager.                    |
| Request handling    | One function, `handleRequest(req, ctx): Promise<Response>`, using the Fetch API      |
| Storage             | Markdown files via `node:fs`                                                         |
| Rendering           | Server-rendered HTML from template strings, escaped with `escapeHtml`                |
| Interactivity       | `public/app.js`, plain JavaScript module; shared Markdown rendering and editor serialization in `public/rich-text.js` |
| Styling             | One stylesheet, `public/styles.css`. Dark theme only.                                |
| Static assets       | `styles.css`, `app.js`, and `icon.svg` imported as text. A Bun macro embeds `rich-text.js` while also allowing its renderer to run on the server. No asset disk reads at runtime. |
| Dependencies        | Runtime: `electron-updater` `6.8.11`. Dev: `@types/bun`, `electron`, `electron-builder`, `playwright` `1.64.1`. |
| Agent access        | Official MCP TypeScript SDK v2: `@modelcontextprotocol/server` `2.4.0`, Node adapter `2.1.2`, Zod `4.2.0`. Bundled in Electron; no separate runtime installation. |

### 17.2 Request Flow

```txt
Desktop app:  window → app://local/... → protocol.handle("app") → serveAppRequest → handleRequest → Vault
Development:  browser → http://127.0.0.1:41820/... → devFetch → handleRequest → Vault
Agent access: local MCP client → authenticated 127.0.0.1:<port>/mcp → task operations → same Vault
```

`handleRequest` doesn't know which one called it. Each entry point checks where the request came from first and adds security headers: CSP and `nosniff` in the app, CSP in development (section 21).

### 17.3 Desktop App Behavior

- Double-click opens one window (1280×860). Closing it quits by default.
- Settings can enable agent access and optionally keep MCP running when the window is closed. With both enabled and the listener running, closing hides the window and leaves a system tray icon. Open ToDo restores it; Quit ToDo exits and stops MCP. A tray failure preserves close-to-quit behavior. Nothing starts automatically at Windows sign-in.
- A second launch focuses the existing window instead of opening another.
- Startup failures show an error box ("ToDo couldn't start") and quit.
- The app ID `com.workledger.app` matches in `electron-builder.yml` and `main.ts`. Changing it breaks taskbar pins.
- Installed builds check stable releases in `kuklaph-uncw/todo` on launch and download newer versions. A native dialog offers Restart now or Later. Later leaves the app running and asks again on the next launch; closing normally does not install the update.
- Update failures are logged without stopping the app. Source/development runs do not check for updates.

### 17.4 Where Notes Live

| How it runs                        | Vault path                         |
| ---------------------------------- | ---------------------------------- |
| `VAULT_PATH` set                   | That path (relative to the working directory). |
| Installed app                      | `~/Work Ledger`                    |
| From source (`bun run dev`, `bun run start`) | `./vault`. `bun run dev` first replaces it with a fresh copy of `~/Work Ledger`, so development uses your real notes without changing them. |

The installed app sends errors to `<vault>/.workledger/error.log`. From source they go to the console.

### 17.5 Design Language

From the header of `styles.css`:

- Brass means value. Only starred work and the review payoff use it.
- Serif is the user's words. Mono is the record (dates, times, tags, counts). Sans is the app.
- Ruled lines and a margin column instead of boxes.

A print stylesheet turns the review into a plain black-on-white document.

### 17.6 Commands

| Command              | Does                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| `bun run dev`        | Copies your notes into `./vault` (skipped when `VAULT_PATH` is set), then serves `http://127.0.0.1:41820` (`PORT` overrides). Restarts on code changes and reloads open pages. |
| `bun run demo`       | Same as `bun run dev`, but on fresh sample data: replaces `./demo-vault` with a new `seed:demo` run each start. |
| `bun run start`      | Builds the main process and opens the Electron window.                  |
| `bun run build`      | Builds the main process, Windows x64 installer, zip, and update metadata in `dist/`. Never uploads. |
| `bun test`           | Runs all tests.                                                         |
| `bun run seed:demo`  | Fills `./demo-vault` (or `VAULT_PATH`) with about 10 weeks of sample work. Refuses a non-empty folder. |

`scripts/make-icon.ps1` redraws `public/favicon.ico` (the Windows app icon) at every size Windows uses.

---

## 18. Project Structure

```txt
todo/
├── package.json
├── bun.lock
├── tsconfig.json
├── electron-builder.yml          # packaging, fuses
├── prd.md
├── planning/                     # original milestone plans and mockups (history)
├── public/
│   ├── app.js                    # progressive enhancement
│   ├── rich-text.js              # shared safe Markdown renderer and DOM serializer
│   ├── styles.css
│   ├── icon.svg                  # in-app icon
│   └── favicon.ico               # Windows app icon
├── scripts/
│   ├── make-icon.ps1
│   └── seed-demo.ts
├── src/
│   ├── server.ts                 # handleRequest: routing and bundled assets
│   ├── review.ts                 # review model and exports
│   ├── launch.ts                 # vault path, error log
│   ├── dev-server.ts             # development server
│   ├── assets.d.ts
│   ├── electron/
│   │   ├── main.ts               # window, lockdown, single instance
│   │   └── protocol.ts           # app:// handler, CSP
│   ├── vault/
│   │   ├── format.ts             # parse and format lines and files
│   │   └── vault.ts              # file-backed store
│   ├── routes/
│   │   ├── shared.ts             # page, redirect, form helpers
│   │   ├── today.ts
│   │   ├── journal.ts
│   │   ├── todos.ts
│   │   ├── goals.ts
│   │   └── review.ts
│   ├── views/
│   │   ├── layout.ts             # shell, nav, shortcuts dialog
│   │   ├── components.ts
│   │   ├── today.ts
│   │   ├── todos.ts
│   │   ├── goals.ts
│   │   └── review.ts
│   └── lib/
│       ├── date.ts
│       ├── html.ts
│       ├── lines.ts              # indented continuation boundaries
│       ├── markdown.ts           # re-exports the shared Markdown renderer
│       └── validation.ts
└── tests/
    ├── helpers/test-vault.ts
    ├── unit/                     # date, format, html, markdown, review, validation
    └── integration/              # vault, routes, server, app-protocol, launch
```

Generated and ignored: `out/`, `dist/`, `vault/`, `demo-vault/`, `node_modules/`.

---

## 19. Validation and Error Handling

| Case                               | Behavior                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Blank capture                      | "Write something before adding it to the ledger."                            |
| Unreadable time spent              | "Time spent should look like 45m, 1h, 1h 30m or 90 minutes."                 |
| Empty entry on edit                | "An entry can't be empty. Delete it instead."                                |
| Empty TODO task                    | "A todo needs a task."                                                       |
| Invalid priority                   | "Pick High, Medium, Low or no priority."                                     |
| Invalid TODO status                | "That status isn't one the app knows."                                       |
| Blank goal name on create          | "A goal needs a name."                                                       |
| Invalid goal status                | "Pick Active, Achieved or Dropped."                                          |
| Invalid date on Today              | Falls back to today.                                                         |
| Invalid date on capture            | "That date isn't valid."                                                     |
| Missing entry, TODO, or goal       | 404 page: "… doesn't exist. It may have been deleted or edited outside the app." |
| Unsafe `return_to`                 | Ignored. A default path is used.                                             |
| Unexpected error                   | 500, plain text with the message. Logged to the console or `error.log`.      |
| Startup failure (desktop)          | Error box, then quit.                                                        |

Messages show at the top of the page (`role="alert"`). Capture and edit forms get the typed values back (see 15.2). The capture text itself survives as a draft.

---

## 20. Accessibility and Keyboard Support

### 20.1 Requirements

| ID  | Requirement                                                                                      |
| --- | ------------------------------------------------------------------------------------------------ |
| A-1 | Actions use real `<button>` elements inside forms, or links.                                     |
| A-2 | Inputs have labels (visible or screen-reader only). Icon buttons have `aria-label`.              |
| A-3 | Focus states are visible. A skip link jumps to the main content.                                 |
| A-4 | Destructive actions ask for confirmation (with the script).                                      |
| A-5 | Layout adapts to narrow windows (breakpoints at 1180px, 860px, 560px).                           |
| A-6 | Every page and form works without client-side JS. (The shortcuts dialog, tag and goal suggestions, focus mode, opening subtasks, and reordering need it.) |
| A-7 | After an in-place update, focus stays where the user was.                                        |
| A-8 | Copy results are announced. Animations stop under `prefers-reduced-motion`.                      |

### 20.2 Keyboard Shortcuts

Listed in the app's shortcuts dialog (`?`). Single-key shortcuts are ignored while typing in a field.

| Shortcut                | Where                | Action                                              |
| ----------------------- | -------------------- | --------------------------------------------------- |
| `n`                     | Today                | Focus the capture box.                              |
| `t`                     | Today, Todos         | Focus the add-TODO field.                           |
| `[` / `]`               | Today                | Previous / next day.                                |
| `/`                     | Todos, Review        | Focus search.                                       |
| `Ctrl + Shift + F`      | Today                | Write a new entry in focus mode.                    |
| `Alt + ↑` / `Alt + ↓`   | Todos                | Move the focused TODO or subtask up or down among its siblings. |
| `Alt + →` / `Alt + ←`   | Todos                | Indent the focused subtask under the one above, or outdent it.  |
| `Esc`                   | Any                  | Close the suggestion list, leave focus mode, cancel an entry or TODO edit, or leave a text box. |
| `Ctrl + Enter`          | Any form             | Save the form you're in (`Cmd + Enter` also works). |
| `g` then `t`/`d`/`g`/`r`| Any                  | Go to Today, Todos, Goals, Review.                  |
| `?`                     | Any                  | Show the shortcut list.                             |

---

## 21. Security and Privacy

### 21.1 Posture

| Area            | Requirement                                                                   |
| --------------- | ----------------------------------------------------------------------------- |
| Network         | Pages use `app://`. No listener by default. Opt-in MCP binds only `127.0.0.1`, default port 41821. |
| Outbound calls  | GitHub update checks/downloads. No telemetry or app-initiated notes uploads. Authorized MCP clients receive todo data and may send it to their agent provider. |
| Auth            | MCP requires a revocable bearer token on every request. Settings and UI mutations retain `app://local` origin checks. |
| Data            | Plain Markdown files in a local folder. Not encrypted at rest.                |
| Backups         | Copy the folder.                                                              |

### 21.2 Desktop App

Follows Electron's security checklist.

**Serving pages.**

- The `app` scheme is registered as privileged (`standard`, `secure`, `supportFetchAPI`, `codeCache`) and served with `protocol.handle`.
- Requests for any other host return 404.
- GET and HEAD are open. Any other method needs `initiatorOrigin` to be `app://local`, which Electron sets and a page can't fake. Otherwise 403.
- Every response gets a Content Security Policy and `X-Content-Type-Options: nosniff`:

```txt
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'
```

**Renderer.**

- Sandbox on (`app.enableSandbox()` and `sandbox: true`), `contextIsolation: true`, `nodeIntegration: false`.
- No preload script and no IPC.
- Navigation and redirects are locked to `app://local`. `window.open` is denied. `<webview>` is blocked.
- Every permission is denied except `clipboard-sanitized-write` from `app://local`. Device permissions are denied.

**Packaged build.**

- DevTools off and no menu (so no reload or DevTools shortcuts).
- Refuses to start when launched with `--remote-debugging-port` or `--remote-debugging-pipe`.
- Electron fuses: `runAsNode` off, cookie encryption on, `NODE_OPTIONS` off, `--inspect` arguments off, embedded asar integrity validation on, only load app from asar, file protocol extra privileges off.
- GitHub update feed is `kuklaph-uncw/todo`. `bun run build` uses `--publish never`; publishing is a separate action. See [release steps](docs/releases.md).
- Unsigned. Windows SmartScreen or IT policy may warn or block the installer.

### 21.3 Agent access and background operation

Agent access is disabled by default. The Settings link is in the rail footer. Preferences and a SHA-256 token hash are stored in `<userData>/mcp.json`, outside the Markdown vault. The plaintext token appears only in the response that generates it, with `Cache-Control: no-store`; it is never placed in a URL or retained for later display. Generating a replacement revokes the previous token. The app provides connection examples but does not modify agent configuration files.

The MCP listener and UI share one synchronous Vault in the Electron main process. MCP serves only `POST /mcp`, with the official SDK's stateless handler and legacy-client compatibility. Requests require the configured loopback Host and bearer token. Requests with an Origin header or cross-site fetch metadata are refused, CORS is not enabled, and JSON request bodies are limited to 1 MiB. Bind failures leave the app usable and show an error in Settings. Disabling access or quitting closes the listener.

Tools are `list_todos`, `get_todo`, `add_todo`, `update_todo`, `set_todo_status`, `add_subtask`, `set_subtask_done`, and `delete_todo`. They preserve the app's completion dates, Markdown notes, subtasks, and trash behavior. Every mutation of an existing todo requires its current content revision; stale requests are rejected. Writes require a unique `requestId`; exact retries of the most recent 1024 successful calls reuse their results while this app process runs, including listener restarts. This is not a durable exactly-once guarantee: after an app restart, read current state before retrying a create. Reusing a remembered ID with different arguments is rejected.

Read tools do not assign IDs or change files. A hand-written todo with no block ID can be read, but must be opened in ToDo before editing through MCP. Task forms include revisions too; stale forms return a conflict with submitted text retained for recovery. Older callers omitting the form revision retain their previous behavior. External editor writes are not coordinated by a cross-process lock.

Visible pages check the todo revision every five seconds and on focus. Changes show a notice without replacing page content or moving focus. Refresh is explicit and warns before discarding typed edits. Ledger capture drafts keep their existing localStorage protection. MCP access is local to this computer; remote agents need a separately designed connection.

### 21.4 Development server request guards

`bun run dev` only. Never shipped.

- Binds to `127.0.0.1`.
- Answers only when the `Host` header is `localhost`, `127.0.0.1`, or `[::1]` (blocks DNS rebinding).
- Refuses POSTs with `Sec-Fetch-Site: cross-site`, an `Origin` of `null`, or an `Origin` whose host differs from `Host` (blocks CSRF from other tabs).
- Sends the same CSP as the desktop app.
- Adds a script to each page that reloads it after the server restarts (`/__dev/reload.js`, `/__dev/events`).

### 21.4 Input Handling

- All user text is HTML-escaped before rendering. Tag and link styling runs on escaped text.
- `return_to` only accepts same-origin paths.
- Goal slugs from URLs must be plain slugs.
- Assets are served by exact path from bundled strings, so path traversal can't reach the disk.

---

## 22. Backup and Restore

The vault folder is the source of truth. The rail shows its path on every page.

**Backup.** Quit ToDo before copying the folder. With background mode enabled, use **Quit ToDo** from the system tray; closing the window leaves MCP writes active. Writes are atomic per file, but quitting avoids copying mid-write.

```powershell
Copy-Item -Recurse "$HOME\Work Ledger" "$HOME\Backups\Work Ledger $(Get-Date -Format yyyy-MM-dd)"
```

**Restore.** Quit ToDo, using the system tray's **Quit ToDo** command if background mode is enabled, then copy a backup over the folder (or point `VAULT_PATH` at it). Closing the window alone does not stop background writes.

**Deleted items.** Find the deleted item in `.trash/deleted.md` and paste it back into its file, including an entry's continuation lines. There is no restore button.

**Not yet built.** A `bun run backup` command that copies the vault to a configured folder.

---

## 23. Testing

`bun test` runs unit, integration, and browser tests. Tests use a temp vault and a clock pinned to 2026-09-28 14:05. Browser tests use Playwright with locally installed Microsoft Edge in headless mode; Edge must be installed before running the full suite.

### 23.1 Unit (`tests/unit/`)

| File                   | Covers                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `date.test.ts`         | Local dates, validation, `addDays`, `startOfWeek`, every preset, last quarter across a year boundary, `formatMinutes`. |
| `format.test.ts`       | Entry blocks and TODO lines: parsing and round-trips, continuation boundaries, dedent with spaces and tabs, editable text, multi-line input normalization, tags and goals across the body, list markers and first-line checkboxes, number-only hashtags, variation selectors, notes, frontmatter quoting, goal defaults. |
| `html.test.ts`         | `escapeHtml`.                                                                           |
| `markdown.test.ts`     | Paragraph breaks, nested ordered and unordered lists, heading levels, escaping before emphasis, code-span isolation, literal unsupported syntax, intraword underscore and asterisk rules, underscored tags and goal labels. |
| `review.test.ts`       | Grouping, ordering, stats, goal grouping, filters, newest first, exact Markdown output with multi-line entries in every list, whole-item HTML and single-paragraph spacing, empty range, JSON and JSONL shape and preserved line breaks, filter parsing and the 12-month default. |
| `validation.test.ts`   | Tags, priority, status, time-spent parsing, slugs, `safeReturnPath`.                    |
| `updates.test.ts`      | Stable update checks, automatic downloads, restart permission, and check/download/prompt failures. |

### 23.2 Integration (`tests/integration/`)

| File                     | Covers                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `vault.test.ts`          | Daily note creation, normalized multi-line blocks returned as read back, appending after whole entries, ID assignment changing only the first line, whole-block update and delete with trash, neighboring notes preserved, date listing across years, TODO completion freezing and clearing, notes, goal slugs. |
| `routes.test.ts`         | Pages, 404s, one multi-line entry per submit with clock time, overnight-window date, Markdown markers kept, blank and checkbox-only capture rejected, error round-trips, backfill, multi-line edit/star/delete, entry Markdown across Today, goal evidence and Review while TODOs stay inline, escaping, past-day check-off, TODO filters and edits, review downloads, filtered naming, dev request guard, `return_to`. |
| `server.test.ts`         | Dev server over real HTTP: CSP, assets, form post and redirect, 404, path traversal.   |
| `app-protocol.test.ts`   | `app://` handler: CSP and nosniff, host check, origin check for posts, assets, traversal. |
| `launch.test.ts`         | Vault path resolution, error log writing.                                              |

### 23.3 Browser (`tests/browser/`)

`rich-text.test.ts` exercises journal capture, goal descriptions, TODO notes, formatting round trips, pasted HTML filtering, undo, draft restoration, source fallback, formatted tag metadata, keyboard toolbar navigation, and narrow layouts. It uses a disposable vault through the real development request handler.

The native Electron window, installer, and installed-to-installed updater are not covered by these browser tests.

### 23.4 Manual Smoke Test (Desktop App)

Run against a build from `bun run build`:

1. Install from the NSIS installer without admin rights.
2. Launch. One window opens on Today. The rail shows the notes path, `C:\Users\<name>\Work Ledger`.
3. Launch again. The existing window comes forward. No second window.
4. Submit an entry with several paragraphs and a nested Markdown list. Confirm it stays one entry, edit it and confirm its line breaks survive. Add two more entries in separate submits and one for yesterday.
5. Add three TODOs. On Todos, type in search and change each filter select; results update in place, focus and caret stay put, and typing adds no history entries. With the script off, confirm Apply works. Mark two TODOs done, one while viewing yesterday. It counts on yesterday.
6. Star one entry. Confirm the day summary counts.
7. Add a goal. Link an entry to it. Confirm it on the goal page.
8. Open Review, This week. Confirm dates. Copy the document and paste into Word (formatted) and Notepad (Markdown).
9. Download .md, .json, .jsonl. Print to PDF.
10. Delete an entry. Confirm it is in `.trash/deleted.md`.
11. Edit a line by hand in the vault, reload, and confirm it shows with an ID added.
12. Close the window. Confirm no Work Ledger process remains.
13. Reopen. Data persisted.
14. Confirm no menu bar, F12 and Ctrl+Shift+I do nothing, and a link to an outside site doesn't navigate.
15. Launch with `--remote-debugging-port=9222`. The app refuses to start.

---

## 24. Acceptance Criteria

### Daily Capture

| ID   | Acceptance Criterion                                             |
| ---- | ---------------------------------------------------------------- |
| AC-1 | User can add a journal entry for today in under 10 seconds.      |
| AC-2 | User can submit several paragraphs of Markdown as one entry.    |
| AC-3 | User can add entries for a previous date.                        |
| AC-4 | User can edit journal entries.                                   |
| AC-5 | User can delete journal entries. The whole block is kept in trash. |
| AC-6 | User can star important entries.                                 |
| AC-7 | Draft journal text survives page reload before submission.       |

### TODOs

| ID    | Acceptance Criterion                                                    |
| ----- | ----------------------------------------------------------------------- |
| AC-8  | User can add a TODO with only a task title.                             |
| AC-9  | User can mark a TODO done or reopen it.                                 |
| AC-10 | User can mark a TODO done.                                              |
| AC-11 | A completed TODO appears on its completion date. Done from a past day dates it to that day, never a future one. |
| AC-12 | Reopening and re-closing a TODO does not overwrite its completion date. |
| AC-13 | User can explicitly clear a completion date with confirmation.          |

### Goals

| ID   | Acceptance Criterion                                                           |
| ---- | ------------------------------------------------------------------------------ |
| AC-G1 | User can create a goal with a review cycle and description.                   |
| AC-G2 | User can link entries and TODOs to a goal by checkbox or by typing `[[slug]]`. |
| AC-G3 | A goal page lists linked entries and done TODOs as evidence.                  |
| AC-G4 | User can set a goal Active, Achieved, or Dropped without breaking its links.  |
| AC-G5 | User can review one goal's evidence as a document.                            |

### Review

| ID    | Acceptance Criterion                                     |
| ----- | -------------------------------------------------------- |
| AC-14 | User can select a preset or custom date range.           |
| AC-15 | Review includes journal entries in range.                |
| AC-16 | Review includes done TODOs completed in range.           |
| AC-17 | Review groups items by date and by goal.                 |
| AC-18 | User can filter to starred only, tag, goal, or text.     |
| AC-19 | User can copy the document as formatted text and Markdown. |
| AC-20 | User can download Markdown, JSON, and JSONL.             |
| AC-21 | User can print the document or save it as PDF.          |

### Local, Private, Desktop

| ID    | Acceptance Criterion                                                        |
| ----- | --------------------------------------------------------------------------- |
| AC-22 | Double-click opens the app. Closing quits by default; optional MCP background mode hides to tray. Explicit Quit always stops the app and MCP. |
| AC-23 | A second launch focuses the existing window.                                |
| AC-24 | Data persists in the vault folder after restart.                            |
| AC-25 | No network listener by default. Enabled MCP listens only on authenticated loopback; authorized clients can read/write todos. UI remains on `app://`. |
| AC-26 | The vault can be backed up and restored by copying the folder.              |
| AC-27 | The vault reads as plain Markdown. Hand edits are picked up and kept.       |
| AC-28 | The installer needs no admin rights.                                        |
| AC-29 | Agent access and background preferences persist. Tokens are shown once, stored as hashes, and replaceable. |
| AC-30 | MCP and task forms reject stale edits. Agent changes never automatically replace typed text. |

### Tags and AI Export

| ID   | Acceptance Criterion                                                      |
| ---- | ------------------------------------------------------------------------- |
| PX-1 | User can add, edit, and view tags on journal entries.                     |
| PX-2 | User can add, edit, and view tags on TODOs (typed in the task).           |
| PX-3 | Review output includes tag counts and tag filtering.                      |
| PX-4 | User can export review-range data as JSON and JSONL for AI summarization. |
| PX-5 | The Markdown vault is the source of truth. There is no database.          |

---

## 25. Success Metrics

After 30 days of use, the app is successful if:

| Metric              | Target                                                               |
| ------------------- | -------------------------------------------------------------------- |
| Capture speed       | Simple entry takes under 10 seconds.                                 |
| Review speed        | Prior-month summary can be produced in under 30 seconds.             |
| Logging consistency | At least 20 active logging days out of 30.                           |
| Historical trust    | Completion dates remain accurate.                                    |
| Export usefulness   | Markdown is review-ready; JSON/JSONL is usable for AI summarization. |

If logging consistency is below 50% after a month, the likely issue is UX friction, not missing features.

---

## 26. Product Risks

| Risk                               | Mitigation                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------- |
| User forgets to log daily          | Make backfilling easy. The week strip shows empty days.                     |
| Capture feels too structured       | Keep metadata optional and out of the way. Suggest `#tags` and goals inline. |
| TODOs dominate the app             | Keep Today journal-first.                                                   |
| Review output is noisy             | Stars, starred-only mode, tag and goal filters.                             |
| Accidental deletion loses history  | Confirm deletes. Append whole deleted items to `.trash/deleted.md`.         |
| Completion dates become unreliable | Freeze completion dates. Never date a TODO in the future.                   |
| Vault is lost                      | Show the vault path on every page. Backup is a folder copy.                 |
| Hand edits break the app           | Unrecognized lines are left alone. Missing IDs are added on read. Writes are atomic. |
| Goal links drift                   | Slugs never change. Unknown `[[links]]` are flagged in the UI.              |
| Desktop app attack surface         | No port, sandboxed renderer, no IPC, CSP, fuses, locked navigation.         |
| Unsigned build is blocked at work  | Known limit. Code signing is out of scope.                                  |
| App grows too complex              | Defer sync, auth, recurring tasks, and in-app AI.                           |

---

## 27. Future Ideas

- Full-text search across the journal (today: Todos search and the Review "Contains" filter).
- Weekly review page.
- Restore deleted items from the trash in the app.
- Delete or archive a goal in the app.
- Move a journal entry to another date.
- Backup command (`bun run backup`).
- CSV exports and a raw data page (D-6 to D-9).
- JSON or CSV import.
- Advanced tag management.
- Recurring TODOs.
- AI-generated review drafts.
- Calendar import.
- GitHub/Jira/Linear import.
- Mood or energy tracking.
- macOS or Linux builds.
- Code signing.
- LAN or mobile access. This would need a network listener and authentication, which the current security model deliberately avoids.

---

## 28. Status

### 28.1 Built

Everything in sections 8 to 24 exists in the code, except items marked "Not yet built". That covers:

- Today: capture, backfill, edit, star, delete to trash, drafts, week strip, TODO tray.
- Todos: open and done groups, subtasks, manual order, filters, search, edit, star, clear completion, delete to trash.
- Goals: cycles, statuses, evidence feed, linked open TODOs, review shortcut.
- Review: eight presets, custom ranges, filters, copy as formatted text, Markdown/JSON/JSONL, print to PDF.
- Markdown vault storage with Obsidian-compatible syntax.
- Windows desktop app with the security model in section 21.
- Automated tests (section 23).

`planning/*.html` holds the original milestone plans (`milestone-01-foundation.html` to `milestone-07-polish-backup.html`), the acceptance matrix, and UI mockups. They describe the earlier SQLite and HTMX design and are kept as history.

### 28.2 Open Items

| Item                                   | Notes                                                                |
| -------------------------------------- | -------------------------------------------------------------------- |
| CSV exports, `/data` page (D-6 to D-9) | From the original plan. The vault gives raw access meanwhile.        |
| Restore from trash                     | Original plan deferred it. Today a manual copy-paste.                |
| Backup command                         | Original "future enhancement". Today a manual folder copy.           |
| Move an entry to another date          | Original plan said "may be supported". Not built.                    |
| README                                 | There is no README. Setup, commands, and backup steps live only in this document. |
| Goal delete or archive                 | No UI. Delete the file by hand.                                      |
| Desktop shell automation             | Native Electron window and installed update behavior still need the manual smoke test. |

### 28.3 Known Gaps

- Without `app.js`, destructive actions post without a confirmation prompt. The desktop app always runs the script, so this only affects the dev server with scripts off.
- Adding a TODO doesn't return typed values after a server-side error. That only happens for a blank task or a tampered field, so nothing of value is lost.
