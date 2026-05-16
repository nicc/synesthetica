/**
 * Note Tracking Stabilizer
 *
 * Transforms RawInputFrame (protocol-level) to MusicalFrame (musical abstractions).
 * Correlates MIDI note_on/note_off pairs into Note objects with duration and phase.
 *
 * See RFC 005 for design rationale.
 */

import type {
  IMusicalStabilizer,
  RawInputFrame,
  MusicalFrame,
  Note,
  NoteId,
  NotePhase,
  Pitch,
  PitchClass,
  Velocity,
  PartId,
  Ms,
  Provenance,
  MidiNoteNumber,
  Confidence,
  PitchSample,
} from "@synesthetica/contracts";

import { createNoteId, createEmptyMusicalFrame } from "@synesthetica/contracts";

/**
 * Configuration for the NoteTrackingStabilizer.
 */
export interface NoteTrackingConfig {
  /**
   * Part ID this stabilizer is tracking.
   */
  partId: PartId;

  /**
   * Duration of attack phase in ms.
   * @default 50
   */
  attackDurationMs?: Ms;

  /**
   * Duration of release phase (how long notes remain visible after release).
   * @default 500
   */
  releaseWindowMs?: Ms;
}

const DEFAULT_CONFIG: Required<Omit<NoteTrackingConfig, "partId">> = {
  attackDurationMs: 50,
  releaseWindowMs: 10000,
};

/**
 * MIDI CC controller number for the sustain pedal.
 */
const SUSTAIN_PEDAL_CC = 64;

/**
 * Threshold at which the sustain pedal is considered "down". MIDI
 * spec convention: values 0–63 are "up", 64–127 are "down". Most
 * digital pianos output exactly 0 or 127, so this threshold is
 * mostly nominal — but we honour the spec so partial-pedal
 * controllers still behave (binary at the threshold, not graduated).
 */
const SUSTAIN_PEDAL_THRESHOLD = 64;

/**
 * Internal tracking state for an active note. Sources can be MIDI
 * (paired note_on/note_off with midiNote + channel) or audio
 * (transcription model emitting audio_note_on/off + pitch_bend with
 * an opaque noteId from the adapter).
 */
interface TrackedNote {
  id: NoteId;
  pitch: Pitch;
  velocity: Velocity;
  onset: Ms;
  releaseTime: Ms | null;
  confidence: Confidence;
  /** MIDI-specific tracking fields. Null for audio-sourced notes. */
  midiNote: MidiNoteNumber | null;
  channel: number | null;
  /** Per-note pitch deviation samples (audio only). */
  pitchTrajectory: PitchSample[] | null;
  /**
   * True iff a note_off has been received for this MIDI note while
   * the sustain pedal was down. The note keeps `releaseTime = null`
   * (so phase stays `sustain`) until the pedal lifts, at which
   * point `releaseTime` is set to the pedal-up time. Always false
   * for audio-sourced notes — the audio transcription model does
   * its own note-off prediction; the sustain pedal does not apply.
   */
  pedalRelease: boolean;
}

/**
 * Counter for generating unique keys for released notes during re-triggers.
 */
let releaseCounter = 0;

/**
 * NoteTrackingStabilizer: Converts raw MIDI events to musical Note abstractions.
 *
 * Tracks note_on/note_off pairs and maintains note state including:
 * - Duration (time since onset)
 * - Phase (attack → sustain → release)
 * - Release timing for visual fade-out
 */
export class NoteTrackingStabilizer implements IMusicalStabilizer {
  readonly id = "note-tracking";

  private config: Required<NoteTrackingConfig>;
  private activeNotes: Map<string, TrackedNote> = new Map();
  /**
   * Per-channel sustain-pedal state. A channel's entry is true while
   * the pedal is down (CC64 ≥ threshold) and absent or false while
   * up. MIDI CC64 is per-channel, so a pedal hold on channel 0
   * doesn't sustain notes on channel 1.
   */
  private pedalDown: Map<number, boolean> = new Map();
  private provenance: Provenance;

  constructor(config: NoteTrackingConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provenance = {
      source: "stabilizer",
      stream: this.id,
      version: "0.1.0",
    };
  }

  init(): void {
    this.activeNotes.clear();
    this.pedalDown.clear();
  }

  dispose(): void {
    this.activeNotes.clear();
    this.pedalDown.clear();
  }

  reset(): void {
    this.activeNotes.clear();
    this.pedalDown.clear();
  }

  apply(raw: RawInputFrame, _previous: MusicalFrame | null): MusicalFrame {
    const t = raw.t;

    // Remove expired notes first (past release window)
    this.pruneExpiredNotes(t);

    // Process raw inputs to update tracked notes
    for (const input of raw.inputs) {
      if (input.type === "midi_note_on") {
        this.handleNoteOn(input.note, input.velocity, input.channel, input.t);
      } else if (input.type === "midi_note_off") {
        this.handleNoteOff(input.note, input.channel, input.t);
      } else if (input.type === "audio_note_on") {
        this.handleAudioNoteOn(
          input.noteId,
          input.pitch,
          input.velocity,
          input.confidence,
          input.t,
        );
      } else if (input.type === "audio_note_off") {
        this.handleAudioNoteOff(input.noteId, input.t);
      } else if (input.type === "audio_pitch_bend") {
        this.handleAudioPitchBend(
          input.noteId,
          input.semitones,
          input.confidence,
          input.t,
        );
      } else if (
        input.type === "midi_cc" &&
        input.controller === SUSTAIN_PEDAL_CC
      ) {
        this.handleSustainPedal(input.channel, input.value, input.t);
      }
    }

    // Build the list of notes with current state
    const notes = this.buildNoteList(t);

    return {
      ...createEmptyMusicalFrame(t, this.config.partId),
      notes,
    };
  }

  private handleNoteOn(
    midiNote: MidiNoteNumber,
    velocity: Velocity,
    channel: number,
    t: Ms
  ): void {
    const pitch = this.midiNoteToPitch(midiNote);
    const id = createNoteId(this.config.partId, t, pitch);
    const key = this.noteKey(midiNote, channel);

    // If note is already tracked under this key, move it to a release-tracking key.
    // Only force-release if it hasn't been released yet (re-trigger without note_off).
    // Already-released notes keep their original releaseTime — overwriting it would
    // corrupt their frozen duration and cause the strip to snap to this onset position.
    if (this.activeNotes.has(key)) {
      const existing = this.activeNotes.get(key)!;
      if (existing.releaseTime === null) {
        existing.releaseTime = t;
      }
      // Move to a unique release key so it can continue its release phase
      const releaseKey = `release-${releaseCounter++}`;
      this.activeNotes.set(releaseKey, existing);
      this.activeNotes.delete(key);
    }

    const tracked: TrackedNote = {
      id,
      pitch,
      velocity,
      onset: t,
      releaseTime: null,
      confidence: 1.0,
      midiNote,
      channel,
      pitchTrajectory: null,
      pedalRelease: false,
    };

    this.activeNotes.set(key, tracked);
  }

  private handleNoteOff(
    midiNote: MidiNoteNumber,
    channel: number,
    t: Ms
  ): void {
    const key = this.noteKey(midiNote, channel);
    const tracked = this.activeNotes.get(key);
    if (!tracked || tracked.releaseTime !== null) return;

    // Sustain pedal: while the pedal is down on this channel, keep
    // the note in `sustain` phase (releaseTime stays null) and just
    // record that the key has been released. The pedal-up handler
    // will finalise releaseTime for all such notes at once.
    if (this.pedalDown.get(channel)) {
      tracked.pedalRelease = true;
      return;
    }

    tracked.releaseTime = t;
  }

  /**
   * Sustain pedal (CC64) handler. Binary threshold at value 64:
   * 0–63 = up, 64–127 = down. Per-channel — a pedal hold on one
   * channel does not sustain notes on another.
   *
   * On the rising edge (up → down): record state. Existing notes
   * carry on as they were.
   *
   * On the falling edge (down → up): for every tracked note on this
   * channel that has a key-released-but-pedal-held flag set, set
   * releaseTime = pedal-up time. Those notes now enter `release`
   * phase and fade as normal.
   */
  private handleSustainPedal(channel: number, value: number, t: Ms): void {
    const isDown = value >= SUSTAIN_PEDAL_THRESHOLD;
    const wasDown = this.pedalDown.get(channel) === true;
    if (isDown === wasDown) return; // no state change

    this.pedalDown.set(channel, isDown);
    if (isDown) return; // rising edge — no notes to release

    // Falling edge: release every pending note on this channel.
    for (const tracked of this.activeNotes.values()) {
      if (
        tracked.channel === channel &&
        tracked.pedalRelease &&
        tracked.releaseTime === null
      ) {
        tracked.releaseTime = t;
        tracked.pedalRelease = false;
      }
    }
  }

  /**
   * Audio note-on handler (SPEC 012).
   *
   * Audio notes are tracked by adapter-supplied noteId rather than
   * (midiNote, channel). Velocity arrives as 0..1 (derived from
   * audio amplitude); we scale to the 0..127 convention used
   * throughout the engine so downstream code reads it uniformly.
   * Confidence is propagated from the input event.
   */
  private handleAudioNoteOn(
    noteId: string,
    fractionalPitch: number,
    velocity01: number,
    confidence: Confidence,
    t: Ms,
  ): void {
    const midiInteger = Math.round(fractionalPitch);
    const pitch = this.midiNoteToPitch(midiInteger);
    const id = createNoteId(this.config.partId, t, pitch);
    const key = noteId;

    // Re-trigger on the same audio noteId: shift the old one to a
    // release tracking key so its release tail can render, then
    // start fresh. (Realistically the InferenceWorker already emits
    // note-off before a new noteId at the same pitch, but this is
    // defensive.)
    if (this.activeNotes.has(key)) {
      const existing = this.activeNotes.get(key)!;
      if (existing.releaseTime === null) {
        existing.releaseTime = t;
      }
      const releaseKey = `release-${releaseCounter++}`;
      this.activeNotes.set(releaseKey, existing);
      this.activeNotes.delete(key);
    }

    const tracked: TrackedNote = {
      id,
      pitch,
      velocity: Math.max(0, Math.min(127, velocity01 * 127)),
      onset: t,
      releaseTime: null,
      confidence,
      midiNote: null,
      channel: null,
      pitchTrajectory: [],
      pedalRelease: false, // sustain pedal applies to MIDI notes only
    };

    this.activeNotes.set(key, tracked);
  }

  /** Audio note-off handler (SPEC 012). */
  private handleAudioNoteOff(noteId: string, t: Ms): void {
    const tracked = this.activeNotes.get(noteId);
    if (tracked && tracked.releaseTime === null) {
      tracked.releaseTime = t;
    }
  }

  /**
   * Audio pitch-bend handler (SPEC 012).
   *
   * Appends a sample to the matching active note's pitch trajectory.
   * Silently drops samples that arrive after the note has been
   * released, and samples for unknown noteIds (the worker can
   * occasionally emit a bend slightly after the corresponding
   * note-off in degenerate cases — preferable to crashing).
   */
  private handleAudioPitchBend(
    noteId: string,
    semitones: number,
    confidence: Confidence,
    t: Ms,
  ): void {
    const tracked = this.activeNotes.get(noteId);
    if (!tracked || tracked.releaseTime !== null) return;
    if (tracked.pitchTrajectory) {
      tracked.pitchTrajectory.push({ t, semitones, confidence });
    }
  }

  private buildNoteList(currentTime: Ms): Note[] {
    const notes: Note[] = [];

    for (const tracked of this.activeNotes.values()) {
      const duration = tracked.releaseTime !== null
        ? tracked.releaseTime - tracked.onset
        : currentTime - tracked.onset;
      const phase = this.calculatePhase(tracked, currentTime);

      const note: Note = {
        id: tracked.id,
        pitch: tracked.pitch,
        velocity: tracked.velocity,
        onset: tracked.onset,
        duration,
        release: tracked.releaseTime,
        phase,
        confidence: tracked.confidence,
        provenance: this.provenance,
        ...(tracked.pitchTrajectory && tracked.pitchTrajectory.length > 0
          ? { pitchTrajectory: tracked.pitchTrajectory }
          : {}),
      };

      notes.push(note);
    }

    return notes;
  }

  private calculatePhase(tracked: TrackedNote, currentTime: Ms): NotePhase {
    const duration = currentTime - tracked.onset;

    // If released, we're in release phase
    if (tracked.releaseTime !== null) {
      return "release";
    }

    // If within attack duration, we're in attack phase
    if (duration < this.config.attackDurationMs) {
      return "attack";
    }

    // Otherwise, sustain
    return "sustain";
  }

  private pruneExpiredNotes(currentTime: Ms): void {
    for (const [key, tracked] of this.activeNotes) {
      if (tracked.releaseTime !== null) {
        const timeSinceRelease = currentTime - tracked.releaseTime;
        if (timeSinceRelease > this.config.releaseWindowMs) {
          this.activeNotes.delete(key);
        }
      }
    }
  }

  private noteKey(midiNote: MidiNoteNumber, channel: number): string {
    return `${midiNote}:${channel}`;
  }

  private midiNoteToPitch(midiNote: MidiNoteNumber): Pitch {
    return {
      pc: (midiNote % 12) as PitchClass,
      octave: Math.floor(midiNote / 12) - 1,
    };
  }
}
