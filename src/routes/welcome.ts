import { renderWelcome } from "../views/welcome";
import { page, redirect, type AppContext } from "./shared";

/** GET /welcome */
export function handleWelcome(ctx: AppContext): Response {
  return page(ctx, "Welcome", null, renderWelcome(ctx.vaultPath));
}

/** POST /quit: show a "stopped" page, then stop the background server. */
export function quitApp(ctx: AppContext): Response {
  const quit = ctx.quit;
  if (!quit) return page(ctx, "Not found", null, "", 404);
  // Give the browser a moment to receive this page (and its stylesheet) first.
  setTimeout(quit, 500);
  return page(
    ctx,
    "Stopped",
    null,
    `<div class="page"><header class="page-head"><div>
      <h1>Work Ledger has stopped</h1>
      <p class="page-sub">Your notes are saved. To use it again, start WorkLedger.exe. You can close this window.</p>
    </div></header></div>`,
  );
}

/** POST /welcome/dismiss: remember "Not now" so launches stop opening this page. */
export function dismissWelcome(ctx: AppContext): Response {
  ctx.vault.dismissWelcome();
  return redirect("/");
}
