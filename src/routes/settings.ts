import { renderSettings } from "../views/settings";
import { validPort } from "../mcp/settings";
import { notFound, page, readForm, redirect, type AppContext } from "./shared";

export function handleSettings(
  req: Request,
  ctx: AppContext,
  token: string | null = null,
  error: string | null = null,
  status = 200,
): Response {
  const access = ctx.agentAccess;
  const main = renderSettings(
    access ? { ...access.snapshot(), ...(error ? { error } : {}) } : null,
    { vaultPath: ctx.vaultPath, updatesAvailable: Boolean(ctx.updates) },
    new URL(req.url).searchParams.has("saved") ? "Settings saved." : null,
    token,
  );
  const response = page(ctx, "Settings", "settings", main, status);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function saveSettings(req: Request, ctx: AppContext): Promise<Response> {
  if (!ctx.agentAccess) return notFound(ctx);
  const form = await readForm(req);
  try {
    if (form.text("intent") === "token") return handleSettings(req, ctx, await ctx.agentAccess.rotateToken());
    if (form.text("intent") !== "save") return handleSettings(req, ctx, null, "Unknown settings action.", 400);
    const rawPort = form.text("port");
    const port = Number(rawPort);
    if (!/^\d+$/.test(rawPort) || !validPort(port))
      return handleSettings(req, ctx, null, "Choose a whole port number from 1024 to 65535.", 400);
    await ctx.agentAccess.configure({
      enabled: form.text("enabled") === "on",
      background: form.text("background") === "on",
      port,
    });
    return redirect("/settings?saved=1");
  } catch (error) {
    console.error("Could not save agent settings", error);
    return handleSettings(
      req,
      ctx,
      null,
      "Could not save settings. Check that the app's data folder is writable.",
      500,
    );
  }
}
