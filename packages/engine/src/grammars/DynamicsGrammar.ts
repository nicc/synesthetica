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

/** Left edge of the dynamics bar */
const BAR_LEFT = 0.03;

/** Right edge of the dynamics bar */
const BAR_RIGHT = 0.055;

/** Top of the bar (1/6 from top — centred in 2/3 of screen height) */
const BAR_TOP = 1 / 6;

/** Bottom of the bar (5/6 from top) */
const BAR_BOTTOM = 5 / 6;

/** Bar height in normalized coordinates */
const BAR_HEIGHT = BAR_BOTTOM - BAR_TOP;

/** How long indicator lines take to fully fade (ms) */
const FADE_MS = 2000;

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
