# Daily Work Ledger — PRD / Implementation Handoff

**Author:** [you]
**Date:** 2026-05-27
**Status:** Draft v1
**Target stack:** Bun + SQLite + server-rendered HTML + HTMX
**Product type:** Personal, local-first web app

---

## 1. Summary

Daily Work Ledger is a lightweight local web app for recording daily work, preserving lightweight TODO context, and producing review evidence.

The app has two related purposes:

1. **Daily accomplishment logging** — a fast, freeform way to capture what actually happened during the day.
2. **Lightweight TODO tracking** — a simple structured list for things that need to be remembered or completed.

The primary use case is performance review preparation. Over weeks or months, the user can build a reliable record of meaningful work and later generate a clean, copy-paste-ready summary for any date range.

The app should feel closer to a private work ledger than a project management tool or generic TODO app.

---

## 2. Problem Statement

Performance reviews require recalling meaningful work over long periods of time. Memory is unreliable, and reconstructing accomplishments from calendar events, chats, emails, tickets, and scattered notes is tedious.

The user needs a low-friction system that answers:

> “What did I accomplish during this period?”

The system should make daily capture easy enough to become a habit and make historical review fast enough that preparing a review does not require manual reconstruction.

---

## 3. Product Goals

| Goal                | Description                                                                            |
| ------------------- | -------------------------------------------------------------------------------------- |
| Fast capture        | Add a daily accomplishment in under 10 seconds.                                        |
| Freeform journaling | Let the user describe work naturally, without forcing everything into rigid fields.    |
| Lightweight TODOs   | Support simple TODO tracking without turning the app into project management software. |
| Review-ready output | Generate a readable Markdown summary for a selected date range.                        |
| AI-readable export  | Export review-range JSON and JSONL so an agent can summarize long periods of work.     |
| Local-first         | Run on the user’s machine with data stored in a local SQLite file.                     |
| Durable history     | Completion dates and historical entries should be trustworthy over time.               |
| Low maintenance     | Use a simple stack with no required build step or cloud service.                       |
| Keyboard-friendly   | Common actions should be quick from the keyboard.                                      |

---

## 4. Non-Goals for v1

| Non-goal                | Reason                                            |
| ----------------------- | ------------------------------------------------- |
| Multi-user support      | This is a personal tool.                          |
| Authentication          | Not needed while bound to localhost.              |
| Native mobile app       | Responsive web is enough for v1.                  |
| Cloud sync              | Local-first simplicity is more important.         |
| Notifications/reminders | The app is for capture and review, not reminders. |
| Rich attachments        | Text is the core medium.                          |
| Advanced tag management | Simple first-class tags are enough for v1.        |
| In-app AI summaries     | Capture and export should work without AI.        |
| Project/OKR hierarchy   | Too heavy for v1.                                 |
| Recurring TODOs         | Useful later, not needed initially.               |

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

Metadata like tags, time spent, and highlight status should be useful but not required.

---

### 5.4 Review Should Produce a Document

The review page should prioritize readable output over analytics.

The main artifact is a clean accomplishment summary that can be copied into a review document. Stats are useful, but secondary.

---

### 5.5 Dates Must Be Trustworthy

If a TODO was completed on a date, that date should not silently change because the TODO was edited later.

Completion metadata should be frozen once set, unless explicitly cleared by the user.

---

### 5.6 Local and Private by Default

The app should run on `127.0.0.1`, store data locally, and require no external services.

No telemetry. No cloud dependency. No account.

---

## 6. Primary User

**User:** One person using the app locally to track work and prepare performance reviews.

The app is intentionally optimized for a single-user workflow.

---

## 7. Core User Flows

### 7.1 Daily Capture

The user opens the app, types one or more accomplishments, saves them, and leaves.

Example input:

```txt
Reviewed API migration proposal
Helped Alex debug staging auth issue
Cleaned up flaky billing test
```

The app saves these as daily journal entries for the selected date.

---

### 7.2 Backfill a Previous Day

The user can switch to a previous date and add entries for that day.

This matters because daily logging will not always happen in real time.

---

### 7.3 TODO Tracking

The user can add simple TODOs, update status, and mark items done.

When a TODO is marked done, it becomes part of that day’s review context.

---

### 7.4 End-of-Day Review

The user can review the selected day, add missed accomplishments, mark TODOs done, and optionally star important entries.

---

### 7.5 Performance Review Prep

The user selects a date range and gets a readable accomplishment report containing:

- Journal entries.
- Completed TODOs.
- Highlighted accomplishments.
- Summary counts.
- Optional time totals.
- Markdown export.

---

## 8. Information Architecture

| Route              | Page              | Purpose                                                   |
| ------------------ | ----------------- | --------------------------------------------------------- |
| `/`                | Day View          | Main daily capture surface.                               |
| `/todos`           | TODO Manager      | Full task list with filters and search.                   |
| `/review`          | Review            | Generate date-range accomplishment summaries.             |
| `/review/export.*` | Review Export     | Export review-range Markdown, JSON, and JSONL.            |
| `/data`            | Data Utility      | Optional future raw data page, not required for v1.       |

The Day View is the main page.

The TODO Manager supports the workflow but should not dominate the product.

---

## 9. Page Requirements

## 9.1 `/` — Day View

The Day View is the default landing page.

### URL

```txt
/
```

Defaults to today.

```txt
/?date=2026-05-27
```

Shows a specific date.

### Purpose

The Day View should answer:

> “What happened on this day, and what am I working on?”

### Layout

Desktop:

```txt
┌───────────────────────────────┬───────────────────────────────┐
│ Journal                       │ TODOs                         │
│                               │                               │
│ Quick capture                 │ Quick add TODO                │
│ Entries for selected date     │ Open / In Progress / Blocked  │
│ Completed TODOs for date      │                               │
└───────────────────────────────┴───────────────────────────────┘
```

Mobile:

```txt
Journal
TODOs
Day summary
```

### Day Navigation

The user should be able to move between dates.

Required controls:

- Today
- Previous day
- Next day
- Date picker

If the selected date is not today, the page should clearly show that.

Example:

```txt
Viewing Wednesday, May 20, 2026
```

---

## 9.2 Day View — Journal

### Requirements

| ID  | Requirement                                                     |
| --- | --------------------------------------------------------------- |
| J-1 | User can add one or more journal entries for the selected date. |
| J-2 | User can edit an existing journal entry inline.                 |
| J-3 | User can delete a journal entry.                                |
| J-4 | User can star or unstar an entry as a highlight.                |
| J-5 | User can optionally assign one or more tags.                    |
| J-6 | User can optionally enter time spent.                           |
| J-7 | Entries display in creation order by default.                   |
| J-8 | Empty entries are rejected.                                     |
| J-9 | Past dates are editable.                                        |

### Quick Capture

The main journal input should be a textarea.

Default visible fields:

```txt
[ What did you do?                              ]
[ Add ]
```

Optional fields are hidden behind a details section:

```txt
Details: tags, time spent
```

### Multiline Capture

The quick capture box should support multiple entries at once.

Input:

```txt
Reviewed API migration proposal
Helped Alex debug staging auth issue
Cleaned up flaky billing test
```

Creates three journal entries.

Rules:

- Split on non-empty lines.
- Trim whitespace.
- Ignore blank lines.
- If the user enters a paragraph with wrapped lines, this may still split by line in v1. That is acceptable.
- A later version may add an explicit “save as one entry” option.

### Draft Protection

The journal textarea should save unsent draft text in `localStorage`, scoped by selected date.

Behavior:

- Draft restores after page reload.
- Draft clears after successful save.
- Draft does not need to sync to the database.

---

## 9.3 Day View — TODO Panel

The TODO panel provides lightweight task tracking alongside the journal.

### Sections

Show:

1. In Progress
2. Open
3. Blocked
4. Completed on selected date

### Requirements

| ID  | Requirement                                                                            |
| --- | -------------------------------------------------------------------------------------- |
| T-1 | User can add a TODO from the Day View.                                                 |
| T-2 | New TODOs default to `Open`, no tags, and no priority.                                |
| T-3 | User can mark a TODO as `In Progress`, `Blocked`, `Done`, or `Cancelled`.              |
| T-4 | User can edit task, priority, tags, and notes.                                        |
| T-5 | User can delete a TODO.                                                                |
| T-6 | When a TODO is marked `Done`, completion metadata is set if not already present.       |
| T-7 | Completed TODOs appear on the date they were completed.                                |
| T-8 | Reopening and re-closing a TODO does not silently change its original completion date. |

---

## 9.4 Day Summary

At the bottom or top of the Day View, show a simple summary.

Example:

```txt
4 journal entries · 2 TODOs completed · 1 highlight · 90 minutes logged
```

If no time is logged, omit the time phrase.

---

## 9.5 `/todos` — TODO Manager

The TODO Manager is a secondary page for managing all tasks.

### Requirements

| ID   | Requirement                                                       |
| ---- | ----------------------------------------------------------------- |
| TM-1 | User can view all non-deleted TODOs.                              |
| TM-2 | User can filter by status.                                        |
| TM-3 | User can filter by tag.                                           |
| TM-4 | User can filter by priority.                                      |
| TM-5 | User can search task and notes.                                   |
| TM-6 | User can create, edit, and delete TODOs.                          |
| TM-7 | User can explicitly clear completion metadata, with confirmation. |
| TM-8 | User can star or unstar important TODOs.                          |

### Default Sort

Sort TODOs by:

1. Status group:
   - In Progress
   - Open
   - Blocked
   - Done
   - Cancelled

2. Priority:
   - High
   - Medium
   - Low
   - None

3. Most recently updated.

---

## 9.6 `/review` — Review Page

The Review page is the payoff surface.

It should feel like a generated accomplishment document, not a data dashboard.

### URL

```txt
/review
/review?from=2026-01-01&to=2026-03-31
```

### Date Range Presets

Required presets:

| Preset        | Description                           |
| ------------- | ------------------------------------- |
| This Week     | Current local week.                   |
| This Month    | Current local month.                  |
| This Quarter  | Current local quarter.                |
| Last 6 Months | Rolling six-month range ending today. |
| Year to Date  | January 1 through today.              |
| Custom        | User-selected start and end dates.    |

### Review Page Order

The page should be ordered for usefulness:

1. Date range controls.
2. Copy/export actions.
3. Highlight summary.
4. Generated accomplishment document.
5. Supporting stats.

### Summary Stats

Show:

| Metric              | Description                                           |
| ------------------- | ----------------------------------------------------- |
| Journal entries     | Count of entries in range.                            |
| Completed TODOs     | Count of TODOs completed in range.                    |
| Highlights          | Count of starred entries/TODOs in range.              |
| Active logging days | Unique dates with journal entries or completed TODOs. |
| Time logged         | Sum of optional time entries.                         |
| Tag breakdown       | Counts by tag.                                        |

### Review Feed

Group items by date.

Example:

```md
## 2026-05-27

### Highlights

- Resolved flaky billing integration test.
- Helped unblock staging auth issue.

### Journal

- Reviewed API migration proposal.
- Met with support about customer escalation.

### Completed TODOs

- [High] Set up local tracker
- Update onboarding notes
```

### Requirements

| ID  | Requirement                                                        |
| --- | ------------------------------------------------------------------ |
| R-1 | User can select a date range.                                      |
| R-2 | User can view journal entries and completed TODOs grouped by date. |
| R-3 | User can show all items or highlights only.                        |
| R-4 | User can toggle oldest-first/newest-first.                         |
| R-5 | User can copy Markdown.                                            |
| R-6 | User can download Markdown.                                        |
| R-7 | Empty dates are hidden.                                            |
| R-8 | Output should be useful without extra formatting.                  |

---

## 9.7 Review Export and Data Access

Review export is part of v1 because it supports the core performance review workflow.

### Purpose

The export surface exists so the user can copy human-readable review output and provide structured date-range data to an AI agent.

Standalone raw data browsing under `/data` is optional for v1.1. V1 should not require a full raw table utility page.

### v1 Requirements

| ID  | Requirement                                                      |
| --- | ---------------------------------------------------------------- |
| D-1 | User can download review output as Markdown.                     |
| D-2 | User can download review-range data as structured JSON.          |
| D-3 | User can download review-range data as JSONL.                    |
| D-4 | Exports include tags, highlights, completed TODOs, and metadata. |

### Deferred v1.1 Requirements

| ID  | Requirement                                |
| --- | ------------------------------------------ |
| D-5 | User can download journal entries as CSV.  |
| D-6 | User can download TODOs as CSV.            |
| D-7 | User can download all active data as JSON. |
| D-8 | User can view simple raw tables.           |

---

## 10. Data Model

The app has these primary storage concepts:

1. `journal_entries`
2. `todos`
3. `tags`
4. join tables that attach tags to journal entries and TODOs

Journal entries and TODOs are related by date, not by foreign key.

A day’s accomplishment view combines:

- Journal entries where `entry_date = selected date`.
- TODOs where `completed_on = selected date`.

---

## 10.1 `journal_entries`

| Field                |                Type | Required | Notes                                      |
| -------------------- | ------------------: | -------: | ------------------------------------------ |
| `id`                 | INTEGER PRIMARY KEY |      Yes | Autoincrement row ID.                      |
| `entry_date`         |                TEXT |      Yes | Local `YYYY-MM-DD` date the work happened. |
| `content`            |                TEXT |      Yes | Freeform text. Markdown allowed.           |
| `time_spent_minutes` |             INTEGER |       No | Optional. Must be non-negative.            |
| `is_highlight`       |             INTEGER |      Yes | `0` or `1`. Defaults to `0`.               |
| `created_at`         |                TEXT |      Yes | UTC ISO timestamp.                         |
| `updated_at`         |                TEXT |      Yes | UTC ISO timestamp.                         |
| `deleted_at`         |                TEXT |       No | Soft delete timestamp. NULL means active.  |

---

## 10.2 `todos`

| Field          |                Type | Required | Notes                                                  |
| -------------- | ------------------: | -------: | ------------------------------------------------------ |
| `id`           | INTEGER PRIMARY KEY |      Yes | Autoincrement row ID.                                  |
| `task`         |                TEXT |      Yes | Short task title.                                      |
| `priority`     |                TEXT |       No | `High`, `Medium`, `Low`, or NULL.                      |
| `status`       |                TEXT |      Yes | `Open`, `In Progress`, `Blocked`, `Done`, `Cancelled`. |
| `notes`        |                TEXT |       No | Optional detail.                                       |
| `is_highlight` |             INTEGER |      Yes | `0` or `1`. Defaults to `0`.                           |
| `created_at`   |                TEXT |      Yes | UTC ISO timestamp.                                     |
| `updated_at`   |                TEXT |      Yes | UTC ISO timestamp.                                     |
| `completed_at` |                TEXT |       No | UTC ISO timestamp set when first marked done.          |
| `completed_on` |                TEXT |       No | Local `YYYY-MM-DD` date set when first marked done.    |
| `deleted_at`   |                TEXT |       No | Soft delete timestamp. NULL means active.              |

---

## 10.3 `tags`

| Field       |                Type | Required | Notes                                      |
| ----------- | ------------------: | -------: | ------------------------------------------ |
| `id`        | INTEGER PRIMARY KEY |      Yes | Autoincrement row ID.                      |
| `name`      |                TEXT |      Yes | Normalized tag text without `#`. Unique.   |
| `created_at`|                TEXT |      Yes | UTC ISO timestamp.                         |

Tags are simple labels in v1. Advanced colors, aliases, hierarchies, and a management screen are deferred.

---

## 10.4 Suggested SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  time_spent_minutes INTEGER CHECK (
    time_spent_minutes IS NULL OR time_spent_minutes >= 0
  ),
  is_highlight INTEGER NOT NULL DEFAULT 0 CHECK (
    is_highlight IN (0, 1)
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date
  ON journal_entries(entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_deleted_at
  ON journal_entries(deleted_at);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_entry_tags (
  journal_entry_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (journal_entry_id, tag_id),
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_tags_tag_id
  ON journal_entry_tags(tag_id);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL CHECK (length(trim(task)) > 0),
  priority TEXT CHECK (
    priority IS NULL OR priority IN ('High', 'Medium', 'Low')
  ),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (
    status IN ('Open', 'In Progress', 'Blocked', 'Done', 'Cancelled')
  ),
  notes TEXT,
  is_highlight INTEGER NOT NULL DEFAULT 0 CHECK (
    is_highlight IN (0, 1)
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  completed_on TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_todos_status
  ON todos(status);

CREATE INDEX IF NOT EXISTS idx_todos_completed_on
  ON todos(completed_on);

CREATE INDEX IF NOT EXISTS idx_todos_deleted_at
  ON todos(deleted_at);

CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id
  ON todo_tags(tag_id);
```

---

## 11. Date and Time Rules

Use two different date concepts.

| Value         | Format       | Purpose                                                                |
| ------------- | ------------ | ---------------------------------------------------------------------- |
| Local date    | `YYYY-MM-DD` | Used for daily grouping and review ranges.                             |
| UTC timestamp | ISO string   | Used for audit fields like `created_at`, `updated_at`, `completed_at`. |

Examples:

```txt
entry_date:   2026-05-27
completed_on: 2026-05-27
created_at:   2026-05-27T18:42:15.123Z
updated_at:   2026-05-27T18:45:09.882Z
completed_at: 2026-05-27T20:13:44.001Z
```

Do not derive local dates using:

```ts
new Date().toISOString().slice(0, 10);
```

That returns a UTC date and can be wrong near midnight.

Use a local date helper:

```ts
export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

---

## 12. Core Business Logic

## 12.1 Creating Journal Entries

Validation:

| Field                | Rule                                  |
| -------------------- | ------------------------------------- |
| `entry_date`         | Required. Must be valid `YYYY-MM-DD`. |
| `content`            | Required after trim.                  |
| `tags`               | Optional normalized tag list.         |
| `time_spent_minutes` | Optional integer >= 0.                |
| `is_highlight`       | Optional boolean. Defaults to false.  |

Behavior:

1. Split multiline quick capture into entries.
2. Trim each entry.
3. Ignore blank lines.
4. Insert each entry with the selected date.
5. Set `created_at` and `updated_at`.
6. Return updated journal fragment.

---

## 12.2 Updating Journal Entries

Rules:

- Past entries are editable.
- Empty content is rejected.
- Updating bumps `updated_at`.
- Star/unstar is allowed.
- Changing tags/time spent is allowed.
- Changing `entry_date` may be supported in the full edit UI, but is not required inline for v1.

---

## 12.3 Deleting Journal Entries

Use soft delete.

Behavior:

```sql
UPDATE journal_entries
SET deleted_at = ?, updated_at = ?
WHERE id = ?;
```

Deleted entries are hidden from normal views and exports.

Restore UI is not required for v1.

---

## 12.4 Creating TODOs

Validation:

| Field      | Rule                               |
| ---------- | ---------------------------------- |
| `task`     | Required after trim.               |
| `priority` | Optional: `High`, `Medium`, `Low`. |
| `status`   | Optional. Defaults to `Open`.      |
| `tags`     | Optional normalized tag list.      |
| `notes`    | Optional.                          |

Behavior:

1. Insert TODO.
2. Set `created_at` and `updated_at`.
3. If created directly as `Done`, set `completed_at` and `completed_on`.

---

## 12.5 Marking a TODO Done

When a TODO first transitions to `Done`, set completion metadata.

```ts
if (newStatus === "Done" && existing.completed_at === null) {
  completed_at = nowUtcIso();
  completed_on = localDateString();
}
```

Rules:

- `completed_at` is the exact UTC completion timestamp.
- `completed_on` is the local calendar date used for grouping.
- Once set, completion metadata is not overwritten automatically.
- Reopening a TODO preserves completion metadata.
- Re-closing a TODO preserves the original completion date.
- Completion metadata can only be cleared by explicit user action.

---

## 12.6 Cancelling a TODO

`Cancelled` means the task is no longer relevant.

Rules:

- Marking a task `Cancelled` does not set completion metadata.
- If a previously completed task is later marked `Cancelled`, existing completion metadata is preserved unless explicitly cleared.

---

## 12.7 Deleting TODOs

Use soft delete.

Behavior:

```sql
UPDATE todos
SET deleted_at = ?, updated_at = ?
WHERE id = ?;
```

Deleted TODOs are hidden from normal views and exports.

Restore UI is not required for v1.

---

## 13. Review Query Model

The review output combines journal entries and completed TODOs by date.

A SQLite view may be used to simplify this.

The base review view should keep journal and TODO rows aligned. Tags can be loaded from the join tables for the returned item IDs or aggregated by the review query layer.

```sql
CREATE VIEW IF NOT EXISTS review_items AS
SELECT
  entry_date AS item_date,
  'journal' AS item_type,
  id,
  content,
  time_spent_minutes,
  is_highlight,
  created_at
FROM journal_entries
WHERE deleted_at IS NULL

UNION ALL

SELECT
  completed_on AS item_date,
  'todo' AS item_type,
  id,
  task AS content,
  NULL AS time_spent_minutes,
  is_highlight,
  completed_at AS created_at
FROM todos
WHERE completed_on IS NOT NULL
  AND deleted_at IS NULL;
```

Review query:

```sql
SELECT *
FROM review_items
WHERE item_date BETWEEN ? AND ?
ORDER BY item_date ASC, created_at ASC;
```

Highlights-only query:

```sql
SELECT *
FROM review_items
WHERE item_date BETWEEN ? AND ?
  AND is_highlight = 1
ORDER BY item_date ASC, created_at ASC;
```

---

## 14. Markdown and AI-Readable Export

### Routes

```txt
GET /review/export.md?from=2026-01-01&to=2026-03-31
GET /review/export.json?from=2026-01-01&to=2026-03-31
GET /review/export.jsonl?from=2026-01-01&to=2026-03-31
```

Optional params:

```txt
sort=asc|desc
highlightsOnly=1
```

### Markdown Format

```md
# Accomplishments: 2026-01-01 to 2026-03-31

## Summary

- Journal entries: 42
- TODOs completed: 18
- Highlights: 9
- Active logging days: 37
- Time logged: 64h 30m

## Highlights

- 2026-01-08 — Resolved flaky billing integration test.
- 2026-01-17 — Helped unblock staging auth issue.
- 2026-02-03 — Reviewed API migration proposal and identified rollout risks.

## Daily Accomplishments

### 2026-01-08

#### Journal

- Resolved flaky billing integration test.
- Helped support investigate customer escalation.

#### Completed TODOs

- [High] Write incident follow-up notes

### 2026-01-09

#### Journal

- Reviewed design proposal for reporting dashboard.
```

### Copy as Markdown

The review page should include a copy button.

Implementation:

- Server generates Markdown for the selected range.
- Render it into a hidden or visible `<textarea>`.
- Use `navigator.clipboard.writeText`.
- Provide a manual copy fallback.

### JSON and JSONL Format

The JSON export should return a structured review bundle with range metadata, stats, tag counts, and normalized review items.

JSONL should return one review item per line with enough metadata for long-range agent ingestion.

Both formats must use the same review model as the page and Markdown export.

---

## 15. Routes

## 15.1 Page Routes

| Method | Path      | Purpose                                      |
| ------ | --------- | -------------------------------------------- |
| GET    | `/`       | Day View for today or selected date.         |
| GET    | `/todos`  | TODO Manager.                                |
| GET    | `/review` | Review page.                                 |
| GET    | `/data`   | Raw data utility page. Optional for v1.1.    |

---

## 15.2 Journal Routes

| Method | Path                     | Purpose                     | Response                                |
| ------ | ------------------------ | --------------------------- | --------------------------------------- |
| POST   | `/journal`               | Create one or more entries. | Updated journal list fragment.          |
| PATCH  | `/journal/:id`           | Update entry.               | Updated entry fragment.                 |
| DELETE | `/journal/:id`           | Soft delete entry.          | Updated journal list or empty response. |
| PATCH  | `/journal/:id/highlight` | Toggle highlight.           | Updated entry fragment.                 |

---

## 15.3 TODO Routes

| Method | Path                          | Purpose                               | Response                               |
| ------ | ----------------------------- | ------------------------------------- | -------------------------------------- |
| POST   | `/todos`                      | Create TODO.                          | Updated TODO panel/table fragment.     |
| PATCH  | `/todos/:id`                  | Update TODO.                          | Updated TODO fragment or parent panel. |
| DELETE | `/todos/:id`                  | Soft delete TODO.                     | Updated TODO panel/table fragment.     |
| PATCH  | `/todos/:id/highlight`        | Toggle highlight.                     | Updated TODO fragment.                 |
| POST   | `/todos/:id/clear-completion` | Explicitly clear completion metadata. | Updated TODO fragment.                 |

---

## 15.4 Review Routes

| Method | Path                   | Purpose                                         |
| ------ | ---------------------- | ----------------------------------------------- |
| GET    | `/review/fragment`     | Optional HTMX refresh for range/filter changes. |
| GET    | `/review/export.md`    | Download Markdown export.                       |
| GET    | `/review/export.json`  | Download structured review-range JSON.          |
| GET    | `/review/export.jsonl` | Download review-range JSONL.                    |

---

## 15.5 Deferred Raw Data Utility Routes

Optional v1.1 raw data utility:

| Method | Path                | Purpose                           |
| ------ | ------------------- | --------------------------------- |
| GET    | `/data/journal.csv` | Download journal entries as CSV.  |
| GET    | `/data/todos.csv`   | Download TODOs as CSV.            |
| GET    | `/data/export.json` | Download all active data as JSON. |

---

## 16. HTMX Patterns

Use server-rendered HTML fragments.

### Journal Add Form

```html
<form
  hx-post="/journal"
  hx-target="#journal-list"
  hx-swap="outerHTML">
  <input
    type="hidden"
    name="entry_date"
    value="2026-05-27" />

  <label for="journal-content">What did you do?</label>
  <textarea
    id="journal-content"
    name="content"
    required></textarea>

  <details>
    <summary>Details</summary>

    <label>
      Tags
      <input
        name="tags"
        placeholder="support, testing" />
    </label>

    <label>
      Time spent, minutes
      <input
        name="time_spent_minutes"
        type="number"
        min="0" />
    </label>
  </details>

  <button type="submit">Add</button>
</form>
```

### TODO Status Update

When a status update can move a TODO between sections, return the whole TODO panel.

```html
<form
  hx-patch="/todos/123"
  hx-target="#day-todos"
  hx-swap="outerHTML">
  <input
    type="hidden"
    name="status"
    value="Done" />
  <button type="submit">Mark done</button>
</form>
```

---

## 17. Technical Architecture

### Stack

| Layer           | Choice                  |
| --------------- | ----------------------- |
| Runtime         | Bun                     |
| Server          | `Bun.serve()`           |
| Database        | SQLite via `bun:sqlite` |
| Rendering       | Server-rendered HTML    |
| Interactivity   | HTMX                    |
| Styling         | Small local stylesheet  |
| Markdown export | Handwritten formatter   |
| Build step      | None required           |

### Local Defaults

- Bind to `127.0.0.1`.
- Store data in `tracker.db`.
- Vendor static assets locally where practical.
- No telemetry.
- No external services required.
- Database file is gitignored.

---

## 18. Suggested Project Structure

```txt
tracker/
├── tracker.db                  # SQLite database, gitignored
├── package.json
├── bun.lockb
├── README.md
├── PRD.md
├── src/
│   ├── server.ts               # Bun.serve entry point
│   ├── db.ts                   # SQLite connection and migration runner
│   ├── schema.ts               # SQL migrations
│   ├── queries.ts              # Query helpers
│   ├── routes/
│   │   ├── day.ts              # Day View
│   │   ├── journal.ts          # Journal mutations
│   │   ├── todos.ts            # TODO pages and mutations
│   │   ├── review.ts           # Review page and export
│   │   └── data.ts             # Optional export routes
│   ├── views/
│   │   ├── layout.ts
│   │   ├── components.ts
│   │   ├── day.ts
│   │   ├── todos.ts
│   │   ├── review.ts
│   │   └── data.ts
│   └── lib/
│       ├── date.ts
│       ├── html.ts             # Escaping helpers
│       ├── markdown.ts
│       ├── validation.ts
│       └── csv.ts
└── public/
    ├── styles.css
    ├── app.js                  # Small client helpers
    └── htmx.min.js
```

---

## 19. Validation and Error Handling

### Validation Rules

| Case                  | Behavior                                                   |
| --------------------- | ---------------------------------------------------------- |
| Empty journal content | Reject with inline error.                                  |
| Empty TODO task       | Reject with inline error.                                  |
| Invalid date          | Show error or fall back to today.                          |
| Invalid status        | Reject.                                                    |
| Invalid priority      | Reject.                                                    |
| Negative time spent   | Reject.                                                    |
| Missing record        | Return 404.                                                |
| Database error        | Show readable local error page and log details to console. |

For HTMX requests, return the updated form fragment with inline errors.

For normal requests, re-render the page with an error message.

---

## 20. Accessibility and Keyboard Support

### Requirements

| ID  | Requirement                                                       |
| --- | ----------------------------------------------------------------- |
| A-1 | All buttons use real `<button>` elements.                         |
| A-2 | Inputs have labels.                                               |
| A-3 | Focus states are visible.                                         |
| A-4 | Destructive actions require confirmation.                         |
| A-5 | Pages are usable on narrow screens.                               |
| A-6 | Basic navigation works without relying on complex client-side JS. |

### Keyboard Shortcuts

Minimum v1:

| Shortcut           | Page         | Action              |
| ------------------ | ------------ | ------------------- |
| `Cmd/Ctrl + Enter` | Journal form | Save journal entry. |
| `Cmd/Ctrl + Enter` | TODO form    | Save TODO.          |
| `/`                | TODO Manager | Focus search field. |

Nice-to-have:

| Shortcut | Page     | Action               |
| -------- | -------- | -------------------- |
| `g t`    | Any page | Go to today.         |
| `g r`    | Any page | Go to review.        |
| `n`      | Day View | Focus journal input. |

---

## 21. Security and Privacy

V1 security posture:

| Area            | Requirement                     |
| --------------- | ------------------------------- |
| Network binding | Bind to `127.0.0.1` by default. |
| Auth            | None for localhost-only use.    |
| External calls  | None required.                  |
| Telemetry       | None.                           |
| Database        | Local SQLite file.              |
| Backups         | Manual file copy initially.     |

If LAN access is added later by binding to `0.0.0.0`, add:

- Basic password protection.
- Clear README warning.
- Optional local-network-only guidance.

---

## 22. Backup and Restore

The SQLite database is the source of truth.

### v1 Backup

Document manual backup:

```bash
cp tracker.db ~/Backups/tracker-$(date +%Y-%m-%d).db
```

### Restore

Document restore:

```bash
cp ~/Backups/tracker-2026-05-27.db ./tracker.db
```

### Future Enhancement

Add:

```bash
bun run backup
```

Which copies the database to a configured backup directory.

---

## 23. Testing Requirements

### Unit Tests

Test:

- Local date formatting.
- Date range preset calculations.
- Multiline journal splitting.
- Journal validation.
- TODO validation.
- TODO completion transition logic.
- Markdown export formatting.
- Soft delete query behavior.

### Integration Tests

Test:

- Add journal entry.
- Add multiline journal entries.
- Edit journal entry.
- Soft delete journal entry.
- Add TODO.
- Mark TODO done.
- Reopen TODO without changing completion metadata.
- Star journal entry.
- Star TODO.
- Review query includes journal entries and completed TODOs.
- Review query excludes soft-deleted records.
- Markdown export returns expected content.

### Manual Smoke Test

Before v1 is considered usable:

1. Start the app.
2. Add three journal entries for today using multiline capture.
3. Add one journal entry for yesterday.
4. Add three TODOs.
5. Mark two TODOs done.
6. Star one journal entry.
7. Confirm today’s summary counts are correct.
8. Open review for this week.
9. Confirm entries and completed TODOs appear on the correct dates.
10. Copy Markdown.
11. Download Markdown.
12. Restart the server.
13. Confirm data persisted.

---

## 24. Acceptance Criteria

### Daily Capture

| ID   | Acceptance Criterion                                             |
| ---- | ---------------------------------------------------------------- |
| AC-1 | User can add a journal entry for today in under 10 seconds.      |
| AC-2 | User can paste multiple lines and save them as separate entries. |
| AC-3 | User can add entries for a previous date.                        |
| AC-4 | User can edit journal entries.                                   |
| AC-5 | User can delete journal entries.                                 |
| AC-6 | User can star important entries.                                 |
| AC-7 | Draft journal text survives page reload before submission.       |

### TODOs

| ID    | Acceptance Criterion                                                    |
| ----- | ----------------------------------------------------------------------- |
| AC-8  | User can add a TODO with only a task title.                             |
| AC-9  | User can update TODO status.                                            |
| AC-10 | User can mark a TODO done.                                              |
| AC-11 | Completed TODO appears on the correct completion date.                  |
| AC-12 | Reopening and re-closing a TODO does not overwrite completion metadata. |
| AC-13 | User can explicitly clear completion metadata with confirmation.        |

### Review

| ID    | Acceptance Criterion                      |
| ----- | ----------------------------------------- |
| AC-14 | User can select a custom date range.      |
| AC-15 | Review includes journal entries in range. |
| AC-16 | Review includes completed TODOs in range. |
| AC-17 | Review groups items by date.              |
| AC-18 | User can filter to highlights only.       |
| AC-19 | User can copy Markdown.                   |
| AC-20 | User can download Markdown.               |

### Local-First

| ID    | Acceptance Criterion                                  |
| ----- | ----------------------------------------------------- |
| AC-21 | App runs locally with `bun run dev`.                  |
| AC-22 | Data persists in SQLite after restart.                |
| AC-23 | App does not require an external service.             |
| AC-24 | Database file can be manually backed up and restored. |

### Planning Additions

| ID   | Acceptance Criterion                                                       |
| ---- | -------------------------------------------------------------------------- |
| PX-1 | User can add, edit, and view simple tags on journal entries.               |
| PX-2 | User can add, edit, and view simple tags on TODOs.                         |
| PX-3 | Review output includes tag breakdown and optional tag filtering.           |
| PX-4 | User can export review-range data as JSON and JSONL for AI summarization.  |
| PX-5 | SQLite remains the source of truth; Markdown files are not primary storage. |

---

## 25. Success Metrics

After 30 days of use, the app is successful if:

| Metric              | Target                                                   |
| ------------------- | -------------------------------------------------------- |
| Capture speed       | Simple entry takes under 10 seconds.                     |
| Review speed        | Prior-month summary can be produced in under 30 seconds. |
| Logging consistency | At least 20 active logging days out of 30.               |
| Historical trust    | Completion dates remain accurate.                        |
| Export usefulness   | Markdown is review-ready; JSON/JSONL is usable for AI summarization. |

If logging consistency is below 50% after a month, the likely issue is UX friction, not missing features.

---

## 26. Product Risks

| Risk                               | Mitigation                                    |
| ---------------------------------- | --------------------------------------------- |
| User forgets to log daily          | Make backfilling easy.                        |
| Capture feels too structured       | Keep metadata optional and hidden by default. |
| TODOs dominate the app             | Keep Day View journal-first.                  |
| Review output is noisy             | Add highlights and highlights-only mode.      |
| Accidental deletion loses history  | Use soft delete.                              |
| Completion dates become unreliable | Freeze completion metadata.                   |
| Local DB is lost                   | Document backup early.                        |
| App grows too complex              | Defer sync, auth, recurring tasks, and in-app AI. |

---

## 27. Future Ideas

Potential future features:

- Full-text search.
- Weekly review page.
- Advanced tag management.
- JSON import.
- CSV import.
- Restore deleted entries.
- Recurring TODOs.
- Goal or OKR linkage.
- AI-generated review drafts.
- LAN/mobile access with password.
- Backup script.
- Calendar import.
- GitHub/Jira/Linear import.
- Mood or energy tracking.
- “Wins only” review mode.
- Print-friendly review page.

---

## 28. Recommended Build Order

### Milestone 1 — Foundation

Build:

- Bun project.
- SQLite connection.
- Migration runner.
- Base layout.
- Static assets.
- Local date helpers.

Done when:

- App starts with `bun run dev`.
- Database initializes automatically.
- Home page renders.

---

### Milestone 2 — Day View Journal

Build the core habit loop first.

Build:

- `/?date=YYYY-MM-DD`.
- Date navigation.
- Quick capture textarea.
- Multiline entry creation.
- Journal list.
- Edit journal entry.
- Soft delete journal entry.
- Star/unstar journal entry.
- Draft protection.

Done when:

- User can log a day’s work from the landing page.

---

### Milestone 3 — Minimal TODO Support

Build TODOs inside the Day View before building a full manager.

Build:

- Add TODO.
- Show Open/In Progress/Blocked TODOs.
- Mark TODO done.
- Show TODOs completed on selected date.
- Freeze `completed_at` and `completed_on`.
- Reopen TODO without changing completion metadata.

Done when:

- TODOs provide useful context for the daily journal.

---

### Milestone 4 — Review Output

Build the payoff workflow.

Build:

- Date range picker.
- Presets.
- Review query.
- Grouped date output.
- Highlights section.
- Highlights-only mode.
- Summary stats.

Done when:

- User can inspect a date range and understand what happened.

---

### Milestone 5 — Markdown and AI Export

Build:

- Copy as Markdown.
- Download `.md`.
- Download review-range JSON.
- Download review-range JSONL.
- Clean Markdown formatting.
- Export tests.

Done when:

- Output can be pasted directly into a performance review draft.
- JSON and JSONL can be handed to an agent for date-range summarization.

---

### Milestone 6 — TODO Manager

Build:

- `/todos`.
- Filters.
- Search.
- Edit details.
- Clear completion metadata explicitly.
- Soft delete TODO.

Done when:

- User can manage the task list beyond the Day View.

---

### Milestone 7 — Polish and Backup

Build:

- Keyboard shortcuts.
- Empty states.
- Inline validation errors.
- Delete confirmations.
- README instructions.
- Manual backup documentation.
- Smoke test checklist.

Done when:

- The app is comfortable enough for real daily use.

---

## 29. v1 Definition of Done

v1 is complete when the user can:

1. Run the app locally.
2. Add freeform journal entries for today.
3. Add multiple journal entries at once.
4. Backfill a previous day.
5. Add and manage lightweight TODOs.
6. Mark TODOs done with frozen completion dates.
7. Star important accomplishments.
8. Review a date range.
9. Filter review output to highlights.
10. Copy or download Markdown.
11. Restart the app without losing data.
12. Back up the SQLite database manually.

The app should be useful before any advanced features are added.
