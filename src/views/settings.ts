import { escapeHtml } from "../lib/html";
import type { AgentAccess } from "../mcp/access";
import { icon, notice } from "./components";

function copyBlock(id: string, label: string, value: string, rows: number): string {
  return `<div class="field config-example"><label for="${id}">${label}</label>
    <textarea id="${id}" rows="${rows}" readonly spellcheck="false">${escapeHtml(value)}</textarea>
    <div class="edit-bar"><button class="btn" type="button" data-copy="#${id}" data-copy-status="#${id}-status" data-copy-message="Copied.">${icon("copy")} Copy</button>
    <p id="${id}-status" class="copy-status" role="status"></p></div></div>`;
}

export function renderSettings(
  state: ReturnType<AgentAccess["snapshot"]>,
  message: string | null,
  token: string | null,
): string {
  const url = `http://127.0.0.1:${state.port}/mcp`;
  const status = state.error
    ? notice(state.error)
    : `<p class="mcp-state${state.running ? " is-running" : ""}">${state.running ? "Running. Agents with your token can connect." : "Off. Agents can't connect."}</p>`;
  return `<div class="page settings-page">
    <header class="page-head"><div><h1>Settings</h1><p class="page-sub">Agent access (MCP) lets AI tools on this computer read and change your todos, notes, and subtasks.</p></div></header>
    ${notice(message, "ok")}
    <section aria-labelledby="access-title"><h2 class="section-title" id="access-title">Agent access</h2>${status}
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
