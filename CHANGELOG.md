# Changelog

Notable changes to Synesthetica. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **GPU memory grew over a long session.** Text labels (chord names, note and interval names) each own a canvas texture, and removing a label disposed its material but not the texture. Every chord change left one behind.
- **Playing E4 on the computer keyboard overwrote the clipboard.** A frame-capture debugging shortcut was bound to the bare "c" key, which is also E4 on the on-screen keyboard. It now exists only in dev builds, on Shift+C.
- **The computer keyboard input swallowed shortcuts.** With it active, Cmd/Ctrl+C, V, Z and other shortcuts on mapped keys played a note and had their default action blocked. Keys held with Cmd, Ctrl or Alt now pass through to the browser.

### Security

- **The CLI's local servers listened on every network interface.** The web-app server and the engine bridge now bind to 127.0.0.1, and the bridge rejects WebSocket connections from non-loopback browser origins. Previously another machine on the network, or any open web page, could connect to the bridge and feed state into the LLM's context.
- **A malformed URL could crash the CLI.** A request like `GET /%E0` threw inside the static server's request handler; it now gets a 400.

## [1.0.1] — 2026/09/14

### Fixed

- **`synesthetica start` failed to launch under Claude Desktop and any other MCP host.** The bundled CLI's prompt-file resolver was reaching for a workspace path that only exists inside the monorepo checkout (`@synesthetica/contracts/package.json`), which the published tarball doesn't ship. `composeSystemOverview` blew up during MCP server initialisation, the process exited, and the host reported "Connection closed". Fixed by checking the bundle-adjacent `dist/prompts/` path first (where the build script actually places the .md files) before falling back to the workspace resolver.
- Incorrect ring-buffer default (1000) in the CLI's `--help` output for `--recent-events-buffer`; actual default has been 10000 for a while.

## [1.0.0] — 2026/09/14

First public release.

### Added

- **CLI** (`synesthetica start`) that spawns the visualiser in a browser tab and, unless `--no-mcp` is passed, an MCP server on stdio for Claude Desktop / Claude Code / any MCP-capable LLM client.
- **Three visualisation lenses** — dynamics (velocity bar), rhythm (scrolling note strips + drift streaks), harmony (chord glyph + functional harmony clock).
- **Chord glyph visual language** — hub margin encodes chord quality (straight / wavy / concave / convex / dashed / zig-zag); spokes encode intervals by length and angle; colours anchored on a pitch-class → hue mapping.
- **Functional harmony clock** with diatonic + borrowed rings and animated modal-interchange arcs over two orders of sub-dominant resolution.
- **On-screen QWERTY keyboard** as the boot-default input — one row of naturals (Z–/) plus one row of sharps (S/D/G/H/J/L/;) — so a fresh user has a working input with no permission prompts.
- **MIDI + audio input paths** — MIDI via Web MIDI; audio via Spotify's Basic Pitch (polyphonic pitch detection running in WebAssembly).
- **LLM-mediated control** via a manifest-generated primer that describes every operation, its musical implications at parameter extremes, and how the LLM should reason about the user's playing. Includes a primer-gate token that every non-`get_started` tool call carries.
- **~1 hour recent-events buffer** (10k events) queryable by the LLM for interpretation and practice feedback.
- **Preset save / load / list / delete** via MCP tools (web UI not yet exposed).
- **Session controls** — key (tonic + mode), tempo, time signature, chord interpretation (harmonic / bass-led), metronome — all `null`-clearable for free-time / free-key rendering.
- **Colour mapping controls** — pitch-class anchor rotation and per-pitch overrides, propagated through all lenses and the on-screen keyboard.
- **Built-in static server** serves the bundled web app from the CLI process — no separate deploy needed to `npx synesthetica start` and get a working visualiser tab.

### Notes

- Node.js 20+ required. Chromium-based browsers only (Web MIDI + WebAssembly Basic Pitch dependencies).
- Swing timing not yet supported.

[Unreleased]: https://github.com/nicc/synesthetica/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nicc/synesthetica/releases/tag/v1.0.0
