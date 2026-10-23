# Synesthetica Web App

The browser app: the visualiser canvas, the input session, and the control panel generated from the manifest. It is not published on its own; the CLI (`packages/cli`) bundles its build and serves it.

## Running locally

Requires Node.js 20+ and a Chromium-based browser (Web MIDI, and `SharedArrayBuffer` for the audio path; `vite.config.ts` sets the COOP/COEP headers that enable it).

```bash
# From the repo root
npm install
npm run dev        # builds contracts, adapters and engine, then starts Vite on localhost:3000 in Chrome
```

Changes under `packages/web-app/src` hot-reload. The app imports the engine, adapters and contracts from their built `dist/`, so changes there need a rebuild of that package (e.g. `npm run build -w @synesthetica/engine`).

Other scripts in this package: `npm run build` (production bundle to `dist/`), `npm run preview`, `npm test`.

Opened directly, the app runs standalone with the panel only. When the CLI opens it, the URL carries `ws-port` and `instance`, and the app connects to the CLI's WebSocket bridge so the MCP server can drive it.

## Architecture

`src/main.ts` wires the pipeline and owns the session:

```
Input (one active at a time)
  ComputerKeyboardSource ──┐  boot default, with the on-screen keyboard
  WebMidiSource ───────────┴─→ RawMidiAdapter ─┐
  Microphone → AudioInputAdapter (Basic Pitch) ─┴─→ VisualPipeline

VisualPipeline
  Stabilizers   NoteTracking → Dynamics
                NoteTracking → ChordDetection → Harmony
  Vocabulary    MusicalVisualVocabulary
  Lenses        RhythmLens, HarmonyLens, DynamicsLens
  Compositor    IdentityCompositor
  Renderer      ThreeJSRenderer → <canvas>
```

- **Session.** A computer-keyboard session starts on load. Switching input swaps the adapter without tearing the session down; a full stop happens only on the LLM's `stop_session` or page unload.
- **One dispatch path.** Panel widgets and LLM tool calls both go through `applyEngineOp` in `main.ts`, which applies the change and publishes a state snapshot to the CLI.
- **`src/panel/`** — the Basics / Advanced / About shell, rendered from `generatePanel(productionManifest)` (`@synesthetica/contracts`).
- **`src/engine/wsReceiver.ts`** — WebSocket client for the CLI's bridge; reconnects with backoff.
- **`src/engine/recentEvents.ts`** — ring buffer behind the LLM's `get_recent_events` (10,000 events standalone; the CLI sets the size with `buffer-size`).
- **`src/engine/enumerateInputs.ts`** — MIDI and audio input list for the input selector.
- **`src/keyboard/OnScreenKeyboard.ts`** — on-screen keyboard overlay for the computer-keyboard input.
- **`src/audio/inference-worker-entry.ts`** — Basic Pitch inference worker; the capture worklet and model are in `public/`.

## Known limitations

- Chromium-based browsers only.
- Single part (no multi-instrument support).
- Tempo, meter and key are prescribed by the user, not inferred. Swing is not supported.
- Presets can be saved and loaded through the MCP tools only; the panel has no preset UI.
- Not built for small screens.
