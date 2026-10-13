import { escapeHtml } from "../lib/html";

export type NavKey = "today" | "todos" | "goals" | "review";

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
  vaultPath: string;
  /** Open + in-progress + blocked todos, shown beside the nav item. */
  openTodos?: number;
}

const SHORTCUTS: [string, string][] = [
  ["n", "Write a new entry"],
  ["Ctrl + Shift + F", "Write a new entry in focus mode (Esc to leave)"],
  ["t", "Add a todo"],
  ["[ and ]", "Previous / next day"],
  ["/", "Search (Todos and Review pages)"],
  ["Esc", "Close a menu, cancel an edit, or leave a text box"],
  ["Ctrl + Enter", "Save the form you're in"],
  ["g then t / d / g / r", "Go to Today, Todos, Goals, Review"],
  ["?", "Show this list"],
];

export function renderLayout(options: LayoutOptions): string {
  const nav = NAV_ITEMS.map((item) => {
    const current = item.key === options.active ? ' aria-current="page"' : "";
    const count =
      item.key === "todos" && options.openTodos ? `<span class="nav-count">${options.openTodos}</span>` : "";
    return `<a href="${item.href}"${current}><span>${item.label}</span>${count}<kbd class="nav-keys">${item.keys}</kbd></a>`;
  }).join("");

  const shortcuts = SHORTCUTS.map(([keys, action]) => `<dt><kbd>${escapeHtml(keys)}</kbd></dt><dd>${escapeHtml(action)}</dd>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(options.title)} · Work Ledger</title>
  <meta name="theme-color" content="#141311">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="shell">
    <header class="rail">
      <a class="wordmark" href="/"><span class="wordmark-rule" aria-hidden="true"></span>Work Ledger</a>
      <nav class="nav" aria-label="Main">${nav}</nav>
      <div class="rail-foot">
        <p class="rail-label">Vault</p>
        <p class="vault-path" title="${escapeHtml(options.vaultPath)}">${escapeHtml(options.vaultPath)}</p>
        <p class="rail-note">Plain Markdown files. Back up by copying the folder.</p>
        <button type="button" class="link-button" data-open-shortcuts>Keyboard shortcuts <kbd>?</kbd></button>
      </div>
    </header>
    <main id="main" tabindex="-1">${options.main}</main>
  </div>
  <dialog class="shortcuts" id="shortcuts" aria-labelledby="shortcuts-title">
    <h2 id="shortcuts-title">Keyboard shortcuts</h2>
    <dl>${shortcuts}</dl>
    <form method="dialog"><button class="btn" type="submit">Close</button></form>
  </dialog>
</body>
</html>`;
}
