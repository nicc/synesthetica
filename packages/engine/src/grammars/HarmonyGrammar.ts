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
  ColorHSVA,
} from "@synesthetica/contracts";

import {
  colorToCSS,
  getDashArray,
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
          elementCount: chord.shape.elements.length,
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
   * Render chord shape with gradient fills.
   */
  private renderChordShapeSVG(
    elements: ChordShapeElement[],
    margin: string,
    width: number,
    height: number
  ): string {
    // Chord shape is 25% of width, centered
    const scale = width * 0.25 / 2; // radius = 25% of width / 2
    const cx = width / 2;
    const cy = height / 2;

    // Separate wedges from lines
    const wedges = elements.filter((e) => e.style !== "line");
    const lines = elements.filter((e) => e.style === "line");

    if (wedges.length === 0) {
      return "";
    }

    // Find root element for center color
    const rootElement = wedges.find((e) => e.interval === "1") ?? wedges[0];
    const rootColor = rootElement.color;

    let svg = "";

    // Generate gradient definitions
    svg += "  <defs>\n";
    for (let i = 0; i < wedges.length; i++) {
      const element = wedges[i];
      const armLength = ARM_LENGTH[element.tier];
      svg += this.generateGradientDef(i, rootColor, element.color, element.angle, cx, cy, scale, armLength);
    }
    svg += "  </defs>\n";

    // Render lines first (behind shape)
    for (const line of lines) {
      svg += this.renderLinePath(line, scale, cx, cy);
    }

    // Render each wedge with its gradient
    for (let i = 0; i < wedges.length; i++) {
      const element = wedges[i];
      svg += this.renderWedgePath(i, element, margin, scale, cx, cy);
    }

    // Render hub circle with margin style
    svg += this.renderHub(margin, scale, cx, cy, rootColor);

    return svg;
  }

  /**
   * Generate SVG gradient definition for a wedge.
   * Gradient goes from hub center (root color) to element tip color.
   * This fills the entire shape with a continuous gradient from center outward.
   */
  private generateGradientDef(
    index: number,
    rootColor: ColorHSVA,
    tipColor: ColorHSVA,
    angle: number,
    cx: number,
    cy: number,
    scale: number,
    armLength: number
  ): string {
    // Linear gradient from hub CENTER to tip along the arm angle
    const hubR = scale * HUB_RADIUS;
    const tipR = hubR + scale * armLength;

    // Calculate gradient line endpoints - start at center, end at tip
    const rad = ((90 - angle) * Math.PI) / 180;
    const x1 = cx; // Start at center
    const y1 = cy;
    const x2 = cx + tipR * Math.cos(rad); // End at tip
    const y2 = cy - tipR * Math.sin(rad);

    const rootCSS = colorToCSS(rootColor);
    const tipCSS = colorToCSS(tipColor);

    return `    <linearGradient id="wedge-grad-${index}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${rootCSS}"/>
      <stop offset="100%" stop-color="${tipCSS}"/>
    </linearGradient>\n`;
  }

  /**
   * Render a single wedge with gradient fill and colored outline.
   */
  private renderWedgePath(
    index: number,
    element: ChordShapeElement,
    margin: string,
    scale: number,
    cx: number,
    cy: number
  ): string {
    const hubR = scale * HUB_RADIUS;
    const armLength = ARM_LENGTH[element.tier];
    const tipR = hubR + scale * armLength;

    const armLeftAngle = element.angle - BASE_WIDTH / 2;
    const armRightAngle = element.angle + BASE_WIDTH / 2;

    const baseLeft = this.polarToXY(cx, cy, armLeftAngle, hubR);
    const baseRight = this.polarToXY(cx, cy, armRightAngle, hubR);
    const tip = this.polarToXY(cx, cy, element.angle, tipR);

    // Wedge path (triangle from hub to tip)
    const path = `M ${baseLeft.x.toFixed(1)} ${baseLeft.y.toFixed(1)} L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L ${baseRight.x.toFixed(1)} ${baseRight.y.toFixed(1)} Z`;

    const strokeColor = colorToCSS(element.color);
    const dashArray = getDashArray(margin as Parameters<typeof getDashArray>[0]);
    const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";

    return `  <path d="${path}" fill="url(#wedge-grad-${index})" stroke="${strokeColor}" stroke-width="${this.config.strokeWidth}"${dashAttr}/>\n`;
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
   * Render the hub circle with margin style.
   */
  private renderHub(
    margin: string,
    scale: number,
    cx: number,
    cy: number,
    rootColor: ColorHSVA
  ): string {
    const hubR = scale * HUB_RADIUS;
    const rootCSS = colorToCSS(rootColor);
    const dashArray = getDashArray(margin as Parameters<typeof getDashArray>[0]);
    const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";

    // For wavy/concave/convex, we'd need a more complex path
    // For now, use a simple circle (the wedge paths already show the style)
    return `  <circle cx="${cx}" cy="${cy}" r="${hubR.toFixed(1)}" fill="${rootCSS}" fill-opacity="0.3" stroke="${rootCSS}" stroke-width="${this.config.strokeWidth}"${dashAttr}/>\n`;
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
