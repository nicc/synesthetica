/**
 * Tests for RomanNumeralGlyphBuilder
 *
 * Run with GENERATE_SNAPSHOTS=1 to generate SVG files for visual review:
 *   GENERATE_SNAPSHOTS=1 npm test -w packages/engine -- -t "RomanNumeralGlyph"
 *
 * Snapshots written to test/_snapshots/roman-numerals/
 */

import { describe, it, expect } from "vitest";
import { buildRomanNumeralGlyph } from "../../src/utils/RomanNumeralGlyphBuilder";
import type { RomanNumeralGlyph } from "@synesthetica/contracts";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// ============================================================================
// SVG Snapshot Helpers
// ============================================================================

const SNAPSHOT_DIR = resolve(__dirname, "../_snapshots/roman-numerals");
const GENERATE = process.env.GENERATE_SNAPSHOTS === "1";

function glyphToSVG(
  glyph: RomanNumeralGlyph,
  label: string,
  options: { scale?: number; color?: string } = {},
): string {
  const scale = options.scale ?? 80;
  const color = options.color ?? "#e0e0e0";
  const padding = 20;

  const w = Math.max(glyph.width * scale, 10) + padding * 2;
  const h = glyph.height * scale + padding * 2;

  let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <rect width="${w}" height="${h}" fill="#111"/>\n`;

  // Flip Y: SVG is Y-down, glyph coords are Y-up
  svg += `  <g transform="translate(${padding}, ${padding + glyph.height * scale}) scale(${scale}, ${-scale})">\n`;

  for (const seg of glyph.segments) {
    svg += `    <line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}" stroke="${color}" stroke-width="${2 / scale}" stroke-linecap="round"/>\n`;
  }

  for (const arc of glyph.arcs) {
    const start = arc.startAngle ?? 0;
    const end = arc.endAngle ?? Math.PI * 2;
    if (Math.abs(end - start - Math.PI * 2) < 0.01) {
      // Full circle
      svg += `    <circle cx="${arc.cx}" cy="${arc.cy}" r="${arc.r}" fill="none" stroke="${color}" stroke-width="${2 / scale}"/>\n`;
    } else {
      const x1 = arc.cx + arc.r * Math.cos(start);
      const y1 = arc.cy + arc.r * Math.sin(start);
      const x2 = arc.cx + arc.r * Math.cos(end);
      const y2 = arc.cy + arc.r * Math.sin(end);
      const large = end - start > Math.PI ? 1 : 0;
      svg += `    <path d="M${x1} ${y1} A${arc.r} ${arc.r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${2 / scale}"/>\n`;
    }
  }

  svg += `  </g>\n`;

  // Label (outside the flipped group)
  svg += `  <text x="${w / 2}" y="${h - 4}" text-anchor="middle" fill="#666" font-size="11" font-family="monospace">${label}</text>\n`;

  svg += `</svg>`;
  return svg;
}

function maybeWriteSnapshot(name: string, svg: string): void {
  if (!GENERATE) return;
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(resolve(SNAPSHOT_DIR, `${name}.svg`), svg);
}

/**
 * Render a grid of all standard Roman numerals to a single SVG.
 */
function renderGlyphGrid(
  entries: Array<{ roman: string; label: string }>,
): string {
  const scale = 60;
  const cellW = 120;
  const cellH = 100;
  const cols = 7;
  const rows = Math.ceil(entries.length / cols);
  const w = cols * cellW;
  const h = rows * cellH;

  let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <rect width="${w}" height="${h}" fill="#111"/>\n`;

  for (let i = 0; i < entries.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = col * cellW + cellW / 2;
    const baseY = row * cellH + cellH - 25;
    const { roman, label } = entries[i];
    const glyph = buildRomanNumeralGlyph(roman);

    // Center the glyph horizontally in the cell
    const glyphPixelW = glyph.width * scale;
    const gx = cx - glyphPixelW / 2;

    svg += `  <g transform="translate(${gx}, ${baseY}) scale(${scale}, ${-scale})">\n`;

    for (const seg of glyph.segments) {
      svg += `    <line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}" stroke="#e0e0e0" stroke-width="${2 / scale}" stroke-linecap="round"/>\n`;
    }
    for (const arc of glyph.arcs) {
      svg += `    <circle cx="${arc.cx}" cy="${arc.cy}" r="${arc.r}" fill="none" stroke="#e0e0e0" stroke-width="${2 / scale}"/>\n`;
    }

    svg += `  </g>\n`;

    // Label below
    svg += `  <text x="${cx}" y="${row * cellH + cellH - 5}" text-anchor="middle" fill="#888" font-size="10" font-family="monospace">${label}</text>\n`;
  }

  svg += `</svg>`;
  return svg;
}

// ============================================================================
// Tests
// ============================================================================

describe("RomanNumeralGlyphBuilder", () => {
  describe("base numerals", () => {
    const cases = ["I", "II", "III", "IV", "V", "VI", "VII"];

    for (const numeral of cases) {
      it(`produces geometry for ${numeral}`, () => {
        const glyph = buildRomanNumeralGlyph(numeral);
        expect(glyph.segments.length).toBeGreaterThan(0);
        expect(glyph.height).toBeCloseTo(1.0, 1); // Uppercase = full height
        expect(glyph.width).toBeGreaterThanOrEqual(0);
      });
    }

    it("lowercase numerals are shorter than uppercase", () => {
      const upper = buildRomanNumeralGlyph("V");
      const lower = buildRomanNumeralGlyph("v");
      expect(lower.height).toBeLessThan(upper.height);
    });

    it("III is wider than I", () => {
      const one = buildRomanNumeralGlyph("I");
      const three = buildRomanNumeralGlyph("III");
      expect(three.width).toBeGreaterThan(one.width);
    });
  });

  describe("quality suffixes", () => {
    it("° adds an arc (diminished)", () => {
      const glyph = buildRomanNumeralGlyph("vii°");
      expect(glyph.arcs.length).toBeGreaterThan(0);
    });

    it("°7 adds arc and extra segments (dim7)", () => {
      const glyph = buildRomanNumeralGlyph("vii°7");
      expect(glyph.arcs.length).toBeGreaterThan(0);
      // 7 has segments beyond the base numeral
      const base = buildRomanNumeralGlyph("vii");
      expect(glyph.segments.length).toBeGreaterThan(base.segments.length);
    });

    it("ø7 adds arc with stroke (half-dim)", () => {
      const glyph = buildRomanNumeralGlyph("vii" + "ø7");
      expect(glyph.arcs.length).toBeGreaterThan(0);
      // The ø stroke adds a segment beyond what ° would have
      const dim = buildRomanNumeralGlyph("vii°7");
      expect(glyph.segments.length).toBeGreaterThan(dim.segments.length);
    });

    it("+ adds segments (augmented)", () => {
      const base = buildRomanNumeralGlyph("III");
      const aug = buildRomanNumeralGlyph("III+");
      expect(aug.segments.length).toBeGreaterThan(base.segments.length);
    });

    it("7 adds segments (dominant)", () => {
      const base = buildRomanNumeralGlyph("V");
      const dom = buildRomanNumeralGlyph("V7");
      expect(dom.segments.length).toBeGreaterThan(base.segments.length);
    });

    it("Δ7 adds triangle segments (major 7th)", () => {
      const base = buildRomanNumeralGlyph("I");
      const maj7 = buildRomanNumeralGlyph("I" + "Δ7");
      expect(maj7.segments.length).toBeGreaterThan(base.segments.length);
    });

    it("suffix is positioned to the right of the base", () => {
      const glyph = buildRomanNumeralGlyph("V7");
      // The 7 suffix segments should have x values beyond the V chevron width
      const base = buildRomanNumeralGlyph("V");
      const suffixSegments = glyph.segments.slice(base.segments.length);
      for (const seg of suffixSegments) {
        expect(Math.max(seg.x1, seg.x2)).toBeGreaterThan(base.width * 0.5);
      }
    });
  });

  describe("accidentals", () => {
    it("♭ prefix adds segments before the numeral", () => {
      const plain = buildRomanNumeralGlyph("III");
      const flat = buildRomanNumeralGlyph("♭III");
      expect(flat.segments.length).toBeGreaterThan(plain.segments.length);
      expect(flat.width).toBeGreaterThan(plain.width);
    });

    it("♯ prefix adds segments before the numeral", () => {
      const plain = buildRomanNumeralGlyph("II");
      const sharp = buildRomanNumeralGlyph("♯II");
      expect(sharp.segments.length).toBeGreaterThan(plain.segments.length);
    });
  });

  describe("parsing edge cases", () => {
    it("handles lowercase with suffix", () => {
      const glyph = buildRomanNumeralGlyph("ii7");
      expect(glyph.segments.length).toBeGreaterThan(0);
      expect(glyph.height).toBeCloseTo(0.65, 1);
    });

    it("handles accidental + lowercase + suffix", () => {
      const glyph = buildRomanNumeralGlyph("♭vi°");
      expect(glyph.segments.length).toBeGreaterThan(0);
      expect(glyph.arcs.length).toBeGreaterThan(0);
    });
  });

  describe("SVG snapshots", () => {
    it("generates individual glyph snapshots", () => {
      const numerals = [
        "I", "ii", "iii", "IV", "V", "vi", "vii°",
        "V7", "I" + "Δ7", "vii°7", "viiø7", "III+",
        "♭III", "♭VI", "♯IV",
      ];

      for (const roman of numerals) {
        const glyph = buildRomanNumeralGlyph(roman);
        const svg = glyphToSVG(glyph, roman);
        maybeWriteSnapshot(roman.replace(/[♭♯°ø+Δ]/g, (c) => {
          const map: Record<string, string> = { "♭": "flat-", "♯": "sharp-", "°": "dim", "ø": "hdim", "+": "aug", "Δ": "maj" };
          return map[c] ?? c;
        }), svg);
      }
    });

    it("generates full glyph grid snapshot", () => {
      const entries = [
        // Major key diatonic
        { roman: "I", label: "I" },
        { roman: "ii", label: "ii" },
        { roman: "iii", label: "iii" },
        { roman: "IV", label: "IV" },
        { roman: "V", label: "V" },
        { roman: "vi", label: "vi" },
        { roman: "vii°", label: "vii°" },
        // Seventh chords
        { roman: "I" + "Δ7", label: "IΔ7" },
        { roman: "V7", label: "V7" },
        { roman: "vii°7", label: "vii°7" },
        { roman: "viiø7", label: "viiø7" },
        { roman: "III+", label: "III+" },
        { roman: "ii7", label: "ii7" },
        { roman: "iv7", label: "iv7" },
        // Borrowed / chromatic
        { roman: "♭III", label: "♭III" },
        { roman: "♭VI", label: "♭VI" },
        { roman: "♭VII", label: "♭VII" },
        { roman: "♯IV", label: "♯IV" },
      ];

      const svg = renderGlyphGrid(entries);
      maybeWriteSnapshot("_grid", svg);

      // Basic sanity: every entry produces geometry
      for (const { roman } of entries) {
        const glyph = buildRomanNumeralGlyph(roman);
        expect(glyph.segments.length + glyph.arcs.length).toBeGreaterThan(0);
      }
    });
  });
});
