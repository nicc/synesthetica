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
 * A single interpretation of a voicing — e.g. the "harmonic" reading
 * (simplest chord explaining the notes, bass-agnostic) or the "bass-led"
 * reading (chord rooted on the bass note).
 *
 * Every voicing admits multiple valid readings. See SPEC_010 for the mode
 * toggle that selects which interpretation grammars render.
 */
export interface ChordInterpretation {
  /** Harmonic root of this reading */
  root: PitchClass;
  /** Simplified chord quality (maj, min, dom7, etc.) for display */
  quality: ChordQuality;
  /**
   * Semitones-from-root of the chord's theoretical tones — e.g. Ab9:
   * [0, 2, 4, 7, 10]. Includes extensions like 9/11/13 so renderers can
   * distinguish chord tones from chromatic alterations even when
   * `quality` rounds off details.
   */
  chordTones: number[];
  /** Full chord name as produced by the detector, e.g. "AbM", "EbM/G" */
  name: string;
  /** Confidence in this specific interpretation, 0–1 */
  confidence: Confidence;
}

/**
 * A musical chord detected by stabilizers.
 *
 * Carries BOTH a harmonic and a bass-led interpretation of the voicing.
 * When bass equals the harmonic root, the two interpretations converge
 * (populated with the same values). Grammars pick which to render via a
 * runtime mode setting.
 */
export interface MusicalChord {
  id: ChordId;
  /** All pitches in the chord, ordered low to high */
  voicing: Pitch[];
  noteIds: NoteId[];
  /** Lowest sounding pitch class (MIDI-lowest note's pc) */
  bass: PitchClass;
  /** Position of bass in the harmonic interpretation's chordTones list */
  inversion: number;
  /** True when harmonic.root !== bass — i.e. the chord is an inversion */
  isInverted: boolean;
  /** Harmonic interpretation: simplest chord that explains the voicing */
  harmonic: ChordInterpretation;
  /** Bass-led interpretation: chord rooted on the bass note */
  bassLed: ChordInterpretation;
  onset: Ms;
  duration: Ms;
  phase: "active" | "decaying";
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
 * A single velocity observation at a point in time.
 * Input-agnostic: normalized from MIDI velocity, audio amplitude, etc.
 */
export interface DynamicsEvent {
  t: Ms;
  /** Normalized intensity 0–1 (e.g. MIDI velocity / 127) */
  intensity: number;
}

/**
 * A single point on the dynamics contour.
 * One point per distinct onset time. Level is max intensity across
 * simultaneous notes; min is the lowest (present only for chords).
 */
export interface DynamicsContourPoint {
  t: Ms;
  level: number; // 0–1 (max intensity at this onset)
  min?: number;  // 0–1 (lowest intensity; omitted when single note)
}

/**
 * Dynamic range summary over the contour window.
 */
export interface DynamicsRange {
  /** Lowest intensity in window, 0–1 */
  min: number;
  /** Highest intensity in window, 0–1 */
  max: number;
  /** Variance relative to full 0–1 range (not observed range) */
  variance: number;
}

/**
 * Dynamics state produced by DynamicsStabilizer.
 *
 * Separates constituents (raw observations) from aggregates (derived summaries).
 * Constituents are the individual velocity events; aggregates are smoothed level,
 * trend, contour history, and dynamic range.
 *
 * The phrasing stabiliser downstream can consume both constituents and aggregates
 * to segment dynamics by phrase boundaries.
 */
export interface DynamicsState {
  // --- Constituents: raw observations ---
  /** Windowed velocity observations, oldest first */
  events: DynamicsEvent[];

  // --- Aggregates: derived from events ---
  /** Current dynamics level (max intensity of most recent onset), 0–1 */
  level: number;
  /** Current trend direction over recent window */
  trend: "rising" | "falling" | "stable";
  /** Level history, oldest first. One point per distinct onset time. */
  contour: DynamicsContourPoint[];
  /** Dynamic range within the contour window */
  range: DynamicsRange;
}

/**
 * Supported musical modes.
 *
 * The seven church modes plus harmonic and melodic minor.
 * Common names in parentheses where applicable.
 */
export type ModeId =
  | "ionian"          // (major)
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "aeolian"         // (natural minor)
  | "locrian"
  | "harmonic-minor"
  | "melodic-minor";

/**
 * Human-readable labels for modes.
 */
export const MODE_LABELS: Record<ModeId, string> = {
  "ionian":         "Ionian (major)",
  "dorian":         "Dorian",
  "phrygian":       "Phrygian",
  "lydian":         "Lydian",
  "mixolydian":     "Mixolydian",
  "aeolian":        "Aeolian (natural minor)",
  "locrian":        "Locrian",
  "harmonic-minor": "Harmonic minor",
  "melodic-minor":  "Melodic minor",
};

/**
 * User-prescribed key.
 * Set via control op, not inferred by stabilizers.
 * When present, enables functional harmony analysis (Roman numerals).
 */
export interface PrescribedKey {
  /** Tonic pitch class */
  root: PitchClass;
  /** Mode — defaults to ionian (major) if omitted */
  mode: ModeId;
}

/**
 * Chord interpretation mode. Selects which reading of a voicing the
 * grammar renders.
 * - "harmonic": simplest chord that explains the notes, bass-agnostic
 *   (EbM/G renders as Eb major, first inversion)
 * - "bass-led": force root = bass; voicing read from the bass up
 *   (EbM/G renders as Gm#5, G minor with augmented 5th)
 * See SPEC_010 for design rationale.
 */
export type ChordInterpretationMode = "harmonic" | "bass-led";

/**
 * A chord analyzed in functional harmony terms relative to a prescribed key.
 */
export interface FunctionalChord {
  /** Scale degree of the chord root (1–7) */
  degree: number;
  /** Roman numeral string (e.g. "I", "ii", "V7", "♭VI") */
  roman: string;
  /** Chord quality from detection */
  quality: ChordQuality;
  /** Root pitch class of the chord (0–11) */
  rootPc: PitchClass;
  /** True if the chord root is not diatonic to the prescribed key/mode */
  borrowed: boolean;
  /** Reference to the source detected chord */
  chordId: ChordId;
  /** Onset time of the chord */
  onset: Ms;
  /** When the chord stopped being active. Null while still being held. */
  releaseTime: Ms | null;
}

/**
 * Harmonic context produced by HarmonyStabilizer.
 *
 * Always provides tension. When a key is prescribed, also provides
 * functional analysis (Roman numerals, progression history).
 *
 * Tension tiers:
 * - Tier 1 (key-agnostic): Interval-based dissonance — always available
 * - Tier 2 (key-aware): Functional tension — when prescribedKey is set
 */
export interface HarmonicContext {
  /**
   * Harmonic tension (0–1).
   *
   * Tier 1 (key-agnostic): interval dissonance in current chord.
   * Tier 2 (key-aware): functional tension (dominant=high, tonic=low).
   */
  tension: number;

  /**
   * Whether tension includes key-aware analysis.
   */
  keyAware: boolean;

  /**
   * Current chord in functional terms. Null when no chord is active
   * or no key is prescribed.
   */
  currentFunction: FunctionalChord | null;

  /**
   * Recent chord progression in functional terms.
   * Only populated when a key is prescribed.
   */
  functionalProgression: FunctionalChord[];
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

  /**
   * User-prescribed key (tonic + mode).
   * Set via control op. Null means no explicit key.
   * When null, functional harmony analysis is disabled.
   */
  prescribedKey: PrescribedKey | null;

  /**
   * Selected chord interpretation mode. Grammars that render chords use
   * this to pick between MusicalChord.harmonic and MusicalChord.bassLed.
   * Defaults to "harmonic" — the simplest chord that explains the voicing.
   */
  chordInterpretation: ChordInterpretationMode;

  // Recent context (references, not copies)
  progression?: ChordId[]; // Recent chord history
  phrases?: Phrase[]; // Phrase boundaries

  // Derived signals (from derived stabilizers)
  /**
   * Harmonic context including tension and functional analysis.
   * Produced by HarmonyStabilizer.
   * Optional — only present when that stabilizer is in the chain.
   */
  harmonicContext?: HarmonicContext;
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

// ============================================================================
// Shared Defaults
// ============================================================================

/** Empty rhythmic analysis — no detected patterns. */
export const EMPTY_RHYTHMIC_ANALYSIS: Readonly<RhythmicAnalysis> = Object.freeze({
  detectedDivision: null,
  onsetDrifts: [],
  stability: 0,
  confidence: 0,
});

/** Empty dynamics state — silence. */
export const EMPTY_DYNAMICS: Readonly<DynamicsState> = Object.freeze({
  events: [],
  level: 0,
  trend: "stable" as const,
  contour: [],
  range: Object.freeze({ min: 0, max: 0, variance: 0 }),
});

/** Empty harmonic context — no tension, no functional analysis. */
export const EMPTY_HARMONIC_CONTEXT: Readonly<HarmonicContext> = Object.freeze({
  tension: 0,
  keyAware: false,
  currentFunction: null,
  functionalProgression: [],
});

/**
 * Create a MusicalFrame with all fields at their empty/null defaults.
 * Callers can spread overrides: `{ ...createEmptyMusicalFrame(t, part), notes }`.
 */
export function createEmptyMusicalFrame(t: Ms, part: PartId): MusicalFrame {
  return {
    t,
    part,
    notes: [],
    chords: [],
    rhythmicAnalysis: { ...EMPTY_RHYTHMIC_ANALYSIS },
    dynamics: {
      ...EMPTY_DYNAMICS,
      range: { ...EMPTY_DYNAMICS.range },
    },
    prescribedTempo: null,
    prescribedMeter: null,
    prescribedKey: null,
    chordInterpretation: "harmonic",
  };
}
