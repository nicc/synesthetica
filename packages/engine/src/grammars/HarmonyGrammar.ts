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
const MAX_STRIP_OPACITY = 1.0;

// ============================================================================
// Edge Connector Arc Constants
// ============================================================================

/** Duration (ms) of the directional connector arc that grows from the
 *  source chord's angular position along its target ring toward the
 *  target strip. Short enough to feel snappy, long enough to read as
 *  a drawn line rather than a snap. Tune to taste. */
const CONNECTOR_ANIMATION_MS = 60;

/** Connector arc radial half-thickness as a normalized fraction of
 *  worldWidth. The renderer draws the arc as a thin annular segment
 *  from (radius − halfThickness) to (radius + halfThickness), so
 *  full stroke thickness is 2×. Chosen to read as ~2× the guide ring
 *  stroke while staying much thinner than the strip's radial extent
 *  (STRIP_RADIAL_FRACTION * clockRadius ≈ 0.01 normalized). */
const CONNECTOR_HALF_THICKNESS_NORMALIZED = 0.001;

/** Arrow indicator height as a multiple of the arc's full stroke
 *  thickness. The arrow's flat base sits flush against the arc at
 *  the source end, apex pointing at the source chord numeral. */
const ARROW_HEIGHT_MULTIPLIER = 2;

/**
 * Assumed renderer worldWidth. The strip renderer uses worldWidth to
 * convert normalized radial coords to world units, and its angular
 * width (strip_arc_width / mean_radius_world) then depends on that
 * assumption. The grammar needs the same assumption to compute where
 * the arc should stop flush with the strip's near edge. Kept as a
 * named constant rather than magic 100 so this coupling is legible.
 * If the renderer's worldWidth ever changes, update this too.
 */
const ASSUMED_WORLD_WIDTH = 100;

/** Opacity multiplier applied to the connector arc's edge-weight-scaled
 *  opacity. Independent knob from MAX_STRIP_OPACITY so the pathway
 *  reads at the right strength without dragging the strip along. */
const CONNECTOR_OPACITY_MULTIPLIER = 0.8;

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

/**
 * Signed shortest arc (degrees) from `from` to `to` on a 360° wheel.
 * Positive = clockwise, negative = counter-clockwise. Range (−180, 180].
 * The exact-180° case resolves to +180 (arbitrary but consistent).
 */
function shorterSignedArc(fromDeg: number, toDeg: number): number {
  const diff = ((toDeg - fromDeg) % 360 + 540) % 360 - 180;
  return diff === -180 ? 180 : diff;
}

/**
 * The longer arc's signed sweep given the shorter arc. If shorter is
 * +P (0 < P ≤ 180) the longer is −(360 − P); if shorter is −P the
 * longer is +(360 − P). The two together always cover a full circle.
 */
function longerSignedArc(shorterSweep: number): number {
  const absLonger = 360 - Math.abs(shorterSweep);
  return -Math.sign(shorterSweep) * absLonger;
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
      // (e.g. "Eb/G"). Mode selects harmonic vs bass-led reading.
      // Tonal uses lowercase 'b' and '#' exclusively as flat/sharp
      // accidentals across roots, bass notes, and chord-tone
      // alterations (e.g. "Bb7b9b13#11/Ab" → "B♭7♭9♭13♯11/A♭"), so a
      // global replace is safe and catches all of: root flats, bass
      // flats, alteration flats (b5/b9/b13), and the equivalent sharps.
      const rawName =
        input.chordInterpretation === "bass-led"
          ? chord.chord.bassLed.name
          : chord.chord.harmonic.name;
      const labelName = rawName
        ? rawName.replace(/b/g, "♭").replace(/#/g, "♯")
        : rawName;
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
        ...this.createEdgeVisuals(
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
   * Create entities for each functional edge:
   *   1. A directional connector arc that grows from the source chord's
   *      angular position along the target's guide ring toward the
   *      target strip, over CONNECTOR_ANIMATION_MS from the source
   *      chord's onset. Snaps to complete on release.
   *   2. A connection strip at the target slot (SPEC 011), emitted
   *      only once the connector arc has reached the target.
   *
   * Both fade with the source chord's lifecycle — same model as the
   * chord numeral, so numeral / connector / strip fade together.
   *
   * Fan-out handling: when a source has two edges on the same target
   * ring (both diatonic or both borrowed), the connectors are routed
   * in opposite directions along the ring so they don't overlap. The
   * higher-weight edge keeps its natural (shorter) arc; the
   * lower-weight edge takes the flipped (longer) arc.
   *
   * Strip directionality (SPEC 011, unchanged):
   *   - The strip sits OUTWARD of the target numeral.
   *   - Its anchored end (full opacity, source hue) sits on the
   *     adjacent guide ring on the side facing outward from the
   *     numeral; the chord-side edge (target hue, fading to zero)
   *     extends radially toward but not touching the numeral.
   */
  private createEdgeVisuals(
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

    // Resolve arc direction (signed sweep degrees) per edge. Fan-out
    // rule: if a source has two edges on the same target ring whose
    // natural (shorter-arc) directions collide, the lower-weight edge
    // is flipped to the longer arc so the two connectors travel
    // opposite ways along the ring.
    const sweepByEdge = this.resolveEdgeSweeps(edges, chordsById, tonicPc, mode);

    // Arrows dedup by (source, ring) — a source with multiple edges
    // to the same target ring only emits one arrow (at the source
    // angle, pointing at the source numeral). A source with edges to
    // both rings emits two arrows at different radial positions.
    const arrowKeysEmitted = new Set<string>();

    for (const edge of edges) {
      const sourceChord = chordsById.get(edge.sourceChordId);
      if (!sourceChord) continue;

      // Fade follows the source chord's lifecycle — same model as the
      // chord numeral, so numeral / connector / strip fade together.
      // releaseTime can be null OR undefined (older fixture shape) —
      // both mean "still held".
      const releaseTime = sourceChord.releaseTime ?? null;
      let fadeOpacity: number;
      if (releaseTime === null) {
        fadeOpacity = 1.0;
      } else {
        const ageSinceRelease = t - releaseTime;
        if (ageSinceRelease < 0 || ageSinceRelease >= fadeMs) continue;
        fadeOpacity = 1 - ageSinceRelease / fadeMs;
      }

      // Animation progress. Snaps to 1 on release so mid-animation
      // releases don't leave the pathway drawing during the fade.
      const progress =
        releaseTime !== null
          ? 1
          : Math.min(1, Math.max(0, (t - sourceChord.onset) / CONNECTOR_ANIMATION_MS));

      const sourceSemitones = (sourceChord.rootPc - tonicPc + 12) % 12;
      const sourceAngleDeg = modalWheelAngle(sourceSemitones, mode);
      const targetSemitones = (edge.targetPc - tonicPc + 12) % 12;
      const targetAngleDeg = modalWheelAngle(targetSemitones, mode);

      // Arc rides at the target's anchor ring (guide ring adjacent to
      // the target numeral). Strip is shifted radially inward by the
      // arc's half-thickness so its outer edge sits at the arc's
      // inner edge — flush radial adjacency, no overlap.
      const targetAnchorFraction = edge.targetDiatonic
        ? GUIDE_RING_MIDDLE_FRACTION
        : GUIDE_RING_OUTER_FRACTION;
      const arcRingR = clockRadius * targetAnchorFraction;
      const stripShift = CONNECTOR_HALF_THICKNESS_NORMALIZED;
      const targetMidR = arcRingR - stripShift;
      const targetChordR = targetMidR - stripRadialHeight;

      const sourceHue = pcToHue(sourceChord.rootPc, DEFAULT_HUE_INVARIANT);
      const targetHue = pcToHue(edge.targetPc, DEFAULT_HUE_INVARIANT);

      const sweepDeg = sweepByEdge.get(edge) ?? 0;
      // One base opacity shared by arc and strip.
      const baseOpacity =
        fadeOpacity * edge.weight * MAX_STRIP_OPACITY * CONNECTOR_OPACITY_MULTIPLIER;
      const arcOpacity = baseOpacity;

      // Extend the arc angularly past the strip's far edge so the arc
      // line runs the full length of the strip's angular extent above
      // it (no radial overlap — arc and strip are radially adjacent).
      const targetArcWidth = edge.targetDiatonic
        ? STRIP_ARC_WIDTH
        : STRIP_ARC_WIDTH * BORROWED_SCALE;
      const meanRingWorld =
        ((targetMidR + targetChordR) / 2) * ASSUMED_WORLD_WIDTH;
      const stripAngularHalfWidthDeg =
        (targetArcWidth / meanRingWorld / 2) * (180 / Math.PI);
      const absSweep = Math.abs(sweepDeg);
      const extendedAbsSweep = absSweep + stripAngularHalfWidthDeg;
      const extendedSweep = Math.sign(sweepDeg) * extendedAbsSweep;

      // Also extend the arc backward past the source angle so it runs
      // under the entire angular span of the source-end triangle.
      const arrowHeightNormalized =
        ARROW_HEIGHT_MULTIPLIER * 2 * CONNECTOR_HALF_THICKNESS_NORMALIZED;
      const arrowHalfBaseNormalized = arrowHeightNormalized / Math.sqrt(3);
      const arrowHalfBaseAngularDeg =
        (arrowHalfBaseNormalized / arcRingR) * (180 / Math.PI);
      const arcStartAngleDeg =
        sourceAngleDeg - Math.sign(extendedSweep) * arrowHalfBaseAngularDeg;
      const arcExtendedSweep =
        extendedSweep + Math.sign(extendedSweep) * arrowHalfBaseAngularDeg;

      // Connector arc: emit whenever the source is alive (even at
      // progress=0 it's a zero-length arc so the renderer no-ops
      // gracefully). Arc terminates flush with the strip's near
      // edge; the strip's shader plateau continues the arc's
      // opacity through the first arc-width of the strip's radial
      // extent.
      if (arcOpacity >= 0.01) {
        entities.push({
          id: `${this.id}:edge-connector:${sourceChord.chordId}:${edge.targetDegree}:${edge.targetDiatonic ? "d" : "b"}`,
          part,
          kind: "glyph",
          createdAt: sourceChord.onset,
          updatedAt: t,
          position: {
            x: HARMONY_PROGRESSION_CENTER_X,
            y: HARMONY_PROGRESSION_CENTER_Y,
          },
          style: {
            opacity: arcOpacity,
          },
          data: {
            type: "connection-arc",
            radius: arcRingR,
            startAngleDeg: arcStartAngleDeg,
            sweepDeg: arcExtendedSweep * progress,
            hue: sourceHue,
            halfThickness: CONNECTOR_HALF_THICKNESS_NORMALIZED,
          },
        });

        // Arrow indicator at the source position, apex pointing at
        // the source chord numeral. Source is always borrowed (only
        // borrowed chords emit edges), so the numeral sits at the
        // borrowed ring — outward of the arc for diatonic targets
        // (arc rides middle guide ring) and inward of the arc for
        // borrowed targets (arc rides outer guide ring). Dedup by
        // (source, ring) so fan-out to the same ring only produces
        // one arrow at that position.
        const arrowKey = `${sourceChord.chordId}:${edge.targetDiatonic ? "d" : "b"}`;
        if (!arrowKeysEmitted.has(arrowKey)) {
          arrowKeysEmitted.add(arrowKey);
          const pointRadial = edge.targetDiatonic ? 1 : -1;
          entities.push({
            id: `${this.id}:edge-arrow:${arrowKey}`,
            part,
            kind: "glyph",
            createdAt: sourceChord.onset,
            updatedAt: t,
            position: {
              x: HARMONY_PROGRESSION_CENTER_X,
              y: HARMONY_PROGRESSION_CENTER_Y,
            },
            style: {
              opacity: arcOpacity,
            },
            data: {
              type: "connection-arrow",
              radius: arcRingR,
              angleDeg: sourceAngleDeg,
              pointRadial,
              heightNormalized:
                ARROW_HEIGHT_MULTIPLIER * 2 * CONNECTOR_HALF_THICKNESS_NORMALIZED,
              arcHalfThicknessNormalized: CONNECTOR_HALF_THICKNESS_NORMALIZED,
              hue: sourceHue,
            },
          });
        }
      }

      // Connection strip: only visible once the connector has landed.
      // Held-chord case: strip appears at t = onset + CONNECTOR_ANIMATION_MS.
      // Released mid-animation: strip snaps to visible on release (via
      // progress=1) and fades from there.
      if (progress < 1) continue;

      const stripOpacity = baseOpacity;
      if (stripOpacity < 0.01) continue;

      entities.push({
        id: `${this.id}:edge:${sourceChord.chordId}:${edge.targetDegree}:${edge.targetDiatonic ? "d" : "b"}`,
        part,
        kind: "glyph",
        createdAt: sourceChord.onset,
        updatedAt: t,
        position: {
          x: HARMONY_PROGRESSION_CENTER_X,
          y: HARMONY_PROGRESSION_CENTER_Y,
        },
        style: {
          opacity: stripOpacity,
        },
        data: {
          type: "connection-strip",
          targetAngleDeg,
          targetMidR,
          targetChordR,
          targetArcWidth,
          sourceHue,
          targetHue,
          // Plateau fraction: what fraction of the strip's radial
          // extent stays at peak opacity before the fade begins.
          // With the strip now radially adjacent to (not overlapping)
          // the arc, no plateau is needed for visual continuity —
          // set to 0 for a full smoothstep fade across the whole
          // strip. Kept as a data field so it remains tunable.
          plateauFraction: 0.1,
        },
      });
    }

    return entities;
  }

  /**
   * Compute the signed sweep (degrees, +cw / −ccw) for each edge's
   * connector arc. Default is the shorter arc from source to target
   * angle; when two edges from the same source ride the same target
   * ring in the same natural direction, the lower-weight edge is
   * flipped to the longer arc so the pair fans in opposite directions.
   */
  private resolveEdgeSweeps(
    edges: FunctionalEdge[],
    chordsById: Map<string, FunctionalChord>,
    tonicPc: PitchClass,
    mode: ModeId,
  ): Map<FunctionalEdge, number> {
    const sweepByEdge = new Map<FunctionalEdge, number>();

    // Group edges by (sourceChordId, target ring) so we only compare
    // co-riding edges when deciding whether to flip a direction.
    const groups = new Map<string, FunctionalEdge[]>();
    for (const edge of edges) {
      const ringKey = edge.targetDiatonic ? "d" : "b";
      const key = `${edge.sourceChordId}::${ringKey}`;
      const existing = groups.get(key);
      if (existing) existing.push(edge);
      else groups.set(key, [edge]);
    }

    for (const group of groups.values()) {
      // Compute natural (shorter-arc) sweep for each edge in the group.
      const natural = group.map((edge) => {
        const sourceChord = chordsById.get(edge.sourceChordId);
        if (!sourceChord) return { edge, sweep: 0 };
        const sourceSemi = (sourceChord.rootPc - tonicPc + 12) % 12;
        const targetSemi = (edge.targetPc - tonicPc + 12) % 12;
        const sourceAngle = modalWheelAngle(sourceSemi, mode);
        const targetAngle = modalWheelAngle(targetSemi, mode);
        return { edge, sweep: shorterSignedArc(sourceAngle, targetAngle) };
      });

      // Fan-out collision check: if the group has multiple edges whose
      // natural sweeps share a sign, flip all but the highest-weight
      // one to the longer arc. In practice max fan on a single ring
      // is 2 (per the interchange table + secondary-dominant chain),
      // so this reduces to "flip the lower-weight edge."
      if (natural.length > 1) {
        natural.sort((a, b) => b.edge.weight - a.edge.weight);
        const keeperSign = Math.sign(natural[0].sweep) || 1;
        for (let i = 1; i < natural.length; i++) {
          const sameDirection = Math.sign(natural[i].sweep) === keeperSign;
          if (sameDirection) {
            natural[i].sweep = longerSignedArc(natural[i].sweep);
          }
        }
      }

      for (const { edge, sweep } of natural) sweepByEdge.set(edge, sweep);
    }

    return sweepByEdge;
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
