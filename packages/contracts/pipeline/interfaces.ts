import type { SourceId, StreamId } from "../core/provenance";
import type { CMSFrame } from "../cms/cms";
import type { IntentFrame } from "../intents/intents";
import type { SceneFrame } from "../scene/scene";
import type { PartId } from "../parts/parts";

export interface ISourceAdapter {
  readonly source: SourceId;
  readonly stream: StreamId;
  nextFrame(): CMSFrame | null;
}

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

export interface IRuleset {
  id: string;
  map(frame: CMSFrame): IntentFrame;
}

export interface GrammarContext {
  canvasSize: { width: number; height: number };
  rngSeed: number;
  part: PartId;
}

export interface IGrammar {
  id: string;
  init(ctx: GrammarContext): void;
  update(input: IntentFrame, previous: SceneFrame | null): SceneFrame;
  paramsSchema?: Record<string, unknown>;
}

export interface ICompositor {
  id: string;
  compose(frames: SceneFrame[]): SceneFrame;
}

export interface IRenderer {
  id: string;
  render(scene: SceneFrame): void;
}
