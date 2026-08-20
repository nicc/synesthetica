import type { MidiInputInfo } from "@synesthetica/adapters";
import type {
  SceneFrame,
  PitchClass,
  ModeId,
  ChordInterpretationMode,
} from "@synesthetica/contracts";
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
import { renderPanel } from "./panel/renderPanel.js";
import { bindPanelToPipeline } from "./panel/bindPanel.js";

/**
 * InferenceWorker URL — vite's `?worker&url` bundles the entry file
 * as an ES-module Web Worker chunk (following all its imports,
 * including into the adapters package) and returns the emitted URL.
 * This works cleanly for Web Workers.
 */
import INFERENCE_WORKER_URL from "./audio/inference-worker-entry.ts?worker&url";

/**
 * AudioCaptureProcessor URL — hand-written vanilla-JS worklet in
 * public/. Vite serves it verbatim (no bundling, no import
 * resolution). The `?worker&url` pattern that works for Web Workers
 * does NOT reliably work for AudioWorklets — the emitted chunk
 * doesn't call registerProcessor in worklet scope. See the file
 * itself for the full explanation.
 */
const AUDIO_CAPTURE_WORKLET_URL = "/audio-capture-worklet.js";

/**
 * Basic Pitch model URL. Files live under public/models/basic-pitch/
 * (copied from the @spotify/basic-pitch package) so vite serves them
 * as static assets. tfjs fetches the .bin weights alongside model.json.
 */
const BASIC_PITCH_MODEL_URL = "/models/basic-pitch/model.json";

// UI elements
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const midiSelect = document.getElementById("midi-input") as HTMLSelectElement;
const statusDiv = document.getElementById("status") as HTMLDivElement;
const controlsDiv = document.getElementById("controls") as HTMLDivElement;
const toggleControlsBtn = document.getElementById("toggle-controls") as HTMLButtonElement;
const tempoInput = document.getElementById("tempo-input") as HTMLInputElement;
const beatsPerBarInput = document.getElementById("beats-per-bar") as HTMLInputElement;
const beatUnitInput = document.getElementById("beat-unit") as HTMLInputElement;
const clearTempoBtn = document.getElementById("clear-tempo") as HTMLButtonElement;
const toggleMetronomeBtn = document.getElementById("toggle-metronome") as HTMLButtonElement;
const keyRootSelect = document.getElementById("key-root") as HTMLSelectElement;
const keyModeSelect = document.getElementById("key-mode") as HTMLSelectElement;
const clearKeyBtn = document.getElementById("clear-key") as HTMLButtonElement;
const toggleChordModeBtn = document.getElementById("toggle-chord-mode") as HTMLButtonElement;
const toggleAudioBtn = document.getElementById("toggle-audio") as HTMLButtonElement;
const audioStatusDiv = document.getElementById("audio-status") as HTMLDivElement;

// App state
let midiSource: WebMidiSource | null = null;
let pipeline: VisualPipeline | null = null;
let renderer: ThreeJSRenderer | null = null;
let metronome: Metronome | null = null;
let chordMode: ChordInterpretationMode = "harmonic";
/**
 * Currently active audio adapter, if any. Held here so we can tear
 * it down on session switch. Null when audio input is not active.
 */
let audioAdapter: AudioInputAdapter | null = null;
/**
 * Which input path is currently driving the session. Enforces the
 * mutex called for by SPEC 012 — MIDI and audio are exclusive.
 */
let activeInputMode: "none" | "midi" | "audio" = "none";

// Resize canvas to fill viewport
function resizeCanvas() {
  // Pass CSS pixels to Three.js - it handles devicePixelRatio internally
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;

  // Update Three.js renderer if active
  if (renderer) {
    renderer.resize(cssWidth, cssHeight);
  }
}
window.addEventListener("resize", resizeCanvas);
let sessionStartTime: number = 0;
let animationFrameId: number | null = null;

/**
 * Initialize Web MIDI and populate device selector
 */
async function initMidi(): Promise<void> {
  try {
    statusDiv.textContent = "Requesting MIDI access...";

    midiSource = new WebMidiSource();
    await midiSource.init();

    const inputs = midiSource.getInputs();

    if (inputs.length === 0) {
      midiSelect.innerHTML = '<option>No MIDI devices found</option>';
      statusDiv.textContent = "No MIDI devices detected";
      statusDiv.className = "error";
      return;
    }

    // Populate dropdown
    midiSelect.innerHTML = '<option value="">Select a MIDI device...</option>';
    for (const input of inputs) {
      const option = document.createElement("option");
      option.value = input.id;
      option.textContent = input.name;
      midiSelect.appendChild(option);
    }

    midiSelect.disabled = false;
    statusDiv.textContent = `Found ${inputs.length} MIDI device(s)`;
    statusDiv.className = "";

    // Auto-start on device selection
    midiSelect.addEventListener("change", handleDeviceSelection);
  } catch (err) {
    console.error("MIDI initialization failed:", err);
    statusDiv.textContent = "MIDI access denied or unavailable";
    statusDiv.className = "error";
    midiSelect.innerHTML = '<option>MIDI unavailable</option>';
  }
}

/**
 * Handle MIDI device selection - auto-start session
 */
function handleDeviceSelection(): void {
  const deviceId = midiSelect.value;

  if (!deviceId || !midiSource) {
    stopSession();
    return;
  }

  const selectedInput = midiSource.getInputs().find((i) => i.id === deviceId);
  if (!selectedInput) {
    statusDiv.textContent = "Selected device not found";
    statusDiv.className = "error";
    return;
  }

  startSession(selectedInput);
}

/**
 * Build the pipeline + renderer + start the render loop. Adapter is
 * passed in — MIDI or audio, doesn't matter, both produce
 * RawInputFrames the pipeline consumes uniformly.
 */
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
  applyTempoMeterSettings();
  startRenderLoop();
}

/**
 * Start a session with the given MIDI input
 */
function startSession(midiInput: MidiInputInfo): void {
  // Stop any existing session (audio or MIDI)
  stopSession();

  statusDiv.textContent = `Starting session with ${midiInput.name}...`;

  try {
    if (!midiSource) {
      throw new Error("MIDI source not initialized");
    }

    sessionStartTime = performance.now();

    const adapter = new RawMidiAdapter(midiSource, {
      sessionStart: sessionStartTime,
    });
    adapter.start();

    buildAndStartPipeline(adapter);
    activeInputMode = "midi";

    statusDiv.textContent = `Session active: ${midiInput.name}`;
    statusDiv.className = "success";
  } catch (err) {
    console.error("Failed to start session:", err);
    statusDiv.textContent = `Failed to start session: ${err}`;
    statusDiv.className = "error";
    stopSession();
  }
}

/**
 * Start a session with microphone audio input via Basic Pitch.
 *
 * Loads the model, requests mic permission, and wires the audio
 * adapter into the pipeline. Any active MIDI session is torn down
 * first — MIDI and audio are exclusive per SPEC 012.
 */
async function startAudioSession(): Promise<void> {
  stopSession();

  toggleAudioBtn.disabled = true;
  toggleAudioBtn.textContent = "Loading model…";
  audioStatusDiv.textContent = "Fetching Basic Pitch model + requesting mic…";
  statusDiv.textContent = "Starting audio session…";
  statusDiv.className = "";

  try {
    sessionStartTime = performance.now();

    // `?audio-debug=1` on the URL turns on per-event console logging
    // in the adapter. Useful when the visualisation looks quiet and
    // we need to confirm whether the model is producing events at all.
    const audioDebug =
      new URLSearchParams(window.location.search).get("audio-debug") === "1";

    audioAdapter = new AudioInputAdapter({
      sessionStart: sessionStartTime,
      modelUrl: BASIC_PITCH_MODEL_URL,
      workerUrl: INFERENCE_WORKER_URL,
      workletUrl: AUDIO_CAPTURE_WORKLET_URL,
      debug: audioDebug,
    });

    // Kicks off getUserMedia (permission prompt), audio context
    // creation, worklet + worker init, and model load. Resolves
    // when the worker reports "ready".
    await audioAdapter.start();

    buildAndStartPipeline(audioAdapter);
    activeInputMode = "audio";

    toggleAudioBtn.textContent = "Disable microphone";
    toggleAudioBtn.disabled = false;
    audioStatusDiv.textContent = "Listening (Basic Pitch)";
    statusDiv.textContent = "Session active: microphone";
    statusDiv.className = "success";

    // Deselect MIDI so the UI reflects reality.
    if (midiSelect.value) midiSelect.value = "";
  } catch (err) {
    console.error("Failed to start audio session:", err);
    toggleAudioBtn.textContent = "Enable microphone";
    toggleAudioBtn.disabled = false;
    audioStatusDiv.textContent =
      err instanceof Error ? `Error: ${err.message}` : "Failed to start audio";
    statusDiv.textContent = "Audio session failed — see below";
    statusDiv.className = "error";
    if (audioAdapter) {
      await audioAdapter.stop().catch(() => {
        /* best effort */
      });
      audioAdapter = null;
    }
    activeInputMode = "none";
  }
}

/**
 * Stop the current session — handles both MIDI and audio adapters.
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

  // Audio adapter cleanup — releases mic, closes AudioContext,
  // terminates the inference worker. Fire-and-forget the promise;
  // stop() is best-effort on teardown.
  if (audioAdapter) {
    void audioAdapter.stop().catch(() => {
      /* best effort */
    });
    audioAdapter = null;
    toggleAudioBtn.textContent = "Enable microphone";
    toggleAudioBtn.disabled = false;
    audioStatusDiv.textContent = "";
  }

  activeInputMode = "none";

  if (statusDiv.className === "success") {
    statusDiv.textContent = "Session stopped";
    statusDiv.className = "";
  }
}

/**
 * Toggle the microphone session — enable if off, disable if on.
 * Fires on user gesture (click), which is required by browsers for
 * getUserMedia and AudioContext instantiation.
 */
function toggleAudio(): void {
  if (activeInputMode === "audio") {
    stopSession();
    return;
  }
  void startAudioSession();
}

// Debug counter for throttled logging
let _debugFrameCount = 0;
let lastSceneFrame: SceneFrame | null = null;

/**
 * Capture current frame to console as JSON (press 'c' to capture)
 * - Outputs as single JSON log entry
 * - Copies to clipboard for easy sharing
 * - Includes Three.js world coordinate calculations
 */
function captureFrame(): void {
  if (!lastSceneFrame) {
    console.log("No frame captured yet");
    return;
  }

  // Three.js world dimensions (must match ThreeJSRenderer defaults)
  const WORLD_WIDTH = 100;
  const WORLD_HEIGHT = 75;

  const entities = lastSceneFrame.entities.map((e) => {
    const normX = e.position?.x ?? 0.5;
    const normY = e.position?.y ?? 0.5;
    // Match ThreeJSRenderer coordinate transform (Y-flip, world space)
    const worldX = normX * WORLD_WIDTH;
    const worldY = (1 - normY) * WORLD_HEIGHT;

    return {
      id: e.id,
      kind: e.kind,
      position: e.position,
      threeWorldCoords: { x: worldX.toFixed(1), y: worldY.toFixed(1) },
      style: e.style,
      data: e.data,
    };
  });

  const capture = {
    t: lastSceneFrame.t,
    canvasCss: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    threeWorld: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    entityCount: entities.length,
    entities,
  };

  const json = JSON.stringify(capture, null, 2);

  // Single log entry
  console.log("FRAME CAPTURE:\n" + json);

  // Copy to clipboard
  navigator.clipboard.writeText(json).then(
    () => console.log("(Copied to clipboard)"),
    (err) => console.warn("Failed to copy to clipboard:", err)
  );
}

// Keyboard shortcut for frame capture
document.addEventListener("keydown", (e) => {
  if (e.key === "c" && !e.ctrlKey && !e.metaKey) {
    captureFrame();
  }
});

/**
 * Render loop - pull-based frame production
 */
function startRenderLoop(): void {
  function render() {
    if (!pipeline || !renderer) return;

    // Calculate session time (ms since session start)
    const sessionMs = performance.now() - sessionStartTime;

    // Request frame from pipeline
    const sceneFrame = pipeline.requestFrame(sessionMs);
    lastSceneFrame = sceneFrame;

    _debugFrameCount++;

    // Render to canvas
    renderer.render(sceneFrame);

    // Continue loop
    animationFrameId = requestAnimationFrame(render);
  }

  render();
}

/**
 * Cleanup on page unload
 */
window.addEventListener("beforeunload", () => {
  stopSession();
  if (midiSource) {
    midiSource.dispose();
    midiSource = null;
  }
});

/**
 * Toggle visibility of controls panel
 */
function toggleControls(): void {
  const isHidden = controlsDiv.classList.toggle("hidden");
  toggleControlsBtn.textContent = isHidden ? "Show Controls" : "Hide Controls";
}

/**
 * Apply tempo and meter settings to the pipeline
 */
function applyTempoMeterSettings(): void {
  if (!pipeline) return;

  // Apply tempo
  const tempoValue = tempoInput.value ? parseInt(tempoInput.value, 10) : null;
  if (tempoValue !== null && tempoValue >= 20 && tempoValue <= 300) {
    pipeline.setTempo(tempoValue);
    metronome?.setTempo(tempoValue);
  } else {
    pipeline.setTempo(null);
    metronome?.setTempo(null);
  }

  // Apply meter
  const beatsPerBar = beatsPerBarInput.value ? parseInt(beatsPerBarInput.value, 10) : null;
  const beatUnit = beatUnitInput.value ? parseInt(beatUnitInput.value, 10) : 4;

  if (beatsPerBar !== null && beatsPerBar >= 1 && beatsPerBar <= 16) {
    pipeline.setMeter(beatsPerBar, beatUnit);
    metronome?.setMeter(beatsPerBar);
  } else {
    pipeline.setMeter(null);
  }
}

/**
 * Clear tempo and meter settings
 */
function clearTempoMeter(): void {
  tempoInput.value = "";
  beatsPerBarInput.value = "";
  beatUnitInput.value = "";

  if (pipeline) {
    pipeline.clearTempoAndMeter();
  }
  metronome?.setTempo(null);
  updateMetronomeButton();
}

/**
 * Toggle metronome on/off. Creates the AudioContext + Metronome on
 * first use (requires a user gesture). Only starts if a tempo is set.
 */
function toggleMetronome(): void {
  if (!metronome) {
    const ctx = new AudioContext();
    metronome = new Metronome(ctx);
    // Sync current tempo/meter state
    const tempoValue = tempoInput.value ? parseInt(tempoInput.value, 10) : null;
    if (tempoValue !== null && tempoValue >= 20 && tempoValue <= 300) {
      metronome.setTempo(tempoValue);
    }
    const beatsPerBar = beatsPerBarInput.value ? parseInt(beatsPerBarInput.value, 10) : 4;
    metronome.setMeter(beatsPerBar);
  }

  if (metronome.isRunning()) {
    metronome.stop();
  } else {
    // Phase-align to the pipeline's session clock so clicks fall on
    // the same beat boundaries as the visual grid.
    const sessionTime = pipeline?.getSessionTime();
    metronome.start(sessionTime);
  }
  updateMetronomeButton();
}

function updateMetronomeButton(): void {
  const running = metronome?.isRunning() ?? false;
  toggleMetronomeBtn.textContent = running ? "Metronome: On" : "Metronome: Off";
}

/**
 * Apply key settings from the UI to the pipeline
 */
function applyKeySettings(): void {
  if (!pipeline) return;

  const rootValue = keyRootSelect.value;
  if (rootValue === "") {
    pipeline.setKey(null);
    return;
  }

  const root = parseInt(rootValue, 10) as PitchClass;
  const mode = keyModeSelect.value as ModeId;
  pipeline.setKey({ root, mode });
}

/**
 * Clear key setting
 */
function clearKey(): void {
  keyRootSelect.value = "";
  if (pipeline) {
    pipeline.setKey(null);
  }
}

/**
 * Toggle between harmonic and bass-led chord interpretation.
 * See SPEC_010 for what these modes mean.
 */
function toggleChordMode(): void {
  chordMode = chordMode === "harmonic" ? "bass-led" : "harmonic";
  pipeline?.setChordInterpretation(chordMode);
  toggleChordModeBtn.textContent =
    chordMode === "harmonic" ? "Chord mode: Harmonic" : "Chord mode: Bass-led";
}

// Event listeners for controls
toggleControlsBtn.addEventListener("click", toggleControls);
tempoInput.addEventListener("change", applyTempoMeterSettings);
beatsPerBarInput.addEventListener("change", applyTempoMeterSettings);
beatUnitInput.addEventListener("change", applyTempoMeterSettings);
clearTempoBtn.addEventListener("click", clearTempoMeter);
toggleMetronomeBtn.addEventListener("click", toggleMetronome);
keyRootSelect.addEventListener("change", applyKeySettings);
keyModeSelect.addEventListener("change", applyKeySettings);
clearKeyBtn.addEventListener("click", clearKey);
toggleChordModeBtn.addEventListener("click", toggleChordMode);
toggleAudioBtn.addEventListener("click", toggleAudio);

// Initialize on load
initMidi();
mountGeneratedPanel();

/**
 * Mount the manifest-generated control panel. Renders once at startup;
 * dispatches user changes through the same pipeline setters MCP tools
 * will use once wired (SPEC 013 §UI Controls, §Engine Channel).
 */
function mountGeneratedPanel(): void {
  const host = document.getElementById("generated-panel");
  if (!host) return;
  const panel = generatePanel(productionManifest);
  const dispatch = bindPanelToPipeline({
    getPipeline: () => pipeline,
    getMetronome: () => metronome,
    onMetronomeToggle: (enabled) => {
      // Reuse the existing toggle path so metronome AudioContext
      // setup (which requires a user gesture) stays in one place.
      if (enabled !== (metronome?.isRunning() ?? false)) {
        toggleMetronome();
      }
    },
  });
  const rendered = renderPanel({ panel, dispatch });
  host.appendChild(rendered.root);
}
