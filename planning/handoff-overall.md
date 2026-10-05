# Overall Handoff: Daily Work Ledger Planning

## Purpose

Use this file to start a fresh thread without reconstructing the project from the conversation. This is the overall handoff for the local-first Daily Work Ledger planning effort in `C:\Dev\todo`.

**Status update (2026-07-01): implementation has started.** Mockup standardization (the task this file originally described as unfinished) is complete — all four `planning\mockups\stitch.*.html` pages already share the "Obsidian Ledger" shell. Milestone 1 (Foundation) plus a real, database-backed visual shell for all 4 nav pages (`/`, `/todos`, `/review`, `/export`) now exists under `src\`, `public\`, and `tests\` (145 passing tests). The repo is also a real, clean git repository now (see below). The rest of this file describes the planning-era state and is kept for historical context on product decisions — treat any "not started yet" claims below as superseded by this note.

## Workspace State

- Root: `C:\Dev\todo`
- Source PRD: `prd.md`
- Planning package: `planning\`
- UI mockups: `planning\mockups\`
- Stitch reference export: `planning\stitch_daily_work_ledger\`
- Task-specific mockup handoff: `planning\handoff-stitch-standardization.md`

(Historical note: at the time this file was written, the `.git` directory existed but was empty and `git status` failed with `fatal: not a git repository`. It has since been reinitialized with `git init` and is a normal, working repository.)

(Historical note: `src\`, `public\`, and `tests\` did not exist when this file was written. They now hold the Milestone 1 foundation and 4-page visual shell — see the Status update above.)

## Current Status

The planning package is the current deliverable. The PRD has been updated to match the later decisions: Daily Work Ledger framing, first-class tags, SQLite source of truth, and review-range Markdown/JSON/JSONL exports.

(Historical note: this line originally read "Implementation has not started. The main unfinished planning-adjacent work is mockup standardization against the Stitch reference bundle." Both are now done — see the Status update above.)

## Canonical Reading Order

1. `planning\handoff-overall.md`: start here for project intent, decisions, current state, and next steps.
2. `prd.md`: use for product requirements, routes, data model, business rules, acceptance criteria, and build order.
3. `planning\index.html`: use for milestone sequencing and planning navigation.
4. `planning\data-access-strategy.html`: use for the SQLite plus export-first AI access decision.
5. `planning\handoff-stitch-standardization.md`: use only when continuing the mockup standardization task.

## Product Direction

This is not just a TODO app. It is a personal Daily Work Ledger for capturing work, preserving lightweight task context, and generating review evidence.

The primary use case is performance review preparation. The app should answer: "What did I accomplish during this period?"

Core surfaces:

- Day View: fast daily journal capture and same-day TODO context.
- TODO Manager: secondary task registry with search, filters, tags, status, and completion metadata.
- Review: date-range accomplishment document for performance review prep.
- Export/Data Access: Markdown for humans and JSON/JSONL for AI-assisted summarization.

The journal is the main artifact. TODOs support the ledger; they should not dominate the product.

## Product Decisions To Preserve

- Local-first, single-user app.
- Runs locally, ideally bound to `127.0.0.1`.
- No cloud dependency, account, telemetry, or required external service.
- SQLite is the source of truth.
- Markdown files are export artifacts, not primary storage.
- Tags are first-class in v1 and should be the organizing primitive.
- Use simple normalized tag text and join tables. Defer tag colors, aliases, hierarchies, and a tag management page.
- Completion dates are historical evidence. Marking a TODO done sets completion metadata. Reopening and re-closing must not silently overwrite the original completion date.
- Soft delete journal entries and TODOs so review/export behavior remains trustworthy.
- Use local `YYYY-MM-DD` dates for day grouping. Use UTC ISO timestamps for audit metadata.
- Review UI, Markdown export, JSON export, and JSONL export must use the same review query/model.
- AI summaries inside the app are deferred. v1 should expose clean data to agents through exports.
- API or MCP access beyond export endpoints is deferred.

## Target Stack From PRD

- Runtime: Bun
- Database: SQLite, likely through `bun:sqlite`
- UI: server-rendered HTML
- Interactivity: HTMX
- Styling: local CSS
- JavaScript: minimal local browser JS

If implementation starts, initialize the app project first. The current workspace only contains the PRD and planning artifacts.

## Planning Files

Main entry:

- `planning\index.html`

Milestones:

- `planning\milestone-01-foundation.html`: Bun app shell, SQLite, migrations, base layout, validation, date helpers, tag storage, route skeleton.
- `planning\milestone-02-day-view-journal.html`: daily capture, date navigation, multiline entry creation, edit/delete, tags, highlights, draft protection.
- `planning\milestone-03-day-view-todos.html`: Day View TODO panel, status transitions, completion metadata, day summary.
- `planning\milestone-04-review-output.html`: date-range review, grouped accomplishment output, stats, tag breakdown, highlights-only mode.
- `planning\milestone-05-markdown-export.html`: Markdown, JSON, and JSONL exports from the shared review model.
- `planning\milestone-06-todo-manager.html`: full TODO Manager with filters, search, tag edits, detail edits, highlight toggles, explicit completion clearing.
- `planning\milestone-07-polish-backup.html`: keyboard polish, empty/error states, manual backup/restore docs, smoke test.

Supporting plans:

- `planning\acceptance-matrix.html`: acceptance criteria mapped to milestones and verification.
- `planning\data-access-strategy.html`: decision record for SQLite plus export-first AI access.
- `planning\deferred-scope.html`: deferred product scope and non-goals.
- `planning\ui-mockups.html`: gallery entry for active mockups.

## Implementation Start Rule

When implementation begins, do not start by editing planning pages. Start by creating the app structure and tests.

Recommended first implementation sequence:

1. Initialize Bun app structure and local scripts.
2. Add SQLite connection, migration runner, and schema.
3. Add unit tests for dates, validation, tag parsing, and HTML escaping.
4. Add route/view skeletons for `/`, `/todos`, `/review`, and export routes.
5. Build milestone by milestone, keeping tests in sync.

User command policy matters: ask before running `bun run ...`, `bun -e`, `node -e`, Python stdin/eval, or commit commands.

## Data Model Direction

The planning files point toward these concepts:

- `journal_entries`
- `todos`
- `tags`
- journal-to-tag join table
- todo-to-tag join table
- review item model or view combining journal entries and completed TODOs

Important fields:

- journal content, entry date, optional time spent, highlight flag, created/updated/deleted timestamps
- TODO task, notes, status, priority, highlight flag, created date, due date if later added, completed timestamp, completed local date, deleted timestamp
- normalized tag name

Keep schema simple. Do not add project hierarchy, recurring TODOs, reminders, auth, sync, or rich attachments in v1.

## Review And Export Contract

Review and exports should operate on a date range and include:

- journal entries in range
- completed TODOs in range
- tags
- highlight flags
- priority where relevant
- optional time spent
- source type
- range metadata
- generated timestamp
- filters used

Planned export endpoints:

- `GET /review/export.md`
- `GET /review/export.json`
- `GET /review/export.jsonl`

The JSON and JSONL formats exist so an agent can summarize several months of work without scraping the UI or reading SQLite directly.

## Test Strategy

Use TDD once implementation starts.

Unit tests:

- date parsing and local date grouping
- tag parsing, normalization, deduplication, and assignment
- validation for journal entries and TODOs
- TODO status and completion transition rules
- Markdown formatting and escaping
- JSON/JSONL export shape

Integration tests:

- create and edit journal entries
- add TODO, mark done, reopen, re-close, and preserve completion metadata
- review query includes journal entries and completed TODOs
- review query excludes soft-deleted records
- export routes return expected content, filters, and headers

Smoke test at the end:

- start app locally
- create multiple journal entries
- add and complete TODOs
- generate review for the week
- verify correct dates
- copy/download Markdown
- export JSON/JSONL
- restart app and confirm persistence

## UI And Design Direction

The user wants functional, utilitarian planning pages. Avoid overdesigned planning docs.

The app mockups should follow the Stitch reference direction, not the older planning-doc styling:

- dark, hard-edged, quiet ledger interface
- fixed left rail
- dense information layout
- serif ledger/body content
- monospace tags, timestamps, and status labels
- rectangular tags
- indigo primary action
- teal highlight rail
- no Tailwind, CDN, Google fonts, Material Symbols, remote images, or external dependencies
- WCAG-minded contrast and visible focus states

Reference bundle:

- `planning\stitch_daily_work_ledger\obsidian_ledger\DESIGN.md`
- `planning\stitch_daily_work_ledger\day-view.html`
- `planning\stitch_daily_work_ledger\todo.html`
- `planning\stitch_daily_work_ledger\review.html`
- `planning\stitch_daily_work_ledger\export.html`

Active mockups:

- `planning\mockups\stitch.dash.html`
- `planning\mockups\stitch.todo.html`
- `planning\mockups\stitch.review.html`
- `planning\mockups\stitch.export.html`
- shared CSS: `planning\mockups\stitch.css`
- shared JS: `planning\mockups\stitch.js`

Current mockup state (updated 2026-07-01 — standardization is complete):

- `stitch.css` exists and is active.
- All four mockup pages (`stitch.dash.html`, `stitch.todo.html`, `stitch.review.html`, `stitch.export.html`) consistently use the `Obsidian Ledger`/`OL`/`Verified Archive` shell — the older `Work Ledger` shell no longer exists anywhere.
- `planning\ui-mockups.html` links to all four active mock pages.

`planning\handoff-stitch-standardization.md` now describes finished work; see its status note.

## Known Workflow Friction

An earlier delete/re-add patch for `stitch.css` failed and temporarily left the active mockups pointing at a missing stylesheet. That has been repaired.

Later, a small patch to `stitch.todo.html` triggered a prompt to retry without sandbox. This was not a project permission issue; `C:\Dev\todo` is writable. If it happens again, do not escalate automatically. Inspect the file and retry with a smaller patch.

Avoid deleting and re-adding existing mockup files. Use small `apply_patch` updates.

## Verification Commands

Run from `C:\Dev\todo`.

List planning files:

```powershell
Get-ChildItem planning -Force | Sort-Object Name | Format-Table Name, Length, Attributes
```

List mockups:

```powershell
Get-ChildItem planning\mockups -Force | Sort-Object Name | Format-Table Name, Length, Attributes
```

Check active mockup shell references:

```powershell
Get-ChildItem planning\mockups -Filter stitch*.html | ForEach-Object {
  $text = Get-Content -Raw $_.FullName
  $css = ([regex]::Matches($text, 'href="stitch\.css"')).Count
  $js = ([regex]::Matches($text, 'src="stitch\.js"')).Count
  $skip = ([regex]::Matches($text, 'class="skip-link"')).Count
  $nav = ([regex]::Matches($text, 'href="stitch\.(dash|todo|review|export)\.html"')).Count
  "$($_.Name): css=$css js=$js skip=$skip nav-links=$nav"
}
```

Check for disallowed external/framework references:

```powershell
Select-String -Path planning\mockups\*.html,planning\mockups\*.css,planning\mockups\*.js,planning\ui-mockups.html -Pattern 'tailwind','cdn','googleapis','gstatic','googleusercontent','material-symbols','theme\(','class="dark"','href="#"','src="http','style='
```

Check ASCII:

```powershell
Select-String -Path planning\*.html,planning\*.md,planning\assets\planning.css,planning\mockups\*.* -Pattern '[^\x00-\x7F]'
```

## Best Next Thread Prompt

Start with:

```text
Read planning\handoff-overall.md first. Milestone 1 (Foundation) and the 4-page visual shell are implemented and tested (145 passing tests). Continue from there. I want [begin implementation milestone 2 (Day View Journal - real capture/edit/delete) / continue another milestone / revise planning docs].
```
