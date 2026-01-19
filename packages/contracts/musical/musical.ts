/**
 * Musical Frame Types
 *
 * Musical abstractions produced by stabilizers. These represent proper
 * musical concepts (notes with duration, chords, beats) rather than
 * protocol-level events.
 *
 * See RFC 005 for design rationale.
 */

import type { Ms, Confidence } from "../core/time";
import type { Provenance } from "../core/provenance";
import type { PartId } from "../parts/parts";
import type { PitchClass, ChordQuality, Velocity } from "../music/music";

/**
 * Musical pitch - pitch class and octave.
 * No protocol-level details (MIDI note number, Hz).
 */
export interface Pitch {
  pc: PitchClass;
  octave: number;
}

/**
 * Note lifecycle phase.
 * - attack: Note just started (first few ms)
 * - sustain: Note is being held
 * - release: Note was released, in decay tail
 */
export type NotePhase = "attack" | "sustain" | "release";

/**
 * Unique identifier for a note.
 * Format: "{partId}:{onset}:{pc}{octave}" e.g. "piano:1500:C4"
 */
export type NoteId = string;

/**
 * A musical note - the proper abstraction for a sounding pitch.
 * Not a pair of on/off messages, but a single entity with duration.
 */
export interface Note {
  id: NoteId;
  pitch: Pitch;
  velocity: Velocity;
  onset: Ms;
  duration: Ms;
  release: Ms | null; // When release began, null if still held
  phase: NotePhase;
  confidence: Confidence; // 1.0 for MIDI, variable for audio
  provenance: Provenance;
}

/**
 * Unique identifier for a chord.
 * Format: "{partId}:{onset}:{root}{quality}"
 */
export type ChordId = string;

/**
 * A musical chord detected by stabilizers.
 */
export interface MusicalChord {
  id: ChordId;
  root: PitchClass;
  quality: ChordQuality;
  noteIds: NoteId[];
  onset: Ms;
  duration: Ms;
  phase: "active" | "decaying";
  confidence: Confidence;
  provenance: Provenance;
}

/**
 * Current beat/meter context.
 */
export interface BeatState {
  phase: number; // 0-1 position within current beat
  tempo: number | null; // BPM if detected
  confidence: Confidence;
}

/**
 * Current dynamics state.
 */
export interface DynamicsState {
  level: number; // 0-1 current loudness
  trend: "rising" | "falling" | "stable";
}

/**
 * Frame of musical state for a single part.
 * Produced by stabilizers, consumed by rulesets.
 */
export interface MusicalFrame {
  t: Ms;
  part: PartId;
  notes: Note[];
  chords: MusicalChord[];
  beat: BeatState | null;
  dynamics: DynamicsState;
}

/**
 * Helper to generate a deterministic NoteId.
 */
export function createNoteId(part: PartId, onset: Ms, pitch: Pitch): NoteId {
  const noteName = pitchClassName(pitch.pc) + pitch.octave;
  return `${part}:${onset}:${noteName}`;
}

/**
 * Helper to generate a deterministic ChordId.
 */
export function createChordId(
  part: PartId,
  onset: Ms,
  root: PitchClass,
  quality: ChordQuality
): ChordId {
  return `${part}:${onset}:${pitchClassName(root)}${quality}`;
}

/**
 * Convert pitch class to note name.
 */
function pitchClassName(pc: PitchClass): string {
  const names = [
    "C",
    "Db",
    "D",
    "Eb",
    "E",
    "F",
    "Gb",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
  ];
  return names[pc];
}
