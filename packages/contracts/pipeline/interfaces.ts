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
  apply(frame: CMSFrame): CMSFrame;
}

export interface IRuleset {
  id: string;
  map(frame: CMSFrame): IntentFrame;
}

export interface StyleContext {
  canvasSize: { width: number; height: number };
  rngSeed: number;
  part: PartId;
}

export interface IStyle {
  id: string;
  init(ctx: StyleContext): void;
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
