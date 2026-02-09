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
  MarginStyle,
} from "@synesthetica/contracts";

import {
  ChordShapeBuilder,
  colorToCSS,
  getDashArray,
} from "../utils/ChordShapeBuilder";

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
          size: 100,
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
   * Render chord shape using ChordShapeBuilder.
   */
  private renderChordShapeSVG(
    elements: ChordShapeElement[],
    margin: MarginStyle,
    width: number,
    height: number
  ): string {
    // Chord shape is 25% of width, centered
    const scale = (width * 0.25) / 2;
    const cx = width / 2;
    const cy = height / 2;

    // Build shape geometry
    const builder = new ChordShapeBuilder(elements, margin, {
      scale,
      center: { x: cx, y: cy },
      strokeWidth: this.config.strokeWidth,
    });

    const fillPath = builder.toSVGPath();
    if (!fillPath) {
      return "";
    }

    // Find root element for fill color
    const arms = builder.getArms();
    const rootArm = arms.find((a) => a.interval === "1") ?? arms[0];
    const fillColor = rootArm ? colorToCSS(rootArm.color) : "#888";

    let svg = "";

    // Render chromatic lines first (behind shape)
    for (const line of builder.toSVGLines()) {
      svg += `  <path d="${line.path}" fill="none" stroke="${colorToCSS(line.color)}" stroke-width="${this.config.strokeWidth}" stroke-linecap="round"/>\n`;
    }

    // Render the main shape
    const dashArray = getDashArray(margin);
    const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";

    svg += `  <path d="${fillPath}" fill="${fillColor}" fill-opacity="0.8" stroke="${fillColor}" stroke-width="${this.config.strokeWidth}" stroke-linejoin="round"${dashAttr}/>\n`;

    return svg;
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
}
