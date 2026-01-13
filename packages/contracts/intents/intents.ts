import type { Ms, Confidence } from "../core/time";
import type { MusicalEvent } from "../cms/music";
import type { ColorHSVA } from "./colors";

export interface PaletteIntent {
  type: "palette";
  t: Ms;
  base: ColorHSVA;
  accents?: ColorHSVA[];
  stability: number;      // 0..1
  confidence: Confidence;
}

export interface MotionIntent {
  type: "motion";
  t: Ms;
  pulse: number;          // 0..1
  flow: number;           // -1..1
  jitter: number;         // 0..1
  confidence: Confidence;
}

export interface TextureIntent {
  type: "texture";
  t: Ms;
  grain: number;          // 0..1
  turbulence: number;     // 0..1
  anisotropy: number;     // 0..1
  confidence: Confidence;
}

export interface ShapeIntent {
  type: "shape";
  t: Ms;
  sharpness: number;      // 0..1
  complexity: number;     // 0..1
  confidence: Confidence;
}

export type VisualIntent = PaletteIntent | MotionIntent | TextureIntent | ShapeIntent;

export interface IntentFrame {
  t: Ms;
  intents: VisualIntent[];
  events: MusicalEvent[];
  uncertainty: number; // 0..1
}
