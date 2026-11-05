# Agent access

In the desktop app, open **Settings** in the sidebar footer.

1. Generate an access token and copy it. ToDo stores only its hash and cannot show it again.
2. Select **Enable agent access**, then **Save settings**. Confirm that the status says Running.
3. Copy the Claude Code command or Codex configuration shown on the page. Replace `YOUR_TOKEN` or set `TODO_MCP_TOKEN` in the environment that starts Codex.
4. Connect or reconnect your agent. It can now list, add, edit, complete, reopen, and delete todos, and add or check subtasks.

Treat the token like a password. Replacing it immediately stops new requests using the old token. The agent receives your todo text and notes; its handling of that data depends on the agent/provider you use. ToDo never writes agent configuration files for you.

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

An agent change shows a notice in an open window. It does not replace your editor. Refresh when ready; unsaved edits require confirmation. A stale task form keeps submitted text on the conflict page so you can recover it.

MCP writes to existing tasks require the revision returned by a read. All writes require a unique `requestId`; reuse it only to retry the exact same call. ToDo remembers the most recent 1024 successful writes while its process runs. After restarting the app, read current state before retrying a create, because retry history is not stored on disk.

Read tools leave the files unchanged. If a task was hand-written without an ID, open Todos once in the app to assign IDs before an agent edits it. The app coordinates UI and MCP writes, but cannot coordinate simultaneous saves from an external Markdown editor.

## Development verification

Run `bun test` for protocol, storage, authentication, settings, and browser checks. `bun run verify:mcp` builds the main process and tests the real Electron lifecycle with disposable app data and notes: settings persistence, writes while hidden, second-launch restore, ordinary close, and explicit quit. It does not modify your installed app or agent configuration. Packaging remains a separate `bun run build` check.
