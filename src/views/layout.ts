import packageJson from "../../package.json";
import type { UpdateSnapshot } from "../electron/updates";
import { escapeHtml } from "../lib/html";
import { icon } from "./components";

export type NavKey = "today" | "todos" | "goals" | "review" | "settings";

const NAV_ITEMS: { key: NavKey; label: string; href: string; keys: string }[] = [
  { key: "today", label: "Today", href: "/", keys: "g t" },
  { key: "todos", label: "Todos", href: "/todos", keys: "g d" },
  { key: "goals", label: "Goals", href: "/goals", keys: "g g" },
  { key: "review", label: "Review", href: "/review", keys: "g r" },
];

export interface LayoutOptions {
  title: string;
  active: NavKey | null;
  main: string;
  /** Open todos, shown beside the nav item. */
  openTodos?: number;
  agentAccess?: boolean;
  /** Read by app.js to show the update control; "unavailable" outside the installed app. */
  updates: UpdateSnapshot | { status: "unavailable" };
  todoVersion?: string;
}

const SHORTCUTS: [string, [string, string][]][] = [
  [
    "Move around",
    [
      ["n", "Write a new entry"],
      ["Ctrl + Shift + F", "Write a new entry in focus mode (Esc to leave)"],
      ["t", "Add a todo"],
      ["[ and ]", "Previous / next day"],
      ["/", "Search (Todos and Review pages)"],
      ["Alt + ↑ / ↓", "Move the focused todo or subtask up or down (Todos page)"],
      ["Alt + → / ←", "Indent or outdent the focused subtask (Todos page)"],
      ["g then t / d / g / r", "Go to Today, Todos, Goals, Review"],
      ["?", "Show this list"],
    ],
  ],
  [
    "While writing",
    [
      ["Ctrl + Enter", "Save the form you're in"],
      ["Esc", "Cancel an edit or leave a text box"],
      ["Ctrl + Shift + X", "Show or hide formatting"],
      ["Ctrl + B / I / E", "Bold, italic, inline code"],
      ["Ctrl + Alt + 1 / 2 / 0", "Heading, subheading, normal text"],
      ["Ctrl + Shift + 7 / 8", "Numbered or bulleted list"],
      ["Tab / Shift + Tab", "Indent or outdent a list item"],
      ["Ctrl + Shift + V", "Paste as plain text"],
    ],
  ],
  [
    "Type Markdown",
    [
      ["* or - then space", "Bulleted list"],
      ["1. then space", "Numbered list"],
      ["# or ## then space", "Heading or subheading"],
      ["`code`", "Inline code"],
      ["``` then Enter", "Code block. Enter on an empty last line leaves it"],
      ["Backspace", "Right after one of these: put the typed characters back"],
    ],
  ],
];

/** Every state's icon is in the page; app.js picks one with data-icon, so icons stay defined in one place. */
const UPDATE_ICONS = ["refresh", "check", "download", "update", "alert"]
  .map((name) => icon(name, false, `update-${name}`))
  .join("");

export function renderLayout(options: LayoutOptions): string {
  const nav = NAV_ITEMS.map((item) => {
    const current = item.key === options.active ? ' aria-current="page"' : "";
    const count =
      item.key === "todos" && options.openTodos ? `<span class="nav-count">${options.openTodos}</span>` : "";
    return `<a href="${item.href}"${current}><span>${item.label}</span>${count}<kbd class="nav-keys">${item.keys}</kbd></a>`;
  }).join("");

  const shortcuts = SHORTCUTS.map(
    ([heading, keys]) =>
      `<h3>${heading}</h3><dl>${keys.map(([key, action]) => `<dt><kbd>${escapeHtml(key)}</kbd></dt><dd>${escapeHtml(action)}</dd>`).join("")}</dl>`,
  ).join("");

  const agentOn = options.agentAccess
    ? '<span class="on-dot" aria-hidden="true"></span><span class="sr-only">, agent access on</span>'
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(options.title)} · ToDo</title>
  <meta name="theme-color" content="#141311">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
  <script src="/app.js" type="module"></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="shell">
    <header class="rail">
      <a class="wordmark" href="/"><span class="wordmark-rule" aria-hidden="true"></span>ToDo</a>
      <nav class="nav" aria-label="Main">${nav}</nav>
      <div class="notice change-notice" id="change-notice" hidden><p id="change-text" role="status"></p><button type="button" class="link-button" data-refresh-page>Refresh when ready</button></div>
      <div class="rail-foot">
        <a class="foot-link agent-settings-link" href="/settings"${options.active === "settings" ? ' aria-current="page"' : ""}>${icon("settings")}<span>Settings</span>${agentOn}</a>
        <button type="button" class="foot-link" data-open-shortcuts aria-label="Keyboard shortcuts" aria-keyshortcuts="?">${icon("keyboard")}<span>Keyboard<span class="label-long"> shortcuts</span></span></button>
        <div class="version-row" id="version-row" data-updates="${escapeHtml(JSON.stringify(options.updates))}">
          <a class="version-link" href="/settings#updates"><span class="version-word">Version </span><span class="version-number">${escapeHtml(packageJson.version)}</span></a>
          <button type="button" class="update-btn" id="update-btn" hidden>${UPDATE_ICONS}<svg class="update-ring" viewBox="0 0 22 22" aria-hidden="true"><circle class="track" cx="11" cy="11" r="9"/><circle class="value" cx="11" cy="11" r="9" pathLength="100"/></svg></button>
          <div class="update-pop" id="update-pop" role="group" aria-labelledby="update-pop-title" hidden></div>
        </div>
        <p class="sr-only" id="update-live" role="status"></p>
      </div>
    </header>
    <main id="main" tabindex="-1" data-todo-version="${escapeHtml(options.todoVersion ?? "")}">${options.main}</main>
  </div>
  <dialog class="shortcuts" id="shortcuts" aria-labelledby="shortcuts-title">
    <h2 id="shortcuts-title">Keyboard shortcuts</h2>
    ${shortcuts}
    <form method="dialog"><button class="btn" type="submit">Close</button></form>
  </dialog>
</body>
</html>`;
}
