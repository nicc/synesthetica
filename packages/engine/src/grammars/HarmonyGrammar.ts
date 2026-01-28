/**
 * Harmony Grammar
 *
 * Visualizes chord shapes and harmonic tension.
 *
 * ## Visual Design
 *
 * **Chord Shape (center)**
 * - Centered in viewport at 25% of screen width
 * - Each arm/wedge outlined in that element's note color
 * - Fill is a gradient: root color at center → element color at tip
 * - Hub margin style reflects chord quality (straight, wavy, concave, convex, dashed)
 *
 * **Tension Bar (right side)**
 * - Vertical gauge showing harmonic tension (0-1)
 * - Higher position = more tension
 * - Derived from HarmonicProgressionStabilizer (tier 1: interval dissonance)
 *
 * ## Implementation Notes
 *
 * - Uses renderChordShape utility for geometry calculations
 * - Generates SVG output for snapshot testing
 * - Snaps instantly between chord changes (no animation)
 *
 * @see SPEC_010 for chord shape design
 * @see HarmonicProgressionStabilizer for tension computation
 */

import type {
  IVisualGrammar,
  GrammarContext,
  AnnotatedMusicalFrame,
  SceneFrame,
  Entity,
  ChordShapeElement,
} from "@synesthetica/contracts";

import {
  colorToCSS,
  HUB_RADIUS,
  ARM_LENGTH,
  BASE_WIDTH,
} from "../vocabularies/renderChordShape";

// ============================================================================
// Configuration
// ============================================================================

export interface HarmonyGrammarConfig {
  /**
   * Viewport width in pixels.
   * @default 800
   */
  width?: number;

  /**
   * Viewport height in pixels.
   * @default 600
   */
  height?: number;

  /**
   * Background color.
   * @default "#1a1a2e"
   */
  backgroundColor?: string;

  /**
   * Whether to show the tension bar.
   * @default true
   */
  showTensionBar?: boolean;

  /**
   * Stroke width for chord shape outline.
   * @default 2
   */
  strokeWidth?: number;
}

const DEFAULT_CONFIG: Required<HarmonyGrammarConfig> = {
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  showTensionBar: true,
  strokeWidth: 2,
};

// ============================================================================
// Grammar Implementation
// ============================================================================

export class HarmonyGrammar implements IVisualGrammar {
  readonly id = "harmony-grammar";

  private config: Required<HarmonyGrammarConfig>;
  private ctx: GrammarContext | null = null;
  private nextId = 0;

  constructor(config: HarmonyGrammarConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(ctx: GrammarContext): void {
    this.ctx = ctx;
    this.nextId = 0;
  }

  dispose(): void {
    this.ctx = null;
  }

  /**
   * Update the scene with chord shape and tension bar entities.
   * For full gradient rendering in tests, use renderToSVG() method.
   */
  update(input: AnnotatedMusicalFrame, _previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];
    const t = input.t;
    const part = input.part;

    // Get the active chord (if any)
    const activeChord = input.chords.find((c) => c.chord.phase === "active");
    const chord = activeChord ?? input.chords[0];

    // Get tension from harmonic context
    const tension = input.harmonicContext.tension;

    // Create chord shape entity (simplified for runtime)
    if (chord) {
      const rootElement = chord.shape.elements.find((e) => e.interval === "1");
      const rootColor = rootElement?.color ?? { h: 0, s: 0, v: 0.8, a: 1 };

      entities.push({
        id: `chord-shape-${this.nextId++}`,
        part,
        kind: "glyph",
        createdAt: t,
        updatedAt: t,
        position: { x: 0.5, y: 0.5 },
        style: {
          color: rootColor,
          size: 200,
          opacity: 1,
        },
        data: {
          type: "chord-shape",
          chordId: chord.chord.id,
          quality: chord.chord.quality,
          elements: chord.shape.elements,
          margin: chord.shape.margin,
        },
      });
    }

    // Create tension bar entity (neutral gray - color reserved for harmony)
    if (this.config.showTensionBar) {
      entities.push({
        id: `tension-bar-${this.nextId++}`,
        part,
        kind: "glyph",
        createdAt: t,
        updatedAt: t,
        position: { x: 0.9, y: 0.5 },
        style: {
          color: { h: 0, s: 0, v: 0.5, a: 1 }, // Neutral gray
          size: 50,
          opacity: 1,
        },
        data: {
          type: "tension-bar",
          tension,
        },
      });
    }

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  // ==========================================================================
  // SVG Rendering (for snapshot testing)
  // ==========================================================================

  /**
   * Render the current frame to SVG for snapshot testing.
   * This provides full gradient rendering that entities can't express.
   */
  renderToSVG(frame: AnnotatedMusicalFrame): string {
    const width = this.ctx?.canvasSize.width ?? this.config.width;
    const height = this.ctx?.canvasSize.height ?? this.config.height;
    const backgroundColor = this.config.backgroundColor;

    // Get the active chord (if any)
    const activeChord = frame.chords.find((c) => c.chord.phase === "active");
    const chord = activeChord ?? frame.chords[0];

    // Get tension from harmonic context
    const tension = frame.harmonicContext.tension;

    // Start SVG
    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n`;

    // Background
    svg += `  <rect width="${width}" height="${height}" fill="${backgroundColor}"/>\n`;

    // Render chord shape if we have one
    if (chord) {
      svg += this.renderChordShapeSVG(chord.shape.elements, chord.shape.margin, width, height);
    }

    // Render tension bar
    if (this.config.showTensionBar) {
      svg += this.renderTensionBarSVG(tension, width, height);
    }

    svg += "</svg>";
    return svg;
  }

  /**
   * Render chord shape as a unified outline with styled hub arcs.
   * Simplified for validation testing - no gradients, just shape outline.
   */
  private renderChordShapeSVG(
    elements: ChordShapeElement[],
    margin: string,
    width: number,
    height: number
  ): string {
    // Chord shape is 25% of width, centered
    const scale = width * 0.25 / 2;
    const cx = width / 2;
    const cy = height / 2;
    const hubR = scale * HUB_RADIUS;

    // Separate wedges from lines
    const wedges = elements.filter((e) => e.style !== "line");
    const lines = elements.filter((e) => e.style === "line");

    if (wedges.length === 0) {
      return "";
    }

    // Sort wedges by angle for proper path generation
    const sortedWedges = [...wedges].sort((a, b) => a.angle - b.angle);

    // Find root element for fill color
    const rootElement = wedges.find((e) => e.interval === "1") ?? wedges[0];
    const fillColor = colorToCSS(rootElement.color);

    let svg = "";

    // Render chromatic lines first (behind shape)
    for (const line of lines) {
      svg += this.renderLinePath(line, scale, cx, cy);
    }

    // Build unified outline path
    const outlinePath = this.buildUnifiedOutline(sortedWedges, margin, scale, cx, cy, hubR);

    // Render the shape: solid fill with 80% opacity, single stroke
    const isDashed = margin === "dash-short" || margin === "dash-long";
    const dashAttr = isDashed ? ` stroke-dasharray="${margin === "dash-short" ? "3,3" : "6,3"}"` : "";

    svg += `  <path d="${outlinePath}" fill="${fillColor}" fill-opacity="0.8" stroke="${fillColor}" stroke-width="${this.config.strokeWidth}" stroke-linejoin="round"${dashAttr}/>\n`;

    return svg;
  }

  /**
   * Build the unified outline path for the chord shape.
   * One continuous path: arm edges are straight, hub arcs are styled.
   */
  private buildUnifiedOutline(
    sortedWedges: ChordShapeElement[],
    margin: string,
    scale: number,
    cx: number,
    cy: number,
    hubR: number
  ): string {
    let path = "";

    for (let i = 0; i < sortedWedges.length; i++) {
      const curr = sortedWedges[i];
      const next = sortedWedges[(i + 1) % sortedWedges.length];

      const armLength = ARM_LENGTH[curr.tier];
      const tipR = hubR + scale * armLength;

      const armLeftAngle = curr.angle - BASE_WIDTH / 2;
      const armRightAngle = curr.angle + BASE_WIDTH / 2;

      const baseLeft = this.polarToXY(cx, cy, armLeftAngle, hubR);
      const baseRight = this.polarToXY(cx, cy, armRightAngle, hubR);
      const tip = this.polarToXY(cx, cy, curr.angle, tipR);

      if (i === 0) {
        path += `M ${baseLeft.x.toFixed(1)} ${baseLeft.y.toFixed(1)}`;
      }

      // Straight edge to tip
      path += ` L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;

      // Straight edge to hub right
      path += ` L ${baseRight.x.toFixed(1)} ${baseRight.y.toFixed(1)}`;

      // Styled hub arc to next arm
      const nextLeftAngle = next.angle - BASE_WIDTH / 2;
      path += this.styledHubArc(armRightAngle, nextLeftAngle, hubR, margin, cx, cy);
    }

    path += " Z";
    return path;
  }

  /**
   * Generate styled hub arc between arms (wavy, concave, convex, or circular).
   */
  private styledHubArc(
    startAngle: number,
    endAngle: number,
    hubR: number,
    margin: string,
    cx: number,
    cy: number
  ): string {
    // Calculate arc span (going clockwise)
    let arcSpan = endAngle - startAngle;
    if (arcSpan < 0) arcSpan += 360;

    const end = this.polarToXY(cx, cy, endAngle, hubR);

    if (margin === "straight" || margin === "dashed") {
      // Simple circular arc
      const largeArc = arcSpan > 180 ? 1 : 0;
      return ` A ${hubR.toFixed(1)} ${hubR.toFixed(1)} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    }

    if (margin === "wavy") {
      // Wavy arc using quadratic beziers
      const steps = Math.max(3, Math.floor(arcSpan / 20));
      let arcPath = "";
      const amp = 4;

      for (let i = 0; i < steps; i++) {
        const t1 = (i + 1) / steps;
        const angle1 = startAngle + arcSpan * t1;
        const midAngle = startAngle + arcSpan * (i + 0.5) / steps;

        const p1 = this.polarToXY(cx, cy, angle1, hubR);
        const waveR = hubR + (i % 2 === 0 ? amp : -amp);
        const ctrl = this.polarToXY(cx, cy, midAngle, waveR);

        arcPath += ` Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
      }
      return arcPath;
    }

    if (margin === "concave") {
      // Concave: curves inward (sweep=0)
      if (arcSpan >= 150) {
        return ` L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
      }
      const start = this.polarToXY(cx, cy, startAngle, hubR);
      const chordLen = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
      const minR = chordLen / 2 + 1;
      const scaleFactor = 1 + arcSpan * 0.03;
      const concaveR = Math.max(hubR * scaleFactor, minR);
      const largeArc = arcSpan > 180 ? 1 : 0;
      return ` A ${concaveR.toFixed(1)} ${concaveR.toFixed(1)} 0 ${largeArc} 0 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    }

    if (margin === "convex") {
      // Convex: curves outward
      const expansionFactor = 1.5 + arcSpan * 0.008;
      const convexR = hubR * expansionFactor;
      return ` A ${convexR.toFixed(1)} ${convexR.toFixed(1)} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    }

    // Default: circular arc
    const largeArc = arcSpan > 180 ? 1 : 0;
    return ` A ${hubR.toFixed(1)} ${hubR.toFixed(1)} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }

  /**
   * Render chromatic line.
   */
  private renderLinePath(
    element: ChordShapeElement,
    scale: number,
    cx: number,
    cy: number
  ): string {
    const hubR = scale * HUB_RADIUS;
    const outerR = hubR + scale * ARM_LENGTH.extension;
    const innerR = hubR + this.config.strokeWidth * 0.25;

    const inner = this.polarToXY(cx, cy, element.angle, innerR);
    const outer = this.polarToXY(cx, cy, element.angle, outerR);

    const path = `M ${inner.x.toFixed(1)} ${inner.y.toFixed(1)} L ${outer.x.toFixed(1)} ${outer.y.toFixed(1)}`;
    const color = colorToCSS(element.color);

    return `  <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>\n`;
  }

  /**
   * Render the tension bar on the right side.
   * Uses neutral gray - no color (color is reserved for harmony).
   */
  private renderTensionBarSVG(tension: number, width: number, height: number): string {
    const barWidth = 20;
    const barHeight = height * 0.6;
    const barX = width - 60;
    const barY = (height - barHeight) / 2;

    // Clamp tension to 0-1
    const clampedTension = Math.max(0, Math.min(1, tension));

    // Indicator position (from bottom)
    const indicatorY = barY + barHeight - barHeight * clampedTension;

    let svg = "";

    // Bar background (neutral gray)
    svg += `  <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="#222" stroke="#444" stroke-width="1" rx="3"/>\n`;

    // Indicator line (white)
    svg += `  <line x1="${barX - 5}" y1="${indicatorY.toFixed(1)}" x2="${barX + barWidth + 5}" y2="${indicatorY.toFixed(1)}" stroke="#fff" stroke-width="2"/>\n`;

    // Label
    svg += `  <text x="${barX + barWidth / 2}" y="${barY - 10}" text-anchor="middle" fill="#666" font-size="12">Tension</text>\n`;

    return svg;
  }

  /**
   * Convert polar coordinates to XY.
   */
  private polarToXY(
    cx: number,
    cy: number,
    angle: number,
    radius: number
  ): { x: number; y: number } {
    const rad = ((90 - angle) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy - radius * Math.sin(rad),
    };
  }
}
