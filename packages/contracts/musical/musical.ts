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
import type { PitchClass, ChordQuality, Velocity } from "../primitives/primitives";

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
  bass: PitchClass; // Lowest sounding pitch class (for slash chords like C/E)
  inversion: number; // 0 = root position, 1 = first inversion, etc.
  voicing: Pitch[]; // All pitches in the chord, ordered low to high
  noteIds: NoteId[];
  onset: Ms;
  duration: Ms;
  phase: "active" | "decaying";
  confidence: Confidence;
  provenance: Provenance;
}

/**
 * Time signature.
 * Set via control op, not detected by stabilizers.
 */
export interface TimeSignature {
  /** Beats per bar (e.g., 4 for 4/4, 3 for 3/4) */
  beatsPerBar: number;
  /** Beat unit (e.g., 4 for quarter note, 8 for eighth note) */
  beatUnit: number;
}

/**
 * Drift measurement for a single subdivision level.
 * See RFC 008 for design rationale.
 */
export interface SubdivisionDrift {
  /**
   * Human-readable label for this subdivision level.
   * Tier 2/3 (with tempo): "quarter" | "8th" | "16th" | "32nd"
   * Tier 1 (without tempo): "1x" | "2x" | "4x" | "8x"
   */
  label: string;

  /** Subdivision period in ms */
  period: Ms;

  /** Signed timing error: negative = early, positive = late */
  drift: Ms;

  /** True if this is the closest subdivision to the onset */
  nearest: boolean;
}

/**
 * Per-onset drift analysis with measurements at multiple subdivision levels.
 * Replaces raw onset timestamps with structured timing data.
 * See RFC 008 for design rationale.
 */
export interface OnsetDrift {
  /** Onset timestamp */
  t: Ms;

  /** Drift at 4 subdivision levels, coarse to fine */
  subdivisions: SubdivisionDrift[];
}

/**
 * Rhythmic analysis produced by BeatDetectionStabilizer.
 *
 * This is purely DESCRIPTIVE - it analyzes historic onset patterns
 * without inferring future intent. See RFC 007 for design rationale,
 * RFC 008 for per-onset drift analysis.
 *
 * Key insight: Tempo inference is a category error. We cannot distinguish
 * subdivisions from tempo changes, drift from rubato, off-beat from syncopation
 * based on historic data alone. Therefore:
 * - Stabilizer outputs descriptive analysis (detectedDivision, stability)
 * - Tempo/meter are set explicitly by user via control ops
 */
export interface RhythmicAnalysis {
  /**
   * Detected time division between recent onsets in ms.
   * This is the most prominent IOI cluster, NOT a "tempo".
   * Null if insufficient data or no clear pattern.
   */
  detectedDivision: Ms | null;

  /**
   * Per-onset drift analysis at 4 subdivision levels.
   * Each onset includes drift measurements from coarse (beat/detected) to fine (32nd/8x).
   * The `nearest` flag on each subdivision indicates the closest grid position.
   * Empty if no onsets in the analysis window.
   */
  onsetDrifts: OnsetDrift[];

  /**
   * How stable the detected division is across the window.
   * High stability = consistent spacing between onsets.
   * Range: 0.0 to 1.0
   */
  stability: number;

  /**
   * Confidence in the detected division.
   * Based on cluster strength and sample count.
   * Low confidence = "not enough data" or "ambiguous pattern".
   * Range: 0.0 to 1.0
   */
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
 * A musical phrase boundary detected by stabilizers.
 */
export interface Phrase {
  id: string;
  onset: Ms;
  duration: Ms;
  chordIds: ChordId[]; // Chords in this phrase (references)
  noteIds: NoteId[]; // Notes in this phrase (references)
  confidence: Confidence;
}

/**
 * Frame of musical state for a single part.
 * Produced by stabilizers, consumed by rulesets.
 *
 * MusicalFrame is a "snapshot with context" - it contains:
 * - Current state: What's sounding now (notes, chords, rhythmic analysis, dynamics)
 * - Prescribed context: User-specified tempo and meter (via control ops)
 * - Recent context: What led here via references (progression, phrases)
 * - No raw events: Those stay in RawInputFrame
 *
 * This allows rulesets to remain pure functions while accessing temporal
 * context like harmonic tension or phrase position.
 *
 * See SPEC_006 for windowing, SPEC_009 for frame types, RFC 007 for rhythmic analysis.
 */
export interface MusicalFrame {
  t: Ms;
  part: PartId;

  // Current state (from stabilizers)
  notes: Note[];
  chords: MusicalChord[];
  rhythmicAnalysis: RhythmicAnalysis;
  dynamics: DynamicsState;

  // Prescribed context (from control ops, not stabilizers)
  /**
   * User-prescribed tempo in BPM.
   * Set via control op. Null means no explicit tempo.
   * When null, grammars should not show drift or beat-grid visuals.
   */
  prescribedTempo: number | null;

  /**
   * User-prescribed time signature.
   * Set via control op. Null means no explicit meter.
   * When null, grammars should not show bar-boundary visuals.
   */
  prescribedMeter: TimeSignature | null;

  // Recent context (references, not copies)
  progression?: ChordId[]; // Recent chord history
  phrases?: Phrase[]; // Phrase boundaries
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
