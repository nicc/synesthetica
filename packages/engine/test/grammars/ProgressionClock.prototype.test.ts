/**
 * Progression Clock Prototype
 *
 * SVG snapshots of the progression clock concept: Roman numeral glyphs
 * positioned radially (pitch-class angles), coloured by root hue (I14),
 * fading with age (Principle 9).
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
} from "@synesthetica/contracts";
import { pcToHue, INTERVAL_ANGLES } from "@synesthetica/contracts";
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

/** Default pitch-hue invariant (A = red, clockwise) */
const HUE_INV = { referencePc: 9 as PitchClass, referenceHue: 0, direction: "cw" as const };

// ============================================================================
// Scale Intervals (duplicated from HarmonyStabilizer for test isolation)
// ============================================================================

const SCALE_INTERVALS: Record<string, number[]> = {
  "ionian": [0, 2, 4, 5, 7, 9, 11],
  "dorian": [0, 2, 3, 5, 7, 9, 10],
  "phrygian": [0, 1, 3, 5, 7, 8, 10],
  "lydian": [0, 2, 4, 6, 7, 9, 11],
  "mixolydian": [0, 2, 4, 5, 7, 9, 10],
  "aeolian": [0, 2, 3, 5, 7, 8, 10],
  "locrian": [0, 1, 3, 5, 6, 8, 10],
  "harmonic-minor": [0, 2, 3, 5, 7, 8, 11],
  "melodic-minor": [0, 2, 3, 5, 7, 9, 11],
};

// ============================================================================
// Test Helpers
// ============================================================================

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
  const intervals = SCALE_INTERVALS[key.mode];
  const rootPc = borrowed
    ? inferBorrowedPc(key, roman)
    : ((key.root + intervals[degree - 1]) % 12) as PitchClass;

  return { roman, degree, quality, borrowed, onset, rootPc };
}

/** Infer root PC for borrowed chords from the accidental in the roman string */
function inferBorrowedPc(key: PrescribedKey, roman: string): PitchClass {
  const intervals = SCALE_INTERVALS[key.mode];
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
): string {
  let svg = `<svg width="${SVG_SIZE}" height="${SVG_SIZE}" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <rect width="${SVG_SIZE}" height="${SVG_SIZE}" fill="#0a0a0f"/>\n`;

  // Clock face — subtle ring
  svg += `  <circle cx="${CX}" cy="${CY}" r="${CLOCK_RADIUS}" fill="none" stroke="#222" stroke-width="1"/>\n`;

  // Tick marks at each pitch-class position (subtle)
  for (let pc = 0; pc < 12; pc++) {
    const angleDeg = INTERVAL_ANGLES[pc];
    const angleRad = ((angleDeg - 90) * Math.PI) / 180; // -90 to put 0° at top
    const innerR = CLOCK_RADIUS - 5;
    const outerR = CLOCK_RADIUS + 5;
    const x1 = CX + innerR * Math.cos(angleRad);
    const y1 = CY + innerR * Math.sin(angleRad);
    const x2 = CX + outerR * Math.cos(angleRad);
    const y2 = CY + outerR * Math.sin(angleRad);
    svg += `  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1a1a1a" stroke-width="1"/>\n`;
  }

  // Render each chord event as a positioned, coloured, fading glyph
  for (const event of events) {
    const age = currentTime - event.onset;
    if (age < 0 || age >= FADE_MS) continue;

    const fadeFraction = 1 - age / FADE_MS;
    const opacity = fadeFraction;

    // Angular position from root pitch class interval relative to tonic
    const interval = ((event.rootPc - key.root) + 12) % 12;
    const angleDeg = INTERVAL_ANGLES[interval];
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;

    // Position on the clock
    const glyphCX = CX + CLOCK_RADIUS * 0.75 * Math.cos(angleRad);
    const glyphCY = CY + CLOCK_RADIUS * 0.75 * Math.sin(angleRad);

    // Colour from root pitch class
    const hue = pcToHue(event.rootPc, HUE_INV);
    const color = hsvToCSS(hue, 0.7, 0.9, opacity);

    // Build glyph geometry
    const glyph = buildRomanNumeralGlyph(event.roman);

    // Render glyph centered at position
    svg += renderGlyphSVG(glyph, glyphCX, glyphCY, color, angleDeg);
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
): string {
  let svg = "";

  // Center the glyph on the position
  const offsetX = cx - (glyph.width * GLYPH_SCALE) / 2;
  const offsetY = cy + (glyph.height * GLYPH_SCALE) / 2; // flip Y

  // Glyph group — Y-flipped
  svg += `  <g transform="translate(${offsetX.toFixed(1)}, ${offsetY.toFixed(1)}) scale(${GLYPH_SCALE}, ${-GLYPH_SCALE})">\n`;

  for (const seg of glyph.segments) {
    svg += `    <line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}" stroke="${color}" stroke-width="${2 / GLYPH_SCALE}" stroke-linecap="round"/>\n`;
  }

  for (const arc of glyph.arcs) {
    const start = arc.startAngle ?? 0;
    const end = arc.endAngle ?? Math.PI * 2;
    if (Math.abs(end - start - Math.PI * 2) < 0.01) {
      svg += `    <circle cx="${arc.cx}" cy="${arc.cy}" r="${arc.r}" fill="none" stroke="${color}" stroke-width="${2 / GLYPH_SCALE}"/>\n`;
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
});
