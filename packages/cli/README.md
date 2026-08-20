# @synesthetica/cli

CLI wrapper for **Synesthetica** — a real-time music visualiser with LLM-mediated control via MCP (Model Context Protocol).

Starts an engine instance (browser tab hosting the visualiser) and the MCP server that lets an LLM client (Claude Desktop, Claude Code, or any MCP-capable client) discover the engine's tools, resources, and prompts.

## Requirements

- **Node.js 20+** (24+ recommended).
- A modern **Chromium-based browser** for the engine tab (Web MIDI + Basic Pitch audio require it).
- **Not yet publishable** — see the note at the bottom.

## Install

Once published:

```bash
npm install -g @synesthetica/cli
# or use npx directly (no install)
npx @synesthetica/cli start
```

## Usage

### Standalone (no LLM)

```bash
synesthetica start --no-mcp
```

Opens a browser tab with the visualiser and the manifest-generated control panel. No LLM connection. This is the "I just want to launch and play" mode.

### With an MCP client

```bash
synesthetica start
```

Same as above, plus an MCP server on stdio. Point your MCP client at this command; the LLM sees a set of tools (`set_tempo`, `set_key`, `set_macro`, …) and resources (`state://<label>/current`, `annotations://…`, `concepts://…`).

## Adding to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your platform. Add an entry under `mcpServers`:

```json
{
  "mcpServers": {
    "synesthetica": {
      "command": "npx",
      "args": ["-y", "@synesthetica/cli", "start"]
    }
  }
}
```

Restart Claude Desktop. Open a new chat and Synesthetica will be listed under the connected servers. Ask "start the visualiser"; the LLM will call `set_input` and a browser tab will open.

## Adding to Claude Code

From any project directory:

```bash
claude mcp add synesthetica -- npx -y @synesthetica/cli start
```

Or create a `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "synesthetica": {
      "command": "npx",
      "args": ["-y", "@synesthetica/cli", "start"]
    }
  }
}
```

Restart Claude Code. `/mcp` in an interactive session lists connected servers.

## Command reference

```
synesthetica start [options]         start engine + MCP server; opens a browser tab
synesthetica stop [--instance L]     stop one instance or the whole CLI
synesthetica status                  show running instances and MCP server state
synesthetica reload-annotations      regenerate annotation manifest from source
synesthetica list-presets            list available presets
synesthetica help                    show this message

start OPTIONS
  --instance <label>       instance label (required for the 2nd+ instance)
  --port <port>            MCP server TCP port (only with --transport tcp)
  --transport <type>       'stdio' (default) or 'tcp'
  --no-mcp                 skip MCP server; engine + UI run standalone
  --recent-events-buffer <N>
                           in-memory event ring size (default 1000)
  --log-retention-days <N> days to retain rotated event logs (default 7)
  --no-open                do not open the browser automatically
  --web-app-port <port>    fix the web-app dev server port (default: auto)
  --ws-port <port>         engine bridge WebSocket port (default: auto)
```

## Status

**Not publishable to npm yet.** The current build spawns Vite as a subprocess and locates the web-app via the monorepo workspace layout; an npm-installed copy won't find it. Tracked as [synesthetica-co4](https://github.com/nicc/synesthetica/issues) — replace the Vite subprocess with a bundled static server.

Everything else works today when run from the monorepo checkout: MCP tools, resources, prompts, presets, state subscription, the WebSocket bridge to the browser, the manifest-generated control panel.

See [../../specs/SPEC_013_llm_control_plane_mcp.md](../../specs/SPEC_013_llm_control_plane_mcp.md) for the full architecture.

## License

MIT — see [LICENSE](../../LICENSE).
