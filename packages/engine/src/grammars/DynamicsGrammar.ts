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
// Layout Constants (from shared layout)
// ============================================================================

import {
  DYNAMICS_BAR_LEFT as BAR_LEFT,
  DYNAMICS_BAR_RIGHT as BAR_RIGHT,
  DYNAMICS_BAR_WIDTH as BAR_WIDTH,
  BAR_TOP,
  BAR_BOTTOM,
  BAR_HEIGHT,
} from "./layout";

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

/** Minimum playable MIDI intensity (velocity 1/127) — maps to bar bottom */
const MIN_INTENSITY = 1 / 127;

/** Tick length as fraction of bar width (ruler marks at 25% intervals) */
const TICK_LENGTH = 0.25;


/** Outline/tick visual style */
const OUTLINE_COLOR: ColorHSVA = { h: 200, s: 0.2, v: 0.4, a: 1.0 };
const OUTLINE_OPACITY = 0.4;
const TICK_OPACITY = 0.25;

/** Outline stroke thickness in normalized coords */
export const OUTLINE_THICKNESS = 0.001;

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

    // --- Outline (four rect edges — no corner overlap) ---
    const outlineStyle = { color: OUTLINE_COLOR, opacity: OUTLINE_OPACITY };
    const ot = OUTLINE_THICKNESS;
    // Top edge
    entities.push({
      id: `${this.id}:outline-t`, part, kind: "glyph", createdAt: t, updatedAt: t,
      style: outlineStyle,
      data: { type: "dynamics-indicator", x: BAR_LEFT, y: BAR_TOP, w: BAR_WIDTH, h: ot },
    });
    // Bottom edge
    entities.push({
      id: `${this.id}:outline-b`, part, kind: "glyph", createdAt: t, updatedAt: t,
      style: outlineStyle,
      data: { type: "dynamics-indicator", x: BAR_LEFT, y: BAR_BOTTOM - ot, w: BAR_WIDTH, h: ot },
    });
    // Left edge (between top and bottom edges)
    entities.push({
      id: `${this.id}:outline-l`, part, kind: "glyph", createdAt: t, updatedAt: t,
      style: outlineStyle,
      data: { type: "dynamics-indicator", x: BAR_LEFT, y: BAR_TOP + ot, w: ot, h: BAR_HEIGHT - 2 * ot },
    });
    // Right edge (between top and bottom edges)
    entities.push({
      id: `${this.id}:outline-r`, part, kind: "glyph", createdAt: t, updatedAt: t,
      style: outlineStyle,
      data: { type: "dynamics-indicator", x: BAR_RIGHT - ot, y: BAR_TOP + ot, w: ot, h: BAR_HEIGHT - 2 * ot },
    });

    // --- Ruler ticks at 25%, 50%, 75% ---
    // Inset from outline edges; rendered as rects to avoid line overlap
    const tickLen = BAR_WIDTH * TICK_LENGTH;
    const tickStyle = { color: OUTLINE_COLOR, opacity: TICK_OPACITY };
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = BAR_BOTTOM - frac * BAR_HEIGHT - ot / 2;
      entities.push({
        id: `${this.id}:tick:${frac}`, part, kind: "glyph", createdAt: t, updatedAt: t,
        style: tickStyle,
        data: { type: "dynamics-indicator", x: BAR_LEFT + ot, y, w: tickLen, h: ot },
      });
      entities.push({
        id: `${this.id}:tick-r:${frac}`, part, kind: "glyph", createdAt: t, updatedAt: t,
        style: tickStyle,
        data: { type: "dynamics-indicator", x: BAR_RIGHT - ot - tickLen, y, w: tickLen, h: ot },
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
      // Indicators inset by the outline thickness on all four sides
      // so they sit flush with the inner edge of the border without
      // overlapping it (which would brighten the border at indicator
      // positions).
      const ageFraction = age / FADE_MS;
      const rawHalfH =
        (INDICATOR_THICKNESS_MIN +
          (INDICATOR_THICKNESS_MAX - INDICATOR_THICKNESS_MIN) * ageFraction) /
        2;
      const top = Math.max(centerY - rawHalfH, BAR_TOP + ot);
      const bottom = Math.min(centerY + rawHalfH, BAR_BOTTOM - ot);

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
          x: BAR_LEFT + ot,
          y: top,
          w: BAR_WIDTH - 2 * ot,
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
   * Map intensity to y position within the bar.
   * The minimum playable MIDI velocity (1/127) maps to BAR_BOTTOM,
   * maximum (1.0) maps to BAR_TOP, filling the full bar height.
   */
  private intensityToY(intensity: number): number {
    const normalized = (intensity - MIN_INTENSITY) / (1 - MIN_INTENSITY);
    return BAR_BOTTOM - Math.max(0, Math.min(1, normalized)) * BAR_HEIGHT;
  }
}
