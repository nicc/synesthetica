import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnWebApp } from "../src/webApp/spawnWebApp.js";
import { PassThrough } from "node:stream";

/**
 * We can't run a real Vite in unit tests (heavy, port-bound, slow).
 * Instead, seed a fake web-app dir with a fake vite.js under
 * node_modules that prints the expected line and behaves. That
 * exercises the subprocess plumbing + URL-detection regex without
 * depending on Vite itself.
 */

function makeFakeWebApp(viteScript: string): string {
  const dir = mkdtempSync(join(tmpdir(), "syn-fake-webapp-"));
  const pkg = {
    name: "@synesthetica/fake-web-app",
    version: "0.0.0",
    private: true,
  };
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  const viteDir = join(dir, "node_modules", "vite", "bin");
  mkdirSync(viteDir, { recursive: true });
  writeFileSync(join(viteDir, "vite.js"), viteScript);
  return dir;
}

describe("spawnWebApp", () => {
  it("detects the Vite-format URL and resolves", async () => {
    const dir = makeFakeWebApp(
      // Print a Vite-shaped ready line, then sleep forever.
      `console.log('  ➜  Local:   http://localhost:5177/'); setInterval(()=>{}, 1000);`,
    );
    const log = new PassThrough();
    const handle = await spawnWebApp({ webAppDir: dir, log });
    expect(handle.url).toBe("http://localhost:5177/");
    await handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects when the subprocess exits before ready", async () => {
    const dir = makeFakeWebApp(`process.exit(3);`);
    const log = new PassThrough();
    await expect(spawnWebApp({ webAppDir: dir, log })).rejects.toThrow(
      /vite exited before becoming ready/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws when vite binary cannot be located", async () => {
    // Web-app dir exists but has no node_modules/vite/bin/vite.js.
    const dir = mkdtempSync(join(tmpdir(), "syn-no-vite-"));
    writeFileSync(join(dir, "package.json"), '{"name":"x","private":true}');
    const log = new PassThrough();
    await expect(spawnWebApp({ webAppDir: dir, log })).rejects.toThrow(
      /could not locate vite entry/,
    );
    rmSync(dir, { recursive: true, force: true });
  });
});
