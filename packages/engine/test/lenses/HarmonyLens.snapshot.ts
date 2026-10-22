/**
 * HarmonyLens chord-shape SVG snapshots: review artefacts, not tests.
 *
 *   npm run snapshots -w packages/engine
 *
 * Writes to test/_snapshots/harmony/ (gitignored). Rendering lives in
 * test/_harness/harmonySvg.ts; the production lens emits entities only.
 */

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { ChordQuality, PitchClass } from "@synesthetica/contracts";
import { renderHarmonySVG } from "../_harness/harmonySvg";
import { shouldGenerateSnapshots } from "../_harness/svg-snapshot";
import { createTestChord, createChordFrame } from "../_harness/harmonyFixtures";

const SNAPSHOTS_DIR = resolve(__dirname, "../_snapshots/harmony");

function maybeWrite(name: string, svg: string): void {
  if (!shouldGenerateSnapshots()) return;
  mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  writeFileSync(resolve(SNAPSHOTS_DIR, `${name}.svg`), svg, "utf-8");
}

describe("HarmonyLens chord-shape snapshots", () => {
  const chords: Array<[string, PitchClass, ChordQuality, number[], number]> = [
    ["major-triad", 0, "maj", [0, 4, 7], 0.1],
    ["minor-triad", 0, "min", [0, 3, 7], 0.15],
    ["dominant-7th", 7, "dom7", [0, 4, 7, 10], 0.45],
    ["diminished-7th", 0, "dim7", [0, 3, 6, 9], 0.75],
    ["augmented-triad", 0, "aug", [0, 4, 8], 0.35],
    ["sus4-chord", 0, "sus4", [0, 5, 7], 0.25],
    ["sus2-chord", 0, "sus2", [0, 2, 7], 0.2],
    ["major-9th", 0, "maj7", [0, 4, 7, 11, 2], 0.3],
  ];

  for (const [name, root, quality, intervals, tension] of chords) {
    it(name, () => {
      const frame = createChordFrame(1000, createTestChord(root, quality, intervals), tension);
      const svg = renderHarmonySVG(frame);
      maybeWrite(name, svg);
      expect(svg).toContain("<path");
    });
  }

  it("no-chord", () => {
    const svg = renderHarmonySVG(createChordFrame(1000, null, 0));
    maybeWrite("no-chord", svg);
    expect(svg).toContain("<svg");
  });
});
