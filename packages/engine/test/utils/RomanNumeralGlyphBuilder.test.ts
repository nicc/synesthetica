/**
 * Tests for RomanNumeralGlyphBuilder
 *
 * SVG snapshots live in RomanNumeralGlyphBuilder.snapshot.ts
 * (`npm run snapshots`).
 */

import { describe, it, expect } from "vitest";
import { buildRomanNumeralGlyph } from "../../src/utils/RomanNumeralGlyphBuilder";
import type { RomanNumeralGlyph } from "@synesthetica/contracts";

// ============================================================================
// Helpers
// ============================================================================

/** Total vertex count across all polylines — proxy for "glyph complexity". */
function totalPoints(glyph: RomanNumeralGlyph): number {
  return glyph.polylines.reduce((sum, p) => sum + p.length, 0);
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
        expect(glyph.polylines.length).toBeGreaterThan(0);
        expect(glyph.height).toBeCloseTo(1.0, 1); // Uppercase = full height
        expect(glyph.width).toBeGreaterThanOrEqual(0);
      });
    }

    it("lowercase numerals have dot strokes above vertical strokes", () => {
      const glyph = buildRomanNumeralGlyph("iii");
      // 3 vertical strokes → 3 extra tiny "dot" polylines above them.
      // Total polylines: 3 main strokes + 3 dots = 6.
      expect(glyph.polylines).toHaveLength(6);
      // Dot polylines sit above y=0.65 (lowercase height).
      const dotLike = glyph.polylines.filter(
        (p) => p.length === 2 && Math.min(p[0].y, p[1].y) > 0.65,
      );
      expect(dotLike).toHaveLength(3);
    });

    it("uppercase numerals have no dots", () => {
      const glyph = buildRomanNumeralGlyph("III");
      // III: three vertical polylines, no extras.
      expect(glyph.polylines).toHaveLength(3);
      expect(glyph.arcs).toHaveLength(0);
    });

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
      const base = buildRomanNumeralGlyph("vii");
      expect(totalPoints(glyph)).toBeGreaterThan(totalPoints(base));
    });

    it("ø7 adds arc with stroke (half-dim)", () => {
      const glyph = buildRomanNumeralGlyph("vii" + "ø7");
      expect(glyph.arcs.length).toBeGreaterThan(0);
      const dim = buildRomanNumeralGlyph("vii°7");
      expect(totalPoints(glyph)).toBeGreaterThan(totalPoints(dim));
    });

    it("+ adds segments (augmented)", () => {
      const base = buildRomanNumeralGlyph("III");
      const aug = buildRomanNumeralGlyph("III+");
      expect(totalPoints(aug)).toBeGreaterThan(totalPoints(base));
    });

    it("7 adds segments (dominant)", () => {
      const base = buildRomanNumeralGlyph("V");
      const dom = buildRomanNumeralGlyph("V7");
      expect(totalPoints(dom)).toBeGreaterThan(totalPoints(base));
    });

    it("Δ7 adds triangle segments (major 7th)", () => {
      const base = buildRomanNumeralGlyph("I");
      const maj7 = buildRomanNumeralGlyph("I" + "Δ7");
      expect(totalPoints(maj7)).toBeGreaterThan(totalPoints(base));
    });

    it("suffix is positioned to the right of the base", () => {
      const glyph = buildRomanNumeralGlyph("V7");
      const base = buildRomanNumeralGlyph("V");
      // At least one polyline has all its points beyond the V chevron's center.
      const suffixPolys = glyph.polylines.filter(
        (p) => p.every((pt) => pt.x > base.width * 0.5),
      );
      expect(suffixPolys.length).toBeGreaterThan(0);
    });
  });

  describe("accidentals", () => {
    it("♭ prefix adds segments before the numeral", () => {
      const plain = buildRomanNumeralGlyph("III");
      const flat = buildRomanNumeralGlyph("♭III");
      expect(totalPoints(flat)).toBeGreaterThan(totalPoints(plain));
      expect(flat.width).toBeGreaterThan(plain.width);
    });

    it("♯ prefix adds segments before the numeral", () => {
      const plain = buildRomanNumeralGlyph("II");
      const sharp = buildRomanNumeralGlyph("♯II");
      expect(totalPoints(sharp)).toBeGreaterThan(totalPoints(plain));
    });
  });

  describe("parsing edge cases", () => {
    it("handles lowercase with suffix", () => {
      const glyph = buildRomanNumeralGlyph("ii7");
      expect(glyph.polylines.length).toBeGreaterThan(0);
      // Height exceeds stroke height (0.65) due to dots above strokes
      expect(glyph.height).toBeGreaterThan(0.65);
    });

    it("handles accidental + lowercase + suffix", () => {
      const glyph = buildRomanNumeralGlyph("♭vi°");
      expect(glyph.polylines.length).toBeGreaterThan(0);
      expect(glyph.arcs.length).toBeGreaterThan(0);
    });

  });

  it("produces geometry for every standard numeral, suffix and accidental", () => {
    const romans = [
      "I", "ii", "iii", "IV", "V", "vi", "vii°", "IΔ7", "V7", "vii°7", "viiø7",
      "III+", "ii7", "iv7", "♭III", "♭VI", "♭VII", "♯IV",
    ];
    for (const roman of romans) {
      const glyph = buildRomanNumeralGlyph(roman);
      expect(glyph.polylines.length + glyph.arcs.length, roman).toBeGreaterThan(0);
    }
  });
});
