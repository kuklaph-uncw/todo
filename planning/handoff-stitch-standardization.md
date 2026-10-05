# Handoff: Stitch Mockup Standardization

**Status (2026-07-01): Complete.** All four mockup pages now consistently use the `Obsidian Ledger`/`OL`/`Verified Archive` shell described below — verified by direct read and grep across `planning\mockups\`. This file is kept for historical context on the standardization requirements; the "Current State" and "Suggested Next Steps" sections below describe a mid-migration state that no longer exists.

## Goal

Continue standardizing the Stitch-exported mockups into local, vanilla HTML/CSS/JS while keeping them visually close to the reference bundle in `planning\stitch_daily_work_ledger`.

The user wants functional planning/mockup artifacts, not a styled planning system. The app direction is a local-first Daily Work Ledger: daily capture, lightweight TODOs, accomplishment review, and AI-readable export.

## Key Requirements

- Use vanilla HTML, CSS, and JS only.
- Keep all assets local. No Tailwind CDN, Google fonts, Material Symbols, remote images, or generated external URLs.
- Keep the four mockup areas as working pages:
  - `planning\mockups\stitch.dash.html`
  - `planning\mockups\stitch.todo.html`
  - `planning\mockups\stitch.review.html`
  - `planning\mockups\stitch.export.html`
- Preserve working left-nav links across the four pages.
- Align visual style with `planning\stitch_daily_work_ledger\obsidian_ledger\DESIGN.md` and the exported reference HTML/screens:
  - dark charcoal surfaces
  - hard borders
  - fixed left rail
  - dense ledger/table/document layouts
  - serif ledger/body content
  - monospace tags, timestamps, and status labels
  - indigo primary action
  - teal highlight rail
- Maintain WCAG-minded contrast and visible focus states.
- Tags are the organizing primitive. Do not reintroduce categories as the primary model.

## Reference Files

- Design reference: `planning\stitch_daily_work_ledger\obsidian_ledger\DESIGN.md`
- Exported reference pages:
  - `planning\stitch_daily_work_ledger\day-view.html`
  - `planning\stitch_daily_work_ledger\todo.html`
  - `planning\stitch_daily_work_ledger\review.html`
  - `planning\stitch_daily_work_ledger\export.html`
- Gallery entry point: `planning\ui-mockups.html`

## Current State

`planning\mockups\stitch.css` exists and is the active shared stylesheet. It was restored after an earlier failed delete/re-add attempt left the mockups pointing at a missing stylesheet.

Current active mockup files:

- `stitch.css`
- `stitch.js`
- `stitch.dash.html`
- `stitch.todo.html`
- `stitch.review.html`
- `stitch.export.html`

`stitch.dash.html` is partly aligned with the Stitch reference:

- title changed to `Daily Work Ledger - Day View`
- sidebar brand changed to `Obsidian Ledger`
- quick entry button added under the brand
- main layout changed to `day-shell`
- date header changed to `Monday, Oct 23, 2023`
- capture card now uses reference-style `New Entry` and `Commit`
- ledger entries now use the reference-style auth review, product sync, and hotfix content
- right rail uses `Today's Focus` and `Ledger Index`

The other three pages still have the older shell/content:

- `stitch.todo.html` still says `Work Ledger - TODO Manager` and uses `WL`/`Work Ledger`
- `stitch.review.html` still says `Work Ledger - Review` and uses `WL`/`Work Ledger`
- `stitch.export.html` still says `Work Ledger - Export` and uses `WL`/`Work Ledger`

The gallery at `planning\ui-mockups.html` already links to all four active Stitch mockup pages.

## Important Edit-Tool Note

There were two unrelated edit failures:

1. A delete/re-add patch for `stitch.css` failed earlier and left the CSS missing. That has been repaired.
2. A small patch to `stitch.todo.html` triggered an editor prompt saying `command failed; retry without sandbox?`. This was not a project permission issue. `C:\Dev\todo` is writable. The file remained unchanged after the interruption.

Do not assume approval is needed to edit files under `C:\Dev\todo`. If the patch tool asks to retry without sandbox on a normal workspace edit, stop, inspect the file state, and retry with a smaller patch.

Prefer small `apply_patch` updates. Avoid deleting and re-adding existing mockup files.

## Suggested Next Steps

1. Normalize the shared shell on `stitch.todo.html`, `stitch.review.html`, and `stitch.export.html`.
   - Change page titles to `Daily Work Ledger - ...`
   - Change sidebar brand from `WL`/`Work Ledger` to `OL`/`Obsidian Ledger`
   - Change sidebar subtitle to `Verified Archive`
   - Add the same `Quick Entry` button used in Day View

2. Bring `stitch.todo.html` closer to the exported TODO reference.
   - Keep `TODO Manager` as the page title
   - Use a broad filter bar: search, status, priority, tag, clear
   - Use a dense bordered table
   - Use reference-like task content and rectangular tags

3. Bring `stitch.review.html` closer to the exported Review reference.
   - Use `Generate Accomplishment Report` as the page header
   - Use period controls and a `Generate Report` button
   - Add an action bar for preview/copy/PDF/Markdown
   - Make the output read like a dark document frame: `Performance Review Evidence`, summary box, month sections, date metadata column

4. Bring `stitch.export.html` closer to the exported Export reference.
   - Use `Data Access & Export` as the page header
   - Use a two-column layout: export formats and parameters
   - Include Markdown Archive, Structured JSON, and JSONLines
   - Include date range fields, metadata/tag toggle, and backup card

5. Verify the active mockups.
   - No broken local links or sources
   - No Tailwind/CDN/remote references
   - Four nav links per mockup page
   - `stitch.css` and `stitch.js` are referenced
   - skip link exists on each page
   - no accidental non-ASCII characters

## Useful Verification Commands

Run from `C:\Dev\todo`.

```powershell
Get-ChildItem planning\mockups -Force | Sort-Object Name | Format-Table Name, Length, Attributes
```

```powershell
Select-String -Path planning\mockups\*.html,planning\mockups\*.css,planning\mockups\*.js,planning\ui-mockups.html -Pattern 'tailwind','cdn','googleapis','gstatic','googleusercontent','material-symbols','theme\(','class="dark"','href="#"','src="http','style='
```

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

```powershell
Select-String -Path planning\*.html,planning\assets\planning.css,planning\mockups\*.* -Pattern '[^\x00-\x7F]'
```

## Current Product Decisions To Preserve

- SQLite is the source of truth.
- Markdown, JSON, and JSONL exports make the data useful for human review and AI summarization.
- Tags are v1 scope and should replace category-style organization.
- TODOs are secondary context, not the whole product.
- Review/export are core value surfaces because the user wants to understand what they accomplished over long periods.
