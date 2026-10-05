import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { APP_ORIGIN, CSP, isAppUrl, serveAppRequest } from "../../src/electron/protocol";
import { createTestContext } from "../helpers/test-vault";

// The desktop window's transport: Electron passes app:// requests and their initiator origin here.
let ctx: ReturnType<typeof createTestContext>;

beforeEach(() => {
  ctx = createTestContext();
});
afterEach(() => ctx.cleanup());

const get = (path: string) => serveAppRequest(new Request(`${APP_ORIGIN}${path}`), undefined, ctx);
const post = (initiatorOrigin: string | undefined) =>
  serveAppRequest(
    new Request(`${APP_ORIGIN}/journal`, {
      method: "POST",
      body: new URLSearchParams({ date: "2026-09-28", content: "From the app", return_to: "/?date=2026-09-28" }),
    }),
    initiatorOrigin,
    ctx,
  );

describe("app:// requests", () => {
  it("serves pages with the content security policy and no content sniffing", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toBe(CSP);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("only answers for the app's own host", async () => {
    expect((await serveAppRequest(new Request("app://elsewhere/"), undefined, ctx)).status).toBe(404);
  });

  // The window uses this to decide where it may navigate and which pages get permissions.
  it("recognises only app://local as the app", () => {
    expect(isAppUrl("app://local/todos?x=1")).toBe(true);
    expect(isAppUrl("app://local")).toBe(true);
    for (const url of ["app://local.evil/", "app://other/", "https://local/", "http://local/", "not a url"]) {
      expect(isAppUrl(url)).toBe(false);
    }
  });

  it("accepts a form post from the app's own pages and redirects back", async () => {
    const res = await post(APP_ORIGIN);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/?date=2026-09-28");
    expect(ctx.vault.getEntries("2026-09-28").map((e) => e.text)).toEqual(["From the app"]);
  });

  it.each([undefined, "null", "https://evil.example"])("refuses a post from %p and changes nothing", async (origin) => {
    const res = await post(origin);
    expect(res.status).toBe(403);
    expect(res.headers.get("content-security-policy")).toBe(CSP);
    expect(ctx.vault.getEntries("2026-09-28")).toEqual([]);
  });

  it("serves the bundled styles and script", async () => {
    const css = await get("/styles.css");
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(await css.text()).toContain("--brass");
    const js = await get("/app.js");
    expect(js.headers.get("content-type")).toContain("javascript");
    expect(await js.text()).toContain("swapPage");
  });

  it("returns 404 for unknown files, including encoded traversal attempts", async () => {
    expect((await get("/package.json")).status).toBe(404);
    expect((await get("/styles.css/..%2f..%2fpackage.json")).status).toBe(404);
  });
});
