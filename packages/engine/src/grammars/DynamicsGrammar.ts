/**
 * DynamicsGrammar — vertical dynamics bar visualization
 *
 * Renders a vertical bar on the left of the screen. Each note onset appears as
 * a horizontal indicator line at the corresponding velocity position (higher =
 * louder). Lines start at an opacity proportional to their velocity and fade
 * uniformly over FADE_MS.
 *
 * Entity types:
 * - dynamics-indicator: glyph — horizontal line per note onset, fading over time
 *
 * Consumes: frame.dynamics.events (DynamicsEvent[] from DynamicsStabilizer)
 *
 * See synesthetica-s97 for design rationale.
 */

import type {
  AnnotatedMusicalFrame,
  IVisualGrammar,
  GrammarContext,
  SceneFrame,
  Entity,
  ColorHSVA,
} from "@synesthetica/contracts";

// ============================================================================
// Layout Constants
// ============================================================================

/**
 * The dynamics bar sits in the left 1/6 margin of the world width
 * (the rhythm grammar occupies the central 2/3). The bar is centred
 * horizontally in that margin.
 */
const LEFT_MARGIN = 1 / 6;                     // matches RhythmGrammar
const BAR_WIDTH_FRACTION = 0.24;                // bar takes 24% of the margin
const BAR_WIDTH = LEFT_MARGIN * BAR_WIDTH_FRACTION;
const BAR_CENTER = LEFT_MARGIN / 2;
const BAR_LEFT = BAR_CENTER - BAR_WIDTH / 2;
const BAR_RIGHT = BAR_CENTER + BAR_WIDTH / 2;

/** Indicator lines span the full bar width (BAR_LEFT to BAR_RIGHT) */

/** Top of the bar (1/6 from top — centred in 2/3 of screen height) */
const BAR_TOP = 1 / 6;

/** Bottom of the bar (5/6 from top) */
const BAR_BOTTOM = 5 / 6;

/** Bar height in normalized coordinates */
const BAR_HEIGHT = BAR_BOTTOM - BAR_TOP;

/** How long indicator lines take to fully fade (ms) */
const FADE_MS = 2000;

/** Line width in pixels at birth */
const LINE_WIDTH_MIN = 3;

/** Line width in pixels at full fade */
const LINE_WIDTH_MAX = 7;

/** Minimum starting opacity so quiet notes are still visible */
const MIN_OPACITY = 0.25;

/** Tick length as fraction of bar width (ruler marks at 25% intervals) */
const TICK_LENGTH = 0.25;

/** Outline/tick visual style */
const OUTLINE_COLOR: ColorHSVA = { h: 200, s: 0.2, v: 0.4, a: 1.0 };
const OUTLINE_OPACITY = 0.4;
const TICK_OPACITY = 0.25;

// ============================================================================
// Colors
// ============================================================================

const INDICATOR_COLOR: ColorHSVA = { h: 200, s: 0.5, v: 0.9, a: 1.0 };

// ============================================================================
// Grammar Implementation
// ============================================================================

export class DynamicsGrammar implements IVisualGrammar {
  readonly id = "dynamics-grammar";

  init(_ctx: GrammarContext): void {
    // Stateless — reads events directly each frame
  }

  dispose(): void {
    // No resources to clean up
  }

  update(input: AnnotatedMusicalFrame, _previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];
    const t = input.t;
    const part = input.part;
    const events = input.dynamics.dynamics.events;

    // --- Outline (closed rectangle) ---
    entities.push({
      id: `${this.id}:outline`,
      part,
      kind: "glyph",
      createdAt: t,
      updatedAt: t,
      style: { color: OUTLINE_COLOR, opacity: OUTLINE_OPACITY, size: 1 },
      data: {
        type: "dynamics-contour",
        points: [
          { x: BAR_LEFT, y: BAR_TOP },
          { x: BAR_RIGHT, y: BAR_TOP },
          { x: BAR_RIGHT, y: BAR_BOTTOM },
          { x: BAR_LEFT, y: BAR_BOTTOM },
          { x: BAR_LEFT, y: BAR_TOP },
        ],
      },
    });

    // --- Ruler ticks at 25%, 50%, 75% ---
    const tickLen = BAR_WIDTH * TICK_LENGTH;
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = BAR_BOTTOM - frac * BAR_HEIGHT;
      entities.push({
        id: `${this.id}:tick:${frac}`,
        part,
        kind: "glyph",
        createdAt: t,
        updatedAt: t,
        style: { color: OUTLINE_COLOR, opacity: TICK_OPACITY, size: 1 },
        data: {
          type: "dynamics-contour",
          points: [
            { x: BAR_LEFT, y },
            { x: BAR_LEFT + tickLen, y },
          ],
        },
      });
      entities.push({
        id: `${this.id}:tick-r:${frac}`,
        part,
        kind: "glyph",
        createdAt: t,
        updatedAt: t,
        style: { color: OUTLINE_COLOR, opacity: TICK_OPACITY, size: 1 },
        data: {
          type: "dynamics-contour",
          points: [
            { x: BAR_RIGHT - tickLen, y },
            { x: BAR_RIGHT, y },
          ],
        },
      });
    }

    // --- Indicator lines ---
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const age = t - event.t;

      if (age >= FADE_MS) continue;

      const fadeFraction = 1 - age / FADE_MS;
      const startOpacity = Math.max(event.intensity, MIN_OPACITY);
      const opacity = startOpacity * fadeFraction;

      if (opacity < 0.01) continue;

      const y = this.intensityToY(event.intensity);

      // Lines are always full bar width; they grow thicker (vertically)
      // as they fade, but thickness is clamped so the line stays within
      // the bar's top/bottom edges.
      const ageFraction = age / FADE_MS;
      const rawWidth = LINE_WIDTH_MIN + (LINE_WIDTH_MAX - LINE_WIDTH_MIN) * ageFraction;

      // Clamp: half the line extends above and below y. Ensure it
      // doesn't exceed BAR_TOP or BAR_BOTTOM in normalized coords.
      // We approximate pixel→normalized: 1px ≈ 1/worldHeightPx, but
      // since the renderer handles actual pixel sizing, we just cap the
      // growth near edges proportionally.
      const headroom = Math.min(y - BAR_TOP, BAR_BOTTOM - y);
      const maxWidthForHeadroom =
        headroom < 0.02
          ? LINE_WIDTH_MIN + (rawWidth - LINE_WIDTH_MIN) * (headroom / 0.02)
          : rawWidth;
      const lineWidth = Math.max(LINE_WIDTH_MIN, maxWidthForHeadroom);

      entities.push({
        id: `${this.id}:ind:${i}`,
        part,
        kind: "glyph",
        createdAt: event.t,
        updatedAt: t,
        style: {
          color: INDICATOR_COLOR,
          opacity,
          size: lineWidth,
        },
        data: {
          type: "dynamics-contour",
          points: [
            { x: BAR_LEFT, y },
            { x: BAR_RIGHT, y },
          ],
        },
      });
    }

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  /**
   * Map intensity (0–1) to y position within the bar.
   * Higher intensity = higher on screen (lower y value).
   */
  private intensityToY(intensity: number): number {
    return BAR_BOTTOM - intensity * BAR_HEIGHT;
  }
}
