/**
 * DynamicsGrammar — unphrased dynamics contour visualization
 *
 * Renders a dynamics contour line in a horizontal strip at the top of the canvas.
 * Time flows left-to-right, NOW at right edge. Y-axis = dynamics level (up = louder).
 *
 * Entity types:
 * - dynamics-contour: glyph with contour point data for renderer to draw as line
 * - dynamics-level: particle showing current level at NOW position
 * - dynamics-range: field showing min/max band behind contour
 *
 * Consumes: frame.dynamics (DynamicsState from DynamicsStabilizer)
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
  DynamicsContourPoint,
} from "@synesthetica/contracts";

// ============================================================================
// Layout Constants
// ============================================================================

/** Top of dynamics strip (normalized, 0 = top of canvas) */
const STRIP_TOP = 0.0;

/** Bottom of dynamics strip */
const STRIP_BOTTOM = 0.12;

/** Strip height */
const STRIP_HEIGHT = STRIP_BOTTOM - STRIP_TOP;

/** NOW position on x-axis (rightmost) */
const NOW_X = 0.95;

/** Left edge of contour area */
const LEFT_X = 0.05;

/** Time window to display (matches stabiliser default) */
const DISPLAY_WINDOW_MS = 8000;

// ============================================================================
// Colors
// ============================================================================

const CONTOUR_COLOR: ColorHSVA = { h: 200, s: 0.5, v: 0.8, a: 0.9 };
const LEVEL_MARKER_COLOR: ColorHSVA = { h: 50, s: 0.7, v: 0.9, a: 1.0 };
const RANGE_BAND_COLOR: ColorHSVA = { h: 200, s: 0.2, v: 0.4, a: 0.15 };

// ============================================================================
// Grammar Implementation
// ============================================================================

export class DynamicsGrammar implements IVisualGrammar {
  readonly id = "dynamics-grammar";

  init(_ctx: GrammarContext): void {
    // Context available for future use (e.g., canvas-relative positioning)
  }

  dispose(): void {
    // No resources to clean up
  }

  update(input: AnnotatedMusicalFrame, _previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];
    const t = input.t;
    const part = input.part;
    const dynamics = input.dynamics.dynamics;

    // Contour line
    if (dynamics.contour.length > 0) {
      entities.push(this.createContourEntity(dynamics.contour, t, part));
    }

    // Current level marker
    entities.push(this.createLevelMarker(dynamics.level, t, part));

    // Range band
    if (dynamics.events.length > 0) {
      entities.push(this.createRangeBand(dynamics.range.min, dynamics.range.max, t, part));
    }

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  /**
   * Map a timestamp to x position within the contour strip.
   * NOW = NOW_X (right edge), oldest = LEFT_X.
   */
  private timeToX(eventTime: number, now: number): number {
    const age = now - eventTime;
    const normalizedAge = Math.min(age / DISPLAY_WINDOW_MS, 1);
    return NOW_X - normalizedAge * (NOW_X - LEFT_X);
  }

  /**
   * Map a dynamics level (0–1) to y position within the strip.
   * Higher level = higher on screen (lower y value).
   */
  private levelToY(level: number): number {
    return STRIP_BOTTOM - level * STRIP_HEIGHT;
  }

  private createContourEntity(
    contour: DynamicsContourPoint[],
    t: number,
    part: string,
  ): Entity {
    // Convert contour points to normalized screen coordinates
    const points: Array<{ x: number; y: number }> = [];

    for (const point of contour) {
      const x = this.timeToX(point.t, t);
      if (x >= LEFT_X) {
        const y = this.levelToY(point.level);
        points.push({ x, y });
      }
    }

    return {
      id: `${this.id}:contour`,
      part,
      kind: "glyph",
      createdAt: t,
      updatedAt: t,
      style: {
        color: CONTOUR_COLOR,
        opacity: CONTOUR_COLOR.a,
      },
      data: {
        type: "dynamics-contour",
        points,
      },
    };
  }

  private createLevelMarker(
    level: number,
    t: number,
    part: string,
  ): Entity {
    return {
      id: `${this.id}:level`,
      part,
      kind: "particle",
      createdAt: t,
      updatedAt: t,
      position: {
        x: NOW_X,
        y: this.levelToY(level),
      },
      style: {
        color: LEVEL_MARKER_COLOR,
        size: 4,
        opacity: 1.0,
      },
      data: {
        type: "dynamics-level",
      },
    };
  }

  private createRangeBand(
    min: number,
    max: number,
    t: number,
    part: string,
  ): Entity {
    return {
      id: `${this.id}:range`,
      part,
      kind: "field",
      createdAt: t,
      updatedAt: t,
      position: {
        x: LEFT_X,
        y: this.levelToY(max),
      },
      style: {
        color: RANGE_BAND_COLOR,
        opacity: RANGE_BAND_COLOR.a,
      },
      data: {
        type: "dynamics-range",
        width: NOW_X - LEFT_X,
        height: (max - min) * STRIP_HEIGHT,
        yBottom: this.levelToY(min),
        yTop: this.levelToY(max),
      },
    };
  }
}
