import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveStatic, type ServeStaticHandle } from "../src/webApp/serveStatic.js";

let root: string;
let handle: ServeStaticHandle;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "syn-static-test-"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>t</title>hello");
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "app.js"), "console.log('hi');");
  writeFileSync(join(root, "assets", "app.js.map"), "{}");
  writeFileSync(join(root, "styles.css"), "body{color:#0f0}");
  handle = await serveStatic({ root, port: 0, log: () => {} });
});
afterEach(async () => {
  await handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("serveStatic — basics", () => {
  it("assigns an OS-picked port when port=0", () => {
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toBe(`http://localhost:${handle.port}/`);
  });

  it("serves index.html on /", async () => {
    const res = await fetch(handle.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("hello");
  });

  it("serves a JS file with the correct MIME type", async () => {
    const res = await fetch(`${handle.url}assets/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/javascript");
    expect(await res.text()).toContain("console.log");
  });

  it("serves a CSS file with the correct MIME type", async () => {
    const res = await fetch(`${handle.url}styles.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });

  it("sets COOP/COEP headers on every response (needed for SharedArrayBuffer)", async () => {
    const res = await fetch(handle.url);
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(res.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
  });

  it("returns 404 for missing files with a known extension", async () => {
    const res = await fetch(`${handle.url}assets/nope.js`);
    expect(res.status).toBe(404);
  });

  it("SPA-falls-back to index.html for extension-less GETs", async () => {
    const res = await fetch(`${handle.url}deep/path/without/extension`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hello");
  });

  it("refuses URL-encoded path traversal outside the root", async () => {
    // fetch() normalises literal ../ segments; only URL-encoded
    // traversal reaches the server intact. Our guard resolves the
    // request against the root and refuses paths that escape it.
    const res = await fetch(`${handle.url}%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
    expect(res.status).toBe(403);
  });

  it("throws at construction when the root has no index.html", async () => {
    const bare = mkdtempSync(join(tmpdir(), "syn-static-bare-"));
    await expect(
      serveStatic({ root: bare, port: 0, log: () => {} }),
    ).rejects.toThrow(/no index\.html/);
    rmSync(bare, { recursive: true, force: true });
  });
});

describe("serveStatic — query strings + special files", () => {
  it("ignores query strings for path resolution", async () => {
    const res = await fetch(`${handle.url}?ws-port=8765&instance=default`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hello");
  });

  it("serves .map files with a JSON MIME (sourcemap requests)", async () => {
    const res = await fetch(`${handle.url}assets/app.js.map`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("json");
  });
});
