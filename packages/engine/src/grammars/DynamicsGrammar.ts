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
const BAR_RIGHT = 0.035;

/** Bar width at birth */
const BAR_WIDTH = BAR_RIGHT - BAR_LEFT;

/** Extra width growth as line fully fades (fraction of BAR_WIDTH) */
const WIDTH_GROWTH = 0.4;

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

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const age = t - event.t;

      // Skip fully faded indicators
      if (age >= FADE_MS) continue;

      const fadeFraction = 1 - age / FADE_MS;
      const opacity = event.intensity * fadeFraction;

      // Skip near-invisible indicators
      if (opacity < 0.01) continue;

      const y = this.intensityToY(event.intensity);

      // Lines grow slightly wider and thicker as they fade
      const ageFraction = age / FADE_MS;
      const extraWidth = BAR_WIDTH * WIDTH_GROWTH * ageFraction;
      const left = BAR_LEFT - extraWidth / 2;
      const right = BAR_RIGHT + extraWidth / 2;
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
