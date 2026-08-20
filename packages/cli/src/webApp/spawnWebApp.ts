/**
 * Spawns the Vite dev server that hosts the web-app engine tab.
 *
 * Both `synesthetica start` and `synesthetica start --no-mcp` launch
 * this — the SPEC 013 promise is that the engine + web app + UI
 * controls launch regardless of MCP wiring. Only --no-mcp skips the
 * MCP server registration.
 *
 * Vite is launched as a subprocess in the workspace's web-app package
 * directory. We parse its stdout to discover the URL, then return it
 * to the caller (who typically opens the browser next).
 *
 * Vite stdout/stderr is forwarded to the CLI's stderr so stdio-
 * transport MCP framing on stdout stays clean.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execPath as nodeExecPath } from "node:process";

const READY_TIMEOUT_MS = 30_000;

export interface WebAppHandle {
  url: string;
  close(): Promise<void>;
}

export interface SpawnWebAppOptions {
  /** Explicit port; when omitted, Vite picks one. */
  port?: number;
  /** Where to write Vite's stdio (defaults to process.stderr). */
  log?: NodeJS.WritableStream;
  /** Override the web-app directory location (used by tests). */
  webAppDir?: string;
}

export async function spawnWebApp(
  opts: SpawnWebAppOptions = {},
): Promise<WebAppHandle> {
  const dir = opts.webAppDir ?? locateWebAppDir();
  const log = opts.log ?? process.stderr;

  // Spawn Vite directly (not via `npm run dev`). Going through npm
  // adds an intermediate process that outlives our shutdown signal
  // and orphans Vite in the process group. Direct-spawn gives us the
  // actual Vite pid so kill-and-wait is deterministic.
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
    async close() {
      await closeChild(child);
    },
  };
}

/**
 * Locate the Vite entry (JS file) starting from the web-app dir.
 * Node runs the .js directly — spawning through `npm run` adds an
 * extra process layer we then can't reliably kill.
 */
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

/**
 * Locate the web-app package directory by walking up from the CLI's
 * install location. Works in the monorepo dev tree; when packaged +
 * installed, the web-app should be a peer under node_modules.
 */
function locateWebAppDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // From packages/cli/dist/webApp/spawnWebApp.js → walk up looking
  // for a sibling packages/web-app dir.
  const candidates = [
    resolve(here, "../../../web-app"), // monorepo dev
    resolve(here, "../../../../web-app"), // one level deeper (unlikely)
    resolve(here, "../../../../node_modules/@synesthetica/web-app"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "package.json"))) return c;
  }
  throw new Error(
    `could not locate @synesthetica/web-app — tried:\n  ${candidates.join(
      "\n  ",
    )}\n\nSet SYNESTHETICA_WEB_APP_DIR to override, or run from the monorepo.`,
  );
}

/**
 * Watch Vite's output until it prints its ready URL, or timeout.
 * Vite writes lines like "  ➜  Local:   http://localhost:5173/".
 */
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
      // Vite emits ANSI colour codes inside its ready URL even when
      // FORCE_COLOR=0. Strip them before regex-matching so the URL
      // parses cleanly regardless.
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

// Minimal ANSI escape-sequence stripper. Matches CSI sequences
// (ESC + [ + params + final byte); enough for Vite's colour codes.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-?]*[ -/]*[@-~]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

async function closeChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  return new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    // Escalate if Vite ignores SIGTERM for too long.
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 2_000);
  });
}
