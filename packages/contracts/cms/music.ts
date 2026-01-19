/**
 * Legacy musical event types.
 *
 * These types represent protocol-level events (note_on, note_off).
 * New code should use the musical abstractions in @synesthetica/contracts/musical:
 * - Note (with duration and phase)
 * - Pitch (pitch class and octave)
 *
 * @deprecated See RFC 005 for the new frame type architecture.
 */

import type { Ms, Confidence } from "../core/time";
import type { Provenance } from "../core/provenance";
import type { PartId } from "../parts/parts";

export type MidiNote = number;   // 0..127
export type Velocity = number;   // 0..127
export type PitchClass = 0|1|2|3|4|5|6|7|8|9|10|11; // C=0..B=11

/**
 * @deprecated Use Note from @synesthetica/contracts/musical instead.
 */
export interface NoteOn {
  type: "note_on";
  t: Ms;
  part: PartId;
  note: MidiNote;
  velocity: Velocity;
  channel?: number;
  pc: PitchClass;
  octave: number;
  provenance: Provenance;
}

/**
 * @deprecated Use Note from @synesthetica/contracts/musical instead.
 */
export interface NoteOff {
  type: "note_off";
  t: Ms;
  part: PartId;
  note: MidiNote;
  channel?: number;
  provenance: Provenance;
}

export interface Beat {
  type: "beat";
  t: Ms;
  part: PartId;
  index: number;
  phase?: number; // 0..1
  confidence: Confidence;
  provenance: Provenance;
}

export type ChordQuality =
  | "maj" | "min" | "dim" | "aug"
  | "sus2" | "sus4"
  | "maj7" | "min7" | "dom7" | "hdim7" | "dim7"
  | "unknown";

export interface Chord {
  type: "chord";
  span: { t0: Ms; t1: Ms };
  part: PartId;
  root: PitchClass;
  quality: ChordQuality;
  confidence: Confidence;
  provenance: Provenance;
}

export type MusicalEvent = NoteOn | NoteOff | Beat | Chord;
