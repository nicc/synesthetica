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
 *   1. Read current ring head (samples written so far).
 *   2. Peek the latest windowSamples into a pre-allocated Float32Array.
 *   3. Run BasicPitch.evaluateSingleFrame.
 *   4. Convert posteriors to notes via outputToNotesPoly +
 *      addPitchBendsToNoteEvents.
 *   5. For each note: dedup against recently-emitted onsets,
 *      emit note-on / pitch-bend events.
 *   6. For each currently-active note: if not re-detected within
 *      noteOffTimeoutSamples, emit note-off.
 *
 * Tunables (all exposed via WorkerInitMessage so they can be
 * adjusted from the main thread without recompiling):
 *   - onsetThreshold: confidence required to emit a note-on. The
 *     spike (synesthetica-w1z) suggested 0.5 as a good starting
 *     point.
 *   - frameThreshold: confidence required for a frame to count as
 *     "the note is still sounding." Lower than onsetThreshold so
 *     short fades don't trigger spurious note-off.
 *   - minNoteLengthFrames: drop notes shorter than this in the
 *     model's output (filters out blip-level false positives).
 *   - dedupWindowSamples: if a new onset is at the same pitch and
 *     within this many samples of an already-active note's onset,
 *     treat it as the same note.
 *   - noteOffTimeoutSamples: if a tracked note hasn't been re-
 *     detected for this many samples, emit note-off.
 */

import * as tf from "@tensorflow/tfjs";
import {
  BasicPitch,
  outputToNotesPoly,
  addPitchBendsToNoteEvents,
} from "@spotify/basic-pitch";
import { AudioRing } from "./AudioRing";
import type { MainToWorker, WorkerToMain } from "./workerProtocol";

// Basic Pitch constants — duplicated from the package so we don't
// need to peek at its internals at runtime. Verified in
// synesthetica-w1z spike.
const FFT_HOP = 256;

interface ActiveNote {
  noteId: string;
  pitch: number;
  onsetSampleIndex: number;
  /** Last sample index at which this note was confirmed re-detected. */
  lastSeenSampleIndex: number;
  /** Highest pitch-bend frame index already emitted for this note. */
  lastEmittedBendFrameIdx: number;
}

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
    dedupWindowSamples: number;
    noteOffTimeoutSamples: number;
  } | null;
  activeByNoteId: Map<string, ActiveNote>;
  activeByPitch: Map<number, string>; // pitch midi → noteId
  /** Cumulative onset count, used to mint unique noteIds. */
  nextNoteSeq: number;
}

const state: WorkerState = {
  ring: null,
  windowBuffer: null,
  basicPitch: null,
  intervalId: null,
  config: null,
  activeByNoteId: new Map(),
  activeByPitch: new Map(),
  nextNoteSeq: 0,
};

function post(msg: WorkerToMain) {
  (self as DedicatedWorkerGlobalScope).postMessage(msg);
}

function mintNoteId(): string {
  return `audio-${state.nextNoteSeq++}`;
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
      dedupWindowSamples: message.dedupWindowSamples,
      noteOffTimeoutSamples: message.noteOffTimeoutSamples,
    };

    // Try WebGL backend first (fastest in browsers), fall back to
    // CPU. WASM would also work; left as a future option. We
    // intentionally do NOT crash if WebGL is unavailable.
    try {
      await tf.setBackend("webgl");
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
    for (const note of state.activeByNoteId.values()) {
      post({
        type: "audio_note_off",
        sampleIndex: head,
        noteId: note.noteId,
        confidence: 0.5,
      });
    }
  }
  state.activeByNoteId.clear();
  state.activeByPitch.clear();
}

async function runInference() {
  const cfg = state.config;
  const ring = state.ring;
  const bp = state.basicPitch;
  const buf = state.windowBuffer;
  if (!cfg || !ring || !bp || !buf) return;
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

  // Decode posteriors → notes (with onset times, durations, amplitudes).
  // outputToNotesPoly returns startFrame / endFrame in model frame
  // indices; we'll convert to absolute sample indices.
  const rawNotes = outputToNotesPoly(
    frames,
    onsets,
    cfg.onsetThreshold,
    cfg.frameThreshold,
    cfg.minNoteLengthFrames,
  );
  // Attach per-frame pitch-bend curves to each note.
  const notesWithBends = addPitchBendsToNoteEvents(contours, rawNotes);

  for (const note of notesWithBends) {
    const onsetSampleInWindow = note.startFrame * FFT_HOP;
    const absoluteOnsetSample = (windowStartSample + onsetSampleInWindow) >>> 0;
    const endFrame = note.startFrame + note.durationFrames;
    const endSampleInWindow = endFrame * FFT_HOP;
    const absoluteLastSeenSample = (windowStartSample + endSampleInWindow) >>> 0;
    const pitch = note.pitchMidi;

    let active = state.activeByPitch.has(pitch)
      ? state.activeByNoteId.get(state.activeByPitch.get(pitch)!)
      : undefined;

    // Dedup: same pitch + onset close to a known active note ⇒ same note.
    if (
      active &&
      Math.abs((absoluteOnsetSample - active.onsetSampleIndex) | 0) <=
        cfg.dedupWindowSamples
    ) {
      // Continue tracking the existing note. Update last-seen.
      active.lastSeenSampleIndex = absoluteLastSeenSample;
    } else {
      // If a note at this pitch was already active but the new onset
      // is well separated, close out the old note before opening a new one.
      if (active) {
        post({
          type: "audio_note_off",
          sampleIndex: active.lastSeenSampleIndex,
          noteId: active.noteId,
          confidence: 0.7,
        });
        state.activeByNoteId.delete(active.noteId);
        state.activeByPitch.delete(pitch);
      }
      const newNoteId = mintNoteId();
      const newActive: ActiveNote = {
        noteId: newNoteId,
        pitch,
        onsetSampleIndex: absoluteOnsetSample,
        lastSeenSampleIndex: absoluteLastSeenSample,
        lastEmittedBendFrameIdx: -1,
      };
      state.activeByNoteId.set(newNoteId, newActive);
      state.activeByPitch.set(pitch, newNoteId);
      // Basic Pitch's `amplitude` is the model's note-strength estimate
      // (0..1). We adopt it directly as velocity. Marked derived in the
      // contract; not comparable to MIDI 0..127 absolute.
      post({
        type: "audio_note_on",
        sampleIndex: absoluteOnsetSample,
        noteId: newNoteId,
        pitch,
        velocity: Math.max(0, Math.min(1, note.amplitude)),
        confidence: cfg.onsetThreshold, // conservative — model emits a binary above threshold
      });
      active = newActive;
    }

    // Emit any new pitch-bend samples since this note's last emission.
    if (note.pitchBends && active) {
      const bends = note.pitchBends;
      for (let i = active.lastEmittedBendFrameIdx + 1; i < bends.length; i++) {
        const bendSampleIndex =
          (absoluteOnsetSample + i * FFT_HOP) >>> 0;
        post({
          type: "audio_pitch_bend",
          sampleIndex: bendSampleIndex,
          noteId: active.noteId,
          semitones: bends[i],
          confidence: cfg.frameThreshold,
        });
      }
      active.lastEmittedBendFrameIdx = bends.length - 1;
    }
  }

  // Emit note-off for any tracked active note that hasn't been
  // re-detected within the timeout.
  for (const [noteId, active] of state.activeByNoteId) {
    if (
      ((headAfter - active.lastSeenSampleIndex) >>> 0) >
      cfg.noteOffTimeoutSamples
    ) {
      post({
        type: "audio_note_off",
        sampleIndex: active.lastSeenSampleIndex,
        noteId,
        confidence: 0.7,
      });
      state.activeByNoteId.delete(noteId);
      state.activeByPitch.delete(active.pitch);
    }
  }
}

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
