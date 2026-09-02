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
} from "@synesthetica/adapters";
import {
  VisualPipeline,
  ThreeJSRenderer,
  NoteTrackingStabilizer,
  ChordDetectionStabilizer,
  HarmonyStabilizer,
  MusicalVisualVocabulary,
  RhythmGrammar,
  HarmonyGrammar,
  DynamicsGrammar,
  DynamicsStabilizer,
  IdentityCompositor,
  Metronome,
} from "@synesthetica/engine";
import { renderPanel, type RenderedPanel } from "./panel/renderPanel.js";
import { bindPanelToEngine } from "./panel/bindPanel.js";
import { mountPanelShell } from "./panel/panelShell.js";
import { buildAboutPanel } from "./panel/aboutPanel.js";
import { startWsReceiver, type WsReceiverHandle } from "./engine/wsReceiver.js";
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
let renderer: ThreeJSRenderer | null = null;
let metronome: Metronome | null = null;
let audioAdapter: AudioInputAdapter | null = null;
let sessionStartTime = 0;
let animationFrameId: number | null = null;
let lastSceneFrame: SceneFrame | null = null;
let basicsPanel: RenderedPanel | null = null;
let advancedPanel: RenderedPanel | null = null;
let wsReceiver: WsReceiverHandle | null = null;

// State snapshot we publish back to the CLI over WS. Kept in sync
// with pipeline mutations; every setter update also mirrors here so
// the CLI's WSBackedEngineHandle can return it to MCP callers.
const engineState: EngineStateSnapshot = {
  instance: "default",
  macros: {},
  session: {
    tonic: null,
    mode: null,
    tempo: null,
    beatsPerBar: null,
    beatValue: null,
    chordMode: "harmonic",
    metronome: false,
  },
  input: null,
  activePreset: null,
};

/** Publish the current engineState snapshot to the CLI. */
function publishState(): void {
  wsReceiver?.publishStateChanged({
    ...engineState,
    session: { ...engineState.session },
    macros: { ...engineState.macros },
  });
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
      engineState.macros[name] = value;
      // Macro plumbing to pipeline setters lands with the tier-1 work
      // (synesthetica-1wq). For now the state mirror is truthful even
      // if the pipeline hasn't wired the parameter yet.
      break;
    }
    case "setInput": {
      const [source] = args as [string];
      engineState.input = source;
      handleInputSource(source);
      break;
    }
    case "setHueForPitch": {
      // Placeholder — engine plumbing lands with the hue-anchor macro.
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
  return {
    ...engineState,
    session: { ...engineState.session },
    macros: { ...engineState.macros },
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
 * ----------------------------------------------------------------- */
function buildAndStartPipeline(
  adapter: RawMidiAdapter | AudioInputAdapter,
): void {
  const partId = "main";
  pipeline = new VisualPipeline({
    canvasSize: { width: canvas.width, height: canvas.height },
    rngSeed: Date.now(),
    partId,
  });
  pipeline.addAdapter(adapter);
  pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
  pipeline.addStabilizerFactory(() => new DynamicsStabilizer({ partId }));
  pipeline.addStabilizerFactory(() => new ChordDetectionStabilizer({ partId }));
  pipeline.addStabilizerFactory(() => new HarmonyStabilizer({ partId }));
  pipeline.setVocabulary(new MusicalVisualVocabulary());
  pipeline.addGrammar(new RhythmGrammar());
  pipeline.addGrammar(new HarmonyGrammar());
  pipeline.addGrammar(new DynamicsGrammar());
  pipeline.setCompositor(new IdentityCompositor());

  renderer = new ThreeJSRenderer({ backgroundColor: 0x000000 });
  renderer.attach(canvas);

  pipeline.reset();
  startRenderLoop();
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
  if (audioAdapter) {
    void audioAdapter.stop().catch(() => {
      /* best effort */
    });
    audioAdapter = null;
  }
}

async function startMidiSession(deviceId: string): Promise<void> {
  stopSession();
  if (!midiSource) throw new Error("MIDI source not initialised");
  const info = midiSource.getInputs().find((i) => i.id === deviceId);
  if (!info) throw new Error(`no MIDI device with id ${deviceId}`);
  sessionStartTime = performance.now();
  const adapter = new RawMidiAdapter(midiSource, { sessionStart: sessionStartTime });
  adapter.start();
  buildAndStartPipeline(adapter);
  setStatus(`MIDI: ${info.name}`, "success");
}

async function startAudioSession(): Promise<void> {
  stopSession();
  setStatus("Loading audio model + requesting mic…");
  sessionStartTime = performance.now();
  const audioDebug =
    new URLSearchParams(window.location.search).get("audio-debug") === "1";
  audioAdapter = new AudioInputAdapter({
    sessionStart: sessionStartTime,
    modelUrl: BASIC_PITCH_MODEL_URL,
    workerUrl: INFERENCE_WORKER_URL,
    workletUrl: AUDIO_CAPTURE_WORKLET_URL,
    debug: audioDebug,
  });
  try {
    await audioAdapter.start();
    buildAndStartPipeline(audioAdapter);
    setStatus("Audio: microphone", "success");
  } catch (err) {
    setStatus(`Audio failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    if (audioAdapter) {
      await audioAdapter.stop().catch(() => {
        /* best effort */
      });
      audioAdapter = null;
    }
    throw err;
  }
}

function setStatus(text: string, kind: "" | "success" | "error" = ""): void {
  statusEl.textContent = text;
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
  if (source === "audio") {
    void startAudioSession();
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
  const options: Array<{ value: string; label: string }> = [];
  if (midiSource) {
    for (const input of midiSource.getInputs()) {
      options.push({ value: `midi:${input.id}`, label: `MIDI: ${input.name}` });
    }
  }
  options.push({ value: "audio", label: "Audio: microphone (Basic Pitch)" });
  return options;
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

  mountPanelShell({
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
        return basicsPanel.root;
      },
      advanced: () => {
        advancedPanel = renderPanel({
          panel,
          dispatch,
          optionsFor,
          sectionIds: ["advanced"],
        });
        return advancedPanel.root;
      },
      about: () => buildAboutPanel(),
    },
  });
}

/* -----------------------------------------------------------------
 * MIDI enumeration (populates the input:source dropdown)
 * ----------------------------------------------------------------- */
async function initMidi(): Promise<void> {
  try {
    midiSource = new WebMidiSource();
    await midiSource.init();
    setStatus(`MIDI: ${midiSource.getInputs().length} device(s) available`);
    // Hydrate the input:source select in case the Basics panel is open.
    basicsPanel?.updateOptions("input:source", currentInputOptions());
    // Watch for device connects/disconnects.
    midiSource.onStateChange(() => {
      basicsPanel?.updateOptions("input:source", currentInputOptions());
    });
  } catch (err) {
    setStatus(
      `MIDI unavailable: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  }
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
mountPanels();
void initMidi();
mountWsReceiver();

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
      if (method === "getRecentEvents") {
        // Recent events aren't buffered here yet; return an empty
        // window rather than failing. Full buffer lands as engine
        // wiring extends.
        return [] as unknown[];
      }
      return applyEngineOp(method, args);
    },
    log: (line) => console.info(line),
  });
}
