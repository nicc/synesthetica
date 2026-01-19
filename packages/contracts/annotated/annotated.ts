/**
 * Annotated Musical Frame Types (RFC 006)
 *
 * Annotated frames combine musical elements with visual properties.
 * Rulesets produce these; grammars consume them and decide how to render.
 *
 * Key insight: rulesets define vocabulary, grammars write sentences.
 *
 * See RFC 006 for design rationale.
 */

import type { Ms, Confidence } from "../core/time";
import type { PartId } from "../parts/parts";
import type { ColorHSVA } from "../intents/colors";
import type {
  Note,
  NoteId,
  MusicalChord,
  BeatState,
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
// Annotated Musical Elements
// ============================================================================

/**
 * A note with visual annotations.
 * The note data comes from stabilizers; annotations come from ruleset.
 */
export interface AnnotatedNote {
  /** The underlying musical note */
  note: Note;

  /** Visual properties assigned by ruleset */
  visual: VisualAnnotation;
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

  /** Visual properties assigned by ruleset */
  visual: VisualAnnotation;

  /** IDs of constituent notes (from chord detection) */
  noteIds: NoteId[];
}

/**
 * Beat information with visual annotations.
 *
 * Note: beatInBar and isDownbeat are now part of BeatState (from stabilizer).
 * Grammars access them via beat.beatInBar and beat.isDownbeat.
 */
export interface AnnotatedBeat {
  /** Current beat state (includes tempo, phase, beatInBar, isDownbeat) */
  beat: BeatState;

  /** Visual properties for beat visualization */
  visual: VisualAnnotation;
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

  /** Beat/meter information with visual annotations */
  beat: AnnotatedBeat | null;

  /** Bar boundaries with visual annotations */
  bars: AnnotatedBar[];

  /** Phrase boundaries with visual annotations */
  phrases: AnnotatedPhrase[];

  /** Global dynamics with visual annotations */
  dynamics: AnnotatedDynamics;
}
