/**
 * SVG rendering of a frame's chord shape, for HarmonyLens snapshots.
 *
 * Draws the active chord (or the first chord, if none is active) with
 * ChordShapeBuilder: flat fill in the root colour, chromatic
 * lines behind it, dashed margin for sus chords. Review artefact only;
 * the production lens emits entities, not SVG.
 */

import type {
  AnnotatedMusicalFrame,
  ChordShapeElement,
  MarginStyle,
} from "@synesthetica/contracts";
import {
  ChordShapeBuilder,
  colorToCSS,
  getDashArray,
} from "../../src/utils/ChordShapeBuilder";

export interface HarmonySVGOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  strokeWidth?: number;
}

const DEFAULTS: Required<HarmonySVGOptions> = {
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  strokeWidth: 2,
};

export function renderHarmonySVG(
  frame: AnnotatedMusicalFrame,
  options: HarmonySVGOptions = {},
): string {
  const { width, height, backgroundColor, strokeWidth } = { ...DEFAULTS, ...options };

  const activeChord = frame.chords.find((c) => c.chord.phase === "active");
  const chord = activeChord ?? frame.chords[0];

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <rect width="${width}" height="${height}" fill="${backgroundColor}"/>\n`;

  if (chord) {
    svg += renderChordShapeSVG(chord.shape.elements, chord.shape.margin, width, height, strokeWidth);
  }

  svg += "</svg>";
  return svg;
}

function renderChordShapeSVG(
  elements: ChordShapeElement[],
  margin: MarginStyle,
  width: number,
  height: number,
  strokeWidth: number,
): string {
  // Chord shape is 25% of width, centered
  const scale = (width * 0.25) / 2;
  const builder = new ChordShapeBuilder(elements, margin, {
    scale,
    center: { x: width / 2, y: height / 2 },
    strokeWidth,
  });

  const fillPath = builder.toSVGPath();
  if (!fillPath) return "";

  const arms = builder.getArms();
  const rootArm = arms.find((a) => a.interval === "1") ?? arms[0];
  const fillColor = rootArm ? colorToCSS(rootArm.color) : "#888";

  let svg = "";

  // Chromatic lines first (behind shape)
  for (const line of builder.toSVGLines()) {
    svg += `  <path d="${line.path}" fill="none" stroke="${colorToCSS(line.color)}" stroke-width="${strokeWidth}" stroke-linecap="round"/>\n`;
  }

  const dashArray = getDashArray(margin);
  const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
  svg += `  <path d="${fillPath}" fill="${fillColor}" fill-opacity="0.8" stroke="${fillColor}" stroke-width="${strokeWidth}" stroke-linejoin="round"${dashAttr}/>\n`;

  return svg;
}
