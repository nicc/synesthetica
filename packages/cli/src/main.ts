/**
 * CLI main — dispatches parsed commands.
 *
 * Chunk A scope: `start` launches the MCP server; other subcommands
 * print not-yet-implemented placeholders. Real command handlers land
 * as subsequent chunks fill in state, engine registry, and preset store.
 */

import { parseArgs, helpText, type Command, type StartOptions } from "./args.js";
import { startMcpServer } from "./mcpServer.js";
import { StubEngineHandle } from "./engine/stubEngineHandle.js";

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
      writeErr(`'${cmd.kind}' not yet implemented (Chunk A only covers 'start')`);
      return 1;
  }
}

async function runStart(options: StartOptions): Promise<number> {
  const instanceLabel = options.instance ?? "default";
  writeErr(`starting synesthetica (instance=${instanceLabel})`);

  if (!options.mcpEnabled) {
    writeErr(
      `--no-mcp: engine standalone mode not yet implemented (Chunk F). ` +
        `Nothing to start without an engine adapter yet.`,
    );
    return 1;
  }

  // Chunk C: a StubEngineHandle stands in for the real browser-hosted
  // engine until Chunk F wires the WebSocket bridge. The stub tracks
  // state so tool calls are meaningful end-to-end (MCP client → tool
  // handler → engine → state resource). Ships the real engine wiring
  // as a swap at Chunk F.
  const stubEngine = new StubEngineHandle({ label: instanceLabel });

  try {
    const server = await startMcpServer(
      {
        serverName: SERVER_NAME,
        serverVersion: SERVER_VERSION,
        resolveEngine: (instance) => {
          // Single-instance for now — Phase 3 replaces this with a
          // registry lookup.
          if (instance !== undefined && instance !== stubEngine.label) {
            return {
              error: {
                code: "INSTANCE_NOT_FOUND",
                message: `no instance labelled '${instance}' (only '${stubEngine.label}' is running)`,
              },
            };
          }
          return stubEngine;
        },
      },
      options.transport,
      options.port,
    );

    // Graceful shutdown on SIGINT / SIGTERM.
    const shutdown = async (signal: string) => {
      writeErr(`\nreceived ${signal}, shutting down...`);
      await server.close();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));

    writeErr(`MCP server ready on ${options.transport}`);
    // Keep the process alive; the transport is what does the real work.
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
