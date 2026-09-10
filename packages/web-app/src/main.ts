/**
 * Web-app entry.
 *
 * Owns:
 *  - The visualisation canvas (Three.js renderer + VisualPipeline).
 *  - MIDI + audio session lifecycle (start/stop; MIDI and audio are
 *    mutually exclusive per SPEC 012).
 *  - The manifest-generated control panel (Basics / Advanced / About)
 *    per SPEC 013 §UI Controls.
 *
 * No bespoke DOM controls remain — the panel shell is the only user
 * surface for parameter adjustment. Input source, session controls,
 * and macros all flow through the same dispatch path.
 */

import type { SceneFrame } from "@synesthetica/contracts";
import {
  generatePanel,
  productionManifest,
} from "@synesthetica/contracts";
import {
  RawMidiAdapter,
  WebMidiSource,
  AudioInputAdapter,
  ComputerKeyboardSource,
} from "@synesthetica/adapters";
import {
  mountOnScreenKeyboard,
  type OnScreenKeyboardHandle,
} from "./keyboard/OnScreenKeyboard.js";
import {
  VisualPipeline,
  ThreeJSRenderer,
  NoteTrackingStabilizer,
  ChordDetectionStabilizer,
  HarmonyStabilizer,
  MusicalVisualVocabulary,
  RhythmLens,
  HarmonyLens,
  DynamicsLens,
  DynamicsStabilizer,
  IdentityCompositor,
  Metronome,
} from "@synesthetica/engine";
import { renderPanel, type RenderedPanel } from "./panel/renderPanel.js";
import { bindPanelToEngine } from "./panel/bindPanel.js";
import { mountPanelShell } from "./panel/panelShell.js";
import { buildAboutPanel } from "./panel/aboutPanel.js";
import { startWsReceiver, type WsReceiverHandle } from "./engine/wsReceiver.js";
import {
  attachRecentEventsBuffer,
  type RecentEventsBuffer,
} from "./engine/recentEvents.js";
import {
  enumerateInputs,
  enumerateInputsSync,
  inputsToPanelOptions,
} from "./engine/enumerateInputs.js";
import type {
  EngineMethod,
  EngineStateSnapshot,
} from "@synesthetica/contracts";

/* -----------------------------------------------------------------
 * Worker + model URLs (Vite handles these at build time)
 * ----------------------------------------------------------------- */
import INFERENCE_WORKER_URL from "./audio/inference-worker-entry.ts?worker&url";
const AUDIO_CAPTURE_WORKLET_URL = "/audio-capture-worklet.js";
const BASIC_PITCH_MODEL_URL = "/models/basic-pitch/model.json";

/* -----------------------------------------------------------------
 * DOM refs (three: canvas, status line, body host for the shell)
 * ----------------------------------------------------------------- */
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const statusEl = document.getElementById("syn-status") as HTMLDivElement;

/* -----------------------------------------------------------------
 * Session state
 * ----------------------------------------------------------------- */
let midiSource: WebMidiSource | null = null;
let pipeline: VisualPipeline | null = null;
let vocabulary: MusicalVisualVocabulary | null = null;
let renderer: ThreeJSRenderer | null = null;
let metronome: Metronome | null = null;
let audioAdapter: AudioInputAdapter | null = null;
let midiAdapter: RawMidiAdapter | null = null;
// The keyboard input has three coupled bits of state: the MidiSource
// wrapping the document event stream, the adapter feeding it into
// the pipeline, and the on-screen UI overlay. All three come up and
// down together; module-level so start/stop/swap paths can find them.
let keyboardSource: ComputerKeyboardSource | null = null;
let keyboardAdapter: RawMidiAdapter | null = null;
let onScreenKeyboard: OnScreenKeyboardHandle | null = null;
let sessionStartTime = 0; // performance.now() reference for session-ms math
let sessionStartedAtIso: string | null = null; // wall-clock ISO at session start
let animationFrameId: number | null = null;
let lastSceneFrame: SceneFrame | null = null;
let basicsPanel: RenderedPanel | null = null;
let advancedPanel: RenderedPanel | null = null;
let wsReceiver: WsReceiverHandle | null = null;
let recentEvents: RecentEventsBuffer | null = null;

/**
 * Cache of the most recent async input enumeration (MIDI + audio, with
 * labels once the browser has surfaced them). Populated by
 * refreshInputOptions and read by currentInputOptions so the widget's
 * dropdown reflects the full device list on first render — before
 * that, currentInputOptions falls back to the sync path (MIDI + a
 * single default-audio entry), which is the source of the "only
 * generic audio input visible until I pick something" symptom.
 */
let cachedInputOptions: Array<{ value: string; label: string }> | null = null;

/**
 * Recent-events buffer capacity, from the CLI-injected `buffer-size`
 * query param (see SessionManager.buildOpenUrl). Falls back to a
 * standalone-mode default sized for ~1hr of typical play at ~2–3
 * events/sec — a natural token guard-rail: even if the LLM asks for
 * `limit: 999999`, get_recent_events can only return what fits.
 */
const STANDALONE_RECENT_EVENTS_CAPACITY = 10_000;
function parseRecentEventsBufferSize(): number {
  const raw = new URLSearchParams(window.location.search).get("buffer-size");
  if (raw === null) return STANDALONE_RECENT_EVENTS_CAPACITY;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : STANDALONE_RECENT_EVENTS_CAPACITY;
}

/**
 * Clear the recent-events buffer on session teardown. Called from
 * stopSession(); the buffer's dispose() cuts the subscription so no
 * stale frame captures leak across sessions.
 */
function clearRecentEvents(): void {
  if (recentEvents) {
    recentEvents.dispose();
    recentEvents = null;
  }
}

// State snapshot we publish back to the CLI over WS.
//
// `macros.intents` is the last value asked for per macro — populated
// by any of set_macro, set_hue_for_pitch, switch_preset, or a panel
// widget edit (the panel dispatches through applyEngineOp on the
// same path as LLM tool calls). `macros.effective` is sourced from
// consumer runtime on every publishState — see SPEC 014 §1.9.
// Everything else is mirrored on the way through applyEngineOp.
const engineState: EngineStateSnapshot = {
  instance: "default",
  macros: { intents: {}, effective: {} },
  permissions: { midi: "prompt", audio: "prompt" },
  session: {
    tonic: null,
    mode: null,
    tempo: null,
    beatsPerBar: null,
    beatValue: null,
    chordMode: "harmonic",
    metronome: false,
    phase: "no-session",
  },
  input: null,
  activePreset: null,
  startedAt: null,
  now: null,
};

/** Current session-time (ms) at call. null when no session is active. */
function sessionNow(): number | null {
  if (sessionStartedAtIso === null) return null;
  return performance.now() - sessionStartTime;
}

/** Publish the current engineState snapshot to the CLI. Rebuilds
 *  `macros.effective` from the live pipeline on every call so
 *  drift between intent and consumer state stays visible. */
function publishState(): void {
  engineState.now = sessionNow();
  refreshEffectiveMacros();
  wsReceiver?.publishStateChanged({
    ...engineState,
    session: { ...engineState.session },
    macros: {
      intents: { ...engineState.macros.intents },
      effective: { ...engineState.macros.effective },
    },
  });
}

function refreshEffectiveMacros(): void {
  if (!pipeline) return;
  engineState.macros.effective = pipeline.readEffectiveMacros(
    productionManifest.macros,
  );
}

/**
 * Single dispatch path — both the local panel and the CLI-over-WS
 * end up here. Updates local pipeline state, mirrors to engineState,
 * publishes to the CLI, and refreshes the panel widget.
 */
async function applyEngineOp(
  method: EngineMethod,
  args: readonly unknown[],
): Promise<EngineStateSnapshot> {
  switch (method) {
    case "setKey": {
      const [tonic] = args as [number | null, string | null];
      let mode = (args as [number | null, string | null])[1];
      // When a tonic is set without an explicit mode, fill from the
      // annotated default (session:mode declares "ionian"). Preserves
      // any mode the user already picked. Keeps mode + tonic in
      // lockstep so key detection can enable on tonic-only picks.
      if (tonic !== null && mode === null) {
        mode = engineState.session.mode ?? readModeDefault();
      }
      engineState.session.tonic = tonic;
      engineState.session.mode = mode;
      if (pipeline) {
        if (tonic === null || mode === null) pipeline.setKey(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        else pipeline.setKey({ root: tonic as any, mode: mode as any });
      }
      break;
    }
    case "setTempo": {
      const [bpm] = args as [number | null];
      engineState.session.tempo = bpm;
      pipeline?.setTempo(bpm);
      metronome?.setTempo(bpm);
      break;
    }
    case "setMeter": {
      const [bpb, unit] = args as [number | null, number | null];
      engineState.session.beatsPerBar = bpb;
      engineState.session.beatValue = unit;
      pipeline?.setMeter(bpb, unit ?? 4);
      if (bpb !== null) metronome?.setMeter(bpb);
      break;
    }
    case "setChordMode": {
      const [mode] = args as ["harmonic" | "bass-led"];
      engineState.session.chordMode = mode;
      pipeline?.setChordInterpretation(mode);
      break;
    }
    case "setMetronome": {
      const [enabled] = args as [boolean];
      engineState.session.metronome = enabled;
      toggleMetronome(enabled);
      break;
    }
    case "setMacro": {
      const [name, value] = args as [string, number | string];
      engineState.macros.intents[name] = value;
      pipeline?.setMacro(name, value);
      break;
    }
    case "setInput": {
      const [source] = args as [string];
      engineState.input = source;
      handleInputSource(source);
      break;
    }
    case "setHueForPitch": {
      const [pc, hue] = args as [number, number];
      vocabulary?.setHueForPitch(pc, hue);
      // Record the equivalent reference-hue as the user's intent, so
      // state://.macros.intents reads back the same value set_macro
      // would have used. `effective` is picked up automatically from
      // the vocab by publishState.
      const derived = vocabulary?.readMacros()["system:colour-mapping:reference"];
      if (typeof derived === "number") {
        engineState.macros.intents["system:colour-mapping:reference"] = derived;
      }
      break;
    }
    case "switchPreset": {
      const [name] = args as [string];
      engineState.activePreset = name;
      break;
    }
    case "savePreset": {
      // No pipeline side effect; the CLI's preset store owns the file.
      break;
    }
    case "getStateSnapshot":
    case "getRecentEvents":
      // Read-only ops handled below.
      break;
  }
  // Refresh the panel widget for this id so LLM-driven changes appear
  // in the UI. For pair-typed ids we push both children.
  refreshPanelForMethod(method, args);
  publishState();
  return snapshotCopy();
}

/**
 * Build a values map covering every panel-controlled field from the
 * current engineState. Used to sync a freshly-rendered panel to
 * whatever the LLM (or previous UI activity) has already changed —
 * without this, opening the Basics or Advanced tab after some
 * WS-driven writes shows widgets at their manifest defaults, not
 * at the current values.
 */
function collectCurrentPanelValues(): Record<string, number | string | boolean | null> {
  const values: Record<string, number | string | boolean | null> = {};
  // Session controls.
  values["session:tonic"] = engineState.session.tonic;
  values["session:mode"] = engineState.session.mode;
  values["session:tempo"] = engineState.session.tempo;
  values["session:beats-per-bar"] = engineState.session.beatsPerBar;
  values["session:beat-value"] = engineState.session.beatValue;
  values["session:chord-mode"] = engineState.session.chordMode;
  values["session:metronome"] = engineState.session.metronome;
  // Input.
  values["input:source"] = engineState.input;
  // Macros — prefer effective (what consumers are actually running)
  // over intents (what was asked for), since the widget's job is to
  // show the current running value. Fall back to intents when
  // effective is empty (compound macros don't appear in effective).
  for (const [id, v] of Object.entries(engineState.macros.effective)) {
    values[id] = v as number | string;
  }
  for (const [id, v] of Object.entries(engineState.macros.intents)) {
    if (!(id in values)) values[id] = v as number | string;
  }
  return values;
}

function refreshPanelForMethod(method: EngineMethod, args: readonly unknown[]): void {
  const values: Record<string, number | string | boolean | null> = {};
  switch (method) {
    case "setKey":
      // Read from engineState (already mutated by applyEngineOp),
      // not raw args — that way mode auto-fill on tonic-only picks
      // is reflected in the widget.
      values["session:tonic"] = engineState.session.tonic;
      values["session:mode"] = engineState.session.mode;
      break;
    case "setTempo":
      values["session:tempo"] = (args[0] as number | null) ?? null;
      break;
    case "setMeter":
      values["session:beats-per-bar"] = (args[0] as number | null) ?? null;
      values["session:beat-value"] = (args[1] as number | null) ?? null;
      break;
    case "setChordMode":
      values["session:chord-mode"] = args[0] as string;
      break;
    case "setMetronome":
      values["session:metronome"] = args[0] as boolean;
      break;
    case "setMacro":
      values[args[0] as string] = args[1] as number | string;
      break;
    case "setInput":
      values["input:source"] = args[0] as string;
      break;
    default:
      return;
  }
  basicsPanel?.update(values);
  advancedPanel?.update(values);
}

/**
 * Read the annotated default for session:mode from the manifest —
 * the manifest is the single source of truth for defaults, so this
 * stays in sync if the value ever changes there.
 */
function readModeDefault(): string {
  const modeAnn = productionManifest.sessionControls.find(
    (s) => s.id === "session:mode",
  );
  if (modeAnn && modeAnn.type === "enum" && typeof modeAnn.default === "string") {
    return modeAnn.default;
  }
  return "ionian";
}

function snapshotCopy(): EngineStateSnapshot {
  // Refresh effective from live pipeline; intents are already
  // authoritative on engineState.
  refreshEffectiveMacros();
  return {
    ...engineState,
    session: { ...engineState.session },
    macros: {
      intents: { ...engineState.macros.intents },
      effective: { ...engineState.macros.effective },
    },
    now: sessionNow(),
  };
}

/* -----------------------------------------------------------------
 * Canvas resize
 * ----------------------------------------------------------------- */
window.addEventListener("resize", () => {
  if (renderer) renderer.resize(window.innerWidth, window.innerHeight);
});

/* -----------------------------------------------------------------
 * Session lifecycle
 * -----------------------------------------------------------------
 *
 * Split into two phases (SPEC 014 §Lifecycle):
 *
 * 1. initializePipeline() — runs on page load. Builds the pipeline
 *    with all consumers (lenses, vocab, stabilizer factories) but
 *    NO adapter and NO render loop. LLM setter calls arriving after
 *    this reach real consumers immediately.
 *
 * 2. attachAdapter(adapter) — runs when the user or LLM picks an
 *    input. First attach (spawned → input-active) creates the
 *    renderer + recent-events buffer, replays accumulated macros to
 *    the fresh pipeline, marks the session started, starts the
 *    render loop. Subsequent attaches (mid-session input swap) do
 *    none of that — the pipeline, vocab, stabilizers, renderer,
 *    buffer, and session clock all carry over.
 *
 * 3. detachCurrentAdapter() — removes whichever adapter is currently
 *    attached, without disposing the pipeline. Used before each
 *    attachAdapter to make the swap clean.
 *
 * 4. stopSession() — full teardown. Only called from the LLM
 *    stop_session tool and beforeunload. Input switches never call
 *    stopSession; they swap via detachCurrentAdapter + attachAdapter.
 */

const PIPELINE_PART_ID = "main";

function initializePipeline(): void {
  if (pipeline) return; // idempotent
  engineState.session.phase = "spawned";
  pipeline = new VisualPipeline({
    canvasSize: { width: canvas.width, height: canvas.height },
    rngSeed: Date.now(),
    partId: PIPELINE_PART_ID,
  });
  pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId: PIPELINE_PART_ID }));
  pipeline.addStabilizerFactory(() => new DynamicsStabilizer({ partId: PIPELINE_PART_ID }));
  pipeline.addStabilizerFactory(() => new ChordDetectionStabilizer({ partId: PIPELINE_PART_ID }));
  pipeline.addStabilizerFactory(() => new HarmonyStabilizer({ partId: PIPELINE_PART_ID }));
  vocabulary = new MusicalVisualVocabulary();
  pipeline.setVocabulary(vocabulary);
  pipeline.addLens(new RhythmLens());
  pipeline.addLens(new HarmonyLens());
  pipeline.addLens(new DynamicsLens());
  pipeline.setCompositor(new IdentityCompositor());
  // Publish the phase transition to "spawned" so the CLI's cached
  // state reflects it. Without this the CLI stays at emptyState()
  // (phase: "no-session") until the first LLM op fires publishState,
  // which is set_input in the standard flow — so start_session's
  // returned state, and any get_state read before set_input, would
  // report "no-session" contradicting the successful spawn.
  // wsReceiver may be null on the very first bootstrap call if
  // mountWsReceiver hasn't run yet; publishState is a no-op in that
  // case (optional chaining on the send). Bootstrap orders
  // mountWsReceiver *before* initializePipeline for this reason.
  publishState();
}

/**
 * Attach `adapter` to the running pipeline. On first attach (session
 * transitioning from `spawned` → `input-active`), also spins up the
 * renderer, the recent-events buffer, primes partStates for macro
 * dispatch, and stamps the session clock. On subsequent attach —
 * a mid-session input swap — the pipeline, vocab, stabilizers,
 * renderer, buffer, and session clock all carry over. No consumer
 * teardown, no state hydration needed.
 *
 * Callers should first detach any previously-attached adapter via
 * detachCurrentAdapter().
 */
function attachAdapter(adapter: RawMidiAdapter | AudioInputAdapter): void {
  if (!pipeline) initializePipeline();
  pipeline!.addAdapter(adapter);

  const firstAttach = engineState.session.phase !== "input-active";
  if (firstAttach) {
    if (!renderer) {
      renderer = new ThreeJSRenderer({ backgroundColor: 0x000000 });
      renderer.attach(canvas);
    }
    if (!recentEvents) {
      recentEvents = attachRecentEventsBuffer(pipeline!, {
        capacity: parseRecentEventsBufferSize(),
      });
    }
    // Prime partStates so pipeline.setMacro dispatch reaches
    // stabilizers on the first replay (partStates are created lazily
    // by requestFrame; without this the initial macro replay
    // silently skips stabilizer-owned macros).
    pipeline!.requestFrame(0);
    // Replay accumulated macro intents into the freshly-initialised
    // consumers.
    for (const [name, value] of Object.entries(engineState.macros.intents)) {
      pipeline!.setMacro(name, value);
    }
    markSessionStarted();
    startRenderLoop();
  }
  // Mid-session swap: nothing else — the caller's next tick of the
  // existing render loop picks up frames from the new adapter.
}

/**
 * Detach whichever adapter is currently attached, if any. Removes it
 * from the pipeline (without disposing the pipeline itself) and stops
 * the adapter's own resources (audio worklet + inference worker for
 * audio; nothing for MIDI, which shares the module-level midiSource).
 */
async function detachCurrentAdapter(): Promise<void> {
  if (midiAdapter) {
    pipeline?.removeAdapter(midiAdapter);
    midiAdapter = null;
  }
  if (audioAdapter) {
    pipeline?.removeAdapter(audioAdapter);
    await audioAdapter.stop().catch(() => {
      /* best effort */
    });
    audioAdapter = null;
  }
  if (keyboardAdapter) {
    pipeline?.removeAdapter(keyboardAdapter);
    keyboardAdapter.stop();
    keyboardAdapter = null;
  }
  if (keyboardSource) {
    keyboardSource.dispose();
    keyboardSource = null;
  }
  if (onScreenKeyboard) {
    onScreenKeyboard.destroy();
    onScreenKeyboard = null;
  }
}

function startRenderLoop(): void {
  function render() {
    if (!pipeline || !renderer) return;
    const sessionMs = performance.now() - sessionStartTime;
    const sceneFrame = pipeline.requestFrame(sessionMs);
    lastSceneFrame = sceneFrame;
    renderer.render(sceneFrame);
    animationFrameId = requestAnimationFrame(render);
  }
  render();
}

/**
 * Full session teardown — disposes the pipeline, detaches the
 * renderer, stops all adapters, clears the recent-events buffer, and
 * resets the session clock. Restores the "pipeline exists after page
 * load" invariant by re-initializing an empty pipeline in spawned
 * phase.
 *
 * Only called from the LLM `stop_session` MCP tool and the browser's
 * `beforeunload` handler. A mid-session input switch (LLM or panel)
 * uses swapCurrentAdapter — which keeps the pipeline, vocab,
 * stabilizers, renderer, buffer, and session clock alive so no state
 * hydration is needed.
 */
function stopSession(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (pipeline) {
    pipeline.dispose();
    pipeline = null;
  }
  if (renderer) {
    renderer.detach();
    renderer = null;
  }
  if (midiAdapter) midiAdapter = null;
  if (audioAdapter) {
    void audioAdapter.stop().catch(() => {
      /* best effort */
    });
    audioAdapter = null;
  }
  if (keyboardAdapter) {
    keyboardAdapter.stop();
    keyboardAdapter = null;
  }
  if (keyboardSource) {
    keyboardSource.dispose();
    keyboardSource = null;
  }
  if (onScreenKeyboard) {
    onScreenKeyboard.destroy();
    onScreenKeyboard = null;
  }
  sessionStartedAtIso = null;
  engineState.startedAt = null;
  engineState.now = null;
  // Adapter is gone; back to spawned phase (pipeline restored below).
  engineState.session.phase = "spawned";
  clearRecentEvents();
  // Restore the invariant so a subsequent LLM setter arriving before
  // the user picks a new input still reaches consumers rather than
  // silent-writing. Macros on the fresh pipeline are empty; the next
  // attachAdapter first-attach replays engineState.macros.intents.
  initializePipeline();
}

/**
 * Mark a session as freshly started — capture both the monotonic
 * reference (for internal `t` math) AND the wall-clock ISO (for the
 * LLM's absolute anchor). Called from every session-start path.
 */
function markSessionStarted(): void {
  sessionStartTime = performance.now();
  sessionStartedAtIso = new Date().toISOString();
  engineState.startedAt = sessionStartedAtIso;
  engineState.now = 0;
  engineState.session.phase = "input-active";
}

/**
 * Start (or swap to) the on-screen keyboard session. No permissions
 * to request and no async device handshake — the source hooks
 * document key events immediately, the adapter starts, and the
 * on-screen UI mounts. This is the boot-default input; a fresh user
 * lands on a working, zero-permission input with no clicks needed.
 */
async function startKeyboardSession(): Promise<void> {
  await detachCurrentAdapter();
  // Ensure engineState reflects the input even when this path is
  // reached from the boot auto-start rather than from set_input().
  engineState.input = "keyboard";
  keyboardSource = new ComputerKeyboardSource();
  keyboardSource.attach();
  const sessionStart = sessionStartTime || performance.now();
  const adapter = new RawMidiAdapter(keyboardSource, {
    sessionStart,
    sourceId: "keyboard",
    streamId: "onscreen-keyboard",
  });
  adapter.start();
  keyboardAdapter = adapter;
  attachAdapter(adapter);
  onScreenKeyboard = mountOnScreenKeyboard(document.body, keyboardSource);
  setStatus("On-screen keyboard — type on Z / A rows to play", "success");
  // Reflect the boot-time selection in the panel dropdown when it
  // eventually mounts.
  basicsPanel?.update({ "input:source": "keyboard" });
}

async function startMidiSession(deviceId: string): Promise<void> {
  if (!midiSource) throw new Error("MIDI source not initialised");
  const info = midiSource.getInputs().find((i) => i.id === deviceId);
  if (!info) throw new Error(`no MIDI device with id ${deviceId}`);
  await detachCurrentAdapter();
  // sessionStartTime is set by markSessionStarted on first attach;
  // for a swap it already reflects the original session start.
  const sessionStart = sessionStartTime || performance.now();
  const adapter = new RawMidiAdapter(midiSource, { sessionStart });
  adapter.start();
  midiAdapter = adapter;
  attachAdapter(adapter);
  setStatus(`MIDI: ${info.name}`, "success");
}

async function startAudioSession(deviceId?: string): Promise<void> {
  await detachCurrentAdapter();
  setStatus(
    deviceId
      ? `Loading audio model + requesting device ${deviceId}…`
      : "Loading audio model + requesting mic…",
  );
  const audioDebug =
    new URLSearchParams(window.location.search).get("audio-debug") === "1";
  const sessionStart = sessionStartTime || performance.now();
  audioAdapter = new AudioInputAdapter({
    sessionStart,
    modelUrl: BASIC_PITCH_MODEL_URL,
    workerUrl: INFERENCE_WORKER_URL,
    workletUrl: AUDIO_CAPTURE_WORKLET_URL,
    debug: audioDebug,
    deviceId,
  });
  try {
    await audioAdapter.start();
    attachAdapter(audioAdapter);
    setStatus(
      deviceId ? `Audio: device ${deviceId}` : "Audio: microphone",
      "success",
    );
    // getUserMedia resolved — mic permission is granted for this
    // origin. Ground truth beats the Permissions-API query's guess.
    setPermission("audio", "granted");
    // Permission was just granted (or previously granted for this
    // origin) — enumerateDevices now returns real labels. Refresh
    // panel options so subsequent user selections see friendly names.
    void refreshInputOptions();
  } catch (err) {
    setStatus(`Audio failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    // Distinguish permission denial from other failures (device
    // missing, over-constrained). NotAllowedError = user blocked mic;
    // everything else is a capability / configuration problem where
    // permission state is untouched by the failure.
    if (err instanceof Error && err.name === "NotAllowedError") {
      setPermission("audio", "denied");
    }
    if (audioAdapter) {
      await audioAdapter.stop().catch(() => {
        /* best effort */
      });
      audioAdapter = null;
    }
    throw err;
  }
}

function setStatus(text: string, kind: "" | "success" | "error" | "warning" = ""): void {
  statusEl.textContent = text;
  statusEl.className = kind ? `syn-status ${kind}` : "syn-status";
}

/**
 * setStatus variant that renders a small subset of markup: `<a href>`.
 * Used only for capability hints that need a clickable link (e.g.
 * the Firefox WebMIDI add-on page). Callers construct HTML strings
 * literally — no untrusted content flows through here.
 */
function setStatusWithLink(
  htmlText: string,
  kind: "" | "success" | "error" | "warning" = "",
): void {
  statusEl.innerHTML = htmlText;
  statusEl.className = kind ? `syn-status ${kind}` : "syn-status";
}

/* -----------------------------------------------------------------
 * Metronome toggle — needs a user gesture (AudioContext)
 * ----------------------------------------------------------------- */
function toggleMetronome(enabled: boolean): void {
  if (!metronome) {
    const ctx = new AudioContext();
    metronome = new Metronome(ctx);
  }
  if (enabled && !metronome.isRunning()) {
    metronome.start(pipeline?.getSessionTime());
  } else if (!enabled && metronome.isRunning()) {
    metronome.stop();
  }
}

/* -----------------------------------------------------------------
 * Input source dispatch — parses "midi:<id>" or "audio" values
 * ----------------------------------------------------------------- */
function handleInputSource(source: string): void {
  if (source === "keyboard") {
    void startKeyboardSession();
  } else if (source === "audio") {
    void startAudioSession();
  } else if (source.startsWith("audio:")) {
    const deviceId = source.slice("audio:".length);
    void startAudioSession(deviceId);
  } else if (source.startsWith("midi:")) {
    void startMidiSession(source.slice("midi:".length));
  } else {
    setStatus(`Unknown input source: ${source}`, "error");
  }
}

/* -----------------------------------------------------------------
 * Panel wiring
 * ----------------------------------------------------------------- */
function currentInputOptions(): Array<{ value: string; label: string }> {
  // Prefer the cached async list (populated on boot + after any input
  // change) so first-render of the panel already shows every detected
  // device, not just MIDI + a single default-audio placeholder. Fall
  // back to the sync path only until the first async enumeration
  // resolves.
  if (cachedInputOptions !== null) return cachedInputOptions;
  return inputsToPanelOptions(enumerateInputsSync(midiSource));
}

/**
 * Async option refresh — enumerates audio devices (with labels once
 * permission is granted) and pushes the merged list into the panel
 * widget and the module-level cache. Called on boot, after MIDI
 * state changes, after each audio session start, and on
 * mediaDevices.devicechange (hot-plug).
 */
async function refreshInputOptions(): Promise<void> {
  const inputs = await enumerateInputs(midiSource);
  cachedInputOptions = inputsToPanelOptions(inputs);
  basicsPanel?.updateOptions("input:source", cachedInputOptions);
}

/**
 * localStorage key marking that the About panel has already been
 * shown-and-dismissed at least once. First-ever load opens About
 * automatically as an orientation gesture; once the user closes it
 * (by any means — X, ESC, click-outside, or switching to another
 * tab) the flag is set and future loads leave About untouched.
 * Wrapped in try/catch — private-mode / storage-disabled browsers
 * still render the app; they just get the auto-open every time,
 * which is the safe fallback for a discoverability gesture.
 */
const ABOUT_SEEN_KEY = "syn:about-seen";

function hasSeenAbout(): boolean {
  try {
    return window.localStorage.getItem(ABOUT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markAboutSeen(): void {
  try {
    window.localStorage.setItem(ABOUT_SEEN_KEY, "1");
  } catch {
    /* private mode / storage disabled — silently drop */
  }
}

function mountPanels(): void {
  const panel = generatePanel(productionManifest);
  // Single dispatch path: panel → applyEngineOp → (pipeline, state
  // mirror, WS publish). LLM-driven calls end up in the same path via
  // wsReceiver.onCall, keeping user + LLM control surfaces coherent.
  const dispatch = bindPanelToEngine({
    onEngineOp: (method, args) => applyEngineOp(method, args),
  });
  const optionsFor = (id: string) => (id === "input:source" ? currentInputOptions() : undefined);

  // Track the previous open state so we can detect "was About, now
  // isn't" — the dismissal moment. onOpenChange fires on every
  // transition (including the auto-open → about), so we need the
  // prev-state check to only stamp on genuine departure.
  let prevOpen: "basics" | "advanced" | "about" | null = null;

  const shell = mountPanelShell({
    host: document.body,
    labels: { basics: "Basics", advanced: "Advanced", about: "About" },
    panelContent: {
      basics: () => {
        basicsPanel = renderPanel({
          panel,
          dispatch,
          optionsFor,
          sectionIds: ["input", "basics"],
        });
        // Sync widgets from current engineState so LLM-driven changes
        // made before this tab was first opened appear correctly.
        basicsPanel.update(collectCurrentPanelValues());
        return basicsPanel.root;
      },
      advanced: () => {
        advancedPanel = renderPanel({
          panel,
          dispatch,
          optionsFor,
          sectionIds: ["advanced"],
        });
        advancedPanel.update(collectCurrentPanelValues());
        return advancedPanel.root;
      },
      about: () => buildAboutPanel(),
    },
    onOpenChange: (id) => {
      if (prevOpen === "about" && id !== "about") markAboutSeen();
      prevOpen = id;
    },
  });

  // First-ever load: open About as the orientation gesture. Any
  // dismissal (X / ESC / click-outside / tab-swap) then flips the
  // localStorage flag via onOpenChange above, so subsequent loads
  // leave About untouched.
  if (!hasSeenAbout()) {
    shell.open("about");
  }
}

/* -----------------------------------------------------------------
 * MIDI enumeration (populates the input:source dropdown)
 * ----------------------------------------------------------------- */
async function initMidi(): Promise<void> {
  // Safari + a few edge cases don't expose Web MIDI at all — surface
  // that clearly instead of hitting the requestMIDIAccess throw path.
  if (typeof navigator.requestMIDIAccess !== "function") {
    const browser = detectBrowser();
    setStatus(
      browser === "safari"
        ? "Safari doesn't support Web MIDI. Use Chrome or Firefox for MIDI input; microphone input still works."
        : "This browser doesn't support Web MIDI. Try Chrome or Firefox for MIDI input; microphone input still works.",
      "warning",
    );
    // No Web MIDI in this browser — permission can never be granted
    // here. Mark denied so the LLM stops suggesting "click Allow".
    setPermission("midi", "denied");
    return;
  }

  try {
    midiSource = new WebMidiSource();
    await midiSource.init();
    // requestMIDIAccess resolved — user allowed (or previously
    // allowed, or the browser doesn't gate this at all). This is the
    // ground truth; overrides whatever the Permissions API said.
    setPermission("midi", "granted");
    const count = midiSource.getInputs().length;
    const sysexNote = midiSource.hasSysExAccess() ? "" : " (SysEx denied — some devices may not appear)";
    setStatus(`MIDI: ${count} device(s) available${sysexNote}`);

    // Firefox sometimes under-enumerates MIDI devices vs Chrome. If
    // we see zero after init and this is Firefox, wait a moment then
    // soften: some hardware just doesn't show up, and Chrome is the
    // reliable fallback for users who need it.
    if (count === 0 && detectBrowser() === "firefox") {
      setTimeout(() => {
        if (midiSource && midiSource.getInputs().length === 0) {
          setStatus(
            "MIDI: no devices detected. Firefox occasionally misses devices Chrome sees — worth checking a Chromium browser if you have hardware connected. Microphone input still works.",
            "warning",
          );
        }
      }, 5000);
    }

    // Hydrate the input:source select in case the Basics panel is
    // open. Sync path first (immediate), then async refresh to pick
    // up audio-device labels once permission is granted.
    basicsPanel?.updateOptions("input:source", currentInputOptions());
    void refreshInputOptions();
    // Watch for device connects/disconnects.
    midiSource.onStateChange(() => {
      basicsPanel?.updateOptions("input:source", currentInputOptions());
      void refreshInputOptions();
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Firefox exposes navigator.requestMIDIAccess but refuses to grant
    // access without the "WebMIDI site permission" add-on installed
    // per-origin. This isn't a permission dialog we can trigger — the
    // user must install the Mozilla add-on themselves. Detect the
    // specific error string and give a clickable install link.
    const isFirefoxAddOnError =
      detectBrowser() === "firefox" &&
      /site permission add-on|permission add-on|WebMIDI/i.test(msg);
    if (isFirefoxAddOnError) {
      // Firefox's WebMIDI has two hard requirements the user must meet
      // BEFORE the page loads — not just reload, RESTART Firefox:
      //
      //   1. At least one MIDI device physically connected
      //   2. Firefox launched WITH that device connected — Firefox
      //      has no MIDI hot-plug support, so devices plugged in
      //      after launch are invisible until Firefox is restarted
      //
      // If both hold, requestMIDIAccess triggers Firefox's inline
      // prompt to install an auto-generated per-origin site
      // permission add-on. Accept → API works.
      //
      // If either condition fails, requestMIDIAccess rejects with
      // 'WebMIDI requires a site permission add-on to activate' —
      // the same error whether no device is connected, Firefox was
      // launched before connecting one, or the user declined the
      // prompt. Nothing in the error distinguishes these cases.
      //
      // Chrome is the reliable path for casual users. Firefox works
      // if the user is willing to sequence the launch correctly.
      setStatusWithLink(
        `MIDI on Firefox needs: (1) a MIDI device connected BEFORE Firefox launches (Firefox doesn't hot-plug), then (2) accept the site-permission add-on prompt it shows. Chrome doesn't need any of this. <a href="https://support.mozilla.org/en-US/kb/site-permission-add-ons" target="_blank" rel="noopener">Learn more</a>. Microphone input works without any of this.`,
        "warning",
      );
    } else {
      setStatus(`MIDI unavailable: ${msg}`, "error");
    }
    // requestMIDIAccess rejected — the user either blocked the prompt,
    // Firefox needs the add-on, or the browser refused. From the LLM's
    // POV, MIDI is unavailable and re-prompting won't help.
    setPermission("midi", "denied");
  }
}

/**
 * Coarse browser detection for capability messaging. Not used for
 * feature switching — always feature-detect first — but for tuning
 * the user-facing hint text.
 */
function detectBrowser(): "chrome" | "firefox" | "safari" | "other" {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return "firefox";
  // Chromium-family (Chrome, Edge, Brave, Opera) all report Chrome/…
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

/* -----------------------------------------------------------------
 * Cleanup on unload
 * ----------------------------------------------------------------- */
window.addEventListener("beforeunload", () => {
  stopSession();
  if (midiSource) {
    midiSource.dispose();
    midiSource = null;
  }
});

/* -----------------------------------------------------------------
 * Frame-capture keyboard shortcut (dev tool)
 * ----------------------------------------------------------------- */
document.addEventListener("keydown", (e) => {
  if (e.key === "c" && !e.ctrlKey && !e.metaKey) captureFrame();
});
function captureFrame(): void {
  if (!lastSceneFrame) return;
  const json = JSON.stringify(
    {
      t: lastSceneFrame.t,
      canvasCss: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      entityCount: lastSceneFrame.entities.length,
      entities: lastSceneFrame.entities.map((e) => ({
        id: e.id,
        kind: e.kind,
        position: e.position,
        style: e.style,
        data: e.data,
      })),
    },
    null,
    2,
  );
  // eslint-disable-next-line no-console
  console.log("FRAME CAPTURE:\n" + json);
  navigator.clipboard.writeText(json).catch(() => {
    /* best effort */
  });
}

// Bootstrap
//
// mountWsReceiver runs BEFORE initializePipeline so that
// initializePipeline's tail publishState() has a receiver to send
// through. This is what puts the "spawned" phase into the CLI's
// cached state before start_session unblocks — see the extended
// comment inside initializePipeline for the "no-session on
// start_session return" bug this ordering prevents.
//
// The CLI won't send any engine ops until it sees pipeline-ready,
// so having mountWsReceiver live before the pipeline exists doesn't
// create a null-pipeline race — pipeline-ready is the gate.
mountPanels();
void initMidi();
// Kick an eager async input enumeration so the widget's dropdown
// reflects every detected audio device on first open — not just the
// single default-audio placeholder from the sync path. Labels stay
// empty (browser privacy gate) until microphone permission is granted;
// after that, refreshInputOptions runs again automatically inside
// startAudioSession's success branch and the real names appear.
void refreshInputOptions();
// Boot default: start the on-screen keyboard immediately. Zero
// permissions, always available, means a fresh user lands on a
// working input with no clicks — no dropdown to hunt through, no
// permission prompt. Users who prefer a MIDI controller or the mic
// switch via the Basics panel's Input dropdown at any time.
void startKeyboardSession();
// Hot-plug: devicechange fires when an audio device is added / removed
// and (in most browsers) when permission state changes such that labels
// become visible for the first time — re-enumerate and re-push both
// times. Guarded on the API's presence; older browsers just miss the
// hot-plug refresh.
if (typeof navigator !== "undefined" && navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener?.("devicechange", () => {
    void refreshInputOptions();
  });
}
mountWsReceiver();
initializePipeline();
void queryPermissionsAndPublish();
// Signal to the CLI that we're wired up and ready to receive engine
// calls that actually take effect on consumers. SessionManager.start()
// on the CLI awaits this before returning ok:true to the LLM, so a
// subsequent set_macro doesn't race a null pipeline. WS is ordered
// per-connection, so the state-changed emitted by initializePipeline
// above lands on the CLI's cache before this pipeline-ready.
wsReceiver?.publishPipelineReady();

/**
 * Query the browser's Permissions API for MIDI + microphone access,
 * populate engineState.permissions, and subscribe to change events
 * so a user clicking Allow / Block fires a state-changed push and
 * the LLM sees the new state on its next read.
 *
 * Falls back to "prompt" for any query the browser refuses to answer
 * (some Firefox / older-Chrome combos don't expose MIDI in the
 * standard Permissions API). "prompt" is the safe default because
 * the LLM's guidance ("click Allow in the tab") reads correctly for
 * both an actual prompt state and an unqueryable one.
 */
async function queryPermissionsAndPublish(): Promise<void> {
  const perms = (navigator as { permissions?: Permissions }).permissions;
  if (!perms) return; // ancient browser; stays at defaults

  const applyChange = (
    kind: "midi" | "audio",
    status: PermissionStatus,
  ): void => {
    engineState.permissions[kind] = status.state as "granted" | "prompt" | "denied";
    publishState();
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const midiStatus = await perms.query({ name: "midi" as any });
    applyChange("midi", midiStatus);
    midiStatus.onchange = () => applyChange("midi", midiStatus);
  } catch {
    // Query unsupported — leave at "prompt".
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const micStatus = await perms.query({ name: "microphone" as any });
    applyChange("audio", micStatus);
    micStatus.onchange = () => applyChange("audio", micStatus);
  } catch {
    // Same.
  }
}

/**
 * Overwrite the observed permission state and publish. Used by the
 * initMidi / startAudioSession outcome paths, which have ground truth
 * ("we actually got MIDIAccess", "getUserMedia rejected with
 * NotAllowedError") that beats whatever the Permissions API's
 * query-and-onchange path returned. See synesthetica-ktm0 — Chrome's
 * Permissions API for MIDI doesn't reliably fire onchange when the
 * user grants access via requestMIDIAccess, so state.permissions.midi
 * would remain "prompt" even while a MIDI device was actively feeding
 * events. This helper's callers wire the observation back into state.
 */
function setPermission(
  kind: "midi" | "audio",
  state: "granted" | "prompt" | "denied",
): void {
  if (engineState.permissions[kind] === state) return;
  engineState.permissions[kind] = state;
  publishState();
}

function mountWsReceiver(): void {
  const params = new URLSearchParams(window.location.search);
  const wsPort = params.get("ws-port");
  const label = params.get("instance") ?? "default";
  if (!wsPort) {
    // Standalone browser use — no CLI to connect to. Panel still
    // works locally; LLM control is unavailable.
    return;
  }
  engineState.instance = label;
  wsReceiver = startWsReceiver({
    url: `ws://${window.location.hostname}:${wsPort}`,
    label,
    onCall: async (method, args) => {
      if (method === "getStateSnapshot") return snapshotCopy();
      if (method === "getAvailableInputs") {
        return enumerateInputs(midiSource);
      }
      if (method === "getRecentEvents") {
        // Wrap the buffered slice in a temporal envelope: startedAt
        // (wall-clock ISO anchor) + now (session-ms at read time)
        // give the LLM a self-contained frame of reference. See
        // synesthetica-lnc's temporal-data addition.
        const [limit, since] = args as [number | undefined, number | undefined];
        const events = recentEvents
          ? recentEvents.get(limit ?? 100, since)
          : [];
        return {
          startedAt: sessionStartedAtIso,
          now: sessionNow(),
          events,
        };
      }
      if (method === "clearRecentEvents") {
        // Drop the buffer contents + diff state, keep the pipeline
        // subscription alive so subsequent frames repopulate. Does
        // NOT touch the session clock, adapters, macros, or any
        // consumer state — only the LLM's history view is cleared.
        recentEvents?.clear();
        return snapshotCopy();
      }
      return applyEngineOp(method, args);
    },
    log: (line) => console.info(line),
  });
}
