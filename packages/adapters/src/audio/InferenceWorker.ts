/**
 * InferenceWorker — runs in a Web Worker, hosts the Basic Pitch model
 * and emits note events back to the main thread (SPEC 012).
 *
 * Inputs:
 *   - SAB-backed AudioRing (samples written by the AudioCaptureWorklet
 *     on the audio thread).
 *   - "init" message with model URL, inference cadence, and tuning
 *     parameters.
 *
 * Outputs (via self.postMessage):
 *   - "ready" once the model is loaded.
 *   - "error" if anything fatal happens.
 *   - "audio_note_on" / "audio_note_off" / "audio_pitch_bend" events
 *     timestamped to absolute sample indices.
 *
 * Behaviour every inference tick (default every hopMs = 50ms):
 *   1. Peek the latest windowSamples from the ring.
 *   2. Run BasicPitch.evaluateSingleFrame and decode to notes.
 *   3. Hand notes + current tracked state to processDetectedNotes,
 *      which returns the events to post and the next state
 *      (see AudioDetectionTracker for the note-tracking logic and
 *      SPEC 012 §"Model window constraint" for the guarantees).
 *   4. Post events, replace tracked state.
 */

import * as tf from "@tensorflow/tfjs";
// WASM backend registers itself as a side effect of import. Required
// in this worker: WebGL backend depends on OffscreenCanvas plumbing
// and touches `window` during tensor readback, which throws in
// DedicatedWorkerGlobalScope. WASM is a clean fit — no DOM, ~115ms
// inference per the synesthetica-w1z spike.
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import "@tensorflow/tfjs-backend-wasm";
import {
  BasicPitch,
  outputToNotesPoly,
  addPitchBendsToNoteEvents,
} from "@spotify/basic-pitch";
import { AudioRing } from "./AudioRing";
import type { MainToWorker, WorkerToMain } from "./workerProtocol";
import {
  processDetectedNotes,
  flushAllActiveNotes,
  emptyTrackingState,
  type TrackingState,
  type TrackingConfig,
  type DetectedNote,
  type PitchBendSample,
  type TrackerEvent,
} from "./AudioDetectionTracker";

// Basic Pitch constants — duplicated from the package so we don't
// need to peek at its internals at runtime. Verified in
// synesthetica-w1z spike.
const FFT_HOP = 256;

interface WorkerState {
  ring: AudioRing | null;
  windowBuffer: Float32Array | null;
  basicPitch: BasicPitch | null;
  intervalId: ReturnType<typeof setInterval> | null;
  config: {
    sampleRate: number;
    hopMs: number;
    windowSamples: number;
    onsetThreshold: number;
    frameThreshold: number;
    minNoteLengthFrames: number;
  } | null;
  tracking: TrackingConfig | null;
  trackingState: TrackingState;
}

const state: WorkerState = {
  ring: null,
  windowBuffer: null,
  basicPitch: null,
  intervalId: null,
  config: null,
  tracking: null,
  trackingState: emptyTrackingState(),
};

function post(msg: WorkerToMain) {
  (self as DedicatedWorkerGlobalScope).postMessage(msg);
}

function postTrackerEvent(event: TrackerEvent): void {
  switch (event.type) {
    case "note_on":
      post({
        type: "audio_note_on",
        sampleIndex: event.sampleIndex,
        noteId: event.noteId,
        pitch: event.pitch,
        velocity: event.velocity,
        confidence: event.confidence,
      });
      return;
    case "note_off":
      post({
        type: "audio_note_off",
        sampleIndex: event.sampleIndex,
        noteId: event.noteId,
        confidence: event.confidence,
      });
      return;
    case "pitch_bend":
      post({
        type: "audio_pitch_bend",
        sampleIndex: event.sampleIndex,
        noteId: event.noteId,
        semitones: event.semitones,
        confidence: event.confidence,
      });
      return;
  }
}

async function init(message: Extract<MainToWorker, { type: "init" }>) {
  try {
    state.ring = new AudioRing(message.ring);
    state.windowBuffer = new Float32Array(message.windowSamples);
    state.config = {
      sampleRate: message.sampleRate,
      hopMs: message.hopMs,
      windowSamples: message.windowSamples,
      onsetThreshold: message.onsetThreshold,
      frameThreshold: message.frameThreshold,
      minNoteLengthFrames: message.minNoteLengthFrames,
    };
    state.tracking = {
      onsetThreshold: message.onsetThreshold,
      frameThreshold: message.frameThreshold,
      restrikeGapSamples: message.restrikeGapSamples,
      noteOffTimeoutSamples: message.noteOffTimeoutSamples,
      freshOnsetMaxAgeSamples: message.freshOnsetMaxAgeSamples,
    };
    state.trackingState = emptyTrackingState();

    // WASM backend. Point tfjs at the .wasm binaries served
    // alongside the model files by the web app. Falls back to CPU
    // (pure JS, ~10× slower) if WASM init fails for any reason.
    try {
      setWasmPaths("/models/tfjs-wasm/");
      await tf.setBackend("wasm");
      await tf.ready();
    } catch {
      await tf.setBackend("cpu");
      await tf.ready();
    }

    const model = await tf.loadGraphModel(message.modelUrl);
    state.basicPitch = new BasicPitch(Promise.resolve(model));
    await state.basicPitch.model;

    state.intervalId = setInterval(runInference, message.hopMs);

    post({ type: "ready" });
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function stop() {
  if (state.intervalId !== null) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  // Best-effort: emit note-off for any still-active notes so
  // downstream stabilizers can wrap them up cleanly.
  if (state.ring) {
    const head = state.ring.head();
    const flushEvents = flushAllActiveNotes(state.trackingState, head);
    for (const event of flushEvents) postTrackerEvent(event);
  }
  state.trackingState = emptyTrackingState();
}

async function runInference() {
  const cfg = state.config;
  const trackingCfg = state.tracking;
  const ring = state.ring;
  const bp = state.basicPitch;
  const buf = state.windowBuffer;
  if (!cfg || !trackingCfg || !ring || !bp || !buf) return;
  if (ring.available() < cfg.windowSamples) return; // not enough audio yet

  // Snapshot the head; the peek that follows will read at-or-before
  // this. Tiny race here is acceptable — the latency budget tolerates
  // a few sample-times of drift.
  ring.peekLatest(buf);
  const headAfter = ring.head();
  const windowStartSample = (headAfter - cfg.windowSamples) >>> 0;

  // Reshape audio to [1, windowSamples, 1] and run the model.
  const tensor = tf.tensor(buf).reshape([1, cfg.windowSamples, 1]) as tf.Tensor3D;
  let frames: number[][];
  let onsets: number[][];
  let contours: number[][];
  try {
    const [framesT, onsetsT, contoursT] = await bp.evaluateSingleFrame(tensor, 0);
    frames = (await framesT.array())[0];
    onsets = (await onsetsT.array())[0];
    contours = (await contoursT.array())[0];
    framesT.dispose();
    onsetsT.dispose();
    contoursT.dispose();
  } finally {
    tensor.dispose();
  }

  // Decode posteriors → notes (with onset times, durations, amplitudes,
  // and per-frame pitch-bend curves).
  const rawNotes = outputToNotesPoly(
    frames,
    onsets,
    cfg.onsetThreshold,
    cfg.frameThreshold,
    cfg.minNoteLengthFrames,
  );
  const notesWithBends = addPitchBendsToNoteEvents(contours, rawNotes);

  // Convert model output to absolute-sample DetectedNotes and hand
  // to the tracker kernel. All coordinate resolution (frame → sample,
  // window-relative → absolute) happens here so the tracker stays
  // decoupled from Basic Pitch's frame model.
  const detected: DetectedNote[] = notesWithBends.map((note) => {
    const onsetSampleInWindow = note.startFrame * FFT_HOP;
    const absoluteOnsetSample = (windowStartSample + onsetSampleInWindow) >>> 0;
    const endFrame = note.startFrame + note.durationFrames;
    const endSampleInWindow = endFrame * FFT_HOP;
    const absoluteLastSeenSample = (windowStartSample + endSampleInWindow) >>> 0;

    // Precompute pitch-bend timestamps. We emit these once at note-
    // on and never again for the same note — the bends array is
    // relative to *this pass's* predicted onset, which drifts across
    // passes, so re-emitting wouldn't align to consistent timestamps.
    let pitchBends: PitchBendSample[] | undefined;
    if (note.pitchBends && note.pitchBends.length > 0) {
      pitchBends = note.pitchBends.map((semitones, i) => ({
        sampleIndex: (absoluteOnsetSample + i * FFT_HOP) >>> 0,
        semitones,
      }));
    }

    return {
      pitch: note.pitchMidi,
      absoluteOnsetSample,
      absoluteLastSeenSample,
      amplitude: note.amplitude,
      pitchBends,
    };
  });

  const { events, next } = processDetectedNotes(
    state.trackingState,
    detected,
    headAfter,
    trackingCfg,
  );
  state.trackingState = next;
  for (const event of events) postTrackerEvent(event);
}

/**
 * Wire this worker's onmessage handler into the current Worker global
 * scope. Call this from a worker entry file loaded via
 * `new Worker(new URL('./entry.ts', import.meta.url), { type: 'module' })`.
 * Wrapping in a function (rather than assigning at module top-level)
 * lets the module be imported for its types from a non-worker
 * context without side effects.
 */
export function installInferenceWorker(): void {
  self.onmessage = (event: MessageEvent<MainToWorker>) => {
    const msg = event.data;
    switch (msg.type) {
      case "init":
        void init(msg);
        break;
      case "stop":
        stop();
        break;
    }
  };
}
