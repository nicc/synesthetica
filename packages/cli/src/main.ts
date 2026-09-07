/**
 * CLI main — dispatches parsed commands.
 *
 * `start` launches ONLY the MCP server (stdio transport by default).
 * The web-app + WS bridge + browser tab spin up behind the
 * `start_session` MCP tool — SPEC 014 §Lifecycle. This keeps the
 * always-on cost of having Synesthetica configured in Claude Desktop
 * minimal: an idle CLI holding stdio, nothing else, until the LLM
 * calls start_session on behalf of the user.
 *
 * `--no-mcp` runs the web-app + bridge eagerly and skips the MCP
 * server — kept for standalone smoke testing without an LLM client.
 */

import { parseArgs, helpText, type StartOptions } from "./args.js";
import { startMcpServer } from "./mcpServer.js";
import { createPresetStore } from "./presets/presetStore.js";
import { spawnWebApp, type WebAppHandle } from "./webApp/spawnWebApp.js";
import { openBrowser } from "./webApp/openBrowser.js";
import { startWsBridge, type WsBridgeHandle } from "./engine/wsBridge.js";
import { SessionManager } from "./session/sessionManager.js";
import { composeSystemOverview } from "./resources/promptResources.js";

const SERVER_NAME = "synesthetica";
const SERVER_VERSION = "0.1.0";

/**
 * Short server-level primer set as the MCP `initialize` response's
 * `instructions` field. Kept minimal so clients that surface it as
 * ambient system context don't spend real tokens holding the full
 * primer for conversations that never touch music. The LLM is
 * pointed at `get_started` for the full content.
 */
const SERVER_INSTRUCTIONS =
  "Synesthetica is a real-time music visualiser controlled via this server. " +
  "If the user mentions playing an instrument, music, rhythm, harmony, tempo, " +
  "or visualisation, call `get_started` for the full primer, then " +
  "`start_session` to spawn the visualiser before other tool calls. " +
  "When the user is done, call `stop_session` to close it down.";

export async function runCli(argv: readonly string[]): Promise<number> {
  const cmd = parseArgs(argv);
  switch (cmd.kind) {
    case "help":
      writeOut(helpText(cmd.topic));
      return 0;
    case "error":
      writeErr(`error: ${cmd.message}\n\n${helpText()}`);
      return 2;
    case "start":
      return runStart(cmd.options);
    case "stop":
    case "status":
    case "reload-annotations":
    case "list-presets":
      writeErr(`'${cmd.kind}' not yet implemented`);
      return 1;
  }
}

async function runStart(options: StartOptions): Promise<number> {
  const instanceLabel = options.instance ?? "default";
  writeErr(`starting synesthetica MCP server (instance=${instanceLabel})`);

  interface ShutdownTask {
    name: string;
    run: () => Promise<void>;
  }
  const shutdownTasks: ShutdownTask[] = [];
  let shuttingDown = false;

  const FORCE_EXIT_MS = 5_000;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    writeErr(`\nreceived ${signal}, shutting down...`);
    const forceExitTimer = setTimeout(() => {
      writeErr(
        `shutdown exceeded ${FORCE_EXIT_MS}ms — forcing exit. Check logs for the task that hung.`,
      );
      process.exit(2);
    }, FORCE_EXIT_MS);
    forceExitTimer.unref();
    for (const task of shutdownTasks) {
      const t0 = Date.now();
      try {
        await task.run();
        writeErr(`  ✓ ${task.name} (${Date.now() - t0}ms)`);
      } catch (e) {
        writeErr(`  ✗ ${task.name} (${Date.now() - t0}ms): ${e instanceof Error ? e.message : e}`);
      }
    }
    clearTimeout(forceExitTimer);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // ---- --no-mcp: eager legacy path ----
  // Kept for standalone smoke tests without an MCP client. Spawns
  // everything the way pre-Route-1 `start` did.
  if (!options.mcpEnabled) {
    return runNoMcpEagerPath(options, shutdownTasks);
  }

  // ---- Route 1: MCP-only startup ----
  const session = new SessionManager({
    instanceLabel,
    wsPort: options.wsPort,
    webAppPort: options.webAppPort ?? undefined,
    openBrowser: options.openBrowser,
    browser: options.browser,
    log: (line) => writeErr(line),
  });
  shutdownTasks.push({ name: "session (if running)", run: () => session.stop() });

  const presetStore = createPresetStore();
  writeErr(`preset store: ${presetStore.storePath()}`);

  try {
    const server = await startMcpServer(
      {
        serverName: SERVER_NAME,
        serverVersion: SERVER_VERSION,
        session,
        presetStore,
        serverInstructions: SERVER_INSTRUCTIONS,
      },
      options.transport,
      options.port,
    );
    shutdownTasks.push({ name: "MCP server", run: () => server.close() });

    writeErr(`MCP server ready on ${options.transport} — awaiting start_session`);
    await new Promise<void>(() => {
      /* never resolves */
    });
    return 0;
  } catch (err) {
    writeErr(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/**
 * Legacy eager path for `--no-mcp`: spawns the WS bridge + web-app +
 * browser tab immediately, no MCP server. Useful for standalone
 * smoke tests without any LLM client.
 */
async function runNoMcpEagerPath(
  options: StartOptions,
  shutdownTasks: Array<{ name: string; run: () => Promise<void> }>,
): Promise<number> {
  const instanceLabel = options.instance ?? "default";
  let bridge: WsBridgeHandle;
  try {
    bridge = await startWsBridge({
      port: options.wsPort,
      log: (line) => writeErr(line),
    });
    shutdownTasks.push({ name: "engine bridge (WS)", run: () => bridge.close() });
    writeErr(`engine bridge listening on ws://localhost:${bridge.port}`);
  } catch (err) {
    writeErr(`error starting engine bridge: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  bridge.handleFor(instanceLabel);

  let webApp: WebAppHandle;
  try {
    writeErr("launching web app…");
    webApp = await spawnWebApp({
      port: options.webAppPort ?? undefined,
    });
    shutdownTasks.push({ name: `web app (${webApp.mode})`, run: () => webApp.close() });
    const openUrl =
      webApp.url +
      `?ws-port=${bridge.port}&instance=${encodeURIComponent(instanceLabel)}`;
    writeErr(`web app ready at ${openUrl}`);
    if (options.openBrowser) {
      openBrowser(openUrl, options.browser);
    }
  } catch (err) {
    writeErr(`error launching web app: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  writeErr("--no-mcp: MCP server skipped; web app + engine only.");
  await new Promise<void>(() => {
    /* never resolves */
  });
  return 0;
}

// Suppress unused-import warning under the split of paths above.
void composeSystemOverview;

// stdout carries the MCP protocol on stdio transport — human messages
// must go to stderr to avoid corrupting the framing.
function writeOut(msg: string): void {
  process.stdout.write(msg.endsWith("\n") ? msg : msg + "\n");
}
function writeErr(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
}
