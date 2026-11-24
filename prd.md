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

At the start of a review cycle, the user writes their goals with their manager in the shape Full Cycle Performance (FCP) uses: name, description, meeting expectations, and exceeding expectations. Talent development plan activities have just a name and one text field. Goals start as drafts; once the manager has pasted one into FCP (with Copy for FCP), the user marks it agreed. While logging, they type `/` to pick a goal, or type its `[[goal-link]]`. Each goal collects the linked entries and completed TODOs as evidence, shown as ticks on a timeline of the cycle (April to March) and as a feed on the goal page. Private talking points go in the goal's notes, which never go to FCP. At review time, the user opens a review filtered to that goal. Next cycle, they carry the goals over as new drafts.

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
| `/goals`                             | Goals       | One review cycle's goal sheet (Reader) or month map (Timeline). |
| `/goals/:slug`                       | Goal        | One goal's text, status, timeline row, and evidence feed.   |
| `/review`                            | Review      | Date-range accomplishment document, filters, exports.       |
| `/review/export.{md,json,jsonl}`     | Downloads   | Review export in Markdown, JSON, or JSONL.                  |

Every page shares a left rail with:

- Nav links (Today, Todos, Goals, Review) with their `g` shortcut. Todos shows the count of open TODOs.
- A Settings link with a gear icon. Settings contains the notes folder path and a Copy path button.
- A "Keyboard shortcuts" button with a keyboard icon that opens the shortcut list.
- One line with the app version and a persistent update control for checking, download progress, and user-requested restart actions. Development runs show updates as unavailable.

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
| J-7  | User can link goals by typing `/` (suggests the viewed day's cycle's goals that aren't dropped; see 9.7) or typing `[[goal-slug]]` in full.                  |
| J-8  | User can enter time spent: `45m`, `1h`, `1h 30m`, `90 minutes`, `1.5h`.                                        |
| J-9  | Entries display in file order. New entries go right after the day's last entry.                              |
| J-10 | Empty capture is rejected with a message. Time and star are put back; the text survives as a draft.          |
| J-11 | Past and future dates are editable. Entries added to today get an `HH:MM` clock time; other days get none.    |
| J-12 | On today, the capture form sends no date, so the server uses the real current day.                           |

**Quick capture.** One bordered box with formatting controls, time spent ("Add time"), a star toggle, and "Add to ledger". Time and star apply to the entry. The box grows with the text up to 75% of the window. Focus mode (the expand button or `Ctrl + Shift + F`) fills the window with the box; `Esc` or saving leaves it.

**Rich-text writing.** Every editable multiline field uses the same visual editor: journal capture and edits, goal notes, and TODO notes. Goal fields that are pasted into FCP (name, description, expectations) stay plain textareas. An Aa button or `Ctrl+Shift+X` reveals the formatting strip; its open state is remembered across editors. The strip provides bold, italic, inline code, code blocks, heading, subheading, normal text, bulleted and numbered lists, and Markdown source. In visual mode, typing `* `, `- ` or `1. ` starts a list, `# ` or `## ` starts a heading, closing backticks format inline code, and three backticks followed by Enter start a code block. Enter on an empty last line leaves the block. Backspace immediately after a conversion restores the typed characters. Text remains Markdown on disk and in journal drafts. Existing text that cannot round-trip exactly opens in source mode, where its syntax is preserved. Pasted HTML keeps supported text structure; scripts, images, styling, and unsupported formatting are discarded. Code blocks keep their text literal, including pasted text. `Ctrl+Shift+V` pastes literal text. Single-line titles keep their existing behavior. Without the script, multiline fields remain ordinary textareas.

**Inline tags and goals.** With the script, each field that takes `#tags` (capture, entry edit, TODO add and edit) becomes an editor where tags and goal links show as pills; goal pills show the goal's title. Typing `#` or `/` at the start of a word opens suggestions at the caret (arrows move, `Tab`/`Enter` pick, `Esc` closes). When nothing matches, the list says why (no goals yet, no match). The hidden original field always holds the plain text that is saved (`#tag`, `[[slug]]`), so drafts and the server see no difference.

**Draft protection.** Unsent capture text is saved in `localStorage` (key `draft:today` on today, `draft:YYYY-MM-DD` on other days). It restores after a reload and clears after a successful save.

**Display.** On Today, goal evidence and Review, entries render paragraphs (single line breaks become `<br>`), `-`, `*` or `+` bullets and `1.` numbered lists nested by indent, `#` headings shifted down two levels (at most `h6`), `**bold**`, `*italic*` or `_italic_`, backtick code spans, fenced code blocks, inline `[label](https://example.com)` links, and bare `https://` addresses. HTTP and HTTPS links open in the system browser from the desktop app, without navigating ToDo; trailing punctuation and an unmatched `)` stay outside a bare address. A link with another scheme (such as `t3-thread://`) shows only its label, with the address on hover; clicking it (or Enter when it has focus) copies the address and says "Copied", as reference chips do. Link destinations survive visual edits and supported HTML paste. Relative URLs and URLs containing credentials remain inactive. Fenced blocks show escaped, undecorated text in a monospace block. Underscores inside words stay literal; asterisks can emphasize part of a word. Other Markdown, including images, raw HTML and checkboxes, stays literal. All text is HTML-escaped first. Inline `#tags` and `[[links]]` are styled outside code; tokens inside code blocks or web-link destinations do not count as metadata. Tags and links not written inline, and time spent, show as chips under the entry. A `[[link]]` that matches no goal is dimmed with a hint to check the spelling. TODO titles and subtasks render the same inline formatting (bold, italic, code, links) on one line, never blocks; labels read aloud or shown on hover use the plain words. An entry's references (10.2) show under it as a row of links: a web address opens in the system browser, and any other (such as an agent thread) copies its address and says "Copied".

**References.** Links kept apart from an entry's text, such as the agent thread or ticket the work came from. The capture and edit forms have a folded References field, one per line: an address, a label then an address, or a Markdown link. A line without an address (a scheme such as `https:`) sends the form back with everything typed kept. Review's Markdown export lists them under the entry; JSON exports include a `references` array.

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
| T-8 | A TODO with a due date shows "Due Oct 5" on its tag line, highlighted once overdue. Due dates are set on the Todos page. |

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
| TM-5 | User can add a TODO with a priority, an optional due date, and goal checkboxes. If the filters hide it, a notice says so. |
| TM-6 | User can edit task, priority, due date, and rich-text notes. A blank due date clears it. Notes retain paragraphs and nested-list indentation separately from subtasks. On a validation error the editor reopens with the typed values. |
| TM-7 | User can check a TODO off or reopen it, star or unstar it, and delete it with confirmation (copy kept in trash). |
| TM-8 | User can clear a completion date with confirmation. The option shows in the editor when a date exists.           |
| TM-9 | Rows show priority, "Due Oct 5" on open TODOs (highlighted once overdue), "Added" date, and "Done Sep 28", or "Kept: done Sep 28" for a reopened TODO. |
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

| ID    | Requirement                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------- |
| GL-1  | User sees one review cycle (`?cycle=`, default the current cycle; an older link's year such as `2026` opens 26-27) in one of two views: Reader (`?view=reader`) or Timeline (`?view=timeline`). |
| GL-2  | A cycle switcher lists the current cycle and every cycle used by a goal, with "No cycle" for goals written without one. A segmented Reader \| Timeline switch keeps the cycle. |
| GL-3  | `/goals` without `view` opens the view used last. The desktop app saves the choice in `<userData>/preferences.json`, outside the vault, so it survives a restart. The development server uses the git-ignored `tmp/dev-preferences.json`. Without a preferences path nothing is remembered and Reader opens; if saving fails, the page still opens. |
| GL-4  | Reader is the goal sheet: an "Individual goals" section, then "Talent development plan" ("Not rated. Reviewed for progress and future planning."). Goals and activities are numbered "Goal 1…n" and "Activity 1…n" by their order. |
| GL-5  | Each goal is a full-width section. The margin shows its number, status stamp, linked entries and todos (linking to the goal page), starred count, and last date. Drafts have a "Mark agreed" button. Mark agreed and the move buttons (GL-7) carry the goal's revision: if the goal changed after the page loaded (for example, an agent edited it), nothing changes and the sheet returns to the goal with "This goal changed after this page loaded. Check it and try again." Posts without a revision still work. |
| GL-6  | The section shows the name, `[[slug]]`, Description, Meeting expectations, Exceeding expectations (an activity shows one Activity field), and Notes, marked "Not in FCP". FCP text shows as typed, line breaks kept, no Markdown. Notes use safe Markdown display. |
| GL-7  | Each section has Edit, Copy for FCP, Open goal page, and Review this goal. Live goals and activities also have Move up and Move down ("Move <name> up"), disabled at the ends of their section; moving renumbers the section and returns to the goal. Timeline follows the same order. There is no drag and drop. |
| GL-8  | Copy for FCP copies plain text in FCP's order: "Goal name", "Description", "Meeting expectations", "Exceeding expectations", each label on its own line above its text, with blank lines between. An activity copies just its text. Notes are never copied. |
| GL-9  | Edit (`?edit=<slug>`) turns that section into a form in place: name, Link (the goal's `[[slug]]`), the FCP fields as plain textareas, Notes in the shared rich-text editor, and Draft / Agreed / Dropped. Save returns to the goal at `#goal-<slug>` (in Timeline, with its row still unfolded); Cancel returns without saving. |
| GL-10 | Add goal or Add activity (`?add=goal` or `?add=activity`) appends a blank form in the same layout, Draft by default. A missing name returns with an error and the typed text kept. After saving, the sheet opens at the new goal. |
| GL-11 | Dropped goals and activities fold into a "Dropped (n)" section at the end, struck through. They don't count toward numbering. |
| GL-12 | A cycle with no goals shows the shape of a goal (its parts, greyed) and "Write your first goal". |
| GL-13 | Timeline is a grid: names, the cycle's months from April to March, and a tally ("12 linked", starred, "last Oct 6"). A label the app doesn't understand, such as "FY26", shows the current cycle's months. |
| GL-14 | Each linked entry or done todo is a tick on its day; starred ticks are taller and brass. A rule marks today. Months still ahead are dotted. Drafts are dashed. A dropped goal is struck out with × on its drop date, and nothing is drawn after it. Three or more past months in a row with nothing linked are named, like "Nothing linked June to August". A legend sits under the grid. |
| GL-15 | Clicking a goal's name unfolds its full text with Edit, Copy for FCP, Open goal page, and Review this goal. It is a button with `aria-expanded`; without the script it reloads with `?open=<slug>`. Edit (`?view=timeline&edit=<slug>`) shows the same form as Reader inside the row. |
| GL-16 | The Reader/Timeline switch sits in a compact bar that stays at the top of the window while scrolling, so it can be used from anywhere. Both views give each goal the id `goal-<slug>`, and goals land just below the bar. With the script, the switch carries the goal at the top of the window, so the other view opens at the same goal. |
| GL-17 | When the next cycle (26-27 → 27-28) has no goals, "Start <next>" opens `?cycle=<next>&from=<cycle>`: every goal and activity not dropped, checked; "Copy notes too", unchecked; and "Start with a blank goal". |

A review cycle is named the way Full Cycle Performance names it: "26-27" runs from April 1, 2026 to March 31, 2027, as UNC System SHRA policy sets the cycle (UNCW policy 08.530). The current cycle changes over on April 1. Versions before 1.8 wrote a year: a goal whose cycle is a bare year such as `2026` reads as the cycle that started that April (26-27), and saving it writes the new label. Any other label is kept as written.

---

### 9.7 `/goals/:slug` Goal

| ID    | Requirement                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| GL-18 | A header links back to the cycle's goals at this goal, steps to the previous and next goal of the same kind in the cycle ("Goal 2 of 4"), and has "Review this goal". |
| GL-19 | The goal's section as on the sheet, read-only, with Edit (the sheet's edit in place) and Copy for FCP. `?edit=1` redirects to the sheet's edit form. |
| GL-20 | The goal's timeline row for its cycle.                                                                         |
| GL-21 | Evidence feed: every linked journal entry and done TODO, all time, newest month first. Each links to its day.  |
| GL-22 | Shows how many linked TODOs are still open, linking to `/todos?goal=<slug>`. They aren't evidence until done.   |
| GL-23 | Changing the Link in the sheet's edit form (GL-9) renames the goal: its file moves to the new slug and every `[[old]]` or `[[old\|label]]` in journal entries and todos (task, notes, subtasks) is rewritten, except inside code. A link with no letters or numbers, one that isn't letters and numbers joined by single hyphens, a reserved link (`carry`, or a Windows device name such as `con` or `aux`; see 12.10), or one another goal uses is refused with the typed text kept, and nothing changes. A notice says how many entries and todos were updated, and the page opens at the new anchor. If an entry or todo can't be updated safely (its file is open in another app, or the change wouldn't read exactly like the original with the link renamed), it is left as it was, the rest are updated, and the notice says how many still link to the old slug. If the goal's file itself can't be renamed, the form comes back with the typed text and says it was saved under the old link. A blank name or link, or the link left as it was, keeps the old one. Cycle and kind don't change on edit. |
| GL-24 | "Review this goal" opens `/review` filtered to the goal, from the first to the last evidence date.             |

`/` suggestions offer only goals of one cycle that aren't dropped: on Today, the cycle of the day being viewed (so backfilling late March in April offers that cycle's goals); on Todos, the current cycle. Older and dropped goals still collect evidence, and typed `[[links]]` to them still show as goal links; they just aren't suggested.

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
    🔗 [Escalation thread](t3-thread://v2/…)
    🔗 https://tickets.example.com/31058364
```

Metadata is parsed only on the first line. The app writes non-blank continuation lines with four spaces added to their typed indentation; internal blank lines stay empty. The reader accepts any space or tab indentation and ends an entry at the next non-blank, unindented line or end of file. Blank lines belong to the entry only when another indented line follows. It removes the smallest indent across non-blank body lines, but never more than four columns, counting a tab as four spaces. Indentation relative to the first line survives; hand-written two-space or tab-indented notes still dedent to zero. Tags and goal links anywhere in the body count alongside the first line's metadata, but remain in the body text. `🔗` lines at the very end of an entry are its references, one link per line (`🔗 [label](address)`, `🔗 <address>` or `🔗 address`); they aren't part of its text and their labels don't count as tags or links. A `🔗` line followed by more text, or one that isn't a link, stays text.

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

`goals/<slug>.md`. Frontmatter holds `title`, `cycle`, `status` (`draft`, `agreed` or `dropped`), `kind` (`goal`, or `activity` for the talent development plan), `order` (position within the cycle and kind), and `dropped` (the local date it was dropped, only while dropped). The body has one `##` section per FCP part, plus the user's notes. Empty sections are left out. An activity uses only Description.

```md
---
title: Improve Workflow Efficiency and Operational Processes
cycle: 26-27
status: agreed
kind: goal
order: 1
---

## Description

Improve, automate, and document workflows that reduce manual effort.

## Meeting expectations

Meeting expectations may include contributions to forms, workflows, and dashboards.

## Exceeding expectations

Exceeding expectations may include establishing reusable workflow standards adopted by the team.

## Notes

The intake form is the big one for year-end.
```

A missing title falls back to the slug. A missing or unknown status reads as `draft`; the older `active` and `achieved` read as `agreed`. A missing kind reads as `goal`; a missing order sorts after the ordered goals, by title, until a goal is added to that cycle and kind, which numbers them first in that order. A `dropped` date is read only when it is a valid date on a dropped goal. Text above the first section (a goal written before sections existed, or by hand) reads as notes, so nothing is dropped. Section headings are matched case-insensitively. A line inside a field that would read as one of these headings is written with a leading backslash (`\## Notes`) and read back without it. Values that would confuse YAML are written JSON-quoted. Frontmatter keys the app doesn't use (say `tags: [work]` or `aliases:` added in Obsidian) are kept exactly as written whenever the app or an agent saves the goal, along with their indented or `- list` value lines and any comments, but they move after the app's own keys. Extra lines under the app's own keys (a multi-line `title:`, for example) are not kept.

### 10.5 Trash

`.trash/deleted.md`. Each delete appends the whole entry block, or the task line with its notes and subtasks, or a subtask with its children, with a UTC timestamp and the source file. Nothing is lost, but there is no restore button.

```md
- Deleted 2026-09-28T18:42:15.123Z from journal/2026/2026-09-28.md
    - 10:02 Draft notes nobody needed ^q2b8nm
```

### 10.6 Line Grammar

Entry first line: `- [HH:MM] text [#tags] [[[links]]] [⏱ Nm] [⭐] ^id`. Continuations follow the block rules in 10.2, then any `🔗` reference lines.

TODO line: `- [mark] task [#tags] [[[links]]] [⏱ Nm] [priority] [⭐] [➕ created] [📅 due] [✅ completed] ^id`

Subtask line: `<indent>- [mark] text ^id`

| Token              | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `[ ]`              | Open                                                                                          |
| `[x]` (or `[X]`)   | Done                                                                                          |
| `[/]`, `[b]`, `[-]` | Read as Open (Obsidian Tasks' in progress, blocked, cancelled). Written back as `[ ]` when the app rewrites the line. |
| `⏫` `🔼` `🔽`     | Priority High, Medium, Low (Obsidian Tasks). `🔺` reads as High and `⏬` as Low; never written. |
| `➕ YYYY-MM-DD`    | Created date (Obsidian Tasks).                                                                |
| `📅 YYYY-MM-DD`    | Optional due date (Obsidian Tasks). Shown on open TODOs; no reminders. Older ToDo versions keep it as task text. |
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
| `due`      | Optional valid `YYYY-MM-DD`. Past dates are allowed.      |

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

- The slug comes from the title: lowercase, accents stripped, non-alphanumerics to `-`, max 48 characters before any `-2`, `-3` suffix.
- If the title's slug is taken by a goal in another cycle, the new goal gets `<slug>-<cycle>` (for example `improve-reliability-27-28`). Otherwise duplicates get `-2`, `-3`, and so on.
- Names and cycles are one line of plain text: line breaks and other control characters become spaces when the app saves them (MCP refuses them instead). A name's runs of spaces become one space; a cycle keeps its own spacing, so a goal added to a hand-written cycle like `FY  2027` stays in it. Name, status, link, and the text fields can change; cycle and kind never do. Changing the link renames the file and rewrites links to it in journal entries and `todos.md` (task lines, notes, subtasks), only where the app's own parser and renderer count them as links (as for evidence and filters): not inside code spans or fenced blocks, not in a fence's info string, not in text outside entries, and never a different slug that shares a prefix (`[[old-2]]`). Each entry or todo is then checked: it must render and carry metadata exactly as before with only the link renamed, or it is left as it was and counted as not updated. The new link is used exactly as checked, never re-slugified. Every file is read and changed before the goal file is renamed; each changed file is written atomically. If the goal file can't be renamed, the form comes back with the typed text, which was already saved under the old link. Goal files aren't searched, since links in goal notes aren't goal links.
- Reserved slugs are never used: `carry` (a route) and the names Windows treats as devices even with an extension (`con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`, any case). A goal named "Carry" or "Con" gets `carry-2` or `con-2`; names that merely start with one, like `console` or `com10`, are fine. Slugs are cut at 48 characters counting a letter outside the BMP as one, and a goal is only written under a slug the app can open.
- New goals start `draft`, with `order` one after the highest in their cycle and kind.
- Move up or down swaps a live goal with its live neighbour, then numbers the live goals of that cycle and kind 1..n, dropped ones after.
- Changing a goal to dropped records today's local date; saving it again while dropped keeps that date (a goal dropped before dates were kept stays undated). Any other status clears it.
- Starting a cycle copies the picked goals of the previous one as new drafts in the same kind and order, with notes only if asked. Copies get their own slugs (usually `<slug>-<cycle>`), so earlier evidence stays with the original. Posting again once the cycle has goals copies nothing.
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
  "goals": [{ "slug": "reliability", "title": "Improve reliability", "cycle": "26-27", "status": "agreed", "kind": "goal" }],
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
| `/goals`                      | Goals. `?view=` (`reader` or `timeline`, remembered), `?cycle=`, `?edit=`, `?open=`, `?add=` (`goal` or `activity`), `?from=`, `?renamed=` (entries and todos updated by a link change), `?error=`. |
| `/goals/:slug`                | Goal page. `?edit=1` redirects to the sheet's edit form. `?error=`. |
| `/review`                     | Review page. Parameters in 9.8.                            |
| `/review/export.md`           | Markdown download.                                         |
| `/review/export.json`         | JSON download.                                             |
| `/review/export.jsonl`        | JSONL download.                                            |
| `/settings`                   | Desktop agent access settings, status, and connection examples. |
| `/todo-version`               | Read-only ledger, todo and goal revision. With `?after=<revision>` it waits (up to 25 seconds, or until the request is dropped) until the revision differs, for live updates. |
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
| `/goals`                          | `title`, `cycle`, `kind`, `status`, `description`, `meeting`, `exceeding`, `notes`, `view` | Create goal, go to it on the sheet. |
| `/goals/carry`                    | `from`, `cycle`, `goal`*, `notes`, `view`                  | Copy picked goals into a new cycle as drafts. |
| `/goals/:slug`                    | `title`, `status`, `link`, `description`, `meeting`, `exceeding`, `notes`, `view`, `return_to` | Save goal; a changed `link` renames it and rewrites links to it. |
| `/goals/:slug/status`             | `status`, `return_to`                                      | Change status only ("Mark agreed").     |
| `/goals/:slug/move`               | `direction` (`up` or `down`), `return_to`                  | Move one place within its cycle and kind. |

\* repeated field.

A successful POST, or one with a validation error, answers with a 303 redirect (post/redirect/get). A missing entry, TODO, or goal gets the 404 page. `return_to` must be a same-origin path (starts with one `/`, not `//` or `/\`), otherwise a default is used. On a validation error, the redirect adds `?error=<message>` and the page shows it. The capture form, the entry and TODO editors, and the new-goal form also get the typed values back. Adding a TODO and editing a goal do not (a TODO's `required` field catches most cases in the browser; a blank goal name keeps the old one).

---

## 16. Progressive Enhancement

There is no HTMX and no client framework. The server renders full HTML pages, and plain forms post and redirect. Everything works without `public/app.js`. With it:

| Behavior               | Detail                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| In-place form posts    | POST forms are sent with `fetch`. The redirected page's `<main>` and nav replace the current ones, and the URL updates. Focus stays on the same control, or the same or a nearby row. New entries are briefly marked. After a goal form, the page stays with that goal (or a goal it added or renamed) and the address ends in its `#goal-<slug>`. On a network error it falls back to a normal submit. |
| In-place pages         | Links to app pages, GET forms (filters, the date jump) and the `g` shortcuts fetch the page and swap `<main>` and nav without reloading the window. The new page fades in (off with reduced motion), focus moves to it (or its `autofocus` field), and it scrolls to the link's `#anchor` or the top. Back and Forward swap the same way and return to the remembered scroll position. Downloads, other windows and modified clicks are left to the browser; anything that isn't a page loads normally. |
| Live updates           | The page waits on `/todo-version?after=<revision>`, which answers as soon as the vault changes (16.1). The page is then fetched again and merged around the user. Forms with unsaved changes, or with the cursor in a text field, never leave the page, so their text, caret, focus and undo history stay; everything else around them is replaced. A click on a form inside an item that changed less than a second ago does nothing and says so, so the user never agrees to text they haven't seen. So do scroll position (the item at the top of the window stays put), open sections and unfolded timeline rows. New or changed items glow briefly and a status message says how many changed; nothing is announced when nothing on the page changed. A focused sidebar link keeps focus when the todo count changes. Back or Forward to an entry that differs only by `#anchor` just scrolls, keeping unsaved edits. A post's result gives way to a page opened after it. Updates wait while a click, drag, text selection, composition, suggestion list, dialog, focus mode or post is in progress, and while the window is hidden. If a form in use isn't on the new page (its item was deleted), the page keeps it and shows a notice until it is saved or cancelled; Refresh when ready is still there. A stale form is caught on save by its revision. |
| Live TODO filters      | The `data-live-search` form waits 250ms after the last committed keystroke, then fetches its GET URL. Only `.page-sub`, `.filter-actions` and `#todo-results` are replaced and initialized, leaving unsent add-TODO text and the search field intact. Typing pauses live search while a `.todo-edit` is open; Enter or a select change still submits. Composing input is ignored; composition end schedules the committed text. Unchanged filters skip the fetch; new input aborts pending requests so stale responses cannot swap. Debounced typing uses `replaceState`; explicit submits use `pushState`. Apply is hidden. Network errors fall back to a normal submit. |
| Confirmations          | Forms with `data-confirm` ask before posting (delete, clear completion).                     |
| Drafts                 | Capture text saved in `localStorage` per day. Cleared after a successful save.                            |
| Rich-text editor       | All editable multiline fields use the same toolbar and Markdown serializer. Source mode protects existing syntax that cannot round-trip. Dirty multiline edits survive Escape; unchanged edits can still be cancelled with it. |
| Auto-submit            | Filter selects and checkboxes submit on change. The date picker waits 900ms for typing to stop.           |
| Copy                   | Writes HTML + Markdown to the clipboard, with fallbacks (14.3). Copy for FCP writes plain text. Status is announced to screen readers. |
| Goals timeline         | Clicking a goal's name unfolds its row in place. The Reader/Timeline switch carries the goal at the top of the window as its `#anchor`. |
| Print                  | Sets the page title to the suggested PDF name, prints, restores the title.                                |
| Reordering             | Drag a TODO or subtask by its grip handle, or use the hotkeys in 20.2. Needs the script.                  |
| Keyboard shortcuts     | See 20.2.                                                                                                 |

Without the script, the date picker shows a "Go" button and TODO filters keep their Apply button. Destructive actions then post without a confirmation prompt (see 28.3).

### 16.1 Change signal

The desktop app and the development server watch the vault folder, subfolders included. A file event for `todos.md`, `journal/` or `goals/` (or one without a file name) wakes waiting `/todo-version?after=` requests, which recompute the revision after 50ms and answer when it differs. That covers the app's own saves, MCP writes and other programs editing the Markdown, while an editor's settings or a git folder inside the vault wake nothing. Nothing reads the vault on a timer. If the folder can't be watched (it doesn't exist yet, or a drive dropped out), each wait tries again, and until then requests answer after their 25-second wait. The development server's idle timeout is 30 seconds so the wait isn't cut short. A server without the watcher (as in some tests) answers at once, and the page then asks every 5 seconds.

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
Agent access: local MCP client → authenticated 127.0.0.1:<port>/mcp → ledger/task/goal operations → same Vault
```

`handleRequest` doesn't know which one called it. Each entry point checks where the request came from first and adds security headers: CSP and `nosniff` in the app, CSP in development (section 21).

### 17.3 Desktop App Behavior

- Double-click opens one window (1280×860). Closing it quits by default.
- Settings can enable agent access and optionally keep MCP running when the window is closed. With both enabled and the listener running, closing hides the window and leaves a system tray icon. Open ToDo restores it; Quit ToDo exits and stops MCP. A tray failure preserves close-to-quit behavior. Nothing starts automatically at Windows sign-in.
- A second launch focuses the existing window instead of opening another.
- Startup failures show an error box ("ToDo couldn't start") and quit.
- The app ID `com.workledger.app` matches in `electron-builder.yml` and `main.ts`. Changing it breaks taskbar pins.
- Installed builds check stable releases in `kuklaph-uncw/todo` on launch and download newer versions in the background. The persistent rail icon and Settings show progress and readiness. Nothing prompts or restarts automatically. Choosing Restart to update opens the install action; changed, unsaved forms require Restart and discard changes. Unsent ledger drafts are preserved. Closing normally does not install the update. Already-installed older builds retain their native prompt for the upgrade that replaces them.
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
│   ├── timeline.ts               # goal timeline: ticks, today, quiet stretches
│   ├── preferences.ts            # app preferences file outside the vault (Goals view)
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
│   │   ├── goals.ts              # goal sheet, goal page, new cycle
│   │   ├── goal-timeline.ts      # timeline rows
│   │   └── review.ts
│   └── lib/
│       ├── date.ts
│       ├── html.ts
│       ├── lines.ts              # indented continuation boundaries
│       ├── markdown.ts           # re-exports the shared Markdown renderer
│       └── validation.ts
└── tests/
    ├── helpers/test-vault.ts
    ├── unit/                     # date, format, html, markdown, preferences, review, timeline, validation
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
| Invalid goal status                | "Pick Draft, Agreed or Dropped."                                             |
| Goal link empty, invalid, reserved (`carry`, Windows device names), or taken | "A link needs at least one letter or number.", "Use letters and numbers, joined by single hyphens.", "That link is reserved. Pick another.", or "Another goal already uses [[slug]]." |
| Goal move without up or down       | "Move a goal up or down."                                                    |
| Quick goal action on a stale page  | "This goal changed after this page loaded. Check it and try again." (nothing changed) |
| Goal file can't be renamed        | "Your changes were saved under [[slug]], but the link couldn't be changed. …" (form kept) |
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
| A-6 | Every page and form works without client-side JS. (The shortcuts dialog, tag and goal suggestions, focus mode, opening subtasks, reordering, unfolding a timeline row in place, keeping your place when switching goal views, opening pages without a reload, and live updates need it.) |
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
| Outbound calls  | GitHub update checks/downloads. No telemetry or app-initiated notes uploads. Authorized MCP clients receive ledger entries, full goals including private notes and todo data and may send it to their agent provider. |
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
- Navigation and redirects stay locked to `app://local`. New-window requests never create an Electron window; HTTP/HTTPS link destinations from app pages are validated before opening in the system browser. Other schemes, credential-bearing URLs and form submissions are refused. `<webview>` is blocked.
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

Todo tools are `list_todos`, `get_todo`, `add_todo`, `update_todo`, `set_todo_status`, `add_subtask`, `set_subtask_done`, and `delete_todo`. Ledger tools are `list_entries`, `get_entry`, `add_entry`, `update_entry`, and `delete_entry`; `list_tags` discovers existing tags. Goal tools are `list_goals` (optional `cycle` filter), `get_goal`, `add_goal`, and `update_goal`. They use the same vault methods as the Goals page, so drafts, order, drop dates and slugs follow the app's rules. `update_goal` patches title, status and text only: links, cycle, kind and order change in the app, and there is no delete (set status `dropped`). A blank title is refused, and activities refuse meeting or exceeding text. Entries support multiline Markdown, inline or structured tags/goal links, minutes spent, stars and a local date/clock time. Dates are validated before file access. Lists default to today and support date ranges, filters and pagination. See [ledger and goal field and retry rules](docs/mcp.md).

Tools preserve completion dates, Markdown notes and entry text, subtasks, and trash behavior. Every mutation of an existing todo, entry or goal requires its current content revision; entry targets also include their date. Stale requests are rejected. Writes require a unique `requestId`; the ledger, todo and goal services each remember their most recent 1024 successful calls while this app process runs, including listener restarts. Exact retries reuse results; a goal retry remembers only the slug and returns the goal as it is now, with its current revision, without writing again. This is not a durable exactly-once guarantee: after an app restart, read current state before retrying a create. Reusing a remembered ID with different arguments is rejected.

Read tools do not assign IDs or change files. Hand-written todos and entries with no block ID can be listed, but must be opened in ToDo before editing through MCP. Task and ledger forms include revisions too; stale forms return a conflict with submitted text retained for recovery. The goal edit form carries its revision as well: a stale save returns to the form with the typed text and a notice instead of overwriting the other change. Older callers omitting the form revision retain their previous behavior. External editor writes are not coordinated by a cross-process lock.

Open pages hear about every vault change at once (16.1) and update in place around unsaved edits (section 16, Live updates). Ledger capture drafts keep their existing localStorage protection. MCP access is local to this computer; remote agents need a separately designed connection.

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
| `format.test.ts`       | Entry blocks and TODO lines: parsing and round-trips, continuation boundaries, dedent with spaces and tabs, editable text, multi-line input normalization, tags and goals across the body, list markers and first-line checkboxes, number-only hashtags, variation selectors, notes, frontmatter quoting, goal sections and their round-trip, heading-like lines inside a field, legacy goal files. |
| `html.test.ts`         | `escapeHtml`.                                                                           |
| `markdown.test.ts`     | Paragraph breaks, nested ordered and unordered lists, heading levels, escaping before emphasis, code-span isolation, literal unsupported syntax, intraword underscore and asterisk rules, underscored tags and goal labels. |
| `review.test.ts`       | Grouping, ordering, stats, goal grouping, filters, newest first, exact Markdown output with multi-line entries in every list, whole-item HTML and single-paragraph spacing, empty range, JSON and JSONL shape and preserved line breaks, filter parsing and the 12-month default. |
| `validation.test.ts`   | Tags, priority, status, time-spent parsing, slugs, `safeReturnPath`.                    |
| `timeline.test.ts`     | Goal timeline: April to March, ticks by day and star, today and months ahead, quiet stretches of three months or more after the first linked work, the line stopping at a drop, real month lengths including leap years. |
| `preferences.test.ts`  | The Goals view preference file: saving, keeping other keys, unreadable files, and no path. |
| `updates.test.ts`      | Stable update state, automatic downloads and progress, explicit restart, duplicate request guards, and check/download/install failures. |

### 23.2 Integration (`tests/integration/`)

| File                     | Covers                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `vault.test.ts`          | Daily note creation, normalized multi-line blocks returned as read back, appending after whole entries, ID assignment changing only the first line, whole-block update and delete with trash, neighboring notes preserved, date listing across years, TODO completion freezing and clearing, notes, goal slugs, order, sheet sorting, drop dates, moving goals, changing a goal's link (rewrites in entries, todos, notes and subtasks; code, text outside entries and prefix-sharing slugs untouched; refused links). |
| `routes.test.ts`         | Pages, 404s, one multi-line entry per submit with clock time, overnight-window date, Markdown markers kept, blank and checkbox-only capture rejected, error round-trips, backfill, multi-line edit/star/delete, entry Markdown across Today, goal evidence and Review while TODOs stay inline, escaping, past-day check-off, TODO filters and edits, review downloads, filtered naming, dev request guard, `return_to`, the goal sheet, edit and add in place, Mark agreed, Copy for FCP text, the timeline, the remembered view, starting a new cycle, the goal page, suggestions limited to this cycle, preferences kept outside the vault, moving goals, changing a link and its refusals. |
| `server.test.ts`         | Dev server over real HTTP: CSP, assets, form post and redirect, 404, path traversal.   |
| `app-protocol.test.ts`   | `app://` handler: CSP and nosniff, host check, origin check for posts, assets, traversal. |
| `launch.test.ts`         | Vault path resolution, error log writing.                                              |
| `update-routes.test.ts`  | Update status, explicit check/restart, unavailable builds, and rejection of foreign-origin update actions. |
| `mcp-ledger.test.ts` | Read-only discovery including entries without IDs, filtered/paged lists, entry metadata round trips, patches, revisions, retries, trash and validation. |
| `mcp-goals.test.ts` | Goal reads with revisions and not-found errors, hand-written goals read without changes, adds with app defaults and numbering, retries, refused input (dropped on create, activity expectations, blank titles, slug/cycle/kind/order changes), patches with drop-date rules and stale revisions, the cycle filter, and app and MCP edits seeing each other. |

### 23.3 Browser (`tests/browser/`)

`rich-text.test.ts` exercises journal capture, goal notes, TODO notes, formatting round trips, pasted HTML filtering, undo, draft restoration, source fallback, formatted tag metadata, keyboard toolbar navigation, and narrow layouts. It uses a disposable vault through the real development request handler.

`goals.test.ts` covers the sticky view switch and landing on the same goal from Reader to Timeline and back, the remembered view, unfolding a timeline row by keyboard, Copy for FCP on the real clipboard, editing in place and returning to the goal, and the 390px layout.

`live.test.ts` covers opening pages and filters in place, Back returning to the scroll position, an agent's todo appearing without moving the page and glowing alone, an edit kept with a notice when its todo is deleted (and Refresh when ready asking first), Mark agreed staying with its goal, a status choice kept after focus leaves, sidebar focus kept, hash-only Back keeping unsaved text, highlights after widening a search, a slow save not pulling the window back, undo history surviving a live update, an unsaved edit following its todo to the Done section, Back after a live filter, focus not jumping into an untouched editor, and a click on a just-changed goal being ignored. `mcp.test.ts` covers settings, live updates around unsaved todo, ledger and goal-status edits (with stale saves rejected), and text typed while an update loads.

`formatting.test.ts` covers the Aa disclosure and selection, typed Markdown conversions and Backspace reversal, fenced code entry/paste/copy/save, literal character preservation, source mode, and the compact Add to ledger button. `updates.test.ts` covers check/progress/ready/error states, explicit restart with unsaved-change warnings, kept ledger drafts, panel keyboard controls, unavailable builds, and responsive layouts with reduced motion. The update client is a stand-in in these tests.

The native Electron window, installer, and installed-to-installed updater are not covered by these browser tests.

### 23.4 Manual Smoke Test (Desktop App)

Run against a build from `bun run build`:

1. Install from the NSIS installer without admin rights.
2. Launch. One window opens on Today. The rail shows the version and update icon. In Settings, Notes folder shows `C:\Users\<name>\Work Ledger` and Copy path copies it.
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
14. Confirm no menu bar, F12 and Ctrl+Shift+I do nothing. A saved HTTP/HTTPS link opens the system browser while ToDo stays on its page; unsafe schemes never launch an external application.
15. Launch with `--remote-debugging-port=9222`. The app refuses to start.
16. With a controlled newer release available, confirm the update downloads without opening a dialog. Open the update panel, choose Not now, and keep working. Change an edit form, then confirm the restart action warns about unsaved changes. Save the form, leave an unsent ledger draft, and choose Restart to update. Confirm the new version opens with the draft intact. These installed-update checks require a real release and are not proved by browser tests or packaging.

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
| AC-G1 | User can write a goal in FCP's shape (name, description, meeting and exceeding expectations) and copy it for FCP as plain text. |
| AC-G2 | User can link entries and TODOs to a goal by picking it with `/` or typing `[[slug]]`. |
| AC-G3 | A goal page lists linked entries and done TODOs as evidence.                  |
| AC-G4 | User can set a goal Draft, Agreed, or Dropped without breaking its links, and carry goals into the next cycle as drafts. |
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
| AC-25 | No network listener by default. Enabled MCP listens only on authenticated loopback; authorized clients can read/write ledger entries, todos and goals, and discover tags. UI remains on `app://`. |
| AC-26 | The vault can be backed up and restored by copying the folder.              |
| AC-27 | The vault reads as plain Markdown. Hand edits are picked up and kept.       |
| AC-28 | The installer needs no admin rights.                                        |
| AC-29 | Agent access and background preferences persist. Tokens are shown once, stored as hashes, and replaceable. |
| AC-30 | MCP and task/ledger forms reject stale edits. Agent changes never automatically replace typed text. |

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
| Vault is lost                      | Keep the vault path and Copy path in Settings. Quit the app before copying the folder for backup. |
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
