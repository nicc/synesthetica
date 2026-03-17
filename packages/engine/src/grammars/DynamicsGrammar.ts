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
const BAR_WIDTH_FRACTION = 0.19;                // bar takes 19% of the margin
const BAR_WIDTH = LEFT_MARGIN * BAR_WIDTH_FRACTION;
const BAR_CENTER = LEFT_MARGIN / 2;
const BAR_LEFT = BAR_CENTER - BAR_WIDTH / 2;
const BAR_RIGHT = BAR_CENTER + BAR_WIDTH / 2;

/** Top of the bar (1/6 from top — centred in 2/3 of screen height) */
const BAR_TOP = 1 / 6;

/** Bottom of the bar (5/6 from top) */
const BAR_BOTTOM = 5 / 6;

/** Bar height in normalized coordinates */
const BAR_HEIGHT = BAR_BOTTOM - BAR_TOP;

/** How long indicator lines take to fully fade (ms) */
const FADE_MS = 2000;

/**
 * Indicator thickness in normalized coords (fraction of BAR_HEIGHT).
 * Grows from MIN to MAX as the indicator ages, giving the blocky
 * diffusion effect. Expressed in normalized coords so the rect
 * can be clamped precisely to BAR_TOP/BAR_BOTTOM.
 */
const INDICATOR_THICKNESS_MIN = 0.003;
const INDICATOR_THICKNESS_MAX = 0.012;

/** Minimum starting opacity so quiet notes are still visible */
const MIN_OPACITY = 0.25;

/** Tick length as fraction of bar width (ruler marks at 25% intervals) */
const TICK_LENGTH = 0.25;

/** Inset ticks from outline edges to avoid opacity stacking */
const TICK_INSET = 0.002;

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
    // Inset from outline edges to avoid opacity stacking at intersections
    const tickLen = BAR_WIDTH * TICK_LENGTH;
    const tickLeftStart = BAR_LEFT + TICK_INSET;
    const tickRightEnd = BAR_RIGHT - TICK_INSET;
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
            { x: tickLeftStart, y },
            { x: tickLeftStart + tickLen, y },
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
            { x: tickRightEnd - tickLen, y },
            { x: tickRightEnd, y },
          ],
        },
      });
    }

    // --- Indicator rectangles ---
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const age = t - event.t;

      if (age >= FADE_MS) continue;

      const fadeFraction = 1 - age / FADE_MS;
      const startOpacity = Math.max(event.intensity, MIN_OPACITY);
      const opacity = startOpacity * fadeFraction;

      if (opacity < 0.01) continue;

      const centerY = this.intensityToY(event.intensity);

      // Thickness grows as the indicator ages (blocky diffusion).
      // Clamp top/bottom independently so notes at the edges still
      // render — the rect extends inward from the edge rather than
      // being symmetrically squashed to zero.
      const ageFraction = age / FADE_MS;
      const rawHalfH =
        (INDICATOR_THICKNESS_MIN +
          (INDICATOR_THICKNESS_MAX - INDICATOR_THICKNESS_MIN) * ageFraction) /
        2;
      const top = Math.max(centerY - rawHalfH, BAR_TOP);
      const bottom = Math.min(centerY + rawHalfH, BAR_BOTTOM);

      entities.push({
        id: `${this.id}:ind:${i}`,
        part,
        kind: "glyph",
        createdAt: event.t,
        updatedAt: t,
        style: {
          color: INDICATOR_COLOR,
          opacity,
        },
        data: {
          type: "dynamics-indicator",
          x: BAR_LEFT,
          y: top,
          w: BAR_WIDTH,
          h: bottom - top,
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
