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
  AnnotatedChord,
  SceneFrame,
  Entity,
  ChordShapeElement,
  MarginStyle,
  FunctionalChord,
  FunctionalEdge,
  ModeId,
  PitchClass,
  ColorHSVA,
} from "@synesthetica/contracts";
import { pcToHue, MODE_SCALE_INTERVALS } from "@synesthetica/contracts";

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
  CHORD_STRIP_CENTER_X,
  CHORD_STRIP_BAR_WIDTH,
} from "./layout";
import { NOW_LINE_Y, timeToY } from "./timeMapping";

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

/** Clock radius as fraction of cell size. Sized so the outer guide ring
 *  fits within the cell vertically (worldHeight < worldWidth, so a
 *  larger fraction would clip the cell vertically and overlap the
 *  chord glyph above). */
const CLOCK_RADIUS_FRACTION = 0.35;

/**
 * Layout fractions of clock radius (SPEC 011). Three guide rings,
 * defining two equal-width annular bands (one for each numeral ring):
 *   - Inner guide  (0.32) — outer edge of chord-label area
 *   - Middle guide (0.62) — between diatonic and borrowed numerals
 *   - Outer guide  (0.92) — outer bound of borrowed band; bands are
 *     0.30 wide each so diatonic and borrowed read as the same width
 * Numeral rings sit at the radial centres of their bands so they read
 * as "centred between guide rings".
 */
const GUIDE_RING_INNER_FRACTION = 0.32;
const GUIDE_RING_MIDDLE_FRACTION = 0.62;
const GUIDE_RING_OUTER_FRACTION = 0.92;
const DIATONIC_GLYPH_RADIUS_FRACTION =
  (GUIDE_RING_INNER_FRACTION + GUIDE_RING_MIDDLE_FRACTION) / 2; // 0.47
const BORROWED_GLYPH_RADIUS_FRACTION =
  (GUIDE_RING_MIDDLE_FRACTION + GUIDE_RING_OUTER_FRACTION) / 2; // 0.77

/** Glyph size in world units (height of uppercase diatonic numeral). */
const GLYPH_SIZE = 2.4;

/**
 * Scale factor applied to diatonic-ring glyphs (size + stroke). Diatonic
 * numerals were initially rendered at GLYPH_SIZE × 1; reduced to 0.8 to
 * sit more comfortably within the diatonic band.
 */
const DIATONIC_SCALE = 0.8;

/**
 * Scale factor applied to borrowed-ring glyphs (size + stroke). 1/φ ≈ 0.618
 * gives the outer ring a lighter visual weight matching its outside-the-key
 * status. Held independent of DIATONIC_SCALE so adjustments to one don't
 * coincidentally resize the other.
 */
const BORROWED_SCALE = 1 / 1.618033988749895;

/**
 * Viewport aspect ratio (worldWidth / worldHeight from the default
 * ThreeJSRenderer config). Used to compensate for the renderer's
 * asymmetric x/y scaling when computing radial positions on the
 * harmony clock — the renderer scales entity position.x by worldWidth
 * (100) and position.y by worldHeight (75), so a circular position in
 * normalized coords would render as an ellipse without this fix.
 * Rings and connection strips are immune because the renderer draws
 * them in world units using worldWidth for both axes.
 */
const VIEWPORT_ASPECT = 100 / 75;

/** Opacity for the always-on structural elements of the harmony clock
 *  (guide rings + slot ticks). Matches DynamicsGrammar's OUTLINE_OPACITY
 *  so the structural cues across grammars share a consistent weight. */
const STRUCTURE_OPACITY = 0.25;

/** Colour for the always-on structural elements of the harmony clock.
 *  Matches DynamicsGrammar's OUTLINE_COLOR (cool muted grey) so the
 *  structural cues across grammars look identical, not just similar. */
const STRUCTURE_COLOR: ColorHSVA = { h: 200, s: 0.2, v: 0.4, a: 1 };

// ============================================================================
// Connection Strip Constants (SPEC 011)
// ============================================================================

/** Strip radial extent as fraction of clock radius. Short — strips are
 *  accent marks, not bars spanning the band. */
const STRIP_RADIAL_FRACTION = 0.068;

/** Strip arc width in world units. Roughly matches the numeral's
 *  rendered height; borrowed strips scale by 1/φ to match borrowed numerals. */
const STRIP_ARC_WIDTH = GLYPH_SIZE * 1.5;

/** Max overall strip opacity at full edge weight. Caps the brightness
 *  of even the strongest functional connections so they remain a
 *  background structural cue rather than competing with the numerals. */
const MAX_STRIP_OPACITY = 0.8;

// ============================================================================
// Scrolling Chord Strip Constants
// ============================================================================

/** Size of Roman numeral glyphs in the scrolling strip (world units) */
const STRIP_GLYPH_SIZE = 1.2;

/** Stroke width for strip glyphs (pixels) — thinner to match their smaller size */
const STRIP_STROKE_WIDTH = 1.5;

/** Opacity of the chord-duration bar behind each glyph */
const STRIP_BAR_OPACITY = 0.25;

/** Default pitch-hue invariant (A = red, clockwise) */
const DEFAULT_HUE_INVARIANT = {
  referencePc: 9 as PitchClass,
  referenceHue: 0,
  direction: "cw" as const,
};

// ============================================================================
// Wheel Angle Helper
// ============================================================================

/** Angle (degrees, 0 = 12 o'clock) for a 1-indexed scale degree on the 7-slot diatonic wheel. */
function degreeAngle(degree: number): number {
  return ((degree - 1) * 360) / 7;
}

/**
 * Map a chromatic offset from the tonic to an angle on the 7-degree wheel.
 * Exact scale-degree matches land on one of the seven slots. Borrowed
 * offsets interpolate linearly between the two adjacent diatonic slots
 * based on their semitone distance (so e.g. ♭III in C major sits exactly
 * midway between ii and iii).
 */
function modalWheelAngle(semitones: number, mode: ModeId): number {
  const scale = MODE_SCALE_INTERVALS[mode];
  const exactIdx = scale.indexOf(semitones);
  if (exactIdx >= 0) return degreeAngle(exactIdx + 1);

  // Find lower neighbour (scale[0] = 0 is always ≤ semitones).
  let lowerIdx = 0;
  for (let i = 0; i < scale.length; i++) {
    if (scale[i] <= semitones) lowerIdx = i;
  }
  const lowerSemi = scale[lowerIdx];
  const lowerAngle = degreeAngle(lowerIdx + 1);

  let upperSemi: number;
  let upperAngle: number;
  if (lowerIdx === scale.length - 1) {
    // Above the highest scale degree — interpolate toward the next octave's tonic.
    upperSemi = 12;
    upperAngle = 360;
  } else {
    upperSemi = scale[lowerIdx + 1];
    upperAngle = degreeAngle(lowerIdx + 2);
  }

  const frac = (semitones - lowerSemi) / (upperSemi - lowerSemi);
  return lowerAngle + (upperAngle - lowerAngle) * frac;
}

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

/** How long the chord shape + label fade out after a chord ends.
 * Purely to smooth the hard cut — not a lingering temporal trace. */
const CHORD_FADE_OUT_MS = 120;

export class HarmonyGrammar implements IVisualGrammar {
  readonly id = "harmony-grammar";

  private config: Required<HarmonyGrammarConfig>;
  private ctx: GrammarContext | null = null;

  // Fade-out state: when no chord is active, keep rendering the most
  // recent chord at dropping opacity for CHORD_FADE_OUT_MS.
  private fadingChord: AnnotatedChord | null = null;
  private fadingChordEndTime: number | null = null;

  constructor(config: HarmonyGrammarConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(ctx: GrammarContext): void {
    this.ctx = ctx;
  }

  dispose(): void {
    this.ctx = null;
    this.fadingChord = null;
    this.fadingChordEndTime = null;
  }

  /**
   * Update the scene with chord shape and tension bar entities.
   * For full gradient rendering in tests, use renderToSVG() method.
   */
  update(input: AnnotatedMusicalFrame, _previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];
    const t = input.t;
    const part = input.part;

    // Select the chord to render and compute its fade-out opacity.
    // A held chord renders at full opacity; once the chord ends we keep
    // rendering the previous one at dropping opacity for CHORD_FADE_OUT_MS
    // so the transition isn't a hard cut.
    const activeChord = input.chords.find((c) => c.chord.phase === "active");
    let chord: AnnotatedChord | null = null;
    let chordOpacity = 1;
    if (activeChord) {
      chord = activeChord;
      chordOpacity = 1;
      this.fadingChord = activeChord;
      this.fadingChordEndTime = null;
    } else if (this.fadingChord) {
      if (this.fadingChordEndTime === null) {
        this.fadingChordEndTime = t;
      }
      const age = t - this.fadingChordEndTime;
      if (age < CHORD_FADE_OUT_MS) {
        chord = this.fadingChord;
        chordOpacity = 1 - age / CHORD_FADE_OUT_MS;
      } else {
        this.fadingChord = null;
        this.fadingChordEndTime = null;
      }
    }

    if (chord) {
      const rootElement = chord.shape.elements.find((e) => e.interval === "1");
      const rootColor = rootElement?.color ?? { h: 0, s: 0, v: 0.8, a: 1 };

      // Chord shape
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
          opacity: chordOpacity,
        },
        data: {
          type: "chord-shape",
          chordId: chord.chord.id,
          quality: chord.chord.harmonic.quality,
          elements: chord.shape.elements,
          margin: chord.shape.margin,
        },
      });

      // Chord label (center of progression wheel). Uses Tonal's chord
      // name directly — already includes slash notation for inversions
      // (e.g. "EbM/G"). Mode selects harmonic vs bass-led reading.
      const labelName =
        input.chordInterpretation === "bass-led"
          ? chord.chord.bassLed.name
          : chord.chord.harmonic.name;
      if (labelName) {
        entities.push({
          id: `${this.id}:chord-label-${chord.chord.id}`,
          part,
          kind: "glyph",
          createdAt: t,
          updatedAt: t,
          position: {
            x: HARMONY_PROGRESSION_CENTER_X,
            y: HARMONY_PROGRESSION_CENTER_Y,
          },
          style: {
            color: { h: 0, s: 0, v: 1, a: 1 },
            opacity: chordOpacity,
          },
          data: {
            type: "chord-label",
            text: labelName,
          },
        });
      }
    }

    // --- Progression clock (bottom cell) ---
    const key = input.prescribedKey;
    const progression = input.harmonicContext.functionalProgression;

    // Guide rings + slot ticks render whenever a key is prescribed,
    // even with no progression data — they hold the spatial structure
    // visually so the clock doesn't blink in/out as chords come and go.
    if (key) {
      entities.push(
        ...this.createClockStructure(t, part),
      );
    }

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
        ...this.createProgressionClock(
          progression,
          t,
          part,
          key.root,
          key.mode,
          fadeMs,
        ),
      );
      entities.push(
        ...this.createConnectionStrips(
          input.harmonicContext.functionalEdges ?? [],
          progression,
          t,
          part,
          key.root,
          key.mode,
          fadeMs,
        ),
      );
      entities.push(
        ...this.createScrollingRomans(progression, t, part),
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
  /**
   * Always-on structural elements of the harmony clock — three guide
   * rings + seven slot tick marks at the diatonic ring. Renders
   * whenever a key is prescribed, regardless of whether any chord is
   * currently being played, so the clock holds its shape.
   */
  private createClockStructure(t: number, part: string): Entity[] {
    const entities: Entity[] = [];
    const clockRadius = HARMONY_CELL_SIZE * CLOCK_RADIUS_FRACTION;

    for (const [suffix, fraction] of [
      ["inner", GUIDE_RING_INNER_FRACTION],
      ["middle", GUIDE_RING_MIDDLE_FRACTION],
      ["outer", GUIDE_RING_OUTER_FRACTION],
    ] as const) {
      entities.push({
        id: `${this.id}:guide-ring-${suffix}`,
        part,
        kind: "glyph",
        createdAt: t,
        updatedAt: t,
        position: {
          x: HARMONY_PROGRESSION_CENTER_X,
          y: HARMONY_PROGRESSION_CENTER_Y,
        },
        style: {
          color: STRUCTURE_COLOR,
          opacity: STRUCTURE_OPACITY,
        },
        data: {
          type: "progression-guide-ring",
          radius: clockRadius * fraction,
        },
      });
    }

    // Slot tick marks act as dividers BETWEEN adjacent scale-degree
    // slots — placed at the angular midpoints, not at the numeral
    // positions. Held the spatial structure when the diatonic ring
    // is empty.
    const diatonicRadius = clockRadius * DIATONIC_GLYPH_RADIUS_FRACTION;
    const tickHalf = clockRadius * 0.04; // half-length of each tick
    const SLOT_HALF_WIDTH = 360 / 7 / 2; // half-slot offset to land between degrees
    for (let deg = 1; deg <= 7; deg++) {
      // Tick between `deg` and `deg + 1` (wraps from 7 → 1).
      const angleDeg = degreeAngle(deg) + SLOT_HALF_WIDTH;
      entities.push({
        id: `${this.id}:slot-tick-${deg}`,
        part,
        kind: "glyph",
        createdAt: t,
        updatedAt: t,
        position: {
          x: HARMONY_PROGRESSION_CENTER_X,
          y: HARMONY_PROGRESSION_CENTER_Y,
        },
        style: {
          color: STRUCTURE_COLOR,
          opacity: STRUCTURE_OPACITY,
        },
        data: {
          type: "progression-slot-tick",
          angleDeg,
          innerRadius: diatonicRadius - tickHalf,
          outerRadius: diatonicRadius + tickHalf,
        },
      });
    }

    return entities;
  }

  private createProgressionClock(
    progression: FunctionalChord[],
    t: number,
    part: string,
    tonicPc: PitchClass,
    mode: ModeId,
    fadeMs: number,
  ): Entity[] {
    const entities: Entity[] = [];
    const clockRadius = HARMONY_CELL_SIZE * CLOCK_RADIUS_FRACTION;
    const diatonicRadius = clockRadius * DIATONIC_GLYPH_RADIUS_FRACTION;
    const borrowedRadius = clockRadius * BORROWED_GLYPH_RADIUS_FRACTION;

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

      // Angular position: 7 equally-spaced slots for diatonic degrees,
      // with borrowed chords interpolated between adjacent diatonic
      // positions based on chromatic distance. Borrowed chords also sit
      // on a larger radius ring so they are visually outside the key.
      const semitonesFromTonic = (fc.rootPc - tonicPc + 12) % 12;
      const angleDeg = modalWheelAngle(semitonesFromTonic, mode);
      const angleRad = ((angleDeg - 90) * Math.PI) / 180; // -90 puts 0° at top
      const radius = fc.borrowed ? borrowedRadius : diatonicRadius;
      const scale = fc.borrowed ? BORROWED_SCALE : DIATONIC_SCALE;

      // Position on the clock, centered on progression cell.
      // y is multiplied by VIEWPORT_ASPECT to compensate for the
      // renderer's worldHeight < worldWidth — without this, numerals
      // at 12/6 o'clock fall short of their ring (the ring uses
      // worldWidth for both axes, the position scales y by worldHeight).
      const x = HARMONY_PROGRESSION_CENTER_X + radius * Math.cos(angleRad);
      const y =
        HARMONY_PROGRESSION_CENTER_Y +
        radius * VIEWPORT_ASPECT * Math.sin(angleRad);

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
          size: GLYPH_SIZE * scale,
        },
        data: {
          type: "roman-numeral",
          polylines: glyph.polylines,
          arcs: glyph.arcs,
          width: glyph.width,
          height: glyph.height,
          strokeWidth: strokeWidth * scale,
        },
      });
    }

    return entities;
  }

  // ==========================================================================
  // Connection Strips (SPEC 011)
  // ==========================================================================

  /**
   * Create entities for functional connection strips. Each FunctionalEdge
   * produces one entity — a single strip at the target slot — and fades
   * with the source chord's lifecycle (no separate resolution-tracking
   * state).
   *
   * Strip directionality (SPEC 011):
   *   - The strip sits OUTWARD of the target numeral.
   *   - Its anchored end (full opacity, source hue) sits on the
   *     adjacent guide ring on the side facing outward from the
   *     numeral; the chord-side edge (target hue, fading to zero)
   *     extends radially toward but not touching the numeral.
   */
  private createConnectionStrips(
    edges: FunctionalEdge[],
    progression: FunctionalChord[],
    t: number,
    part: string,
    tonicPc: PitchClass,
    mode: ModeId,
    fadeMs: number,
  ): Entity[] {
    if (edges.length === 0) return [];

    const entities: Entity[] = [];
    const clockRadius = HARMONY_CELL_SIZE * CLOCK_RADIUS_FRACTION;
    const stripRadialHeight = clockRadius * STRIP_RADIAL_FRACTION;

    // Build a chord-id index for source-chord lookup.
    const chordsById = new Map<string, FunctionalChord>();
    for (const fc of progression) chordsById.set(fc.chordId, fc);

    for (const edge of edges) {
      const sourceChord = chordsById.get(edge.sourceChordId);
      if (!sourceChord) continue;

      // Fade follows the source chord's lifecycle — same model as the
      // chord numeral, so strips and numerals fade together.
      // releaseTime can be null OR undefined (older fixture shape) — both mean "still held".
      const releaseTime = sourceChord.releaseTime ?? null;
      let fadeOpacity: number;
      if (releaseTime === null) {
        fadeOpacity = 1.0;
      } else {
        const ageSinceRelease = t - releaseTime;
        if (ageSinceRelease < 0 || ageSinceRelease >= fadeMs) continue;
        fadeOpacity = 1 - ageSinceRelease / fadeMs;
      }

      const overallOpacity = fadeOpacity * edge.weight * MAX_STRIP_OPACITY;
      if (overallOpacity < 0.01) continue;

      // Only the target strip is rendered. The previous design also
      // emitted a "from" strip at the source chord; user feedback was
      // that it duplicated information already conveyed by the source
      // numeral itself, so we now show only the target side of the
      // relationship.
      //
      // Target strip sits OUTWARD of the target numeral; midpoint
      // anchored at the adjacent guide ring on the side facing
      // outward from the numeral:
      //   - Diatonic target: anchor at middle guide ring (cross-ring)
      //   - Borrowed target: anchor at outer guide ring (within-ring)
      const targetSemitones = (edge.targetPc - tonicPc + 12) % 12;
      const targetAngleDeg = modalWheelAngle(targetSemitones, mode);
      const targetAnchorFraction = edge.targetDiatonic
        ? GUIDE_RING_MIDDLE_FRACTION
        : GUIDE_RING_OUTER_FRACTION;
      const targetMidR = clockRadius * targetAnchorFraction;
      const targetChordR = targetMidR - stripRadialHeight;

      const sourceHue = pcToHue(sourceChord.rootPc, DEFAULT_HUE_INVARIANT);
      const targetHue = pcToHue(edge.targetPc, DEFAULT_HUE_INVARIANT);

      const targetArcWidth = edge.targetDiatonic
        ? STRIP_ARC_WIDTH
        : STRIP_ARC_WIDTH * BORROWED_SCALE;

      entities.push({
        id: `${this.id}:edge:${sourceChord.chordId}:${edge.targetDegree}`,
        part,
        kind: "glyph",
        createdAt: sourceChord.onset,
        updatedAt: t,
        position: {
          x: HARMONY_PROGRESSION_CENTER_X,
          y: HARMONY_PROGRESSION_CENTER_Y,
        },
        style: {
          opacity: overallOpacity,
        },
        data: {
          type: "connection-strip",
          targetAngleDeg,
          targetMidR,
          targetChordR,
          targetArcWidth,
          sourceHue,
          targetHue,
        },
      });
    }

    return entities;
  }

  // ==========================================================================
  // Scrolling Chord Strip
  // ==========================================================================

  /**
   * Create entities for the scrolling Roman-numeral strip. Each chord in
   * the progression renders as:
   * - A thin vertical duration bar from its onset Y to its release Y
   *   (or the now-line if still being held), coloured by root pitch
   *   class at low opacity.
   * - A mini Roman numeral glyph anchored at the onset Y.
   *
   * Glyphs scroll upward in sync with the rhythm grammar's timeline
   * and fade out as they approach the top edge (matching the rhythm
   * grammar's own top-edge opacity gradient).
   */
  private createScrollingRomans(
    progression: FunctionalChord[],
    t: number,
    part: string,
  ): Entity[] {
    const entities: Entity[] = [];
    const stripX = CHORD_STRIP_CENTER_X;
    const barW = CHORD_STRIP_BAR_WIDTH;

    for (let i = 0; i < progression.length; i++) {
      const fc = progression[i];

      const onsetY = timeToY(fc.onset, t);
      const endY = timeToY(fc.releaseTime ?? t, t);

      // Cull if entirely above the visible area (fully scrolled off top)
      if (onsetY < 0 && endY < 0) continue;

      const hue = pcToHue(fc.rootPc, DEFAULT_HUE_INVARIANT);
      const color: ColorHSVA = { h: hue, s: 0.7, v: 0.9, a: 1 };

      // Duration bar: clamp so in-progress chords don't extend into
      // the future and the bar only exists when there's extent to show.
      const top = Math.max(Math.min(onsetY, endY), 0);
      const bottom = Math.min(Math.max(onsetY, endY), NOW_LINE_Y);

      if (bottom > top) {
        // Proximity to top edge fades like rhythm note strips
        const topOpacity = STRIP_BAR_OPACITY * Math.min(top / NOW_LINE_Y, 1);
        const bottomOpacity =
          STRIP_BAR_OPACITY * Math.min(bottom / NOW_LINE_Y, 1);
        entities.push({
          id: `${this.id}:strip-bar:${fc.chordId}`,
          part,
          // "particle" kind with data.type="note-strip" routes to the
          // renderer's rect+gradient path (same as rhythm note strips).
          kind: "particle",
          createdAt: fc.onset,
          updatedAt: t,
          position: { x: stripX, y: top },
          style: {
            color,
            // Renderer divides size by 1000 to get world-unit bar width
            size: barW * 1000,
            opacity: (topOpacity + bottomOpacity) / 2,
          },
          data: {
            type: "note-strip",
            barHeight: bottom - top,
            topOpacity,
            bottomOpacity,
          },
        });
      }

      // Mini Roman numeral glyph at the chord's onset Y — unless the
      // onset itself has already scrolled off the top.
      if (onsetY < 0) continue;
      const glyphOpacity = Math.min(onsetY / NOW_LINE_Y, 1);
      if (glyphOpacity < 0.01) continue;

      const glyph = buildRomanNumeralGlyph(fc.roman);
      entities.push({
        id: `${this.id}:strip-glyph:${fc.chordId}`,
        part,
        kind: "glyph",
        createdAt: fc.onset,
        updatedAt: t,
        position: { x: stripX, y: onsetY },
        style: { color, opacity: glyphOpacity, size: STRIP_GLYPH_SIZE },
        data: {
          type: "roman-numeral",
          polylines: glyph.polylines,
          arcs: glyph.arcs,
          width: glyph.width,
          height: glyph.height,
          strokeWidth: STRIP_STROKE_WIDTH,
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
