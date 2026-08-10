/**
 * Message protocol between the InferenceWorker (Web Worker) and the
 * AudioInputAdapter on the main thread (SPEC 012).
 *
 * - MainToWorker messages set up and tear down the worker.
 * - WorkerToMain messages stream note events back as the model
 *   produces them.
 *
 * The worker emits events with `sampleIndex` (global sample counter
 * since audio start). The main thread converts to session-relative
 * Ms using its captured audioOriginMs offset.
 */

import type { AudioRingHandles } from "./AudioRing";

// ============================================================================
// Main → Worker
// ============================================================================

export interface WorkerInitMessage {
  type: "init";
  /** SAB-backed ring containing live audio samples. */
  ring: AudioRingHandles;
  /** Sample rate of audio in the ring (Hz). Must be 22050 for Basic Pitch. */
  sampleRate: number;
  /** Inference cadence in ms. The worker schedules an inference every
   *  `hopMs`; smaller values give lower latency at higher CPU cost. */
  hopMs: number;
  /** URL of the Basic Pitch model JSON. The worker loads it via
   *  tf.loadGraphModel. */
  modelUrl: string;
  /** Onset detection confidence threshold (0..1). Higher = fewer
   *  spurious notes, more missed onsets. */
  onsetThreshold: number;
  /** Frame-presence confidence threshold for sustaining a note (0..1). */
  frameThreshold: number;
  /** Minimum note length in frames (~11.6ms per frame at 22050/256). */
  minNoteLengthFrames: number;
  /** Window of samples used per inference. Hard-coded to the model's
   *  expected input length (22050*2 - 256). Passed for documentation. */
  windowSamples: number;
  /** A detected onset is treated as the same note as a previous one
   *  if it's within this many samples of an existing active note at
   *  the same MIDI pitch. */
  dedupWindowSamples: number;
  /** If a tracked active note hasn't been re-detected within this many
   *  samples, emit note-off and remove from active set. */
  noteOffTimeoutSamples: number;
  /**
   * Only emit a fresh note-on if the detected onset is within this
   * many samples of the current audio head. Basic Pitch's 2-second
   * inference window returns notes with onsets anywhere in the
   * window — including 1+ seconds in the past. Without this guard,
   * a note the model briefly drops and re-detects gets a new note-on
   * with an onset in the past, appearing as a retroactive marker on
   * the note strip.
   */
  freshOnsetMaxAgeSamples: number;
  /**
   * A new detection at a tracked pitch is treated as a RE-STRIKE
   * (rather than continuation of the tracked note) when its onset
   * sits at least this many samples later than the tracked note's
   * onset. Below the threshold, it's held-note jitter — Basic Pitch
   * shifts its predicted onset by tens of ms across inference
   * passes on the same held note. Above it, the user has genuinely
   * struck the note again.
   */
  restrikeGapSamples: number;
}

export interface WorkerStopMessage {
  type: "stop";
}

export type MainToWorker = WorkerInitMessage | WorkerStopMessage;

// ============================================================================
// Worker → Main
// ============================================================================

export interface WorkerReadyMessage {
  type: "ready";
}

export interface WorkerErrorMessage {
  type: "error";
  message: string;
}

export interface WorkerNoteOnEvent {
  type: "audio_note_on";
  sampleIndex: number;
  noteId: string;
  pitch: number; // fractional MIDI note number
  velocity: number; // 0..1, derived from amplitude
  confidence: number;
}

export interface WorkerNoteOffEvent {
  type: "audio_note_off";
  sampleIndex: number;
  noteId: string;
  confidence: number;
}

export interface WorkerPitchBendEvent {
  type: "audio_pitch_bend";
  sampleIndex: number;
  noteId: string;
  semitones: number;
  confidence: number;
}

export type WorkerToMain =
  | WorkerReadyMessage
  | WorkerErrorMessage
  | WorkerNoteOnEvent
  | WorkerNoteOffEvent
  | WorkerPitchBendEvent;
