/**
 * Visual Intent Types
 *
 * Visual intents are the output of rulesets and input to grammars.
 * They describe what to visualize without any musical concepts.
 *
 * See SPEC_009 for frame type details.
 */

import type { Ms, Confidence } from "../core/time";
import type { ColorHSVA } from "./colors";

/**
 * Unique identifier for a visual intent.
 * Used to correlate intents across frames for entity lifecycle management.
 */
export type VisualIntentId = string;

// ============================================================================
// Intent Types
// ============================================================================

/**
 * Palette intent - color scheme for visualization.
 */
export interface PaletteIntent {
  type: "palette";
  id: VisualIntentId;
  t: Ms;
  base: ColorHSVA;
  accents?: ColorHSVA[];
  stability: number; // 0..1 - how stable the color should be
  confidence: Confidence;
  group?: VisualIntentId; // Reference to parent/grouping intent
}

/**
 * Motion intent - movement characteristics.
 */
export interface MotionIntent {
  type: "motion";
  id: VisualIntentId;
  t: Ms;
  pulse: number; // 0..1 - intensity of motion
  flow: number; // -1..1 - direction tendency
  jitter: number; // 0..1 - randomness
  confidence: Confidence;
  group?: VisualIntentId;
}

/**
 * Texture intent - surface characteristics.
 */
export interface TextureIntent {
  type: "texture";
  id: VisualIntentId;
  t: Ms;
  grain: number; // 0..1
  turbulence: number; // 0..1
  anisotropy: number; // 0..1
  confidence: Confidence;
  group?: VisualIntentId;
}

/**
 * Shape intent - geometric characteristics.
 */
export interface ShapeIntent {
  type: "shape";
  id: VisualIntentId;
  t: Ms;
  sharpness: number; // 0..1
  complexity: number; // 0..1
  confidence: Confidence;
  group?: VisualIntentId;
}

/**
 * Union of all visual intent types.
 */
export type VisualIntent =
  | PaletteIntent
  | MotionIntent
  | TextureIntent
  | ShapeIntent;

// ============================================================================
// Frame Types
// ============================================================================

/**
 * Frame of visual intents.
 *
 * Produced by rulesets, consumed by grammars.
 * Contains only visual intents - no musical concepts.
 */
export interface VisualIntentFrame {
  t: Ms;
  intents: VisualIntent[];
  uncertainty: number; // 0..1 - overall confidence in intent interpretation
}
