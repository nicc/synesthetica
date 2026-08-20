/**
 * CLI argument parsing. Small hand-rolled parser — the surface is
 * narrow enough that pulling in a full parser library isn't worth it.
 *
 * Command shape (SPEC 013 §CLI Shape and Lifecycle):
 *   synesthetica start [--instance <label>] [--port <port>]
 *                      [--transport stdio|tcp] [--no-mcp]
 *                      [--recent-events-buffer <N>]
 *                      [--log-retention-days <N>]
 *   synesthetica stop [--instance <label>]
 *   synesthetica status
 *   synesthetica reload-annotations
 *   synesthetica list-presets
 *   synesthetica help
 */

export type Command =
  | { kind: "start"; options: StartOptions }
  | { kind: "stop"; instance: string | null }
  | { kind: "status" }
  | { kind: "reload-annotations" }
  | { kind: "list-presets" }
  | { kind: "help"; topic?: string }
  | { kind: "error"; message: string };

export interface StartOptions {
  instance: string | null;
  port: number | null;
  transport: "stdio" | "tcp";
  mcpEnabled: boolean;
  recentEventsBufferSize: number;
  logRetentionDays: number;
  openBrowser: boolean;
  webAppPort: number | null;
  wsPort: number;
}

const DEFAULT_START_OPTIONS: StartOptions = {
  instance: null,
  port: null,
  transport: "stdio",
  mcpEnabled: true,
  recentEventsBufferSize: 1000,
  logRetentionDays: 7,
  openBrowser: true,
  webAppPort: null,
  wsPort: 0, // 0 = OS-assigned free port; browser reads via ?ws-port=
};

export function parseArgs(argv: readonly string[]): Command {
  const args = argv.slice();
  const subcommand = args.shift();

  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    return { kind: "help", topic: args[0] };
  }

  switch (subcommand) {
    case "start":
      return parseStart(args);
    case "stop":
      return parseStop(args);
    case "status":
      if (args.length > 0) {
        return { kind: "error", message: `status takes no arguments (got: ${args.join(" ")})` };
      }
      return { kind: "status" };
    case "reload-annotations":
      return { kind: "reload-annotations" };
    case "list-presets":
      return { kind: "list-presets" };
    default:
      return { kind: "error", message: `unknown command: ${subcommand}` };
  }
}

function parseStart(args: string[]): Command {
  const options: StartOptions = { ...DEFAULT_START_OPTIONS };

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    switch (flag) {
      case "--instance": {
        const value = args[++i];
        if (!value) return { kind: "error", message: "--instance requires a label" };
        if (!/^[a-zA-Z0-9-]{1,32}$/.test(value)) {
          return {
            kind: "error",
            message: `invalid instance label '${value}' — alphanumeric + hyphens, max 32 chars`,
          };
        }
        options.instance = value;
        break;
      }
      case "--port": {
        const value = args[++i];
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return { kind: "error", message: `--port requires an integer in [1, 65535]` };
        }
        options.port = port;
        break;
      }
      case "--transport": {
        const value = args[++i];
        if (value !== "stdio" && value !== "tcp") {
          return { kind: "error", message: `--transport must be 'stdio' or 'tcp'` };
        }
        options.transport = value;
        break;
      }
      case "--no-mcp":
        options.mcpEnabled = false;
        break;
      case "--recent-events-buffer": {
        const value = args[++i];
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          return { kind: "error", message: `--recent-events-buffer requires a positive integer` };
        }
        options.recentEventsBufferSize = n;
        break;
      }
      case "--log-retention-days": {
        const value = args[++i];
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) {
          return { kind: "error", message: `--log-retention-days requires a non-negative integer` };
        }
        options.logRetentionDays = n;
        break;
      }
      case "--no-open":
        options.openBrowser = false;
        break;
      case "--web-app-port": {
        const value = args[++i];
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
          return { kind: "error", message: `--web-app-port requires an integer in [1, 65535]` };
        }
        options.webAppPort = n;
        break;
      }
      case "--ws-port": {
        const value = args[++i];
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 65535) {
          return { kind: "error", message: `--ws-port requires an integer in [0, 65535] (0 = auto)` };
        }
        options.wsPort = n;
        break;
      }
      default:
        return { kind: "error", message: `unknown flag: ${flag}` };
    }
  }

  return { kind: "start", options };
}

function parseStop(args: string[]): Command {
  let instance: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--instance") {
      const value = args[++i];
      if (!value) return { kind: "error", message: "--instance requires a label" };
      instance = value;
    } else {
      return { kind: "error", message: `unknown flag: ${flag}` };
    }
  }
  return { kind: "stop", instance };
}

export function helpText(topic?: string): string {
  if (topic) {
    return `no detailed help for '${topic}' yet — see 'synesthetica help'`;
  }
  return `synesthetica — music-visualisation engine with LLM-mediated control

USAGE
  synesthetica <command> [options]

COMMANDS
  start [options]         start engine + MCP server; opens a browser tab
  stop [--instance L]     stop one instance or the whole CLI
  status                  show running instances and MCP server state
  reload-annotations      regenerate annotation manifest from source
  list-presets            list available presets
  help                    show this message

start OPTIONS
  --instance <label>      instance label (required for 2nd+ instance)
  --port <port>           MCP server TCP port (only with --transport tcp)
  --transport <type>      'stdio' (default) or 'tcp'
  --no-mcp                skip MCP server; engine + UI run standalone
  --recent-events-buffer <N>
                          in-memory event ring size (default 1000)
  --log-retention-days <N>
                          days to retain rotated event logs (default 7)
  --no-open               do not open the browser automatically
  --web-app-port <port>   fix the web-app dev server port (default: auto)
  --ws-port <port>        engine bridge WebSocket port (default: auto)

See specs/SPEC_013_llm_control_plane_mcp.md for full details.
`;
}
