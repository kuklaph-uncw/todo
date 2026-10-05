import { escapeHtml } from "../lib/html";

/**
 * First-run page. The exe opens it in a normal Edge tab, because Edge only
 * offers to install a site from a tab. app.js reveals the Install button when
 * Edge says the app is installable.
 */
export function renderWelcome(vaultPath: string): string {
  return `<div class="page welcome">
    <header class="page-head">
      <div>
        <h1>Welcome to Work Ledger</h1>
        <p class="page-sub">A private log of the work you do each day. Write down what you did, keep a short todo list, and when review time comes, the app turns it into a document you can paste in.</p>
      </div>
    </header>

    <section class="welcome-step" aria-labelledby="install-title">
      <h2 id="install-title">Install it as an app</h2>
      <p>Installing puts Work Ledger in your Start menu and taskbar with its own icon, like any other app. It takes one click.</p>
      <div class="welcome-actions">
        <button class="btn primary" type="button" data-install hidden>Install Work Ledger</button>
        <p class="install-status" data-install-status role="status"></p>
      </div>
      <p class="field-hint" data-install-unsupported hidden>This browser can't install web apps. Work Ledger works fine in a tab: choose "Not now" below.</p>
      <details class="install-manual" data-install-manual open>
        <summary>No Install button?</summary>
        <ol>
          <li>Look for an install icon at the right end of the address bar and click it.</li>
          <li>Or open the browser's <strong>…</strong> menu. In Edge: <strong>Apps</strong>, then <strong>Install Work Ledger</strong>. In Chrome: <strong>Cast, save, and share</strong>, then <strong>Install page as app</strong>.</li>
        </ol>
      </details>
    </section>

    <section class="welcome-step" aria-labelledby="notes-title">
      <h2 id="notes-title">Where your notes live</h2>
      <p>Everything you write is saved as plain text files in this folder on your computer. Nothing is sent anywhere. To back up, copy the folder.</p>
      <p class="vault-path">${escapeHtml(vaultPath)}</p>
    </section>

    <section class="welcome-step" aria-labelledby="start-title">
      <h2 id="start-title">Each time you use it</h2>
      <p>Start <strong>WorkLedger.exe</strong>. It runs quietly in the background and opens Work Ledger for you. While it's running, the installed app works from your Start menu and taskbar too. To stop it, choose <strong>Quit Work Ledger</strong> at the bottom of the sidebar.</p>
    </section>

    <form method="post" action="/welcome/dismiss" class="welcome-skip">
      <button class="btn ghost" type="submit">Not now, just open Work Ledger</button>
    </form>
  </div>`;
}
