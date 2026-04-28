/**
 * Progression Clock Prototype
 *
 * SVG snapshots of the progression clock concept: Roman numeral glyphs
 * positioned on a 7-degree diatonic wheel (inner ring) with borrowed
 * chords on an outer ring between adjacent diatonic slots, coloured by
 * root hue (I14), fading with age (Principle 9).
 *
 * This is a design prototype — no grammar or renderer code. Just SVG
 * generation for visual review.
 *
 * Run: GENERATE_SNAPSHOTS=1 npm test -w packages/engine -- -t "Progression Clock"
 * View: open packages/engine/test/_snapshots/progression-clock/
 */

import { describe, it, expect } from "vitest";
import { buildRomanNumeralGlyph } from "../../src/utils/RomanNumeralGlyphBuilder";
import type {
  PrescribedKey,
  PitchClass,
  ChordQuality,
  RomanNumeralGlyph,
  ModeId,
} from "@synesthetica/contracts";
import { pcToHue, MODE_SCALE_INTERVALS } from "@synesthetica/contracts";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// ============================================================================
// Constants
// ============================================================================

const SNAPSHOT_DIR = resolve(__dirname, "../_snapshots/progression-clock");
const GENERATE = process.env.GENERATE_SNAPSHOTS === "1";

/** Clock radius in SVG pixels */
const CLOCK_RADIUS = 160;

/** Center of the clock in the SVG */
const CX = 220;
const CY = 220;

/** SVG canvas size */
const SVG_SIZE = 440;

/** Glyph scale (glyph units → SVG pixels) */
const GLYPH_SCALE = 28;

/** Fade window in ms — matches dynamics grammar */
const FADE_MS = 4000;

/** Diatonic (inner) glyph ring radius as fraction of clock radius */
const DIATONIC_RADIUS_FRACTION = 0.50;

/** Borrowed (outer) glyph ring radius as fraction of clock radius */
const BORROWED_RADIUS_FRACTION = 0.74;

/** Three guide rings bound two equal annular bands so each numeral
 *  sits at the radial centre of its band. */
const GLYPH_BAND_WIDTH = BORROWED_RADIUS_FRACTION - DIATONIC_RADIUS_FRACTION;
const GUIDE_RING_INNER_FRACTION = DIATONIC_RADIUS_FRACTION - GLYPH_BAND_WIDTH / 2;
const GUIDE_RING_MIDDLE_FRACTION =
  (DIATONIC_RADIUS_FRACTION + BORROWED_RADIUS_FRACTION) / 2;
const GUIDE_RING_OUTER_FRACTION = BORROWED_RADIUS_FRACTION + GLYPH_BAND_WIDTH / 2;

/** Borrowed-ring glyph scale (1/φ) */
const BORROWED_SCALE = 1 / 1.618033988749895;

/** Strip radial height (SVG pixels) — thin in the toward/away-from-center direction */
const STRIP_RADIAL_HEIGHT = 6;

/** Gap between strip and numeral (SVG pixels) */
const STRIP_GAP = 4;

/** Strip arc width (SVG pixels) — matches numeral extent along the ring */
const STRIP_ARC_WIDTH = GLYPH_SCALE;

/** Default pitch-hue invariant (A = red, clockwise) */
const HUE_INV = { referencePc: 9 as PitchClass, referenceHue: 0, direction: "cw" as const };

/**
 * Circular midpoint of two hues on the 360° wheel.
 * Takes the shorter arc so that e.g. midpoint(350, 10) = 0, not 180.
 */
function circularMidpointHue(h1: number, h2: number): number {
  let diff = h2 - h1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  let mid = h1 + diff / 2;
  if (mid < 0) mid += 360;
  if (mid >= 360) mid -= 360;
  return mid;
}

// ============================================================================
// Wheel Helpers
// ============================================================================

function degreeAngle(degree: number): number {
  return ((degree - 1) * 360) / 7;
}

function modalWheelAngle(semitones: number, mode: ModeId): number {
  const scale = MODE_SCALE_INTERVALS[mode];
  const exactIdx = scale.indexOf(semitones);
  if (exactIdx >= 0) return degreeAngle(exactIdx + 1);

  let lowerIdx = 0;
  for (let i = 0; i < scale.length; i++) {
    if (scale[i] <= semitones) lowerIdx = i;
  }
  const lowerSemi = scale[lowerIdx];
  const lowerAngle = degreeAngle(lowerIdx + 1);

  const upperSemi =
    lowerIdx === scale.length - 1 ? 12 : scale[lowerIdx + 1];
  const upperAngle =
    lowerIdx === scale.length - 1 ? 360 : degreeAngle(lowerIdx + 2);

  const frac = (semitones - lowerSemi) / (upperSemi - lowerSemi);
  return lowerAngle + (upperAngle - lowerAngle) * frac;
}

// ============================================================================
// Test Helpers
// ============================================================================

/** A functional connection between two chords (SPEC 011). */
interface FunctionalConnection {
  /** Source chord root pitch class */
  sourcePc: PitchClass;
  /** Whether source is on the borrowed ring */
  sourceBorrowed: boolean;
  /** Target chord root pitch class */
  targetPc: PitchClass;
  /** Whether target is on the diatonic ring */
  targetDiatonic: boolean;
  /** Conventional weight (0–1) */
  weight: number;
  /** Whether the target chord has been played */
  resolved: boolean;
  /** Onset of the source chord (for fade) */
  sourceOnset: number;
}

interface ChordEvent {
  roman: string;
  degree: number;
  quality: ChordQuality;
  borrowed: boolean;
  onset: number;        // ms
  rootPc: PitchClass;   // computed from key + degree
}

function makeChordEvent(
  key: PrescribedKey,
  degree: number,
  roman: string,
  quality: ChordQuality,
  onset: number,
  borrowed = false,
): ChordEvent {
  const intervals = MODE_SCALE_INTERVALS[key.mode];
  const rootPc = borrowed
    ? inferBorrowedPc(key, roman)
    : ((key.root + intervals[degree - 1]) % 12) as PitchClass;

  return { roman, degree, quality, borrowed, onset, rootPc };
}

/** Infer root PC for borrowed chords from the accidental in the roman string */
function inferBorrowedPc(key: PrescribedKey, roman: string): PitchClass {
  const intervals = MODE_SCALE_INTERVALS[key.mode];
  // Parse degree from roman numeral
  const upper = roman.replace(/[♭♯]/g, "").toUpperCase();
  let degreeIdx = 0;
  for (const [idx, num] of ["I", "II", "III", "IV", "V", "VI", "VII"].entries()) {
    if (upper.startsWith(num) && num.length > (["I", "II", "III", "IV", "V", "VI", "VII"][degreeIdx]?.length ?? 0)) {
      degreeIdx = idx;
    }
  }
  // Simpler: just match longest
  for (const candidate of ["VII", "VI", "IV", "III", "II", "V", "I"]) {
    if (upper.startsWith(candidate)) {
      degreeIdx = ["I", "II", "III", "IV", "V", "VI", "VII"].indexOf(candidate);
      break;
    }
  }

  let pc = (key.root + intervals[degreeIdx]) % 12;
  if (roman.startsWith("♭")) pc = (pc - 1 + 12) % 12;
  if (roman.startsWith("♯")) pc = (pc + 1) % 12;
  return pc as PitchClass;
}

function hsvToCSS(h: number, s: number, v: number, a: number): string {
  // HSV to RGB
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const ri = Math.round((r + m) * 255);
  const gi = Math.round((g + m) * 255);
  const bi = Math.round((b + m) * 255);
  return `rgba(${ri},${gi},${bi},${a.toFixed(2)})`;
}

// ============================================================================
// SVG Clock Renderer
// ============================================================================

function renderProgressionClock(
  events: ChordEvent[],
  currentTime: number,
  key: PrescribedKey,
  title: string,
  connections: FunctionalConnection[] = [],
): string {
  let svg = `<svg width="${SVG_SIZE}" height="${SVG_SIZE}" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg">\n`;

  // Build connection strip geometry and gradient defs.
  // Each strip is a thin polygon tangent to the ring (matching numeral
  // width along the arc) with a radial gradient: chord hue near the
  // numeral fading to midpoint hue at the guide ring boundary.
  // The numeral-facing edge fades to 0% opacity over 10% of the height.
  let defs = "  <defs>\n";
  const connSvgFragments: string[] = [];

  for (let ci = 0; ci < connections.length; ci++) {
    const conn = connections[ci];
    const age = currentTime - conn.sourceOnset;
    if (age < 0 || age >= FADE_MS) continue;

    const sourceHue = pcToHue(conn.sourcePc, HUE_INV);
    const targetHue = pcToHue(conn.targetPc, HUE_INV);
    const midHue = circularMidpointHue(sourceHue, targetHue);
    const fadeOpacity = (1 - age / FADE_MS) * conn.weight;

    const srcColor = hsvToCSS(sourceHue, 0.7, 0.9, 1);
    const tgtColor = hsvToCSS(targetHue, 0.7, 0.9, 1);
    const midColor = hsvToCSS(midHue, 0.7, 0.9, 1);
    const srcColorTransparent = hsvToCSS(sourceHue, 0.7, 0.9, 0);
    const tgtColorTransparent = hsvToCSS(targetHue, 0.7, 0.9, 0);

    // --- Source strip (inner edge of source numeral, facing guide ring) ---
    const srcSemitones = (conn.sourcePc - key.root + 12) % 12;
    const srcAngleRad = ((modalWheelAngle(srcSemitones, key.mode) - 90) * Math.PI) / 180;
    const srcRingR = CLOCK_RADIUS * (conn.sourceBorrowed
      ? BORROWED_RADIUS_FRACTION
      : DIATONIC_RADIUS_FRACTION);
    // Strip sits inward from numeral: outerR near numeral, innerR toward guide ring
    const srcOuterR = srcRingR - STRIP_GAP;
    const srcInnerR = srcOuterR - STRIP_RADIAL_HEIGHT;
    const srcArcW = conn.sourceBorrowed
      ? STRIP_ARC_WIDTH * BORROWED_SCALE
      : STRIP_ARC_WIDTH;

    // Tangent unit vector (perpendicular to radial, clockwise)
    const srcTx = -Math.sin(srcAngleRad);
    const srcTy = Math.cos(srcAngleRad);
    const srcHW = srcArcW / 2; // half-width along arc

    // Four corners of the source strip polygon
    const srcPoly = [
      [CX + srcInnerR * Math.cos(srcAngleRad) - srcHW * srcTx,
       CY + srcInnerR * Math.sin(srcAngleRad) - srcHW * srcTy],
      [CX + srcInnerR * Math.cos(srcAngleRad) + srcHW * srcTx,
       CY + srcInnerR * Math.sin(srcAngleRad) + srcHW * srcTy],
      [CX + srcOuterR * Math.cos(srcAngleRad) + srcHW * srcTx,
       CY + srcOuterR * Math.sin(srcAngleRad) + srcHW * srcTy],
      [CX + srcOuterR * Math.cos(srcAngleRad) - srcHW * srcTx,
       CY + srcOuterR * Math.sin(srcAngleRad) - srcHW * srcTy],
    ];
    const srcPoints = srcPoly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

    // Gradient: innerR (guide ring side) = midpoint, outerR (numeral side) = chord hue → fade
    const srcGradX1 = CX + srcInnerR * Math.cos(srcAngleRad);
    const srcGradY1 = CY + srcInnerR * Math.sin(srcAngleRad);
    const srcGradX2 = CX + srcOuterR * Math.cos(srcAngleRad);
    const srcGradY2 = CY + srcOuterR * Math.sin(srcAngleRad);

    defs += `    <linearGradient id="conn-${ci}-src" gradientUnits="userSpaceOnUse" x1="${srcGradX1.toFixed(1)}" y1="${srcGradY1.toFixed(1)}" x2="${srcGradX2.toFixed(1)}" y2="${srcGradY2.toFixed(1)}">\n`;
    defs += `      <stop offset="0%" stop-color="${midColor}" />\n`;
    defs += `      <stop offset="90%" stop-color="${srcColor}" />\n`;
    defs += `      <stop offset="100%" stop-color="${srcColorTransparent}" />\n`;
    defs += `    </linearGradient>\n`;

    // --- Target strip (outer edge of target slot, facing guide ring) ---
    const tgtSemitones = (conn.targetPc - key.root + 12) % 12;
    const tgtAngleRad = ((modalWheelAngle(tgtSemitones, key.mode) - 90) * Math.PI) / 180;
    const tgtRingR = CLOCK_RADIUS * (conn.targetDiatonic
      ? DIATONIC_RADIUS_FRACTION
      : BORROWED_RADIUS_FRACTION);
    // Strip sits outward from slot: innerR near numeral, outerR toward guide ring
    const tgtInnerR = tgtRingR + STRIP_GAP;
    const tgtOuterR = tgtInnerR + STRIP_RADIAL_HEIGHT;
    const tgtArcW = conn.targetDiatonic
      ? STRIP_ARC_WIDTH
      : STRIP_ARC_WIDTH * BORROWED_SCALE;

    const tgtTx = -Math.sin(tgtAngleRad);
    const tgtTy = Math.cos(tgtAngleRad);
    const tgtHW = tgtArcW / 2;

    const tgtPoly = [
      [CX + tgtInnerR * Math.cos(tgtAngleRad) - tgtHW * tgtTx,
       CY + tgtInnerR * Math.sin(tgtAngleRad) - tgtHW * tgtTy],
      [CX + tgtInnerR * Math.cos(tgtAngleRad) + tgtHW * tgtTx,
       CY + tgtInnerR * Math.sin(tgtAngleRad) + tgtHW * tgtTy],
      [CX + tgtOuterR * Math.cos(tgtAngleRad) + tgtHW * tgtTx,
       CY + tgtOuterR * Math.sin(tgtAngleRad) + tgtHW * tgtTy],
      [CX + tgtOuterR * Math.cos(tgtAngleRad) - tgtHW * tgtTx,
       CY + tgtOuterR * Math.sin(tgtAngleRad) - tgtHW * tgtTy],
    ];
    const tgtPoints = tgtPoly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

    // Gradient: innerR (numeral side) = chord hue → fade, outerR (guide ring side) = midpoint
    const tgtGradX1 = CX + tgtInnerR * Math.cos(tgtAngleRad);
    const tgtGradY1 = CY + tgtInnerR * Math.sin(tgtAngleRad);
    const tgtGradX2 = CX + tgtOuterR * Math.cos(tgtAngleRad);
    const tgtGradY2 = CY + tgtOuterR * Math.sin(tgtAngleRad);

    defs += `    <linearGradient id="conn-${ci}-tgt" gradientUnits="userSpaceOnUse" x1="${tgtGradX1.toFixed(1)}" y1="${tgtGradY1.toFixed(1)}" x2="${tgtGradX2.toFixed(1)}" y2="${tgtGradY2.toFixed(1)}">\n`;
    defs += `      <stop offset="0%" stop-color="${tgtColorTransparent}" />\n`;
    defs += `      <stop offset="10%" stop-color="${tgtColor}" />\n`;
    defs += `      <stop offset="100%" stop-color="${midColor}" />\n`;
    defs += `    </linearGradient>\n`;

    connSvgFragments.push(
      `  <polygon points="${srcPoints}" fill="url(#conn-${ci}-src)" opacity="${fadeOpacity.toFixed(2)}" />\n` +
      `  <polygon points="${tgtPoints}" fill="url(#conn-${ci}-tgt)" opacity="${fadeOpacity.toFixed(2)}" />\n`,
    );
  }
  defs += "  </defs>\n";
  svg += defs;

  svg += `  <rect width="${SVG_SIZE}" height="${SVG_SIZE}" fill="#0a0a0f"/>\n`;

  // Three subtle guide rings bound the two glyph bands.
  for (const fraction of [
    GUIDE_RING_INNER_FRACTION,
    GUIDE_RING_MIDDLE_FRACTION,
    GUIDE_RING_OUTER_FRACTION,
  ]) {
    svg += `  <circle cx="${CX}" cy="${CY}" r="${(CLOCK_RADIUS * fraction).toFixed(1)}" fill="none" stroke="#333" stroke-width="1" opacity="0.5"/>\n`;
  }

  // Tick marks at each diatonic scale-degree slot on the inner ring.
  for (let deg = 1; deg <= 7; deg++) {
    const angleDeg = degreeAngle(deg);
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    const innerR = CLOCK_RADIUS * DIATONIC_RADIUS_FRACTION - 8;
    const outerR = CLOCK_RADIUS * DIATONIC_RADIUS_FRACTION + 8;
    const x1 = CX + innerR * Math.cos(angleRad);
    const y1 = CY + innerR * Math.sin(angleRad);
    const x2 = CX + outerR * Math.cos(angleRad);
    const y2 = CY + outerR * Math.sin(angleRad);
    svg += `  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#222" stroke-width="1"/>\n`;
  }

  // Render connection strips (behind chord numerals)
  for (const fragment of connSvgFragments) {
    svg += fragment;
  }

  // Render each chord event as a positioned, coloured, fading glyph
  for (const event of events) {
    const age = currentTime - event.onset;
    if (age < 0 || age >= FADE_MS) continue;

    const fadeFraction = 1 - age / FADE_MS;
    const opacity = fadeFraction;

    const semitones = (event.rootPc - key.root + 12) % 12;
    const angleDeg = modalWheelAngle(semitones, key.mode);
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;

    const ringFraction = event.borrowed
      ? BORROWED_RADIUS_FRACTION
      : DIATONIC_RADIUS_FRACTION;
    const glyphCX = CX + CLOCK_RADIUS * ringFraction * Math.cos(angleRad);
    const glyphCY = CY + CLOCK_RADIUS * ringFraction * Math.sin(angleRad);

    const hue = pcToHue(event.rootPc, HUE_INV);
    const color = hsvToCSS(hue, 0.7, 0.9, opacity);

    const glyph = buildRomanNumeralGlyph(event.roman);
    const scale = event.borrowed ? BORROWED_SCALE : 1;
    svg += renderGlyphSVG(glyph, glyphCX, glyphCY, color, angleDeg, scale);
  }

  // Title
  svg += `  <text x="${SVG_SIZE / 2}" y="${SVG_SIZE - 10}" text-anchor="middle" fill="#444" font-size="12" font-family="monospace">${title}</text>\n`;

  // Key label
  const pcNames = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  svg += `  <text x="${SVG_SIZE / 2}" y="20" text-anchor="middle" fill="#333" font-size="11" font-family="monospace">Key: ${pcNames[key.root]} ${key.mode}</text>\n`;

  svg += `</svg>`;
  return svg;
}

function renderGlyphSVG(
  glyph: RomanNumeralGlyph,
  cx: number,
  cy: number,
  color: string,
  _angleDeg: number,
  scale: number,
): string {
  let svg = "";

  const effectiveScale = GLYPH_SCALE * scale;
  const strokeWidth = 2 / GLYPH_SCALE; // keep visual stroke width constant

  // Center the glyph on the position
  const offsetX = cx - (glyph.width * effectiveScale) / 2;
  const offsetY = cy + (glyph.height * effectiveScale) / 2; // flip Y

  // Glyph group — Y-flipped
  svg += `  <g transform="translate(${offsetX.toFixed(1)}, ${offsetY.toFixed(1)}) scale(${effectiveScale}, ${-effectiveScale})">\n`;

  for (const poly of glyph.polylines) {
    if (poly.length < 2) continue;
    const d = poly.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
    svg += `    <path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
  }

  for (const arc of glyph.arcs) {
    const start = arc.startAngle ?? 0;
    const end = arc.endAngle ?? Math.PI * 2;
    if (Math.abs(end - start - Math.PI * 2) < 0.01) {
      svg += `    <circle cx="${arc.cx}" cy="${arc.cy}" r="${arc.r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"/>\n`;
    }
  }

  svg += `  </g>\n`;
  return svg;
}

function maybeWriteSnapshot(name: string, svg: string): void {
  if (!GENERATE) return;
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(resolve(SNAPSHOT_DIR, `${name}.svg`), svg);
}

// ============================================================================
// Test Scenarios
// ============================================================================

describe("Progression Clock prototype", () => {
  const cMajor: PrescribedKey = { root: 0 as PitchClass, mode: "ionian" };

  it("I-IV-V-I cadence (classic)", () => {
    const events = [
      makeChordEvent(cMajor, 1, "I", "maj", 0),
      makeChordEvent(cMajor, 4, "IV", "maj", 1000),
      makeChordEvent(cMajor, 5, "V", "maj", 2000),
      makeChordEvent(cMajor, 1, "I", "maj", 3000),
    ];

    const svg = renderProgressionClock(events, 3000, cMajor, "I → IV → V → I (classic cadence)");
    maybeWriteSnapshot("cadence-I-IV-V-I", svg);

    // All 4 events should be within the fade window
    expect(events.filter((e) => 3000 - e.onset < FADE_MS)).toHaveLength(4);
  });

  it("ii-V-I cadence (jazz)", () => {
    const events = [
      makeChordEvent(cMajor, 2, "ii", "min", 0),
      makeChordEvent(cMajor, 5, "V7", "dom7", 1500),
      makeChordEvent(cMajor, 1, "I" + "Δ7", "maj7", 3000),
    ];

    const svg = renderProgressionClock(events, 3000, cMajor, "ii → V7 → IΔ7 (jazz cadence)");
    maybeWriteSnapshot("cadence-ii-V-I", svg);

    expect(events).toHaveLength(3);
  });

  it("I-vi-IV-V pop progression", () => {
    const events = [
      makeChordEvent(cMajor, 1, "I", "maj", 0),
      makeChordEvent(cMajor, 6, "vi", "min", 1000),
      makeChordEvent(cMajor, 4, "IV", "maj", 2000),
      makeChordEvent(cMajor, 5, "V", "maj", 3000),
    ];

    const svg = renderProgressionClock(events, 3000, cMajor, "I → vi → IV → V (pop)");
    maybeWriteSnapshot("pop-I-vi-IV-V", svg);

    expect(events).toHaveLength(4);
  });

  it("silence after chords (all fading)", () => {
    const events = [
      makeChordEvent(cMajor, 1, "I", "maj", 0),
      makeChordEvent(cMajor, 4, "IV", "maj", 1000),
      makeChordEvent(cMajor, 5, "V", "maj", 2000),
    ];

    // Current time is 1 second after the last chord — everything fading
    const svg = renderProgressionClock(events, 3500, cMajor, "silence — all fading (t=3500)");
    maybeWriteSnapshot("silence-after-chords", svg);

    // All should still be visible (within FADE_MS window)
    expect(events.filter((e) => 3500 - e.onset < FADE_MS)).toHaveLength(3);
  });

  it("silence deep — most chords gone", () => {
    const events = [
      makeChordEvent(cMajor, 1, "I", "maj", 0),
      makeChordEvent(cMajor, 4, "IV", "maj", 1000),
      makeChordEvent(cMajor, 5, "V", "maj", 2000),
    ];

    // Current time is well past fade window for early chords
    const svg = renderProgressionClock(events, 5500, cMajor, "deep silence — only V barely visible (t=5500)");
    maybeWriteSnapshot("silence-deep", svg);

    // Only V (onset=2000) is within fade window at t=5500 (age=3500 < 4000)
    expect(events.filter((e) => 5500 - e.onset < FADE_MS)).toHaveLength(1);
  });

  it("borrowed ♭III chord", () => {
    const events = [
      makeChordEvent(cMajor, 1, "I", "maj", 0),
      makeChordEvent(cMajor, 3, "♭III", "maj", 1500, true),
      makeChordEvent(cMajor, 4, "IV", "maj", 3000),
    ];

    const svg = renderProgressionClock(events, 3000, cMajor, "I → ♭III → IV (borrowed chord)");
    maybeWriteSnapshot("borrowed-bIII", svg);

    expect(events).toHaveLength(3);
  });

  it("single chord — just I", () => {
    const events = [
      makeChordEvent(cMajor, 1, "I", "maj", 0),
    ];

    const svg = renderProgressionClock(events, 0, cMajor, "single chord — I at full brightness");
    maybeWriteSnapshot("single-chord-I", svg);

    expect(events).toHaveLength(1);
  });

  it("minor key — i-iv-V-i in A minor", () => {
    const aMinor: PrescribedKey = { root: 9 as PitchClass, mode: "aeolian" };
    const events = [
      makeChordEvent(aMinor, 1, "i", "min", 0),
      makeChordEvent(aMinor, 4, "iv", "min", 1000),
      makeChordEvent(aMinor, 5, "V", "maj", 2000),  // harmonic minor borrowing
      makeChordEvent(aMinor, 1, "i", "min", 3000),
    ];

    const svg = renderProgressionClock(events, 3000, aMinor, "i → iv → V → i (A minor)");
    maybeWriteSnapshot("minor-i-iv-V-i", svg);

    expect(events).toHaveLength(4);
  });

  it("dense progression — many chords", () => {
    const events = [
      makeChordEvent(cMajor, 1, "I", "maj", 0),
      makeChordEvent(cMajor, 6, "vi", "min", 500),
      makeChordEvent(cMajor, 2, "ii", "min", 1000),
      makeChordEvent(cMajor, 5, "V7", "dom7", 1500),
      makeChordEvent(cMajor, 1, "I", "maj", 2000),
      makeChordEvent(cMajor, 4, "IV", "maj", 2500),
      makeChordEvent(cMajor, 5, "V", "maj", 3000),
      makeChordEvent(cMajor, 1, "I", "maj", 3500),
    ];

    const svg = renderProgressionClock(events, 3500, cMajor, "I→vi→ii→V7→I→IV→V→I (dense)");
    maybeWriteSnapshot("dense-progression", svg);

    expect(events).toHaveLength(8);
  });

  // ==========================================================================
  // Connection Strip Scenarios (SPEC 011)
  // ==========================================================================

  it("♭VII → IV unresolved (subdominant borrowing, target not yet played)", () => {
    // ♭VII played but IV not yet — both strips appear, no IV numeral
    const bVII = makeChordEvent(cMajor, 7, "♭VII", "maj", 0, true);
    const events = [bVII];

    const connections: FunctionalConnection[] = [{
      sourcePc: bVII.rootPc,
      sourceBorrowed: true,
      targetPc: 5 as PitchClass, // F = IV in C
      targetDiatonic: true,
      weight: 0.85,
      resolved: false,
      sourceOnset: 0,
    }];

    const svg = renderProgressionClock(events, 0, cMajor,
      "♭VII → IV unresolved (strips present, IV numeral absent)", connections);
    maybeWriteSnapshot("conn-bVII-IV-unresolved", svg);

    expect(connections).toHaveLength(1);
    expect(connections[0].resolved).toBe(false);
  });

  it("♭VII → IV resolved (both chords played)", () => {
    const bVII = makeChordEvent(cMajor, 7, "♭VII", "maj", 0, true);
    const IV = makeChordEvent(cMajor, 4, "IV", "maj", 1500);
    const events = [bVII, IV];

    const connections: FunctionalConnection[] = [{
      sourcePc: bVII.rootPc,
      sourceBorrowed: true,
      targetPc: IV.rootPc,
      targetDiatonic: true,
      weight: 0.85,
      resolved: true,
      sourceOnset: 0,
    }];

    const svg = renderProgressionClock(events, 1500, cMajor,
      "♭VII → IV resolved (both numerals + strips)", connections);
    maybeWriteSnapshot("conn-bVII-IV-resolved", svg);

    expect(connections[0].resolved).toBe(true);
  });

  it("V/V → V (secondary dominant, resolved)", () => {
    // D major (V/V) resolves to G (V) in C major
    // D = pc 2, not diatonic in C major
    const VofV = makeChordEvent(cMajor, 2, "V/V", "maj", 0, true);
    const V = makeChordEvent(cMajor, 5, "V", "maj", 1500);
    const events = [VofV, V];

    const connections: FunctionalConnection[] = [{
      sourcePc: VofV.rootPc,
      sourceBorrowed: true,
      targetPc: V.rootPc,
      targetDiatonic: true,
      weight: 0.92,
      resolved: true,
      sourceOnset: 0,
    }];

    const svg = renderProgressionClock(events, 1500, cMajor,
      "V/V → V resolved (secondary dominant)", connections);
    maybeWriteSnapshot("conn-VofV-V-resolved", svg);

    expect(connections[0].weight).toBeGreaterThan(0.9);
  });

  it("multiple connections — ♭VII → IV and V/V → V", () => {
    const bVII = makeChordEvent(cMajor, 7, "♭VII", "maj", 0, true);
    const VofV = makeChordEvent(cMajor, 2, "V/V", "maj", 500, true);
    const IV = makeChordEvent(cMajor, 4, "IV", "maj", 1500);
    const V = makeChordEvent(cMajor, 5, "V", "maj", 2000);
    const events = [bVII, VofV, IV, V];

    const connections: FunctionalConnection[] = [
      {
        sourcePc: bVII.rootPc,
        sourceBorrowed: true,
        targetPc: IV.rootPc,
        targetDiatonic: true,
        weight: 0.85,
        resolved: true,
        sourceOnset: 0,
      },
      {
        sourcePc: VofV.rootPc,
        sourceBorrowed: true,
        targetPc: V.rootPc,
        targetDiatonic: true,
        weight: 0.92,
        resolved: true,
        sourceOnset: 500,
      },
    ];

    const svg = renderProgressionClock(events, 2000, cMajor,
      "♭VII→IV + V/V→V (two resolved connections)", connections);
    maybeWriteSnapshot("conn-multiple-resolved", svg);

    expect(connections).toHaveLength(2);
  });

  it("weak connection — ♭VI → ii (moderate weight)", () => {
    const bVI = makeChordEvent(cMajor, 6, "♭VI", "maj", 0, true);
    const events = [bVI];

    const connections: FunctionalConnection[] = [{
      sourcePc: bVI.rootPc,
      sourceBorrowed: true,
      targetPc: 2 as PitchClass, // D = ii in C
      targetDiatonic: true,
      weight: 0.45,
      resolved: false,
      sourceOnset: 0,
    }];

    const svg = renderProgressionClock(events, 0, cMajor,
      "♭VI → ii unresolved (moderate weight, subtle strips)", connections);
    maybeWriteSnapshot("conn-bVI-ii-weak", svg);

    expect(connections[0].weight).toBeLessThan(0.5);
  });
});
