/**
 * Pipeline Interfaces
 *
 * Defines the contracts for pipeline components: adapters, stabilizers,
 * rulesets, grammars, compositor, and renderer.
 *
 * See RFC 005 for the new frame type architecture.
 */

import type { SourceId, StreamId } from "../core/provenance";
import type { Ms, SessionMs } from "../core/time";
import type { CMSFrame } from "../cms/cms";
import type { IntentFrame, VisualIntentFrame } from "../intents/intents";
import type { SceneFrame } from "../scene/scene";
import type { PartId } from "../parts/parts";
import type { RawInputFrame } from "../raw/raw";
import type { MusicalFrame } from "../musical/musical";

// ============================================================================
// New interfaces (RFC 005)
// ============================================================================

/**
 * Source adapter that emits raw protocol-level input.
 * Use this for new implementations.
 */
export interface IRawSourceAdapter {
  readonly source: SourceId;
  readonly stream: StreamId;
  nextFrame(): RawInputFrame | null;
}

/**
 * Stabilizer that transforms raw input to musical abstractions.
 * Use this for new implementations.
 */
export interface IMusicalStabilizer {
  id: string;

  /** Called once when the stabilizer is initialized */
  init(): void;

  /** Called once when the session ends or stabilizer is removed */
  dispose(): void;

  /**
   * Process raw input and produce musical state.
   * Stabilizers accumulate temporal context internally.
   */
  apply(raw: RawInputFrame, previous: MusicalFrame | null): MusicalFrame;

  /**
   * Reset internal state (e.g., on session restart or part reassignment).
   */
  reset(): void;
}

/**
 * Ruleset that maps musical state to visual intents.
 * Use this for new implementations.
 */
export interface IVisualRuleset {
  id: string;

  /**
   * Pure function: maps musical state to visual intents.
   * No internal state. Same input always produces same output.
   */
  map(frame: MusicalFrame): VisualIntentFrame;
}

/**
 * Grammar that maps visual intents to scene entities.
 * Use this for new implementations.
 */
export interface IVisualGrammar {
  id: string;
  init(ctx: GrammarContext): void;
  update(input: VisualIntentFrame, previous: SceneFrame | null): SceneFrame;
  paramsSchema?: Record<string, unknown>;
}

// ============================================================================
// Legacy interfaces (for backward compatibility during migration)
// These will be removed in Phase 9
// ============================================================================

/**
 * @deprecated Use IRawSourceAdapter instead. Will be removed after migration.
 */
export interface ISourceAdapter {
  readonly source: SourceId;
  readonly stream: StreamId;
  nextFrame(): CMSFrame | null;
}

/**
 * @deprecated Use IMusicalStabilizer instead. Will be removed after migration.
 */
export interface IStabilizer {
  id: string;

  /** Called once when the stabilizer is initialized */
  init(): void;

  /** Called once when the session ends or stabilizer is removed */
  dispose(): void;

  /**
   * Process a frame, potentially using and updating internal state.
   * Returns an enriched CMSFrame with derived signals.
   */
  apply(frame: CMSFrame): CMSFrame;

  /**
   * Reset internal state (e.g., on session restart or part reassignment).
   */
  reset(): void;
}

/**
 * @deprecated Use IVisualRuleset instead. Will be removed after migration.
 */
export interface IRuleset {
  id: string;
  map(frame: CMSFrame): IntentFrame;
}

/**
 * @deprecated Use IVisualGrammar instead. Will be removed after migration.
 */
export interface IGrammar {
  id: string;
  init(ctx: GrammarContext): void;
  update(input: IntentFrame, previous: SceneFrame | null): SceneFrame;
  paramsSchema?: Record<string, unknown>;
}

// ============================================================================
// Shared interfaces (unchanged)
// ============================================================================

export interface GrammarContext {
  canvasSize: { width: number; height: number };
  rngSeed: number;
  part: PartId;
}

export interface ICompositor {
  id: string;
  compose(frames: SceneFrame[]): SceneFrame;
}

export interface IRenderer {
  id: string;
  render(scene: SceneFrame): void;
}

/**
 * The central pipeline orchestrator.
 * Uses a pull-based model where the renderer requests frames at target times.
 * See SPEC_005 and SPEC_008 for details.
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
