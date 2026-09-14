#!/usr/bin/env node
/**
 * MCP-handshake smoke test against the freshly bundled CLI.
 *
 * Spawns `node dist/bin.js start --no-open` and sends a real
 * `initialize` JSON-RPC request. Passes iff the server responds
 * with a `result` inside a bounded timeout. Kills the child
 * process regardless.
 *
 * This exists because 1.0.0 shipped a CLI whose promptResources
 * resolver reached for a workspace path that only exists inside
 * the monorepo checkout. `npm publish --dry-run` inspected the
 * tarball contents and gave it a clean bill of health, but never
 * actually RAN the bundled binary — so Claude Desktop was the
 * first place the failure surfaced, right in front of users.
 *
 * Run from the packages/cli/ directory after `npm run build`.
 * Exits 0 on success, 1 on any failure. Prints the child's
 * stderr on failure to make CI logs immediately diagnostic.
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = 15_000;

const here = dirname(fileURLToPath(import.meta.url));
const bin = resolve(here, "..", "dist", "bin.js");

const initMsg =
  JSON.stringify({
    jsonrpc: "2.0",
    method: "initialize",
    id: 1,
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "1" },
    },
  }) + "\n";

const proc = spawn(process.execPath, [bin, "start", "--no-open"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuf = "";
let stderrBuf = "";
proc.stdout.setEncoding("utf8");
proc.stderr.setEncoding("utf8");
proc.stdout.on("data", (chunk) => (stdoutBuf += chunk));
proc.stderr.on("data", (chunk) => (stderrBuf += chunk));

const timer = setTimeout(() => {
  fail(`no initialize response after ${TIMEOUT_MS}ms`);
}, TIMEOUT_MS);

proc.on("exit", (code, signal) => {
  if (code === 0) return; // clean shutdown after we killed it
  if (signal === "SIGTERM" || signal === "SIGKILL") return;
  fail(`child exited unexpectedly (code=${code}, signal=${signal})`);
});
proc.on("error", (err) => fail(`spawn failed: ${err.message}`));

const responseWatcher = setInterval(() => {
  // Framing is one JSON object per line, but we tolerate partials
  // by only consuming complete newline-terminated chunks.
  const nl = stdoutBuf.lastIndexOf("\n");
  if (nl < 0) return;
  const complete = stdoutBuf.slice(0, nl);
  stdoutBuf = stdoutBuf.slice(nl + 1);
  for (const line of complete.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue; // ignore non-JSON lines (there shouldn't be any on stdout)
    }
    if (msg.id === 1 && msg.result) {
      clearTimeout(timer);
      clearInterval(responseWatcher);
      console.log("smoke: MCP initialize OK");
      console.log(`  serverInfo: ${JSON.stringify(msg.result.serverInfo)}`);
      proc.kill("SIGTERM");
      setTimeout(() => process.exit(0), 200);
      return;
    }
    if (msg.id === 1 && msg.error) {
      fail(`initialize returned error: ${JSON.stringify(msg.error)}`);
      return;
    }
  }
}, 50);

proc.stdin.write(initMsg);

function fail(reason) {
  clearTimeout(timer);
  clearInterval(responseWatcher);
  console.error(`smoke: FAIL — ${reason}`);
  if (stderrBuf) {
    console.error("--- child stderr ---");
    console.error(stderrBuf.trimEnd());
  }
  if (stdoutBuf) {
    console.error("--- child stdout (partial) ---");
    console.error(stdoutBuf.trimEnd());
  }
  try {
    proc.kill("SIGKILL");
  } catch {
    /* already dead */
  }
  process.exit(1);
}
