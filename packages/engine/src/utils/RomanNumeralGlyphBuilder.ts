/**
 * Roman Numeral Glyph Builder
 *
 * Produces geometric glyph paths for Roman numerals used in functional
 * harmony display. Each glyph is composed of line segments and arcs —
 * no text rendering required.
 *
 * Glyph coordinates are in a local unit system:
 * - Origin at bottom-left of the baseline
 * - Y-up (0 = baseline, positive = above)
 * - Uppercase height = 1.0, lowercase height = 0.65
 *
 * The builder parses Roman numeral strings (e.g. "vii°7", "IV", "♭III")
 * and composes the appropriate base + suffix geometry.
 *
 * @see SPEC_010 for design rationale (Invariant I19)
 */

import type {
  GlyphSegment,
  GlyphArc,
  RomanNumeralGlyph,
} from "@synesthetica/contracts";

// ============================================================================
// Dimensions
// ============================================================================

/** Height of uppercase glyphs */
const UPPER_H = 1.0;

/** Height of lowercase glyphs */
const LOWER_H = 0.65;

/** Stroke width between vertical strokes (I, i spacing) */
const STROKE_GAP = 0.2;

/** Width of V/v chevron at the top */
const CHEVRON_W = 0.5;

/** Suffix scale relative to base numeral height */
const SUFFIX_SCALE = 0.35;

/** Gap between base numeral and suffix */
const SUFFIX_GAP = 0.08;

/** Radius of the ° circle (in suffix-local coords, before scaling) */
const DEGREE_RADIUS = 0.3;

/** Width of 7 glyph (in suffix-local coords) */
const SEVEN_W = 0.5;

// ============================================================================
// Base Numeral Geometry
// ============================================================================

interface RawGlyph {
  segments: GlyphSegment[];
  arcs: GlyphArc[];
  width: number;
  height: number;
}

function makeI(h: number): RawGlyph {
  return {
    segments: [{ x1: 0, y1: 0, x2: 0, y2: h }],
    arcs: [],
    width: 0,
    height: h,
  };
}

function makeII(h: number): RawGlyph {
  return {
    segments: [
      { x1: 0, y1: 0, x2: 0, y2: h },
      { x1: STROKE_GAP, y1: 0, x2: STROKE_GAP, y2: h },
    ],
    arcs: [],
    width: STROKE_GAP,
    height: h,
  };
}

function makeIII(h: number): RawGlyph {
  return {
    segments: [
      { x1: 0, y1: 0, x2: 0, y2: h },
      { x1: STROKE_GAP, y1: 0, x2: STROKE_GAP, y2: h },
      { x1: STROKE_GAP * 2, y1: 0, x2: STROKE_GAP * 2, y2: h },
    ],
    arcs: [],
    width: STROKE_GAP * 2,
    height: h,
  };
}

function makeV(h: number): RawGlyph {
  // V shape: two lines meeting at bottom center
  const halfW = CHEVRON_W / 2;
  return {
    segments: [
      { x1: 0, y1: h, x2: halfW, y2: 0 },      // left arm down
      { x1: halfW, y1: 0, x2: CHEVRON_W, y2: h }, // right arm up
    ],
    arcs: [],
    width: CHEVRON_W,
    height: h,
  };
}

function makeIV(h: number): RawGlyph {
  // I then V, with gap
  const iGlyph = makeI(h);
  const vGlyph = makeV(h);
  const gap = STROKE_GAP;
  const vOffset = gap;

  return {
    segments: [
      ...iGlyph.segments,
      ...vGlyph.segments.map((s) => ({
        x1: s.x1 + vOffset,
        y1: s.y1,
        x2: s.x2 + vOffset,
        y2: s.y2,
      })),
    ],
    arcs: [],
    width: vOffset + vGlyph.width,
    height: h,
  };
}

function makeVI(h: number): RawGlyph {
  // V then I
  const vGlyph = makeV(h);
  const gap = STROKE_GAP;
  const iOffset = vGlyph.width + gap;

  return {
    segments: [
      ...vGlyph.segments,
      { x1: iOffset, y1: 0, x2: iOffset, y2: h },
    ],
    arcs: [],
    width: iOffset,
    height: h,
  };
}

function makeVII(h: number): RawGlyph {
  // V then II
  const vGlyph = makeV(h);
  const gap = STROKE_GAP;
  const iiOffset = vGlyph.width + gap;

  return {
    segments: [
      ...vGlyph.segments,
      { x1: iiOffset, y1: 0, x2: iiOffset, y2: h },
      { x1: iiOffset + STROKE_GAP, y1: 0, x2: iiOffset + STROKE_GAP, y2: h },
    ],
    arcs: [],
    width: iiOffset + STROKE_GAP,
    height: h,
  };
}

/** Map numeral text to geometry builder */
const NUMERAL_BUILDERS: Record<string, (h: number) => RawGlyph> = {
  I: (h) => makeI(h),
  II: (h) => makeII(h),
  III: (h) => makeIII(h),
  IV: (h) => makeIV(h),
  V: (h) => makeV(h),
  VI: (h) => makeVI(h),
  VII: (h) => makeVII(h),
};

// ============================================================================
// Suffix Geometry
// ============================================================================

function makeDegreeSign(): RawGlyph {
  return {
    segments: [],
    arcs: [{ cx: DEGREE_RADIUS, cy: DEGREE_RADIUS, r: DEGREE_RADIUS }],
    width: DEGREE_RADIUS * 2,
    height: DEGREE_RADIUS * 2,
  };
}

function makeHalfDimSign(): RawGlyph {
  // ø = ° with a horizontal stroke through it
  const d = DEGREE_RADIUS * 2;
  return {
    segments: [
      // Horizontal stroke through the circle, extending slightly beyond
      { x1: -DEGREE_RADIUS * 0.3, y1: DEGREE_RADIUS, x2: d + DEGREE_RADIUS * 0.3, y2: DEGREE_RADIUS },
    ],
    arcs: [{ cx: DEGREE_RADIUS, cy: DEGREE_RADIUS, r: DEGREE_RADIUS }],
    width: d + DEGREE_RADIUS * 0.6,
    height: d,
  };
}

function makePlusSign(): RawGlyph {
  const size = DEGREE_RADIUS * 2;
  const half = size / 2;
  return {
    segments: [
      { x1: half, y1: 0, x2: half, y2: size },     // vertical
      { x1: 0, y1: half, x2: size, y2: half },      // horizontal
    ],
    arcs: [],
    width: size,
    height: size,
  };
}

function makeTriangle(): RawGlyph {
  // Δ — equilateral-ish triangle
  const size = DEGREE_RADIUS * 2.2;
  const half = size / 2;
  return {
    segments: [
      { x1: half, y1: size, x2: 0, y2: 0 },        // top to bottom-left
      { x1: 0, y1: 0, x2: size, y2: 0 },            // bottom-left to bottom-right
      { x1: size, y1: 0, x2: half, y2: size },       // bottom-right to top
    ],
    arcs: [],
    width: size,
    height: size,
  };
}

function makeSeven(): RawGlyph {
  const w = SEVEN_W;
  const h = 0.8;
  return {
    segments: [
      { x1: 0, y1: h, x2: w, y2: h },              // top horizontal
      { x1: w, y1: h, x2: w * 0.3, y2: 0 },        // diagonal down-left
    ],
    arcs: [],
    width: w,
    height: h,
  };
}

// ============================================================================
// Parser + Composer
// ============================================================================

/**
 * Parse a Roman numeral string into base numeral + suffix.
 *
 * Examples:
 *   "I"    → { base: "I", upper: true, suffix: null }
 *   "vii°" → { base: "VII", upper: false, suffix: "°" }
 *   "V7"   → { base: "V", upper: true, suffix: "7" }
 *   "♭III" → { base: "III", upper: true, suffix: null, accidental: "♭" }
 */
interface ParsedNumeral {
  base: string;       // Uppercase numeral key (I–VII)
  upper: boolean;     // Whether the original was uppercase
  suffix: string | null;  // °, °7, ø7, +, 7, Δ7
  accidental: string | null;  // ♭ or ♯ prefix
}

function parseRoman(roman: string): ParsedNumeral {
  let remaining = roman;
  let accidental: string | null = null;

  // Extract accidental prefix
  if (remaining.startsWith("♭") || remaining.startsWith("♯")) {
    accidental = remaining[0];
    remaining = remaining.slice(1);
  }

  // Determine case from first letter
  const upper = remaining[0] === remaining[0].toUpperCase();

  // Extract base numeral (greedy match, longest first)
  const upperRemaining = remaining.toUpperCase();
  let base = "";
  for (const candidate of ["VII", "VI", "IV", "III", "II", "V", "I"]) {
    if (upperRemaining.startsWith(candidate)) {
      base = candidate;
      remaining = remaining.slice(candidate.length);
      break;
    }
  }

  if (!base) {
    // Fallback: treat entire string as unknown
    return { base: "I", upper: true, suffix: null, accidental: null };
  }

  // Everything after the base numeral is the suffix
  const suffix = remaining.length > 0 ? remaining : null;

  return { base, upper, suffix, accidental };
}

function offsetGlyph(glyph: RawGlyph, dx: number, dy: number): RawGlyph {
  return {
    segments: glyph.segments.map((s) => ({
      x1: s.x1 + dx,
      y1: s.y1 + dy,
      x2: s.x2 + dx,
      y2: s.y2 + dy,
    })),
    arcs: glyph.arcs.map((a) => ({
      ...a,
      cx: a.cx + dx,
      cy: a.cy + dy,
    })),
    width: glyph.width,
    height: glyph.height,
  };
}

function scaleGlyph(glyph: RawGlyph, s: number): RawGlyph {
  return {
    segments: glyph.segments.map((seg) => ({
      x1: seg.x1 * s,
      y1: seg.y1 * s,
      x2: seg.x2 * s,
      y2: seg.y2 * s,
    })),
    arcs: glyph.arcs.map((a) => ({
      ...a,
      cx: a.cx * s,
      cy: a.cy * s,
      r: a.r * s,
    })),
    width: glyph.width * s,
    height: glyph.height * s,
  };
}

function buildSuffix(suffix: string): RawGlyph | null {
  switch (suffix) {
    case "°":
      return makeDegreeSign();
    case "°7": {
      const deg = makeDegreeSign();
      const seven = offsetGlyph(makeSeven(), deg.width + 0.05, 0);
      return mergeGlyphs(deg, seven);
    }
    case "ø7": {
      const hd = makeHalfDimSign();
      const seven = offsetGlyph(makeSeven(), hd.width + 0.05, 0);
      return mergeGlyphs(hd, seven);
    }
    case "+":
      return makePlusSign();
    case "7":
      return makeSeven();
    case "Δ7": {
      const tri = makeTriangle();
      const seven = offsetGlyph(makeSeven(), tri.width + 0.05, 0);
      return mergeGlyphs(tri, seven);
    }
    default:
      return null;
  }
}

function mergeGlyphs(a: RawGlyph, b: RawGlyph): RawGlyph {
  return {
    segments: [...a.segments, ...b.segments],
    arcs: [...a.arcs, ...b.arcs],
    width: Math.max(a.width, b.width + (b.segments[0]?.x1 ?? 0)),
    height: Math.max(a.height, b.height),
  };
}

function makeAccidental(acc: string, baseHeight: number): RawGlyph {
  const h = baseHeight * 0.5;
  const w = 0.15;
  const midY = baseHeight * 0.6;

  if (acc === "♭") {
    // Flat: vertical line with a small bump at bottom-right
    return {
      segments: [
        { x1: 0, y1: midY + h * 0.5, x2: 0, y2: midY - h * 0.3 },
        { x1: 0, y1: midY - h * 0.3, x2: w, y2: midY - h * 0.1 },
        { x1: w, y1: midY - h * 0.1, x2: 0, y2: midY + h * 0.1 },
      ],
      arcs: [],
      width: w,
      height: h,
    };
  }

  // Sharp: # — two vertical + two horizontal
  return {
    segments: [
      { x1: w * 0.3, y1: midY - h * 0.4, x2: w * 0.3, y2: midY + h * 0.4 },
      { x1: w * 0.7, y1: midY - h * 0.4, x2: w * 0.7, y2: midY + h * 0.4 },
      { x1: 0, y1: midY - h * 0.15, x2: w, y2: midY - h * 0.05 },
      { x1: 0, y1: midY + h * 0.15, x2: w, y2: midY + h * 0.05 },
    ],
    arcs: [],
    width: w,
    height: h,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build a Roman numeral glyph from a string like "I", "vii°7", "♭III", "V7".
 *
 * Returns geometric path data (line segments + arcs) with a bounding box.
 * Coordinates are in glyph-local units: origin at bottom-left of baseline,
 * Y-up, uppercase height = 1.0.
 */
export function buildRomanNumeralGlyph(roman: string): RomanNumeralGlyph {
  const parsed = parseRoman(roman);

  // Build base numeral
  const h = parsed.upper ? UPPER_H : LOWER_H;
  const builder = NUMERAL_BUILDERS[parsed.base];
  if (!builder) {
    return { segments: [], arcs: [], width: 0, height: 0 };
  }

  const baseGlyph = builder(h);
  let totalWidth = baseGlyph.width;
  let totalHeight = baseGlyph.height;

  // Prepend accidental if present
  let accidentalOffset = 0;
  const allSegments: GlyphSegment[] = [];
  const allArcs: GlyphArc[] = [];

  if (parsed.accidental) {
    const accGlyph = makeAccidental(parsed.accidental, h);
    accidentalOffset = accGlyph.width + SUFFIX_GAP;
    allSegments.push(...accGlyph.segments);
    allArcs.push(...accGlyph.arcs);
    totalWidth += accidentalOffset;
  }

  // Add base numeral (offset by accidental width)
  const offsetBase = offsetGlyph(baseGlyph, accidentalOffset, 0);
  allSegments.push(...offsetBase.segments);
  allArcs.push(...offsetBase.arcs);

  // Append suffix if present
  if (parsed.suffix) {
    const suffixGlyph = buildSuffix(parsed.suffix);
    if (suffixGlyph) {
      // Scale suffix down and position at top-right of base
      const scaled = scaleGlyph(suffixGlyph, SUFFIX_SCALE);
      const suffixX = accidentalOffset + baseGlyph.width + SUFFIX_GAP;
      const suffixY = h - scaled.height;
      const positioned = offsetGlyph(scaled, suffixX, suffixY);

      allSegments.push(...positioned.segments);
      allArcs.push(...positioned.arcs);
      totalWidth = Math.max(totalWidth, suffixX + scaled.width);
      totalHeight = Math.max(totalHeight, h);
    }
  }

  return {
    segments: allSegments,
    arcs: allArcs,
    width: totalWidth,
    height: totalHeight,
  };
}
