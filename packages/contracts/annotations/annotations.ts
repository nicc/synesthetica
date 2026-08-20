/**
 * Annotations are advisory metadata designed to help an LLM operator
 * choose grammars/presets/macros that fit user intent, and to describe
 * the session controls and system vocabulary the LLM can operate on
 * and reason about.
 *
 * They are NOT executable semantics.
 *
 * See SPEC 004 and RFC 011 §Annotation types.
 */

// ============================================================================
// Shared vocabulary
// ============================================================================

export type MusicalConcept =
  | "rhythm" | "harmony" | "melody" | "timbre"
  | "density" | "articulation" | "phrasing" | "dynamics";

export type VisualTrait =
  | "discrete" | "continuous"
  | "transient" | "persistent"
  | "directional" | "layered"
  | "minimal" | "dense"
  | "high-contrast" | "low-contrast"
  | "stable" | "reactive";

export type MacroResponsiveness = "strong" | "moderate" | "weak" | "none";

export interface MacroResponse {
  responsiveness: MacroResponsiveness;
  notes?: string;
}

// ============================================================================
// GrammarAnnotation
// ============================================================================

export interface GrammarAnnotation {
  id: string;                 // grammar id
  name?: string;
  aliases?: string[];         // user-facing synonyms: "style", "look", "effect"
  illustrates?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
  cautions?: string[];
  /** How this grammar responds to each macro (helps LLM choose adjustments) */
  macroResponses?: Record<string, MacroResponse>;
}

// ============================================================================
// PresetAnnotation
// ============================================================================

export interface PresetAnnotation {
  id: string;                 // preset id
  name?: string;
  emphasises?: MusicalConcept[];
  deEmphasises?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
}

// ============================================================================
// MacroAnnotation (discriminated union)
// ============================================================================

/**
 * Directional guidance for continuous macros — describes what happens
 * as the dial moves toward each extreme. Not applicable to discrete
 * or compound macros.
 */
export interface MacroDirectionality {
  low: { description: string; tendsTo?: string[] };
  high: { description: string; tendsTo?: string[] };
}

/**
 * Fields common to every macro annotation regardless of shape.
 */
interface MacroAnnotationBase {
  id: string;                        // e.g. "time-horizon", "rhythm:difficulty"
  name?: string;                     // human-readable
  aliases?: string[];                // user-facing synonyms
  affects?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
  cautions?: string[];
}

/**
 * A macro exposed as a continuous 0..1 (or range-limited) dial. The
 * LLM picks a numeric value; the dispatcher maps to the underlying
 * grammar/stabilizer parameter.
 */
export interface ContinuousMacroAnnotation extends MacroAnnotationBase {
  type: "continuous";
  /** Inclusive range [min, max]. Values outside are clamped. */
  range: [number, number];
  /** Default value (also the launch-time value). Anchors relative
   *  requests like "more" or "less" for the LLM. */
  default: number;
  directionality: MacroDirectionality;
}

/**
 * A macro exposed as a discrete enum — e.g. rhythm:quantise-resolution
 * (quarter | 8th | 16th | 32nd). No directionality; each value is its own
 * meaning.
 */
export interface DiscreteMacroAnnotation extends MacroAnnotationBase {
  type: "discrete";
  /** The allowed values, each with a human-readable label. */
  enumValues: Array<{ value: string | number; label: string }>;
  /** Default value (also the launch-time value). Must be one of
   *  enumValues[i].value. */
  default: string | number;
}

/**
 * A macro exposed as a compound — a single 0..1 dial that fans out to
 * multiple underlying params via a dispatch curve. The dispatcher is
 * responsible for the curve; this annotation declares what the macro
 * touches so the LLM understands its scope.
 */
export interface CompoundMacroAnnotation extends MacroAnnotationBase {
  type: "compound";
  /**
   * Underlying targets fanned by this macro. Each target is either
   * another macro id (recursive) or an internal param reference used
   * for documentation only — the dispatcher owns the mapping.
   */
  targets: string[];
  /** Inclusive input range for the top-level dial. Usually [0, 1]. */
  range: [number, number];
  /** Default value (also the launch-time value). */
  default: number;
  directionality: MacroDirectionality;
}

/**
 * Union of the three macro shapes. Discriminated by `type`.
 */
export type MacroAnnotation =
  | ContinuousMacroAnnotation
  | DiscreteMacroAnnotation
  | CompoundMacroAnnotation;

// ============================================================================
// SessionControlAnnotation
// ============================================================================

/**
 * Describes a per-instance session/input control (e.g. session:tonic,
 * session:tempo, input:source). Categorically distinct from aesthetic
 * macros — session controls set the musical frame the analyser reads
 * within, and use precise types (enums, paired values, booleans,
 * nullable numbers) rather than 0..1 dials.
 *
 * Session controls typically get their own MCP tools (set_key,
 * set_tempo, etc.) rather than being fanned through set_macro. This
 * annotation is for LLM discoverability and documentation.
 */
interface SessionControlAnnotationBase {
  id: string;                        // e.g. "session:tempo", "input:source"
  name?: string;
  aliases?: string[];
  notes?: string[];
  cautions?: string[];
  /**
   * Whether this control accepts null to clear. Session controls are
   * usually clearable (nullable=true); input:source typically is not.
   */
  nullable: boolean;
}

export interface NumberSessionControlAnnotation
  extends SessionControlAnnotationBase {
  type: "number";
  /** Inclusive range [min, max]. */
  range: [number, number];
  /** Human-readable unit ("BPM", "ms"). Optional. */
  unit?: string;
}

export interface EnumSessionControlAnnotation
  extends SessionControlAnnotationBase {
  type: "enum";
  enumValues: Array<{ value: string | number; label: string }>;
  /**
   * When true, the manifest declares the shape but not the values —
   * the renderer expects runtime hydration (e.g. input:source needs
   * the actual list of connected MIDI + audio devices, which lives
   * outside the manifest per SPEC 013 §Audio input selection).
   *
   * `enumValues` is ignored on dynamic controls; the renderer should
   * consult its own device/option source at bind time.
   */
  dynamicOptions?: boolean;
}

export interface BooleanSessionControlAnnotation
  extends SessionControlAnnotationBase {
  type: "boolean";
}

/**
 * Two related controls that must be set together (e.g. session:tonic
 * + session:mode form a key; session:beats-per-bar + session:beat-value
 * form a meter). The LLM should set both when either changes; the MCP
 * tool typically takes both as required args.
 */
export interface PairSessionControlAnnotation
  extends SessionControlAnnotationBase {
  type: "pair";
  /** IDs of the two controls that form the pair. */
  pair: [string, string];
}

export type SessionControlAnnotation =
  | NumberSessionControlAnnotation
  | EnumSessionControlAnnotation
  | BooleanSessionControlAnnotation
  | PairSessionControlAnnotation;

// ============================================================================
// SystemConceptAnnotation
// ============================================================================

/**
 * A term in the system's musical/visual vocabulary that the LLM should
 * be able to look up to reason coherently about user requests.
 * Examples: "borrowed-chord", "modal-interchange", "now-line",
 * "note-strip", "guide-ring", "connection-strip".
 *
 * Rendered as MCP resources under concepts://<term>. Structured for
 * lookup; prose narrative about how the pipeline flows lives
 * separately (guide://system-overview).
 */
export interface SystemConceptAnnotation {
  /** Canonical name, kebab-case (e.g. "borrowed-chord"). */
  term: string;
  /** Short prose definition — one or two sentences. */
  definition: string;
  /** Cross-links to other concept terms the reader may want next. */
  related?: string[];
  /** Optional concrete examples ("♭VI in C major is E♭ major"). */
  examples?: string[];
}
