import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "bun";
import { handleRequest } from "../../src/server";
import { createTestContext } from "../helpers/test-vault";

let server: Server<unknown>;
let baseUrl: string;
let ctx: ReturnType<typeof createTestContext>;

beforeAll(() => {
  ctx = createTestContext();
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req) => handleRequest(req, ctx) });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  ctx.cleanup();
});

describe("server", () => {
  it("GET / returns 200", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
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

  it("serves the app icon as SVG and ICO", async () => {
    const svg = await fetch(`${baseUrl}/icon.svg`);
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
    expect(await svg.text()).toContain("<svg");
    const ico = await fetch(`${baseUrl}/favicon.ico`);
    expect(ico.headers.get("content-type")).toBe("image/x-icon");
    // ICO header: reserved 0, type 1 (icon)
    expect([...new Uint8Array(await ico.arrayBuffer()).slice(0, 4)]).toEqual([0, 0, 1, 0]);
  });

  it("serves an installable manifest whose icons all exist at their declared sizes", async () => {
    const res = await fetch(`${baseUrl}/manifest.webmanifest`);
    expect(res.headers.get("content-type")).toBe("application/manifest+json");
    const manifest = (await res.json()) as { name: string; start_url: string; display: string; icons: { src: string; sizes: string }[] };
    expect(manifest).toMatchObject({ name: "Work Ledger", start_url: "/", display: "standalone" });
    // Edge requires 192 and 512 to offer installation.
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of manifest.icons) {
      const png = new Uint8Array(await (await fetch(`${baseUrl}${icon.src}`)).arrayBuffer());
      const view = new DataView(png.buffer);
      // PNG width and height live at bytes 16 and 20 of the IHDR chunk.
      expect(`${view.getUint32(16)}x${view.getUint32(20)}`).toBe(icon.sizes);
    }
  });

  it("GET /does-not-exist returns 404", async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`);
    expect(res.status).toBe(404);
  });

  // The WHATWG URL parser collapses ".." before the request is sent, so these
  // pass regardless of our guard; tests/unit/server.test.ts checks the guard directly.
  it("does not allow a path-traversal attempt to escape public/", async () => {
    const res = await fetch(`${baseUrl}/../../../../package.json`);
    expect(res.status).toBe(404);
  });

  it("does not allow an encoded path-traversal attempt to escape public/", async () => {
    const res = await fetch(`${baseUrl}/styles.css/..%2f..%2f..%2fpackage.json`);
    expect(res.status).not.toBe(200);
  });
});
