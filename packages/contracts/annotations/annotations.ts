/**
 * Annotations are advisory metadata designed to help an LLM operator
 * choose lenses/presets/macros that fit user intent, and to describe
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
// LensAnnotation
// ============================================================================

export interface LensAnnotation {
  id: string;                 // lens id
  name?: string;
  aliases?: string[];         // user-facing synonyms: "style", "look", "effect"
  illustrates?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
  cautions?: string[];
  /** How this lens responds to each macro (helps LLM choose adjustments) */
  macroResponses?: Record<string, MacroResponse>;
}

// ============================================================================
// ResourceAnnotation
// ============================================================================

/**
 * Describes an MCP resource — the LLM-facing description, aliases,
 * notes, and shape guidance. Covers the state + preset-index +
 * annotations-bundle URIs that don't have their own per-item
 * annotation (unlike macros, session controls, concepts, lenses,
 * presets which each carry their own annotation).
 *
 * Resources are NOUNS (state://<label>/current, presets://). This is
 * the annotation surface for those nouns — the composed
 * system-overview prompt lists them so the LLM knows what data it
 * can read without having to browse resources/list.
 *
 * The `uri` may contain a `{label}` or `{name}` placeholder for
 * template routing.
 */
export interface ResourceAnnotation {
  /** URI or URI template (with {label}, {name}, etc.). */
  uri: string;
  /** Short human-oriented name. */
  name: string;
  /** LLM-facing description — what the resource returns + when to read it. */
  description: string;
  /** Optional natural-language synonyms. */
  aliases?: string[];
  /** Longer prose — usage guidance, shape details, caveats. */
  notes?: string[];
  /** Concrete example URIs / payloads. */
  examples?: string[];
  /** True if the resource fires update notifications; false = pull-only. */
  subscribable: boolean;
}

// ============================================================================
// ToolAnnotation
// ============================================================================

/**
 * Describes an MCP tool — the LLM-facing description, aliases, notes
 * examples. The tool's actual schema and handler live in the CLI's
 * tool code; the annotation supplies the editorial voice.
 *
 * Tools are VERBS (set_key, set_macro, switch_preset). This is the
 * annotation surface for that verb — never rendered as a UI control.
 * The UI panel reads macros + session controls; tools flow to the
 * LLM via MCP tools/list only.
 */
export interface ToolAnnotation {
  /** Tool id — must match the name registered with the MCP server. */
  id: string;
  /** Short LLM-facing description that appears in tools/list. */
  description: string;
  /** Optional natural-language synonyms the LLM can recognise from the user. */
  aliases?: string[];
  /** Longer prose — usage guidance, examples, caveats. */
  notes?: string[];
  /** Concrete example calls, formatted as free text. */
  examples?: string[];
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
 * Runtime consumer of a macro — lens, stabilizer, or vocabulary
 * instance that actually receives the value and mutates behaviour.
 *
 * `id` must match the consumer's runtime id (e.g. "harmony-lens",
 * "chord-detection-stabilizer", "musical-visual"). `macroKey` must
 * exist as a callable entry on that consumer's `macros` dispatch
 * table — the build-time validator + engine-side coverage test
 * assert both. Declaring a consumer here is a promise the code
 * fulfils; the validator turns a broken promise into a build error.
 */
export type ConsumerKind = "lens" | "stabilizer" | "vocab";

export interface MacroConsumer {
  kind: ConsumerKind;
  id: string;
  /** Key in consumer's macros dispatch table. Usually equals the
   *  camelCased param name (e.g. "linger", "arpeggioTolerance"). */
  macroKey: string;
}

/**
 * Fields common to every macro annotation regardless of shape.
 *
 * Notes are split by audience: `notes` speaks to the LLM operator
 * (composed into the get_started primer; assumes tool-call context,
 * mentions macro ids and effective/intents, etc.), while
 * `humanNotes` speaks to the person using the visualiser panel
 * (short, tooltip-appropriate — what does this control do to what
 * I see and hear?). Skip humanNotes on macros that shouldn't ever
 * show a tooltip; the panel renderer treats absent + empty as 'no
 * tooltip'. The validator warns on missing humanNotes for any
 * widget-bearing macro.
 */
interface MacroAnnotationBase {
  id: string;                        // e.g. "time-horizon", "rhythm:difficulty"
  name?: string;                     // human-readable
  aliases?: string[];                // user-facing synonyms
  affects?: MusicalConcept[];
  traits?: VisualTrait[];
  /** LLM-facing notes composed into the get_started primer. */
  notes?: string[];
  /** Human-facing notes for the panel widget's on-hover tooltip.
   *  Excludes LLM-specific framing (no tool-call shape, no primer
   *  references, no `state.macros.effective` etc.). Short — 1–2
   *  sentences per entry. */
  humanNotes?: string[];
  cautions?: string[];
}

/**
 * A macro exposed as a continuous 0..1 (or range-limited) dial. The
 * LLM picks a numeric value; the dispatcher maps to the underlying
 * lens/stabilizer parameter.
 */
export interface ContinuousMacroAnnotation extends MacroAnnotationBase {
  type: "continuous";
  /** Inclusive range [min, max]. Values outside are clamped. */
  range: [number, number];
  /** Default value (also the launch-time value). Anchors relative
   *  requests like "more" or "less" for the LLM. */
  default: number;
  directionality: MacroDirectionality;
  /** Runtime consumers. Required — an unwired macro is a lie the
   *  manifest can't tell. Validator enforces non-empty. */
  consumers: MacroConsumer[];
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
  /** Runtime consumers. Required — see ContinuousMacroAnnotation. */
  consumers: MacroConsumer[];
}

/**
 * A single target of a compound macro. `id` is the leaf macro this
 * compound routes to. `invert: true` flips the direction so the
 * compound's high end corresponds to the leaf's low end (used when a
 * compound's semantics run counter to a leaf's natural range — e.g.
 * "difficulty" HIGH should give tolerance LOW).
 */
export interface CompoundTarget {
  id: string;
  invert?: boolean;
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
   * Underlying targets fanned by this macro. Each entry is either a
   * leaf macro id (default direction) or a `{id, invert}` object for
   * per-target direction control.
   */
  targets: Array<string | CompoundTarget>;
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
// DerivedStateAnnotation — read-only fields the server computes from
// other state, exposed for LLM discovery so it doesn't have to
// re-derive them from primary fields.
// ============================================================================

/**
 * Describes a read-only state field the server computes from other
 * state. Unlike session controls, these have no widget and no setter
 * — the value updates automatically when its inputs change.
 * Enumerable via the manifest so a client can discover what derived
 * context exists without reading `state://<label>/current` blind.
 *
 * The "documentation compensating for state the system knows"
 * pattern: when a computed answer would otherwise be derivable prose
 * the operator has to remember, lift it into a field and describe
 * the field here.
 *
 * The category is empty at time of writing — kept in the manifest
 * shape so future derived fields (resolved compound values, effective
 * clip ceilings once real ones exist, etc.) have a home to appear.
 */
export interface DerivedStateAnnotation {
  /** Field path within EngineStateSnapshot, e.g. "session.someDerived". */
  id: string;
  /** Human-readable name. */
  name?: string;
  /** Aliases for filter / search. */
  aliases?: string[];
  /** Primary inputs the field is derived from (id references). */
  derivedFrom: string[];
  /** For enum-shaped fields, the set of possible values. */
  values?: Array<string | number>;
  /** Explanatory prose. */
  notes?: string[];
}

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
  /** LLM-facing notes composed into the get_started primer. */
  notes?: string[];
  /** Human-facing notes for the panel widget's on-hover tooltip.
   *  See MacroAnnotationBase.humanNotes for the split rationale. */
  humanNotes?: string[];
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
  /**
   * Preferred value when nothing has been prescribed. Used by the UI
   * to seed the widget, and by the engine to fill implicit paired
   * values (e.g. session:mode fills to 'ionian' when a tonic is set
   * with no mode). Optional — when absent, a nullable enum shows
   * "—" and a non-nullable enum shows the first enumValue.
   */
  default?: string | number;
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
 * "note-strip", "guide-ring", "connector-strip".
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
