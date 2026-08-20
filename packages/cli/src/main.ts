/**
 * CLI main — dispatches parsed commands.
 *
 * `start` launches the web-app (Vite subprocess + browser tab), the
 * engine bridge (WebSocket server that connects to the browser tab),
 * and, unless `--no-mcp` is passed, the MCP server. Both consumers
 * are independent — engine + UI work standalone in --no-mcp; MCP
 * layers LLM-mediated control over the same underlying pipeline
 * (SPEC 013 §UI Controls, §Standalone-launch, §Engine Channel).
 */

import { parseArgs, helpText, type StartOptions } from "./args.js";
import { startMcpServer } from "./mcpServer.js";
import { createPresetStore } from "./presets/presetStore.js";
import { spawnWebApp, type WebAppHandle } from "./webApp/spawnWebApp.js";
import { openBrowser } from "./webApp/openBrowser.js";
import { startWsBridge, type WsBridgeHandle } from "./engine/wsBridge.js";

const SERVER_NAME = "synesthetica";
const SERVER_VERSION = "0.1.0";

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
  writeErr(`starting synesthetica (instance=${instanceLabel})`);

  const shutdownTasks: Array<() => Promise<void>> = [];
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    writeErr(`\nreceived ${signal}, shutting down...`);
    for (const task of shutdownTasks) {
      try {
        await task();
      } catch (e) {
        writeErr(`shutdown task failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // ---- Engine bridge (WS server) ----
  let bridge: WsBridgeHandle;
  try {
    bridge = await startWsBridge({
      port: options.wsPort,
      log: (line) => writeErr(line),
    });
    shutdownTasks.push(() => bridge.close());
    writeErr(`engine bridge listening on ws://localhost:${bridge.port}`);
  } catch (err) {
    writeErr(`error starting engine bridge: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const engine = bridge.handleFor(instanceLabel);

  // ---- Web app ----
  let webApp: WebAppHandle;
  try {
    writeErr("launching web app…");
    webApp = await spawnWebApp({
      port: options.webAppPort ?? undefined,
    });
    shutdownTasks.push(() => webApp.close());
    const openUrl =
      webApp.url +
      `?ws-port=${bridge.port}&instance=${encodeURIComponent(instanceLabel)}`;
    writeErr(`web app ready at ${openUrl}`);
    if (options.openBrowser) {
      openBrowser(openUrl);
    }
  } catch (err) {
    writeErr(`error launching web app: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // ---- MCP server (unless --no-mcp) ----
  if (!options.mcpEnabled) {
    writeErr("--no-mcp: MCP server skipped; web app + engine only.");
    await new Promise<void>(() => {
      /* never resolves */
    });
    return 0;
  }

  const presetStore = createPresetStore();
  writeErr(`preset store: ${presetStore.storePath()}`);

  try {
    const server = await startMcpServer(
      {
        serverName: SERVER_NAME,
        serverVersion: SERVER_VERSION,
        engines: [engine],
        presetStore,
        resolveEngine: (instance) => {
          if (instance !== undefined && instance !== engine.label) {
            return {
              error: {
                code: "INSTANCE_NOT_FOUND",
                message: `no instance labelled '${instance}' (only '${engine.label}' is running)`,
              },
            };
          }
          return engine;
        },
      },
      options.transport,
      options.port,
    );
    shutdownTasks.push(() => server.close());

    writeErr(`MCP server ready on ${options.transport}`);
    await new Promise<void>(() => {
      /* never resolves */
    });
    return 0;
  } catch (err) {
    writeErr(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

// stdout carries the MCP protocol on stdio transport — human messages
// must go to stderr to avoid corrupting the framing.
function writeOut(msg: string): void {
  process.stdout.write(msg.endsWith("\n") ? msg : msg + "\n");
}
function writeErr(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
}
