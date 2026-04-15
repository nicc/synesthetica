/**
 * Harmony Grammar
 *
 * Visualizes chord shapes and functional harmony progression.
 *
 * ## Visual Design
 *
 * **Chord Shape (top cell of harmony column)**
 * - Each arm/wedge outlined in that element's note color
 * - Fill is a gradient: root color at center → element color at tip
 * - Hub margin style reflects chord quality
 *
 * **Progression Clock (bottom cell of harmony column)**
 * - Roman numeral glyphs positioned at pitch-class angles on a clock face
 * - Each glyph coloured by root pitch-class hue (I14)
 * - Opacity fades linearly with age (Principle 9: observation over synthesis)
 * - Requires prescribedKey to be set; hidden when no key is prescribed
 *
 * @see SPEC_010 for chord shape design and Roman numeral glyph spec (I19)
 * @see HarmonyStabilizer for functional analysis
 */

import type {
  IVisualGrammar,
  GrammarContext,
  AnnotatedMusicalFrame,
  SceneFrame,
  Entity,
  ChordShapeElement,
  MarginStyle,
  FunctionalChord,
  PitchClass,
  ColorHSVA,
} from "@synesthetica/contracts";
import { pcToHue, INTERVAL_ANGLES } from "@synesthetica/contracts";

import {
  ChordShapeBuilder,
  colorToCSS,
  getDashArray,
} from "../utils/ChordShapeBuilder";
import { buildRomanNumeralGlyph } from "../utils/RomanNumeralGlyphBuilder";
import {
  HARMONY_CHORD_CENTER_X,
  HARMONY_CHORD_CENTER_Y,
  HARMONY_PROGRESSION_CENTER_X,
  HARMONY_PROGRESSION_CENTER_Y,
  HARMONY_CELL_SIZE,
} from "./layout";

// ============================================================================
// Progression Clock Constants
// ============================================================================

/**
 * Fade control value. Unit depends on context:
 * - Without tempo: seconds
 * - With tempo: bars
 * Default: 6 (6 seconds or 6 bars)
 */
const PROGRESSION_FADE_VALUE = 3;

/**
 * Immediate "perceived brightness" step-down on release (fraction of full).
 * After this drop, brightness fades linearly to zero over the fade window.
 * Opacity is derived from brightness by dividing out the stroke-width
 * area growth, so the fade looks even-tempered regardless of chunkiness.
 */
const RELEASE_BRIGHTNESS_STEP = 0.30;

/**
 * Exponent applied to the stroke-width ratio when compensating opacity.
 * Linear (1.0) matches raw pixel coverage, but human vision treats
 * growing shapes as attention-grabbing events that read as brighter;
 * exponents > 1 dim more aggressively as strokes thicken so the fade
 * feels monotonically dimmer throughout.
 */
const WIDTH_COMPENSATION_EXPONENT = 1.8;

/** Stroke width (pixels) while chord is held or fresh */
const STROKE_WIDTH_FRESH = 2;

/** Stroke width (pixels) at full fade — chunky, blocky */
const STROKE_WIDTH_FADED = 8;

/** Clock radius as fraction of cell size */
const CLOCK_RADIUS_FRACTION = 0.35;

/** Glyph placement radius as fraction of clock radius */
const GLYPH_RADIUS_FRACTION = 0.75;

/** Glyph size in world units (height of uppercase numeral) */
const GLYPH_SIZE = 2;

/** Default pitch-hue invariant (A = red, clockwise) */
const DEFAULT_HUE_INVARIANT = {
  referencePc: 9 as PitchClass,
  referenceHue: 0,
  direction: "cw" as const,
};

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
   * Stroke width for chord shape outline.
   * @default 2
   */
  strokeWidth?: number;
}

const DEFAULT_CONFIG: Required<HarmonyGrammarConfig> = {
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  strokeWidth: 2,
};

// ============================================================================
// Grammar Implementation
// ============================================================================

export class HarmonyGrammar implements IVisualGrammar {
  readonly id = "harmony-grammar";

  private config: Required<HarmonyGrammarConfig>;
  private ctx: GrammarContext | null = null;

  constructor(config: HarmonyGrammarConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(ctx: GrammarContext): void {
    this.ctx = ctx;
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

    // Create chord shape entity (simplified for runtime)
    if (chord) {
      const rootElement = chord.shape.elements.find((e) => e.interval === "1");
      const rootColor = rootElement?.color ?? { h: 0, s: 0, v: 0.8, a: 1 };

      entities.push({
        id: `${this.id}:chord-shape-${chord.chord.id}`,
        part,
        kind: "glyph",
        createdAt: t,
        updatedAt: t,
        position: { x: HARMONY_CHORD_CENTER_X, y: HARMONY_CHORD_CENTER_Y },
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

    // --- Progression clock (bottom cell) ---
    // Only renders when a key is prescribed and there's progression data
    const key = input.prescribedKey;
    const progression = input.harmonicContext.functionalProgression;

    if (key && progression.length > 0) {
      // Compute fade window: bars if tempo set, seconds otherwise
      const tempo = input.prescribedTempo;
      let fadeMs: number;
      if (tempo !== null) {
        const beatMs = 60000 / tempo;
        const meter = input.prescribedMeter;
        const barMs = beatMs * (meter?.beatsPerBar ?? 4);
        fadeMs = PROGRESSION_FADE_VALUE * barMs;
      } else {
        fadeMs = PROGRESSION_FADE_VALUE * 1000;
      }

      entities.push(
        ...this.createProgressionClock(progression, t, part, key.root, fadeMs),
      );
    }

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  // ==========================================================================
  // Progression Clock
  // ==========================================================================

  /**
   * Create entities for the progression clock.
   * Each functional chord in the progression becomes a Roman numeral glyph
   * positioned at its pitch-class angle, coloured by root hue, fading with age.
   */
  private createProgressionClock(
    progression: FunctionalChord[],
    t: number,
    part: string,
    tonicPc: PitchClass,
    fadeMs: number,
  ): Entity[] {
    const entities: Entity[] = [];
    const clockRadius = HARMONY_CELL_SIZE * CLOCK_RADIUS_FRACTION;
    const glyphRadius = clockRadius * GLYPH_RADIUS_FRACTION;

    for (let i = 0; i < progression.length; i++) {
      const fc = progression[i];

      // Visual model: a single "perceived brightness" value drives both
      // opacity and stroke width. While held, brightness is full. On
      // release it drops by RELEASE_BRIGHTNESS_STEP (a small noticeable
      // moment) then fades linearly to zero. Stroke width grows from
      // fresh → faded over the fade window for the chunky pixel feel,
      // and opacity is derived by dividing brightness by the stroke
      // area ratio so the visual energy stays even-tempered as the
      // strokes get thicker.
      let opacity: number;
      let strokeWidth: number;
      if (fc.releaseTime === null) {
        opacity = 1.0;
        strokeWidth = STROKE_WIDTH_FRESH;
      } else {
        const ageSinceRelease = t - fc.releaseTime;
        if (ageSinceRelease < 0 || ageSinceRelease >= fadeMs) continue;
        const fadeFraction = 1 - ageSinceRelease / fadeMs;
        const ageFraction = ageSinceRelease / fadeMs;
        const brightness = (1 - RELEASE_BRIGHTNESS_STEP) * fadeFraction;
        strokeWidth =
          STROKE_WIDTH_FRESH +
          (STROKE_WIDTH_FADED - STROKE_WIDTH_FRESH) * ageFraction;
        const widthRatio = strokeWidth / STROKE_WIDTH_FRESH;
        opacity = brightness / Math.pow(widthRatio, WIDTH_COMPENSATION_EXPONENT);
      }
      if (opacity < 0.01) continue;

      // Angular position from root pitch class relative to tonic
      const interval = ((fc.rootPc - tonicPc) + 12) % 12;
      const angleDeg = INTERVAL_ANGLES[interval];
      const angleRad = ((angleDeg - 90) * Math.PI) / 180; // -90 puts 0° at top

      // Position on the clock, centered on progression cell
      // Normalized y is top-down, so +sin moves downward (clockwise)
      const x = HARMONY_PROGRESSION_CENTER_X + glyphRadius * Math.cos(angleRad);
      const y = HARMONY_PROGRESSION_CENTER_Y + glyphRadius * Math.sin(angleRad);

      // Colour from root pitch class
      const hue = pcToHue(fc.rootPc, DEFAULT_HUE_INVARIANT);
      const color: ColorHSVA = { h: hue, s: 0.7, v: 0.9, a: 1 };

      // Build glyph geometry
      const glyph = buildRomanNumeralGlyph(fc.roman);

      entities.push({
        id: `${this.id}:prog:${i}`,
        part,
        kind: "glyph",
        createdAt: fc.onset,
        updatedAt: t,
        position: { x, y },
        style: {
          color,
          opacity,
          size: GLYPH_SIZE,
        },
        data: {
          type: "roman-numeral",
          polylines: glyph.polylines,
          arcs: glyph.arcs,
          width: glyph.width,
          height: glyph.height,
          strokeWidth,
        },
      });
    }

    return entities;
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

    // Start SVG
    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n`;

    // Background
    svg += `  <rect width="${width}" height="${height}" fill="${backgroundColor}"/>\n`;

    // Render chord shape if we have one
    if (chord) {
      svg += this.renderChordShapeSVG(chord.shape.elements, chord.shape.margin, width, height);
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

}
