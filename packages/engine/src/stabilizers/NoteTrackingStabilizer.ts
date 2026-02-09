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
} from "@synesthetica/contracts";

import { createNoteId } from "@synesthetica/contracts";

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
 * Internal tracking state for an active note.
 */
interface TrackedNote {
  id: NoteId;
  pitch: Pitch;
  velocity: Velocity;
  onset: Ms;
  releaseTime: Ms | null;
  midiNote: MidiNoteNumber;
  channel: number;
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
  }

  dispose(): void {
    this.activeNotes.clear();
  }

  reset(): void {
    this.activeNotes.clear();
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
      }
      // CC and audio inputs ignored for now
    }

    // Build the list of notes with current state
    const notes = this.buildNoteList(t);

    return {
      t,
      part: this.config.partId,
      notes,
      chords: [],
      rhythmicAnalysis: {
        detectedDivision: null,
        onsetDrifts: [],
        stability: 0,
        confidence: 0,
      },
      dynamics: {
        level: this.calculateDynamicsLevel(notes),
        trend: "stable",
      },
      prescribedTempo: null,
      prescribedMeter: null,
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

    // If note is already active, release it and move to a release-tracking key
    if (this.activeNotes.has(key)) {
      const existing = this.activeNotes.get(key)!;
      existing.releaseTime = t;
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
      midiNote,
      channel,
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

    if (tracked && tracked.releaseTime === null) {
      tracked.releaseTime = t;
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
        confidence: 1.0, // MIDI is definitive
        provenance: this.provenance,
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

  private calculateDynamicsLevel(notes: Note[]): number {
    if (notes.length === 0) return 0;

    // Use average velocity of currently sounding (non-release) notes
    const activeNotes = notes.filter((n) => n.phase !== "release");
    if (activeNotes.length === 0) {
      // If only release notes, use their average but attenuated
      const avgVelocity =
        notes.reduce((sum, n) => sum + n.velocity, 0) / notes.length;
      return (avgVelocity / 127) * 0.3; // Attenuated for release
    }

    const avgVelocity =
      activeNotes.reduce((sum, n) => sum + n.velocity, 0) / activeNotes.length;
    return avgVelocity / 127;
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
