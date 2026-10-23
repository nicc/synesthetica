/**
 * RhythmLens overtone-strip SVG snapshots (RFC 012): review artefacts,
 * not tests.
 *
 *   npm run snapshots -w packages/engine
 *
 * Writes to test/_snapshots/overtones/ (gitignored).
 */

import { describe, it, expect } from "vitest";
import { maybeWriteSnapshot } from "../_harness/svg-snapshot";
import {
  renderOvertoneScene as render,
  held,
  overtoneStrips,
  type OvertoneNoteSpec,
} from "../_harness/rhythmFixtures";

describe("RhythmLens overtone snapshots", () => {
  const level = 0.5;
  const scenarios: Array<[string, OvertoneNoteSpec[]]> = [
    ["c-then-g-detached", [
      { id: "c", pc: 0, onset: 1500, release: 2300 },
      { id: "g", pc: 7, onset: 2800 },
    ]],
    ["c-then-g-legato", [
      { id: "c", pc: 0, onset: 1500, release: 3500 },
      { id: "g", pc: 7, onset: 2800 },
    ]],
    ["c-major", held([0, 4, 7])],
    ["g7", held([7, 11, 2, 5])],
    ["minor-third-dyad", held([0, 3])],
    ["major-third-dyad", held([0, 4])],
  ];

  for (const [name, specs] of scenarios) {
    for (const colour of ["pitch", "fundamental"] as const) {
      it(`${name} (${colour} hue)`, () => {
        const scene = render(specs, { level, colour });
        maybeWriteSnapshot(`${name}-${colour}`, scene, {}, "overtones");
        expect(overtoneStrips(scene).length).toBeGreaterThan(0);
      });
    }
  }

  it("c-major at levels 0.25 and 1.0", () => {
    for (const l of [0.25, 1.0]) {
      const scene = render(held([0, 4, 7]), { level: l });
      maybeWriteSnapshot(`c-major-level-${l}`, scene, {}, "overtones");
      expect(overtoneStrips(scene).length).toBeGreaterThan(0);
    }
  });
});
