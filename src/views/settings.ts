import { escapeHtml } from "../lib/html";
import type { AgentAccess } from "../mcp/access";
import { icon, notice } from "./components";

function copyBlock(id: string, label: string, value: string, rows: number): string {
  return `<div class="field config-example"><label for="${id}">${label}</label>
    <textarea id="${id}" rows="${rows}" readonly spellcheck="false">${escapeHtml(value)}</textarea>
    <div class="edit-bar"><button class="btn" type="button" data-copy="#${id}" data-copy-status="#${id}-status" data-copy-message="Copied.">${icon("copy")} Copy</button>
    <p id="${id}-status" class="copy-status" role="status"></p></div></div>`;
}

/** Where the notes live, with a copy button: the path is long and only needed when backing up. */
function notesFolder(vaultPath: string): string {
  return `<section aria-labelledby="folder-title"><h2 class="section-title" id="folder-title">Notes folder</h2>
      <div class="field"><label class="field-label" for="vault-path">Location</label>
        <div class="path-row"><input id="vault-path" class="path-value" readonly spellcheck="false" value="${escapeHtml(vaultPath)}" aria-describedby="folder-hint">
        <button class="btn" type="button" data-copy="#vault-path" data-copy-status="#vault-path-status" data-copy-message="Path copied.">${icon("copy")} Copy path</button></div>
        <p id="vault-path-status" class="copy-status" role="status"></p>
      </div>
      <p class="field-hint" id="folder-hint">Plain Markdown files. To back up, quit ToDo, then copy this folder. If ToDo stays in the system tray, quit it from there.</p>
    </section>`;
}

/** app.js fills in the state and actions; the hint says what restarting keeps. */
function updatesSection(available: boolean): string {
  const hint = available
    ? "ToDo checks for a new version when it starts and downloads it in the background. It never restarts on its own: choose Restart to update when it suits you. Unsent ledger entries are kept; other unsaved edits are not."
    : "Updates work only in the installed app. This copy doesn't check for or install them.";
  return `<section aria-labelledby="updates-title" id="updates"><h2 class="section-title" id="updates-title">Updates</h2>
      <div class="settings-updates" id="settings-updates"></div>
      <p class="field-hint">${hint}</p>
    </section>`;
}

export function renderSettings(
  state: ReturnType<AgentAccess["snapshot"]> | null,
  place: { vaultPath: string; updatesAvailable: boolean },
  message: string | null,
  token: string | null,
): string {
  const top = `<div class="page settings-page">
    <header class="page-head"><div><h1>Settings</h1><p class="page-sub">Where your notes live, app updates, and agent access.</p></div></header>
    ${notice(message, "ok")}
    ${notesFolder(place.vaultPath)}
    ${updatesSection(place.updatesAvailable)}`;
  if (!state)
    return `${top}
    <section aria-labelledby="access-title"><h2 class="section-title" id="access-title">Agent access</h2>
      <p class="field-hint">Agent access settings are available in the desktop app.</p>
    </section>
  </div>`;
  const url = `http://127.0.0.1:${state.port}/mcp`;
  const status = state.error
    ? notice(state.error)
    : `<p class="mcp-state${state.running ? " is-running" : ""}">${state.running ? "Running. Agents with your token can connect." : "Off. Agents can't connect."}</p>`;
  return `${top}
    <section aria-labelledby="access-title"><h2 class="section-title" id="access-title">Agent access</h2>
      <p class="field-hint">Agent access (MCP) lets AI tools on this computer read and change your ledger entries, todos, notes, and subtasks, and look up goals and tags.</p>${status}
      <form class="stack-form" method="post" action="/settings">
        <input type="hidden" name="intent" value="save">
        <fieldset class="settings-options"><legend class="sr-only">Agent access preferences</legend>
          <div><label class="check-label" for="mcp-enabled"><input id="mcp-enabled" type="checkbox" name="enabled"${state.enabled ? " checked" : ""} aria-describedby="enabled-hint">Enable agent access</label>
          <p id="enabled-hint" class="field-hint">Only programs on this computer can connect. Off by default.</p></div>
          <div><label class="check-label" for="mcp-background"><input id="mcp-background" type="checkbox" name="background"${state.background ? " checked" : ""} aria-describedby="background-hint">Keep MCP running when the window is closed</label>
          <p id="background-hint" class="field-hint">Applies when agent access is running. Closing the window leaves ToDo in the system tray. Use Open ToDo to return, or Quit to stop it. ToDo does not start at Windows sign-in.</p></div>
        </fieldset>
        <label class="field field-short" for="mcp-port"><span>Port</span><input id="mcp-port" type="number" name="port" required min="1024" max="65535" step="1" value="${state.port}" aria-describedby="port-hint"></label>
        <p id="port-hint" class="field-hint">Default 41821. If another program uses it, choose a different port and update each agent's address.</p>
        <button id="settings-save" class="btn primary" type="submit">Save settings</button>
      </form>
    </section>
    <section aria-labelledby="token-title"><h2 class="section-title" id="token-title">Access token</h2>
      ${
        token
          ? `<div class="notice ok"><label class="field" for="new-token"><span>New access token</span><input id="new-token" class="token-value" readonly value="${escapeHtml(token)}" autocomplete="off" spellcheck="false" aria-describedby="token-hint"></label>
        <p id="token-hint" class="field-hint">Copy it now. ToDo saves only a hash and cannot show this token again.</p>
        <button id="token-action" type="button" class="btn" data-copy="#new-token" data-copy-status="#token-status" data-copy-message="Access token copied.">${icon("copy")} Copy access token</button><p id="token-status" class="copy-status" role="status"></p></div>`
          : `<p class="muted">${state.hasToken ? "An access token is set." : "No access token yet. Generate one before enabling access."}</p>`
      }
      <form method="post" action="/settings"${state.hasToken ? ' data-confirm="Replace the access token? Agents using the current token will need the new one."' : ""}>
        <input type="hidden" name="intent" value="token">
        <button${token ? "" : ' id="token-action"'} type="submit" class="btn">${state.hasToken ? "Replace access token" : "Generate access token"}</button>
      </form>
    </section>
    <section aria-labelledby="connect-title"><h2 class="section-title" id="connect-title">Connect an agent</h2>
      <p class="field-hint">Copy these settings into your agent. Replace YOUR_TOKEN with your access token. ToDo does not change agent configuration files.</p>
      ${copyBlock("mcp-url", "Address", url, 1)}
      ${copyBlock("mcp-claude", "Claude Code: run in a terminal", `claude mcp add --transport http todo ${url} --header "Authorization: Bearer YOUR_TOKEN"`, 3)}
      ${copyBlock("mcp-codex", "Codex: add to ~/.codex/config.toml", `[mcp_servers.todo]\nurl = "${url}"\nbearer_token_env_var = "TODO_MCP_TOKEN"`, 3)}
      <p class="field-hint">For Codex, set TODO_MCP_TOKEN to your token in the environment that launches your agent. Reconnect the agent after starting ToDo. Access works only while ToDo is running, in a window or in the tray.</p>
    </section>
  </div>`;
}
