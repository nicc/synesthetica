/**
 * Visual Intent Types
 *
 * Visual intents are the output of rulesets and input to grammars.
 * They describe what to visualize without any musical concepts.
 *
 * See RFC 005 for design rationale.
 */

import type { Ms, Confidence } from "../core/time";
import type { MusicalEvent } from "../cms/music";
import type { ColorHSVA } from "./colors";

/**
 * Unique identifier for a visual intent.
 */
export type VisualIntentId = string;

// ============================================================================
// Core intent types (used by both legacy and new code)
// ============================================================================

export interface PaletteIntent {
  type: "palette";
  id?: VisualIntentId; // Optional during migration, required in new code
  t: Ms;
  base: ColorHSVA;
  accents?: ColorHSVA[];
  stability: number; // 0..1
  confidence: Confidence;
  group?: VisualIntentId; // Reference to parent/grouping intent
}

export interface MotionIntent {
  type: "motion";
  id?: VisualIntentId;
  t: Ms;
  pulse: number; // 0..1
  flow: number; // -1..1
  jitter: number; // 0..1
  confidence: Confidence;
  group?: VisualIntentId;
}

export interface TextureIntent {
  type: "texture";
  id?: VisualIntentId;
  t: Ms;
  grain: number; // 0..1
  turbulence: number; // 0..1
  anisotropy: number; // 0..1
  confidence: Confidence;
  group?: VisualIntentId;
}

export interface ShapeIntent {
  type: "shape";
  id?: VisualIntentId;
  t: Ms;
  sharpness: number; // 0..1
  complexity: number; // 0..1
  confidence: Confidence;
  group?: VisualIntentId;
}

export type VisualIntent =
  | PaletteIntent
  | MotionIntent
  | TextureIntent
  | ShapeIntent;

// ============================================================================
// Frame types
// ============================================================================

/**
 * Frame of visual intents (new - RFC 005).
 * Produced by rulesets, consumed by grammars.
 *
 * Note: No musical events - grammars must not see musical concepts.
 */
export interface VisualIntentFrame {
  t: Ms;
  intents: VisualIntent[];
  uncertainty: number; // 0..1
}

/**
 * @deprecated Use VisualIntentFrame instead. Will be removed after migration.
 *
 * Legacy frame that includes musical events. Grammars should not read events.
 */
export interface IntentFrame {
  t: Ms;
  intents: VisualIntent[];
  events: MusicalEvent[];
  uncertainty: number;
}
