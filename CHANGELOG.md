# Changelog

Notable changes to Synesthetica. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- fixed incorrect ring buffer size default for event history in cli help output.

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
