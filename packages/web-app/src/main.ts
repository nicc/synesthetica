import type { MidiInputInfo } from "@synesthetica/adapters";
import type { SceneFrame } from "@synesthetica/contracts";
import { RawMidiAdapter, WebMidiSource } from "@synesthetica/adapters";
import {
  VisualPipeline,
  ThreeJSRenderer,
  NoteTrackingStabilizer,
  ChordDetectionStabilizer,
  BeatDetectionStabilizer,
  HarmonicProgressionStabilizer,
  MusicalVisualVocabulary,
  RhythmGrammar,
  HarmonyGrammar,
  IdentityCompositor,
} from "@synesthetica/engine";

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

// App state
let midiSource: WebMidiSource | null = null;
let pipeline: VisualPipeline | null = null;
let renderer: ThreeJSRenderer | null = null;

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
 * Start a session with the given MIDI input
 */
function startSession(midiInput: MidiInputInfo): void {
  // Stop any existing session
  stopSession();

  statusDiv.textContent = `Starting session with ${midiInput.name}...`;

  try {
    if (!midiSource) {
      throw new Error("MIDI source not initialized");
    }

    // Set session start time
    sessionStartTime = performance.now();

    // Create adapter
    const adapter = new RawMidiAdapter(midiSource, {
      sessionStart: sessionStartTime,
    });

    // Start listening to MIDI
    adapter.start();

    // Create pipeline with RFC 005 components
    const partId = "main";
    pipeline = new VisualPipeline({
      canvasSize: { width: canvas.width, height: canvas.height },
      rngSeed: Date.now(),
      partId,
    });

    // Wire up components
    pipeline.addAdapter(adapter);
    pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
    pipeline.addStabilizerFactory(() => new ChordDetectionStabilizer({ partId }));
    pipeline.addStabilizerFactory(() => new BeatDetectionStabilizer({ partId }));
    pipeline.addStabilizerFactory(() => new HarmonicProgressionStabilizer({ partId }));
    pipeline.setVocabulary(new MusicalVisualVocabulary());
    // Use grammars - they'll be composited together
    pipeline.addGrammar(new RhythmGrammar());
    pipeline.addGrammar(new HarmonyGrammar());
    pipeline.setCompositor(new IdentityCompositor());

    // Create renderer
    renderer = new ThreeJSRenderer({
      backgroundColor: 0x000000,
    });
    renderer.attach(canvas);

    // Reset pipeline (initializes stabilizers, sets T=0)
    pipeline.reset();

    // Apply any existing tempo/meter settings
    applyTempoMeterSettings();

    // Start render loop
    startRenderLoop();

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
 * Stop the current session
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

  if (statusDiv.className === "success") {
    statusDiv.textContent = "Session stopped";
    statusDiv.className = "";
  }
}

// Debug counter for throttled logging
let debugFrameCount = 0;
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

    // Debug: log entity counts every 60 frames (~1 second)
    debugFrameCount++;
    if (debugFrameCount % 60 === 0) {
      const typeCounts = new Map<string, number>();
      for (const e of sceneFrame.entities) {
        const type = (e.data?.type as string) || e.kind;
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }
      if (typeCounts.size > 0) {
        const parts = Array.from(typeCounts.entries())
          .map(([type, count]) => `${type}:${count}`)
          .join(", ");
        console.log(`t=${Math.round(sessionMs)}ms: ${parts}`);
      }
    }

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
  } else {
    pipeline.setTempo(null);
  }

  // Apply meter
  const beatsPerBar = beatsPerBarInput.value ? parseInt(beatsPerBarInput.value, 10) : null;
  const beatUnit = beatUnitInput.value ? parseInt(beatUnitInput.value, 10) : 4;

  if (beatsPerBar !== null && beatsPerBar >= 1 && beatsPerBar <= 16) {
    pipeline.setMeter(beatsPerBar, beatUnit);
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
}

// Event listeners for tempo/meter controls
toggleControlsBtn.addEventListener("click", toggleControls);
tempoInput.addEventListener("change", applyTempoMeterSettings);
beatsPerBarInput.addEventListener("change", applyTempoMeterSettings);
beatUnitInput.addEventListener("change", applyTempoMeterSettings);
clearTempoBtn.addEventListener("click", clearTempoMeter);

// Initialize on load
initMidi();
