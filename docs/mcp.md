# Agent access

In the desktop app, open **Settings** in the sidebar footer.

1. Generate an access token and copy it. ToDo stores only its hash and cannot show it again.
2. Select **Enable agent access**, then **Save settings**. Confirm that the status says Running.
3. Copy the Claude Code command or Codex configuration shown on the page. Replace `YOUR_TOKEN` or set `TODO_MCP_TOKEN` in the environment that starts Codex.
4. Connect or reconnect your agent. It can now read and write ledger entries, manage todos and subtasks, and look up existing goals and tags.

Treat the token like a password. Replacing it immediately stops new requests using the old token. The agent can receive ledger entries, goal summaries, todo text and notes; its handling of that data depends on the agent/provider you use. ToDo never writes agent configuration files for you.

## Ledger tools

| Tool | What it does |
| --- | --- |
| `list_entries` | Lists entries with revisions. Defaults to today. `from` and `to` select an inclusive local date range; `q`, `tag`, `goal`, and `isHighlight` filter it. Results are oldest first, then in file order. `limit` defaults to 50, at most 100; pass `nextOffset` as `offset` to read the next page. |
| `get_entry` | Reads one entry by its `date` and `id`. IDs are scoped to a day. |
| `add_entry` | Creates one entry from multiline Markdown `text`, optional `tags` and `goals`, `minutes`, `isHighlight`, `date`, and `time`. |
| `update_entry` | Patches those fields except the date. Requires `date`, `id`, and the current `expectedRevision`. Omitted fields stay unchanged. |
| `delete_entry` | Deletes an entry using its date, ID, and revision, retaining a copy in `.trash/deleted.md`. |
| `list_goals` | Lists existing goal slugs, titles, cycles and statuses for linking. Does not create or change goals. |
| `list_tags` | Lists existing tags and their use counts across entries and todos. |

An entry's `text` accepts the same `#tags`, `[[goal-slug]]` links and Markdown as the app. Tags or links inside code do not count as metadata. Use `list_goals` to find the actual slug; typing `/` is an editor shortcut, not MCP syntax. Unknown goal links are kept, just as in the app.

`minutes` is a nonnegative whole number for time spent, such as 90 for 1h 30m. `isHighlight: true` stars the entry. `time` is the entry's clock time in `HH:MM`, separate from time spent. The date defaults to today in the app's local timezone. Clock time defaults to now for today, or null for other dates. Explicit null clears minutes or clock time; false clears the star.

Tags in arrays are plain names without `#`; goals are slugs without `[[ ]]`. Arrays combine with inline metadata when adding. On update, arrays replace stored metadata, while tokens still present in the text continue to count. To clear all tags or links, supply an empty array and remove their inline tokens from `text`. Changing only text preserves existing tags and goal links and adds any new inline ones.

For example, after looking up the goal slug, call `add_entry` with:

```json
{
  "text": "Finished the release review #ops [[delivery]]",
  "minutes": 90,
  "isHighlight": true,
  "requestId": "unique-request-id"
}
```

Existing todo/subtask tools keep their names and behavior. Reconnect the client after running the updated app so it refreshes the tool list. These tools require the updated desktop build; changing source alone does not update an installed copy.

## Background mode

Select **Keep MCP running when the window is closed** and save. When MCP is running, closing the window leaves ToDo in the Windows system tray. Double-click the tray icon, use **Open ToDo**, or launch ToDo again to restore the window. **Quit ToDo** stops the app and MCP. Turning this setting off restores close-to-quit behavior.

This does not start ToDo at Windows sign-in. If the port is unavailable or a tray icon cannot be created, closing the window quits normally.

Before backing up or restoring the vault, use **Quit ToDo** from the system tray. Closing the window alone can leave agent writes active.

## Connection problems

- Open ToDo and check Settings for its actual status. Generate a token before enabling access.
- The default address is `http://127.0.0.1:41821/mcp`. If the port is occupied, change it in Settings and update each agent's configuration.
- Only clients running on this computer can use this address. A cloud or remote agent cannot reach it directly.
- If you replace a token, update every client that used it. Reconnect after restarting ToDo.
- Preferences and the token hash are in `%APPDATA%\Work Ledger\mcp.json`, outside the Markdown vault. Copying the vault does not copy access credentials.

## Changes and retries

An agent change to entries or todos shows a notice in an open window. It does not replace your editor. Refresh when ready; unsaved edits require confirmation. Stale task and ledger forms keep submitted text on a conflict page so you can recover it.

MCP writes to existing tasks or ledger entries require the revision returned by a read. All writes require a unique `requestId`; reuse it only to retry the exact same call. The todo and ledger services each remember their most recent 1024 successful writes while the process runs, including across listener reconfiguration. After restarting the app, read current state before retrying a create, because retry history is not stored on disk.

Read tools leave the files unchanged. If a task was hand-written without an ID, open Todos once in the app to assign IDs before an agent edits it. For an entry without an ID, open its day in ToDo. The app coordinates UI and MCP writes, but cannot coordinate simultaneous saves from an external Markdown editor.

## Development verification

Run `bun test` for protocol, storage, authentication, settings, and browser checks. `bun run verify:mcp` builds the main process and tests the real Electron lifecycle with disposable app data and notes: settings persistence, todo and ledger writes while hidden, goal lookup, metadata preservation, second-launch restore, ordinary close, and explicit quit. It does not modify your installed app or agent configuration. Packaging remains a separate `bun run build` check.
