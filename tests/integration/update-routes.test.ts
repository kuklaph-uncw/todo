import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { APP_ORIGIN, serveAppRequest } from "../../src/electron/protocol";
import type { UpdateSnapshot } from "../../src/electron/updates";
import { handleRequest } from "../../src/server";
import { createTestContext, formPost, get } from "../helpers/test-vault";

function fakeUpdates(state: UpdateSnapshot) {
  return {
    state,
    snapshot: mock(function (this: { state: UpdateSnapshot }) {
      return this.state;
    }),
    check: mock(async () => {}),
    restart: mock(() => state.status === "ready"),
  };
}

let ctx: ReturnType<typeof createTestContext>;
beforeEach(() => {
  ctx = createTestContext();
});
afterEach(() => ctx.cleanup());

const appPost = (path: string, initiatorOrigin: string | undefined) =>
  serveAppRequest(new Request(`${APP_ORIGIN}${path}`, { method: "POST" }), initiatorOrigin, ctx);

describe("update routes", () => {
  it("reports updates as unavailable outside the installed app and refuses actions", async () => {
    const status = await handleRequest(get("/updates"), ctx);
    expect(status.headers.get("cache-control")).toBe("no-store");
    expect(await status.json()).toEqual({ status: "unavailable" });
    for (const path of ["/updates/check", "/updates/restart"]) {
      const res = await handleRequest(formPost(path, {}), ctx);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ status: "unavailable" });
    }
  });

  it("starts a check and returns the current state", async () => {
    const updates = fakeUpdates({ status: "checking" });
    ctx.updates = updates;
    const res = await handleRequest(formPost("/updates/check", {}), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "checking" });
    expect(updates.check).toHaveBeenCalledTimes(1);
  });

  it("restarts only a ready update and reports a conflict otherwise", async () => {
    const updates = fakeUpdates({ status: "downloading", version: "1.4.0", percent: 10 });
    ctx.updates = updates;
    const early = await handleRequest(formPost("/updates/restart", {}), ctx);
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ status: "downloading" });

    const ready = fakeUpdates({ status: "ready", version: "1.4.0" });
    ctx.updates = ready;
    ready.restart.mockImplementation(() => {
      ready.state = { status: "restarting", version: "1.4.0" };
      return true;
    });
    const res = await handleRequest(formPost("/updates/restart", {}), ctx);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "restarting", version: "1.4.0" });
  });

  it.each([undefined, "null", "https://evil.example"])(
    "refuses update actions from %p in the desktop window",
    async (origin) => {
      const updates = fakeUpdates({ status: "ready", version: "1.4.0" });
      ctx.updates = updates;
      expect((await appPost("/updates/restart", origin)).status).toBe(403);
      expect((await appPost("/updates/check", origin)).status).toBe(403);
      expect(updates.restart).not.toHaveBeenCalled();
      expect(updates.check).not.toHaveBeenCalled();
      expect((await appPost("/updates/restart", APP_ORIGIN)).status).toBe(202);
    },
  );
});
