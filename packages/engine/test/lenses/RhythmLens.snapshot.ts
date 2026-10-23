/**
 * RhythmLens SVG snapshots: review artefacts, not tests.
 *
 *   npm run snapshots -w packages/engine
 *
 * Writes to test/_snapshots/rhythm/ (gitignored). Each SVG carries the
 * scene's metrics in a header comment. Behaviour these scenes show is
 * asserted in RhythmLens.test.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RhythmLens } from "../../src/lenses/RhythmLens";
import { maybeWriteSnapshot } from "../_harness/svg-snapshot";
import {
  createRhythmFrame as createTestFrame,
  lensCtx as ctx,
  type RhythmNoteSpec,
} from "../_harness/rhythmFixtures";
import type { PitchClass } from "@synesthetica/contracts";

describe("RhythmLens snapshots", () => {
  let lens: RhythmLens;

  beforeEach(() => {
    lens = new RhythmLens();
    lens.init(ctx);
    // These scenes describe drift against the quarter-note grid, so
    // onset offsets of ~100ms read as clearly off-beat.
    lens.setMacros({ quantiseResolution: "quarter" });
  });

  const snap = (name: string, frame: ReturnType<typeof createTestFrame>) => {
    const svg = maybeWriteSnapshot(name, lens.update(frame, null));
    expect(svg).toContain("<svg");
  };

  it("basic beat grid (Tier 2)", () => {
    snap("rhythm-basic-grid", createTestFrame(2000, { tempo: 120 }));
  });

  it("notes across pitch classes", () => {
    snap("rhythm-pitch-spread", createTestFrame(1000, {
      tempo: 120,
      notes: [
        { id: "c", pc: 0, onset: 1000, velocity: 100 },
        { id: "e", pc: 4, onset: 900, velocity: 80 },
        { id: "g", pc: 7, onset: 800, velocity: 60 },
        { id: "b", pc: 11, onset: 700, velocity: 90 },
      ],
    }));
  });

  it("notes with drift streaks", () => {
    snap("rhythm-drift-streaks", createTestFrame(2000, {
      tempo: 120,
      notes: [
        { id: "early", pc: 2, onset: 1400 }, // 100ms early
        { id: "tight", pc: 5, onset: 1505 }, // 5ms late (tight)
        { id: "late", pc: 9, onset: 1600 }, // 100ms late
      ],
    }));
  });

  it("bar lines (Tier 3)", () => {
    snap("rhythm-tier3-bars", createTestFrame(4000, {
      tempo: 120,
      meter: { beatsPerBar: 4, beatUnit: 4 },
      notes: [
        { id: "n1", pc: 0, onset: 2000 },
        { id: "n2", pc: 4, onset: 2500 },
        { id: "n3", pc: 7, onset: 3000 },
        { id: "n4", pc: 11, onset: 3500 },
      ],
    }));
  });

  it("minimum horizon", () => {
    lens.setMacros({ horizon: 0.0 });
    snap("rhythm-min-horizon", createTestFrame(4000, {
      tempo: 120,
      notes: [
        { id: "old", pc: 0, onset: 1000 },
        { id: "recent", pc: 7, onset: 3700 },
      ],
    }));
  });

  it("dense note sequence", () => {
    // Fast playing: 16th notes at 120 BPM, cycling through fifths
    const notes: RhythmNoteSpec[] = [];
    for (let i = 0; i < 16; i++) {
      notes.push({
        id: `n${i}`,
        pc: ((i * 7) % 12) as PitchClass,
        onset: 1000 + i * 125,
        velocity: 60 + (i % 4) * 20,
      });
    }
    snap("rhythm-dense-notes", createTestFrame(3000, { tempo: 120, notes }));
  });

  it("sustained notes as bars", () => {
    snap("rhythm-sustained-notes", createTestFrame(3000, {
      tempo: 120,
      notes: [
        { id: "short", pc: 0, onset: 2000, duration: 100, velocity: 80 },
        { id: "quarter", pc: 3, onset: 2000, duration: 500, velocity: 90 },
        { id: "half", pc: 7, onset: 1500, duration: 1000, velocity: 100 },
        { id: "held", pc: 10, onset: 1000, duration: 2000, velocity: 70 },
      ],
    }));
  });

  it("early and late notes with streak direction", () => {
    // Beats at 1500 and 2000: early streaks point up, late point down
    snap("rhythm-streak-direction", createTestFrame(2500, {
      tempo: 120,
      notes: [
        { id: "early", pc: 2, onset: 1400, duration: 200 },
        { id: "late", pc: 9, onset: 1600, duration: 200 },
        { id: "onbeat", pc: 5, onset: 2000, duration: 300 },
      ],
    }));
  });

  it("reference window at middle horizon", () => {
    lens.setMacros({ horizon: 0.5 });
    snap("rhythm-reference-window", createTestFrame(5000, {
      tempo: 120,
      notes: [
        { id: "old-early", pc: 2, onset: 1200, duration: 300 },
        { id: "old-late", pc: 9, onset: 1800, duration: 300 },
        { id: "recent", pc: 5, onset: 4500, duration: 300 },
      ],
    }));
  });

  it("middle horizon (0.5)", () => {
    lens.setMacros({ horizon: 0.5 });
    snap("rhythm-mid-horizon", createTestFrame(4000, {
      tempo: 120,
      meter: { beatsPerBar: 4, beatUnit: 4 },
      notes: [
        { id: "n1", pc: 0, onset: 1000, duration: 500 },
        { id: "n2", pc: 4, onset: 2000, duration: 500 },
        { id: "n3", pc: 7, onset: 3000, duration: 500 },
        { id: "n4", pc: 11, onset: 3800, duration: 200 },
      ],
    }));
  });

  it("notes scrolling off the top", () => {
    snap("rhythm-linger-effect", createTestFrame(10000, {
      tempo: 120,
      notes: [
        { id: "faded-early", pc: 0, onset: 1500, duration: 200, phase: "release" },
        { id: "faded-late", pc: 3, onset: 1700, duration: 200, phase: "release" },
        { id: "faded-tight", pc: 6, onset: 1900, duration: 200, phase: "release" },
        { id: "visible-early", pc: 9, onset: 8580, duration: 200 },
        { id: "visible-late", pc: 11, onset: 9420, duration: 200 },
      ],
    }));
  });
});
