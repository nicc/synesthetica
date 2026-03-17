/**
 * DynamicsGrammar — unphrased dynamics contour visualization
 *
 * Renders a dynamics contour line in a horizontal strip at the top of the canvas.
 * Time flows left-to-right, NOW at right edge. Y-axis = dynamics level (up = louder).
 *
 * Entity types:
 * - dynamics-contour: glyph with contour point data for renderer to draw as line
 *
 * Gap handling: If consecutive contour points are separated by more than one bar
 * (when BPM is prescribed) or 4 seconds (no BPM), the line breaks and a new
 * segment begins. Each segment becomes a separate entity.
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
const STRIP_BOTTOM = 0.24;

/** Strip height */
const STRIP_HEIGHT = STRIP_BOTTOM - STRIP_TOP;

/** NOW position on x-axis (rightmost) */
const NOW_X = 0.95;

/** Left edge of contour area */
const LEFT_X = 0.05;

/** Time window to display (matches stabiliser default) */
const DISPLAY_WINDOW_MS = 8000;

/** Default gap threshold when no BPM is prescribed */
const DEFAULT_GAP_MS = 4000;

// ============================================================================
// Colors
// ============================================================================

const CONTOUR_COLOR: ColorHSVA = { h: 200, s: 0.5, v: 0.8, a: 0.9 };
const MIN_TICK_COLOR: ColorHSVA = { h: 35, s: 0.6, v: 0.8, a: 0.6 };

/** Half-width of the min tick in normalized x coordinates */
const MIN_TICK_HALF_WIDTH = 0.005;

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

    if (dynamics.contour.length > 0) {
      const gapMs = this.computeGapThreshold(input);
      const segments = this.segmentContour(dynamics.contour, gapMs);

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment.length >= 2) {
          entities.push(this.createContourEntity(segment, t, part, i));
        }
      }

      // Min-intensity ticks for chords (where min < level)
      const minTicks = this.createMinTickEntities(dynamics.contour, t, part);
      entities.push(...minTicks);
    }

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  /**
   * Compute the gap threshold for line breaking.
   * One bar when BPM is prescribed, 4 seconds otherwise.
   */
  private computeGapThreshold(input: AnnotatedMusicalFrame): number {
    const tempo = input.rhythm.prescribedTempo;
    const meter = input.rhythm.prescribedMeter;

    if (tempo && tempo > 0) {
      const beatMs = 60000 / tempo;
      const beatsPerBar = meter?.beatsPerBar ?? 4;
      return beatMs * beatsPerBar;
    }

    return DEFAULT_GAP_MS;
  }

  /**
   * Split contour into segments wherever consecutive points exceed gapMs.
   */
  private segmentContour(
    contour: DynamicsContourPoint[],
    gapMs: number,
  ): DynamicsContourPoint[][] {
    const segments: DynamicsContourPoint[][] = [];
    let current: DynamicsContourPoint[] = [contour[0]];

    for (let i = 1; i < contour.length; i++) {
      if (contour[i].t - contour[i - 1].t > gapMs) {
        segments.push(current);
        current = [];
      }
      current.push(contour[i]);
    }

    if (current.length > 0) {
      segments.push(current);
    }

    return segments;
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
    segmentIndex: number,
  ): Entity {
    const points: Array<{ x: number; y: number }> = [];

    for (const point of contour) {
      const x = this.timeToX(point.t, t);
      if (x >= LEFT_X) {
        const y = this.levelToY(point.level);
        points.push({ x, y });
      }
    }

    return {
      id: `${this.id}:contour:${segmentIndex}`,
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

  /**
   * Create small horizontal tick marks at the min intensity for chord onsets.
   * Positioned directly below the contour point at the same x.
   */
  private createMinTickEntities(
    contour: DynamicsContourPoint[],
    t: number,
    part: string,
  ): Entity[] {
    const entities: Entity[] = [];

    for (let i = 0; i < contour.length; i++) {
      const point = contour[i];
      if (point.min === undefined || point.min >= point.level) continue;

      const x = this.timeToX(point.t, t);
      if (x < LEFT_X) continue;

      const y = this.levelToY(point.min);

      entities.push({
        id: `${this.id}:mintick:${i}`,
        part,
        kind: "glyph",
        createdAt: t,
        updatedAt: t,
        style: {
          color: MIN_TICK_COLOR,
          opacity: MIN_TICK_COLOR.a,
        },
        data: {
          type: "dynamics-contour",
          points: [
            { x: x - MIN_TICK_HALF_WIDTH, y },
            { x: x + MIN_TICK_HALF_WIDTH, y },
          ],
        },
      });
    }

    return entities;
  }
}
