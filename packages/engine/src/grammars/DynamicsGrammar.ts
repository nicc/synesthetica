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

/** Left edge of the dynamics bar (in its own strip, left of PITCH_MARGIN) */
const BAR_LEFT = 0.005;

/** Right edge of the dynamics bar */
const BAR_RIGHT = 0.025;

/** Bar width */
const BAR_WIDTH = BAR_RIGHT - BAR_LEFT;

/** Indicator inset from outline edges at birth (fraction of BAR_WIDTH) */
const INDICATOR_INSET = 0.15;

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
const LINE_WIDTH_MAX = 5;

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
      const opacity = event.intensity * fadeFraction;

      if (opacity < 0.01) continue;

      const y = this.intensityToY(event.intensity);

      // Lines grow wider and thicker as they fade, clamped to outline
      const ageFraction = age / FADE_MS;
      const insetNow = INDICATOR_INSET * (1 - ageFraction);
      const left = BAR_LEFT + BAR_WIDTH * insetNow;
      const right = BAR_RIGHT - BAR_WIDTH * insetNow;
      const lineWidth = LINE_WIDTH_MIN + (LINE_WIDTH_MAX - LINE_WIDTH_MIN) * ageFraction;

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
            { x: left, y },
            { x: right, y },
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
