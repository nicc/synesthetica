# Changelog

Notable changes to Synesthetica. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Overtones (harmonic series overlay).** Each played note's partials, up to the 9th harmonic, are modelled at their true pitch and drawn as slow-moving steam: a halo around the chord glyph (on by default) and overtone strips on the rhythm lens (off by default). Both toggles are in Basics; overtone level, rolloff and colour (landing pitch or originating note) are in Advanced. The model is theoretical; it does not analyse audio.
- **Note-name legend under the rhythm lens's NOW line.** On by default, toggled in Basics. Spelling follows the prescribed key; with no key it uses sharps or flats per a new Advanced setting.
- **Interval-name dial around the chord glyph.** R, m2 … M7 at each spoke angle, in a ring just outside the glyph. On by default, toggled in Basics.
- **Guide numerals on the progression clock.** With a key set, the key's seven diatonic numerals are drawn greyed on the diatonic ring. A played numeral covers its slot, and the guide returns as the played numeral fades.
- **Modal-interchange hints (major keys).** An optional Basics toggle adds greyed ♭II, ♭III, iv, ♭VI and ♭VII to the progression clock's borrowed ring.
- **Small-screen warning.** In windows under 768×576 the About panel opens on every load and says the app is not built for small screens.

### Changed

- **The view is contained rather than cropped.** Windows narrower than 4:3 now show the full width with bands above and below; previously the sides were cut off. The on-screen keyboard stays aligned with the clock and the NOW line either way.
- **Progression clock proportions.** The clock is sized so its outer guide ring meets the chord glyph's overtone halo, and the borrowed (outer) band is narrower in proportion to its smaller numerals. Numerals, strokes, arcs and the centre chord name scale with it.
- **Smaller first load for keyboard and MIDI sessions.** The audio model library (TensorFlow.js) was bundled into the main page as well as the audio worker. It now loads only with audio input; the main bundle drops from 2.6 MB to 0.9 MB.
- **Development tooling.** ESLint 10 with type-checked rules that enforce package and engine-layer boundaries; `npm run typecheck` covers the web app and every package's tests; `npm test` runs all packages in one vitest process, with SVG snapshot generation moved to `npm run snapshots`. CI now builds the CLI (the root build had been skipping it) and, like the publish workflow, runs an MCP handshake smoke test against the bundled binary.

### Fixed

- **GPU memory grew over a long session.** Text labels (chord names, note and interval names) each own a canvas texture, and removing a label disposed its material but not the texture. Every chord change left one behind.
- **Playing E4 on the computer keyboard overwrote the clipboard.** A frame-capture debugging shortcut was bound to the bare "c" key, which is also E4 on the on-screen keyboard. It now exists only in dev builds, on Shift+C.
- **The computer keyboard input swallowed shortcuts.** With it active, Cmd/Ctrl+C, V, Z and other shortcuts on mapped keys played a note and had their default action blocked. Keys held with Cmd, Ctrl or Alt now pass through to the browser.
- **Audio input failed in the installed CLI.** The audio worker resolved the model's relative URL against its own location under `assets/`, so `npx synesthetica` requested `/assets/models/basic-pitch/model.json` and got a 404. The URL is now resolved against the page before it reaches the worker.
- **A bug in one lens or analysis stage froze the whole view.** The render loop stopped on any error. Now a failing lens is skipped for that frame, a failing analysis stage is reset and bypassed, each reports a diagnostic, and the rest keeps drawing.
- **New notes paused before scrolling.** A note strip's top edge was held still for about 75 ms after each onset, then started moving. Notes now grow out of the NOW line from their onset.

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

[Unreleased]: https://github.com/nicc/synesthetica/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/nicc/synesthetica/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/nicc/synesthetica/releases/tag/v1.0.0
