import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "bun";
import { devFetch } from "../../src/dev-server";
import { CSP } from "../../src/electron/protocol";
import { createTestContext } from "../helpers/test-vault";

// The development server over real HTTP. The desktop app's transport is in app-protocol.test.ts.
let server: Server<unknown>;
let baseUrl: string;
let ctx: ReturnType<typeof createTestContext>;

beforeAll(() => {
  ctx = createTestContext();
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: devFetch(ctx) });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  ctx.cleanup();
});

describe("development server", () => {
  it("GET / returns 200 with the desktop app's content security policy", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe(CSP);
  });

  it("GET /styles.css returns 200 with a text/css content-type", async () => {
    const res = await fetch(`${baseUrl}/styles.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });

  it("GET /app.js returns 200 with a javascript content-type", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  it("a real form post redirects and the follow-up page shows the entry", async () => {
    const res = await fetch(`${baseUrl}/journal`, {
      method: "POST",
      body: new URLSearchParams({ date: "2026-09-28", content: "Posted over HTTP", return_to: "/?date=2026-09-28" }),
    });
    expect(res.status).toBe(200);
    expect(res.url).toBe(`${baseUrl}/?date=2026-09-28`);
    expect(await res.text()).toContain("Posted over HTTP");
  });

  it("adds the live-reload script to pages and serves its event stream", async () => {
    expect(await (await fetch(`${baseUrl}/`)).text()).toContain('<script src="/__dev/reload.js" defer></script>\n</head>');
    expect(await (await fetch(`${baseUrl}/__dev/reload.js`)).text()).toContain('new EventSource("/__dev/events")');

    const events = await fetch(`${baseUrl}/__dev/events`);
    expect(events.headers.get("content-type")).toBe("text/event-stream");
    await events.body?.cancel();
  });

  it("serves the app icon as SVG", async () => {
    const svg = await fetch(`${baseUrl}/icon.svg`);
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
    expect(await svg.text()).toContain("<svg");
  });

  it("GET /does-not-exist returns 404", async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`);
    expect(res.status).toBe(404);
  });

  // The WHATWG URL parser collapses ".." before the request is sent, so this one
  // passes regardless of the asset table; the encoded case below reaches it.
  it("does not allow a path-traversal attempt to escape public/", async () => {
    const res = await fetch(`${baseUrl}/../../../../package.json`);
    expect(res.status).toBe(404);
  });

  it("does not allow an encoded path-traversal attempt to escape public/", async () => {
    const res = await fetch(`${baseUrl}/styles.css/..%2f..%2f..%2fpackage.json`);
    expect(res.status).not.toBe(200);
  });
});
