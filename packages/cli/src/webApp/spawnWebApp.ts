/**
 * Serves the web-app engine tab.
 *
 * Two modes:
 *   - Dev: locate the web-app source in the monorepo, spawn Vite as
 *     a subprocess for HMR. Used when running from a git checkout.
 *   - Static: locate a bundled `dist/webapp/` inside the CLI's own
 *     install and serve it with the built-in HTTP server. Used when
 *     the CLI is installed via npm.
 *
 * Detection prefers dev (Vite bin exists next to a web-app source
 * package.json). Falling back to static keeps the shipped CLI
 * self-contained — no extra `npm install` required.
 *
 * Both modes send the same COOP/COEP headers so SharedArrayBuffer
 * (SPEC 012 polyphonic audio) is available.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execPath as nodeExecPath } from "node:process";
import { serveStatic } from "./serveStatic.js";

const READY_TIMEOUT_MS = 30_000;

export interface WebAppHandle {
  url: string;
  mode: "dev" | "static";
  close(): Promise<void>;
}

export interface SpawnWebAppOptions {
  /** Explicit port; when omitted, an OS-picked one is used. */
  port?: number;
  /** Where to write Vite's stdio (defaults to process.stderr). */
  log?: NodeJS.WritableStream;
  /**
   * Override the web-app source directory. Only relevant in dev
   * mode; ignored for static-mode discovery.
   */
  webAppDir?: string;
  /**
   * Override the bundled web-app dist directory. Only relevant in
   * static mode; ignored for dev-mode discovery.
   */
  webAppDistDir?: string;
  /**
   * Force one mode. When omitted, dev is preferred if the Vite bin
   * is discoverable; otherwise static.
   */
  mode?: "dev" | "static";
}

export async function spawnWebApp(
  opts: SpawnWebAppOptions = {},
): Promise<WebAppHandle> {
  const mode = opts.mode ?? detectMode(opts);
  return mode === "dev" ? startDev(opts) : startStatic(opts);
}

function detectMode(opts: SpawnWebAppOptions): "dev" | "static" {
  // If the caller pointed at a specific web-app source dir, honour
  // that and use dev mode.
  if (opts.webAppDir && existsSync(opts.webAppDir)) return "dev";
  // Try to find Vite in the monorepo layout; if present, dev mode.
  try {
    const dir = locateWebAppDir();
    locateViteBin(dir);
    return "dev";
  } catch {
    return "static";
  }
}

/* ------------------------------------------------------------------
 * Dev mode: Vite subprocess
 * ------------------------------------------------------------------ */

async function startDev(opts: SpawnWebAppOptions): Promise<WebAppHandle> {
  const dir = opts.webAppDir ?? locateWebAppDir();
  const log = opts.log ?? process.stderr;
  const viteBin = locateViteBin(dir);
  const args = [viteBin];
  if (opts.port !== undefined) args.push("--port", String(opts.port));

  const child = spawn(nodeExecPath, args, {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const url = await waitForVite(child, log);
  return {
    url,
    mode: "dev",
    async close() {
      await closeChild(child);
    },
  };
}

/* ------------------------------------------------------------------
 * Static mode: bundled dist + built-in HTTP server
 * ------------------------------------------------------------------ */

async function startStatic(opts: SpawnWebAppOptions): Promise<WebAppHandle> {
  const dir = opts.webAppDistDir ?? locateBundledWebApp();
  const log = opts.log ?? process.stderr;
  const handle = await serveStatic({
    root: dir,
    port: opts.port ?? 0,
    log: (line) => log.write(`${line}\n`),
  });
  return {
    url: handle.url,
    mode: "static",
    async close() {
      await handle.close();
    },
  };
}

/* ------------------------------------------------------------------
 * Discovery helpers
 * ------------------------------------------------------------------ */

function locateViteBin(webAppDir: string): string {
  const candidates = [
    join(webAppDir, "node_modules", "vite", "bin", "vite.js"),
    join(webAppDir, "..", "..", "node_modules", "vite", "bin", "vite.js"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(
    `could not locate vite entry — tried:\n  ${candidates.join("\n  ")}`,
  );
}

function locateWebAppDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../../web-app"),
    resolve(here, "../../../../web-app"),
    resolve(here, "../../../../node_modules/@synesthetica/web-app"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "package.json"))) return c;
  }
  throw new Error(
    `could not locate @synesthetica/web-app — tried:\n  ${candidates.join("\n  ")}`,
  );
}

/**
 * Locate the bundled web-app dist inside the installed CLI package.
 * Ships as `dist/static/` alongside the CLI's own compiled code —
 * the name is deliberately different from the source dir (webApp)
 * to avoid a case-insensitive filesystem collision on macOS.
 */
function locateBundledWebApp(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", "static"), // dist/webApp/spawnWebApp.js → dist/static/
    resolve(here, "static"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) return c;
  }
  throw new Error(
    `could not locate bundled web-app dist — tried:\n  ${candidates.join(
      "\n  ",
    )}\n\nThis usually means the CLI was built without bundling the web-app assets. ` +
      `In the monorepo, run \`npm run build\` from the root; when installed via npm, ` +
      `reinstall the @synesthetica/cli package.`,
  );
}

/* ------------------------------------------------------------------
 * Vite dev bootstrapping
 * ------------------------------------------------------------------ */

function waitForVite(
  child: ChildProcess,
  log: NodeJS.WritableStream,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      reject(new Error(`vite did not become ready within ${READY_TIMEOUT_MS}ms`));
    }, READY_TIMEOUT_MS);

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      reject(
        new Error(
          `vite exited before becoming ready (code=${code}, signal=${signal})`,
        ),
      );
    };
    child.on("exit", onExit);

    const forward = (buf: Buffer) => {
      const text = buf.toString("utf8");
      log.write(text);
      if (resolved) return;
      const plain = stripAnsi(text);
      const m = plain.match(/http:\/\/[^\s/]+:\d+\//);
      if (m) {
        resolved = true;
        clearTimeout(timer);
        child.off("exit", onExit);
        resolve(m[0]);
      }
    };
    child.stdout?.on("data", forward);
    child.stderr?.on("data", forward);
  });
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-?]*[ -/]*[@-~]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

async function closeChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  return new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 2_000);
  });
}
