import type { MidiInputInfo } from "@synesthetica/adapters";
import { RawMidiAdapter, WebMidiSource } from "@synesthetica/adapters";
import {
  VisualPipeline,
  Canvas2DRenderer,
  NoteTrackingStabilizer,
  MusicalVisualRuleset,
  VisualParticleGrammar,
  IdentityCompositor,
} from "@synesthetica/engine";

// UI elements
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const midiSelect = document.getElementById("midi-input") as HTMLSelectElement;
const statusDiv = document.getElementById("status") as HTMLDivElement;

// Resize canvas to fill viewport
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// App state
let midiSource: WebMidiSource | null = null;
let pipeline: VisualPipeline | null = null;
let renderer: Canvas2DRenderer | null = null;
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
    pipeline.setStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
    pipeline.setRuleset(new MusicalVisualRuleset());
    pipeline.addGrammar(new VisualParticleGrammar());
    pipeline.setCompositor(new IdentityCompositor());

    // Create renderer
    renderer = new Canvas2DRenderer({
      backgroundColor: "#000000",
      clearEachFrame: true,
    });
    renderer.attach(canvas);

    // Reset pipeline (initializes stabilizers, sets T=0)
    pipeline.reset();

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

// Initialize on load
initMidi();
