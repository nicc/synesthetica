/**
 * RomanNumeralGlyphBuilder SVG snapshots: review artefacts, not tests.
 *
 *   npm run snapshots -w packages/engine
 *
 * Writes to test/_snapshots/roman-numerals/ (gitignored).
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

  for (const poly of glyph.polylines) {
    if (poly.length < 2) continue;
    const d = poly.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
    svg += `    <path d="${d}" fill="none" stroke="${color}" stroke-width="${2 / scale}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
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

    for (const poly of glyph.polylines) {
      if (poly.length < 2) continue;
      const d = poly.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
      svg += `    <path d="${d}" fill="none" stroke="#e0e0e0" stroke-width="${2 / scale}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
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

describe("RomanNumeralGlyphBuilder snapshots", () => {
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
      expect(svg).toContain("<svg");
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

    expect(svg).toContain("<svg");
  });
});
