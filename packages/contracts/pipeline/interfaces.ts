/**
 * Pipeline Interfaces
 *
 * Defines the contracts for pipeline components: adapters, stabilizers,
 * rulesets, grammars, compositor, and renderer.
 *
 * See SPEC_008 for pipeline orchestration and SPEC_009 for frame types.
 */

import type { SourceId, StreamId } from "../core/provenance";
import type { Ms, SessionMs } from "../core/time";
import type { SceneFrame } from "../scene/scene";
import type { PartId } from "../parts/parts";
import type { RawInputFrame } from "../raw/raw";
import type { MusicalFrame } from "../musical/musical";
import type { AnnotatedMusicalFrame } from "../annotated/annotated";

// ============================================================================
// Source Adapters
// ============================================================================

/**
 * Source adapter that emits raw protocol-level input.
 *
 * Adapters bridge external input sources (MIDI, audio) to the pipeline.
 * They emit RawInputFrame containing protocol-level events without
 * musical interpretation.
 */
export interface IRawSourceAdapter {
  readonly source: SourceId;
  readonly stream: StreamId;

  /**
   * Get the next frame of raw input, or null if no input available.
   * Called by the pipeline on each frame request.
   */
  nextFrame(): RawInputFrame | null;
}

// ============================================================================
// Stabilizers
// ============================================================================

/**
 * Stabilizer that transforms raw input to musical abstractions.
 *
 * Stabilizers accumulate temporal context to produce proper musical
 * abstractions (notes with duration, chords, beats) from raw protocol
 * events (note_on, note_off).
 *
 * Stabilizers form a DAG based on dependencies. See SPEC_008 for details:
 * - Independent stabilizers (no dependencies) process RawInputFrame directly
 * - Derived stabilizers receive upstream MusicalFrame from dependencies
 * - Pipeline topologically sorts and executes stabilizers in order
 */
export interface IMusicalStabilizer {
  id: string;

  /**
   * IDs of stabilizers this one depends on.
   * Derived stabilizers (e.g., ChordDetectionStabilizer) declare dependencies
   * on upstream stabilizers (e.g., NoteTrackingStabilizer).
   */
  dependencies?: string[];

  /** Called once when the stabilizer is initialized */
  init(): void;

  /** Called once when the session ends or stabilizer is removed */
  dispose(): void;

  /**
   * Process raw input and produce musical state.
   *
   * @param raw - Raw protocol input from adapters
   * @param upstream - Merged MusicalFrame from upstream stabilizers (null if no dependencies)
   * @returns MusicalFrame with this stabilizer's contributions
   */
  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame;

  /**
   * Reset internal state (e.g., on session restart or part reassignment).
   */
  reset(): void;

  /**
   * Optional: apply a manifest macro to this stabilizer's runtime
   * config. Called by the pipeline for every stabilizer on every
   * set_macro dispatch; stabilizers that don't own the given macro
   * ignore it silently.
   *
   * Stabilizers own scope-prefixed macros (harmony:*, rhythm:*)
   * whose parameters live on the stabilizer side of the pipeline
   * rather than the grammar side — e.g. harmony:arpeggio-tolerance
   * maps to ChordDetectionStabilizer.pitchDecayMs.
   */
  setMacro?(name: string, value: number | string): void;

  /**
   * Optional: return the current values of every macro this
   * stabilizer accepts, keyed by the same string setMacro takes
   * (typically the full qualified macro id, e.g. "harmony:arpeggio-tolerance").
   * Used by state:// to source the effective-state view from
   * consumers rather than a mirror; used by the wiring-coverage
   * test to assert setMacro actually mutated something.
   */
  readMacros?(): Record<string, number | string>;
}

// ============================================================================
// Visual Vocabulary (RFC 006)
// ============================================================================

/**
 * Visual Vocabulary that annotates musical frames with visual properties.
 * (Also referred to as "vocabulary" in shorthand.)
 *
 * Visual vocabularies are pure functions that:
 * - Assign palettes based on harmonic content
 * - Assign textures based on timbral qualities
 * - Assign motion properties based on rhythmic/dynamic context
 *
 * Visual vocabularies do NOT:
 * - Decide what shape a note should be
 * - Filter out musical elements
 * - Make rendering decisions
 *
 * Key responsibility: Define a consistent visual vocabulary that encodes
 * musical meaning. All minor chords must share visual characteristics that
 * distinguish them from major chords. Users learn this vocabulary; grammars
 * respect it while making their own rendering choices.
 *
 * The metaphor: vocabulary defines words, grammars write sentences.
 */
export interface IVisualVocabulary {
  id: string;

  /**
   * Pure function: annotates musical state with visual properties.
   * No internal state. Same input always produces same output.
   */
  annotate(frame: MusicalFrame): AnnotatedMusicalFrame;

  /**
   * Optional: apply a manifest macro. Vocab macros are typically
   * colour/palette anchors (e.g. system:colour-mapping:reference).
   * The pipeline calls this on every set_macro; vocabs that don't
   * own the given macro ignore it silently. See IMusicalStabilizer.setMacro.
   */
  setMacro?(name: string, value: number | string): void;

  /**
   * Optional: return the current values of every macro this vocab
   * accepts, keyed as setMacro takes them. See IMusicalStabilizer.readMacros.
   */
  readMacros?(): Record<string, number | string>;
}

/**
 * @deprecated Use IVisualVocabulary instead. Alias retained for migration.
 */
export type IVisualRuleset = IVisualVocabulary;

// ============================================================================
// Grammars (RFC 006)
// ============================================================================

/**
 * Grammar that renders annotated musical frames to scene entities.
 *
 * Grammars receive annotated musical elements and decide HOW to render them
 * (or whether to render them at all). They are aware of musical element
 * categories (notes, chords, beats) but not musical analysis details.
 *
 * Grammars:
 * - Decide which musical elements to render
 * - Decide what visual representation to use (particles, shapes, trails, etc.)
 * - Use visual annotations to style their chosen representations
 * - Maintain entity state across frames
 * - May filter elements (e.g., rhythm grammar ignores chords)
 *
 * Grammars do NOT:
 * - Perform musical analysis
 * - Know pitch class, key, chord quality details
 * - Access raw MIDI or audio data
 *
 * Example interpretive choices:
 * - Rhythm grammar: renders beats as pulses, notes as timing markers, ignores harmony
 * - Chord grammar: renders chords as expanding blooms, notes as particles within
 * - Both use the same visual annotations (palette, texture, motion) from the ruleset
 */
export interface IVisualGrammar {
  id: string;

  /**
   * Initialize the grammar with context for this part.
   */
  init(ctx: GrammarContext): void;

  /**
   * Dispose of any resources.
   */
  dispose(): void;

  /**
   * Update the scene based on annotated musical elements and previous state.
   *
   * The grammar:
   * - Iterates through musical elements it cares about
   * - Creates/updates/removes entities based on its rendering strategy
   * - Uses visual annotations for styling (palette, texture, motion)
   * - Manages entity lifecycle independently
   */
  update(input: AnnotatedMusicalFrame, previous: SceneFrame | null): SceneFrame;

  /** Schema for configurable parameters (optional) */
  paramsSchema?: Record<string, unknown>;

  /**
   * Optional: apply a partial macro update. Keys are the grammar's
   * own camelCased param names (e.g. "linger", "pulseIntensity") —
   * matching the manifest consumer entry's macroKey for grammar
   * consumers. The pipeline translates a scope-prefixed macro id
   * (harmony:linger) to `{ linger: value }` and calls this.
   */
  setMacros?(macros: Record<string, number | string>): void;

  /**
   * Optional: return the current values of every macro this grammar
   * accepts, keyed by the same camelCase names setMacros uses.
   */
  readMacros?(): Record<string, number | string>;
}

/**
 * Context provided to grammars during initialization.
 */
export interface GrammarContext {
  canvasSize: { width: number; height: number };
  rngSeed: number;
  part: PartId;
}

// ============================================================================
// Compositor and Renderer
// ============================================================================

/**
 * Compositor that merges multiple scene frames into one.
 */
export interface ICompositor {
  id: string;
  compose(frames: SceneFrame[]): SceneFrame;
}

/**
 * Renderer that draws a scene frame to output.
 */
export interface IRenderer {
  id: string;
  render(scene: SceneFrame): void;
}

// ============================================================================
// Pipeline
// ============================================================================

/**
 * The central pipeline orchestrator.
 *
 * Uses a pull-based model where the renderer requests frames at target times.
 * The pipeline coordinates: Adapters → Stabilizers → Vocabulary → Grammars → Compositor
 *
 * See SPEC_005 for frame timing and SPEC_008 for orchestration details.
 */
export interface IPipeline {
  /**
   * Request a frame for the given target time.
   * The pipeline processes all active parts and returns a composited scene.
   */
  requestFrame(targetTime: SessionMs): SceneFrame;
}

/**
 * Tracks recent activity per part to resolve deictic references like "this".
 * Used by the speech interface to determine which part a user is referring to.
 */
export interface IActivityTracker {
  /** Record activity for a part at a given time */
  recordActivity(part: PartId, t: SessionMs): void;

  /** Get the most active part within the given time window */
  getMostActive(windowMs: Ms): PartId | null;
}
