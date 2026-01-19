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
import type { VisualIntentFrame } from "../intents/intents";
import type { SceneFrame } from "../scene/scene";
import type { PartId } from "../parts/parts";
import type { RawInputFrame } from "../raw/raw";
import type { MusicalFrame } from "../musical/musical";

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
}

// ============================================================================
// Rulesets
// ============================================================================

/**
 * Ruleset that maps musical state to visual intents.
 *
 * Rulesets are pure functions that translate musical semantics to
 * visual intentions. They encode the "meaning" of musical events
 * without prescribing specific visual outcomes.
 */
export interface IVisualRuleset {
  id: string;

  /**
   * Pure function: maps musical state to visual intents.
   * No internal state. Same input always produces same output.
   */
  map(frame: MusicalFrame): VisualIntentFrame;
}

// ============================================================================
// Grammars
// ============================================================================

/**
 * Grammar that maps visual intents to scene entities.
 *
 * Grammars:
 * - Decide visual form, not meaning
 * - See only visual intents, never musical events
 * - OWN entity lifecycle (TTL, decay, removal)
 * - Are NOT obligated to tie entity lifetime to intent lifetime
 *
 * Entity lifecycle model (see SPEC_009):
 * - Intent appears → Grammar may spawn entity with its own TTL
 * - Intent continues → Grammar may reinforce entity or ignore
 * - Intent disappears → Grammar may spawn release effect or do nothing
 * - Entity TTL expires → Entity is removed (grammar's decision)
 *
 * Grammars may spawn entities that outlive their source intent.
 * This decoupling enables use cases like ear training where visual
 * persistence differs from musical duration.
 */
export interface IVisualGrammar {
  id: string;

  /**
   * Initialize the grammar with context for this part.
   */
  init(ctx: GrammarContext): void;

  /**
   * Update the scene based on current intents and previous state.
   *
   * The grammar interprets intents and manages entity lifecycle.
   * It is not required to track intent presence for entity lifetime.
   */
  update(input: VisualIntentFrame, previous: SceneFrame | null): SceneFrame;

  /** Schema for configurable parameters (optional) */
  paramsSchema?: Record<string, unknown>;
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
 * The pipeline coordinates: Adapters → Stabilizers → Ruleset → Grammars → Compositor
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
