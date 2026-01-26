/**
 * Annotated Musical Frame Types (RFC 006, SPEC 010)
 *
 * Annotated frames combine musical elements with visual properties.
 * Visual vocabularies produce these; grammars consume them and decide how to render.
 *
 * Key insight: vocabularies define words, grammars write sentences.
 *
 * See RFC 006 for design rationale, SPEC 010 for visual vocabulary constraints.
 */

import type { Ms, Confidence } from "../core/time";
import type { PartId } from "../parts/parts";
import type { ColorHSVA } from "../intents/colors";
import type {
  Note,
  NoteId,
  NotePhase,
  MusicalChord,
  RhythmicAnalysis,
  TimeSignature,
  DynamicsState,
} from "../musical/musical";

// ============================================================================
// Visual Annotation Types
// ============================================================================

/**
 * Unique identifier for a palette.
 */
export type PaletteId = string;

/**
 * Unique identifier for a texture.
 */
export type TextureId = string;

/**
 * Reference to a resolved palette with actual colors.
 * Grammars use the resolved colors directly without needing to look up definitions.
 */
export interface PaletteRef {
  id: PaletteId;
  /** Primary color for this element */
  primary: ColorHSVA;
  /** Secondary color (optional) */
  secondary?: ColorHSVA;
  /** Accent color (optional) */
  accent?: ColorHSVA;
}

/**
 * Reference to resolved texture parameters.
 */
export interface TextureRef {
  id: TextureId;
  /** Surface grain (0 = smooth, 1 = rough) */
  grain: number;
  /** Surface smoothness (0 = harsh, 1 = smooth) */
  smoothness: number;
  /** Element density (0 = sparse, 1 = dense) */
  density: number;
}

/**
 * Motion characteristics for an element.
 */
export interface MotionAnnotation {
  /** How much this element should "jitter" or be unstable (0-1) */
  jitter: number;
  /** Pulsing intensity for rhythmic elements (0-1) */
  pulse: number;
  /** Flow direction/intensity (-1 = contracting, 0 = stable, 1 = expanding) */
  flow: number;
}

/**
 * Visual properties assigned by rulesets to musical elements.
 *
 * These define "what this looks like" without specifying "what shape it is".
 * Grammars interpret these properties through their own rendering logic.
 */
export interface VisualAnnotation {
  /** Color palette for this element */
  palette: PaletteRef;

  /** Texture characteristics */
  texture: TextureRef;

  /** Motion characteristics */
  motion: MotionAnnotation;

  /**
   * Uncertainty for this element's visual mapping (0 = certain, 1 = uncertain).
   * Derived from the underlying musical element's detection confidence.
   * e.g., chord detection may have high uncertainty while notes are certain.
   */
  uncertainty: Confidence;

  /** Optional label for debugging/display (not used for rendering decisions) */
  label?: string;
}

// ============================================================================
// Note-Level Visual Properties (SPEC 010)
// ============================================================================

// NotePhase is imported from musical.ts (already defined there)
// Re-export for convenience
export type { NotePhase };

/**
 * Velocity-derived visual properties.
 * Invariant I16: Velocity affects visual prominence.
 */
export interface VelocityAnnotation {
  /** Size multiplier (0.5 to 2.0, derived from velocity) */
  sizeMultiplier: number;
  /** Attack duration in ms (0 to 50, inverse of velocity) */
  attackMs: number;
}

/**
 * Phase-derived visual properties.
 * Invariant I17: Note phase affects intensity.
 */
export interface PhaseAnnotation {
  /** Current phase of the note */
  phase: NotePhase;
  /** Intensity (1.0 at attack, fading during release) */
  intensity: number;
}

// ============================================================================
// Chord Shape Geometry (SPEC 010)
// ============================================================================

/**
 * Radius tier for chord tones based on thirds-distance from root.
 * Invariant I18: Chord quality determines shape geometry.
 */
export type RadiusTier = "triadic" | "seventh" | "extension";

/**
 * A single element in the chord shape (wedge or line).
 */
export interface ChordShapeElement {
  /** Angular position in degrees (0° = root at 12 o'clock) */
  angle: number;
  /** Radius multiplier: 1.0 (triadic), 0.618 (7th), 0.382 (extension) */
  radius: number;
  /** Radius category for semantic clarity */
  tier: RadiusTier;
  /** Rendering style: wedge (diatonic) or line (chromatic alteration) */
  style: "wedge" | "line";
  /** Interval from root (for debugging/labeling, e.g., "3", "♭7", "♯9") */
  interval: string;
}

/**
 * Margin style encoding triad quality.
 * Applied to all wedges in a chord shape.
 */
export type MarginStyle =
  | "straight" // Major
  | "wavy" // Minor
  | "concave" // Diminished
  | "convex" // Augmented
  | "dash-short" // Sus2
  | "dash-long"; // Sus4

/**
 * Complete chord shape geometry.
 * Invariant I18: This geometry is computed by the vocabulary, not grammars.
 */
export interface ChordShapeGeometry {
  /** All elements (wedges and lines) in the shape */
  elements: ChordShapeElement[];
  /** Margin style for all wedges (encodes triad quality) */
  margin: MarginStyle;
  /** Root is always at 0° (12 o'clock) */
  rootAngle: 0;
}

// ============================================================================
// Annotated Musical Elements
// ============================================================================

/**
 * A note with visual annotations.
 * The note data comes from stabilizers; annotations come from vocabulary.
 */
export interface AnnotatedNote {
  /** The underlying musical note */
  note: Note;

  /** Visual properties assigned by vocabulary */
  visual: VisualAnnotation;

  /** Velocity-derived properties (Invariant I16) */
  velocity: VelocityAnnotation;

  /** Phase-derived properties (Invariant I17) */
  phaseState: PhaseAnnotation;
}

/**
 * A chord with visual annotations.
 *
 * References are one-directional (chord → notes) to keep stabilizer logic simple.
 * Chords already track their constituent noteIds from detection.
 * Grammars that need to find which chord a note belongs to can iterate
 * through chords and check noteIds membership - the data volume is small.
 */
export interface AnnotatedChord {
  /** The underlying musical chord */
  chord: MusicalChord;

  /** Visual properties assigned by vocabulary */
  visual: VisualAnnotation;

  /** IDs of constituent notes (from chord detection) */
  noteIds: NoteId[];

  /** Shape geometry for rendering (Invariant I18) */
  shape: ChordShapeGeometry;
}

/**
 * Rhythmic analysis with visual annotations.
 *
 * Contains purely descriptive analysis of onset patterns.
 * Grammars check prescribedTempo/prescribedMeter for intent-relative visualization.
 *
 * See RFC 007 for design rationale.
 */
export interface AnnotatedRhythm {
  /** Rhythmic analysis (detected division, stability, onsets) */
  analysis: RhythmicAnalysis;

  /** Visual properties for rhythm visualization */
  visual: VisualAnnotation;

  /**
   * User-prescribed tempo in BPM (from control op).
   * When non-null, grammars can show beat-relative visuals (drift, grid).
   */
  prescribedTempo: number | null;

  /**
   * User-prescribed time signature (from control op).
   * When non-null (and prescribedTempo is set), grammars can show bar-relative visuals.
   */
  prescribedMeter: TimeSignature | null;
}

/**
 * Bar boundary information.
 */
export interface AnnotatedBar {
  /** When this bar started */
  onset: Ms;

  /** Bar number (1-indexed from session start) */
  barNumber: number;

  /** Visual properties for bar boundary */
  visual: VisualAnnotation;
}

/**
 * Phrase type classification.
 */
export type PhraseType = "call" | "response" | "bridge" | "transition" | "other";

/**
 * Phrase boundary information.
 */
export interface AnnotatedPhrase {
  /** When this phrase started */
  onset: Ms;

  /** Phrase type */
  type: PhraseType;

  /** Visual properties for phrase boundary */
  visual: VisualAnnotation;
}

/**
 * Dynamics state with visual annotations.
 */
export interface AnnotatedDynamics {
  /** Current dynamics state */
  dynamics: DynamicsState;

  /** Visual properties for dynamics visualization */
  visual: VisualAnnotation;
}

// ============================================================================
// Annotated Musical Frame
// ============================================================================

/**
 * The output of a ruleset: musical elements annotated with visual properties.
 * Grammars receive this and decide how to render each element.
 *
 * Grammars are aware of musical element categories (notes, chords, beats, etc.)
 * but not musical analysis details (pitch class, chord quality, key).
 * They use visual annotations to style their chosen representations.
 *
 * Critical design constraint: Because grammars don't know chord quality,
 * the ruleset MUST assign visually consistent annotations to similar musical
 * concepts. All minor chords must share visual characteristics that distinguish
 * them from major chords. This is the ruleset's core responsibility.
 */
export interface AnnotatedMusicalFrame {
  t: Ms;
  part: PartId;

  /** Annotated notes - grammars decide how/whether to render */
  notes: AnnotatedNote[];

  /** Annotated chords - grammars decide how/whether to render */
  chords: AnnotatedChord[];

  /** Rhythmic analysis with visual annotations */
  rhythm: AnnotatedRhythm;

  /** Bar boundaries with visual annotations */
  bars: AnnotatedBar[];

  /** Phrase boundaries with visual annotations */
  phrases: AnnotatedPhrase[];

  /** Global dynamics with visual annotations */
  dynamics: AnnotatedDynamics;
}
