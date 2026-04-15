/**
 * Tests for HarmonyStabilizer
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  HarmonyStabilizer,
  defaultDissonanceAlgorithm,
} from "../../src/stabilizers/HarmonyStabilizer";
import type {
  MusicalChord,
  ChordQuality,
  PitchClass,
  PrescribedKey,
} from "@synesthetica/contracts";
import { createTestRawFrame, createTestMusicalFrame } from "../_harness/frames";

// ============================================================================
// Test Helpers
// ============================================================================

function createChord(
  root: PitchClass,
  quality: ChordQuality,
  voicing: Array<{ pc: PitchClass; octave: number }>,
  onset = 0,
): MusicalChord {
  const interp = {
    root,
    quality,
    chordTones: [],
    name: "",
    confidence: 1.0 as const,
  };
  return {
    id: `test:${onset}:${root}${quality}`,
    bass: voicing[0].pc,
    inversion: 0,
    isInverted: voicing[0].pc !== root,
    voicing: voicing.map((p) => ({ pc: p.pc, octave: p.octave })),
    noteIds: [],
    harmonic: interp,
    bassLed: interp,
    onset,
    duration: 1000,
    phase: "active",
    provenance: { source: "test", stream: "test", version: "1.0" },
  };
}

function createUpstreamFrame(
  t: number,
  chords: MusicalChord[],
  key: PrescribedKey | null = null,
) {
  return createTestMusicalFrame(t, "main", { chords, prescribedKey: key, progression: [] });
}

// ============================================================================
// Tests
// ============================================================================

describe("HarmonyStabilizer", () => {
  let stabilizer: HarmonyStabilizer;

  beforeEach(() => {
    stabilizer = new HarmonyStabilizer({ partId: "main" });
    stabilizer.init();
  });

  describe("basic functionality", () => {
    it("has correct id and dependencies", () => {
      expect(stabilizer.id).toBe("harmony");
      expect(stabilizer.dependencies).toEqual(["chord-detection"]);
    });

    it("returns empty frame with no upstream", () => {
      const raw = createTestRawFrame(1000);
      const result = stabilizer.apply(raw, null);

      expect(result.t).toBe(1000);
      expect(result.chords).toEqual([]);
      expect(result.harmonicContext).toBeUndefined();
    });

    it("returns zero tension with no chords", () => {
      const raw = createTestRawFrame(1000);
      const upstream = createUpstreamFrame(1000, []);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.tension).toBe(0);
      expect(result.harmonicContext?.keyAware).toBe(false);
    });
  });

  describe("tension (key-agnostic)", () => {
    it("computes low tension for major triad", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord]);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.tension).toBeLessThan(0.3);
    });

    it("computes moderate tension for dominant 7th", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(7, "dom7", [
        { pc: 7, octave: 3 },
        { pc: 11, octave: 3 },
        { pc: 2, octave: 4 },
        { pc: 5, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord]);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.tension).toBeGreaterThan(0.2);
      expect(result.harmonicContext?.tension).toBeLessThan(0.85);
    });

    it("computes high tension for diminished 7th", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(0, "dim7", [
        { pc: 0, octave: 4 },
        { pc: 3, octave: 4 },
        { pc: 6, octave: 4 },
        { pc: 9, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord]);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.tension).toBeGreaterThan(0.5);
    });

    it("uses active chord over decaying", () => {
      const raw = createTestRawFrame(1000);
      const activeChord = createChord(0, "dim7", [
        { pc: 0, octave: 4 },
        { pc: 3, octave: 4 },
        { pc: 6, octave: 4 },
        { pc: 9, octave: 4 },
      ]);
      const decayingChord = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ]);
      decayingChord.phase = "decaying";

      const upstream = createUpstreamFrame(1000, [decayingChord, activeChord]);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.tension).toBeGreaterThan(0.4);
    });
  });

  describe("functional analysis (key-aware)", () => {
    const cMajor: PrescribedKey = { root: 0, mode: "ionian" };

    it("is not key-aware when no key is prescribed", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], null);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.keyAware).toBe(false);
      expect(result.harmonicContext?.currentFunction).toBeNull();
      expect(result.harmonicContext?.functionalProgression).toEqual([]);
    });

    it("identifies I in C major", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.keyAware).toBe(true);
      expect(result.harmonicContext?.currentFunction?.degree).toBe(1);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("I");
      expect(result.harmonicContext?.currentFunction?.rootPc).toBe(0); // C
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
    });

    it("identifies ii in C major (Dm)", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(2 as PitchClass, "min", [
        { pc: 2 as PitchClass, octave: 4 },
        { pc: 5 as PitchClass, octave: 4 },
        { pc: 9 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(2);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("ii");
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
    });

    it("identifies V in C major (G)", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(7 as PitchClass, "maj", [
        { pc: 7 as PitchClass, octave: 3 },
        { pc: 11 as PitchClass, octave: 3 },
        { pc: 2 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(5);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("V");
      expect(result.harmonicContext?.currentFunction?.rootPc).toBe(7); // G
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
    });

    it("identifies V7 in C major (G7)", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(7 as PitchClass, "dom7", [
        { pc: 7 as PitchClass, octave: 3 },
        { pc: 11 as PitchClass, octave: 3 },
        { pc: 2 as PitchClass, octave: 4 },
        { pc: 5 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(5);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("V7");
    });

    it("identifies vii° in C major (Bdim)", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(11 as PitchClass, "dim", [
        { pc: 11 as PitchClass, octave: 3 },
        { pc: 2 as PitchClass, octave: 4 },
        { pc: 5 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(7);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("vii°");
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
    });

    it("marks non-diatonic chord as borrowed", () => {
      const raw = createTestRawFrame(1000);
      // Eb major in C major → ♭III (borrowed from parallel minor)
      const chord = createChord(3 as PitchClass, "maj", [
        { pc: 3 as PitchClass, octave: 4 },
        { pc: 7 as PitchClass, octave: 4 },
        { pc: 10 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(true);
      expect(result.harmonicContext?.currentFunction?.roman).toContain("♭");
    });
  });

  describe("modes", () => {
    it("identifies i in D dorian (Dm)", () => {
      const raw = createTestRawFrame(1000);
      const dDorian: PrescribedKey = { root: 2 as PitchClass, mode: "dorian" };
      const chord = createChord(2 as PitchClass, "min", [
        { pc: 2 as PitchClass, octave: 4 },
        { pc: 5 as PitchClass, octave: 4 },
        { pc: 9 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], dDorian);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(1);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("i");
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
    });

    it("identifies IV in D dorian (G major — diatonic)", () => {
      const raw = createTestRawFrame(1000);
      const dDorian: PrescribedKey = { root: 2 as PitchClass, mode: "dorian" };
      // G major: G-B-D (pc 7, 11, 2)
      const chord = createChord(7 as PitchClass, "maj", [
        { pc: 7 as PitchClass, octave: 3 },
        { pc: 11 as PitchClass, octave: 3 },
        { pc: 2 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], dDorian);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(4);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("IV");
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
    });

    it("identifies V in A harmonic minor (E major)", () => {
      const raw = createTestRawFrame(1000);
      const aHarmonicMinor: PrescribedKey = {
        root: 9 as PitchClass,
        mode: "harmonic-minor",
      };
      // E major: E-G#-B (pc 4, 8, 11)
      const chord = createChord(4 as PitchClass, "maj", [
        { pc: 4 as PitchClass, octave: 4 },
        { pc: 8 as PitchClass, octave: 4 },
        { pc: 11 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], aHarmonicMinor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(5);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("V");
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
    });
  });

  describe("progression tracking", () => {
    it("builds progression from successive chords", () => {
      const cMajor: PrescribedKey = { root: 0, mode: "ionian" };

      // I
      const chord1 = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ], 1000);
      let upstream = createUpstreamFrame(1000, [chord1], cMajor);
      let result = stabilizer.apply(createTestRawFrame(1000), upstream);
      expect(result.harmonicContext?.functionalProgression).toHaveLength(1);

      // IV
      const chord2 = createChord(5 as PitchClass, "maj", [
        { pc: 5 as PitchClass, octave: 4 },
        { pc: 9 as PitchClass, octave: 4 },
        { pc: 0, octave: 5 },
      ], 2000);
      upstream = createUpstreamFrame(2000, [chord2], cMajor);
      result = stabilizer.apply(createTestRawFrame(2000), upstream);
      expect(result.harmonicContext?.functionalProgression).toHaveLength(2);
      expect(result.harmonicContext?.functionalProgression[0].roman).toBe("I");
      expect(result.harmonicContext?.functionalProgression[1].roman).toBe("IV");
    });

    it("does not duplicate same chord in progression", () => {
      const cMajor: PrescribedKey = { root: 0, mode: "ionian" };
      const chord = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ], 1000);

      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      stabilizer.apply(createTestRawFrame(1000), upstream);
      const result = stabilizer.apply(createTestRawFrame(1500), upstream);

      expect(result.harmonicContext?.functionalProgression).toHaveLength(1);
    });

    it("prunes entries whose release time is past the window", () => {
      const shortWindow = new HarmonyStabilizer({
        partId: "main",
        progressionWindowMs: 5000,
      });
      shortWindow.init();

      const cMajor: PrescribedKey = { root: 0, mode: "ionian" };

      // C at t=1000
      const chord1 = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ], 1000);
      shortWindow.apply(
        createTestRawFrame(1000),
        createUpstreamFrame(1000, [chord1], cMajor),
      );

      // G at t=2000 — releases C at t=2000
      const chord2 = createChord(7 as PitchClass, "maj", [
        { pc: 7 as PitchClass, octave: 3 },
        { pc: 11 as PitchClass, octave: 3 },
        { pc: 2 as PitchClass, octave: 4 },
      ], 2000);
      shortWindow.apply(
        createTestRawFrame(2000),
        createUpstreamFrame(2000, [chord2], cMajor),
      );

      // F at t=8000 — releases G at t=8000
      // C's releaseTime (2000) is now 6s old, past the 5s window → pruned
      const chord3 = createChord(5 as PitchClass, "maj", [
        { pc: 5 as PitchClass, octave: 3 },
        { pc: 9 as PitchClass, octave: 3 },
        { pc: 0 as PitchClass, octave: 4 },
      ], 8000);
      const result = shortWindow.apply(
        createTestRawFrame(8000),
        createUpstreamFrame(8000, [chord3], cMajor),
      );

      // C pruned (released long ago). G and F remain.
      expect(result.harmonicContext?.functionalProgression).toHaveLength(2);
      expect(result.harmonicContext?.functionalProgression[0].roman).toBe("V");
      expect(result.harmonicContext?.functionalProgression[1].roman).toBe("IV");
    });

    it("clears progression on reset", () => {
      const cMajor: PrescribedKey = { root: 0, mode: "ionian" };
      const chord = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ], 1000);

      stabilizer.apply(
        createTestRawFrame(1000),
        createUpstreamFrame(1000, [chord], cMajor),
      );
      stabilizer.reset();

      const result = stabilizer.apply(
        createTestRawFrame(2000),
        createUpstreamFrame(2000, [], cMajor),
      );

      expect(result.harmonicContext?.functionalProgression).toHaveLength(0);
    });
  });

  describe("custom dissonance algorithm", () => {
    it("accepts custom algorithm", () => {
      const customStabilizer = new HarmonyStabilizer({
        partId: "main",
        dissonanceAlgorithm: () => 0.42,
      });
      customStabilizer.init();

      const raw = createTestRawFrame(1000);
      const chord = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord]);
      const result = customStabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.tension).toBe(0.42);
    });
  });
});

describe("defaultDissonanceAlgorithm", () => {
  it("returns 0 for single note", () => {
    const chord = createChord(0, "maj", [{ pc: 0, octave: 4 }]);
    expect(defaultDissonanceAlgorithm(chord)).toBe(0);
  });

  it("computes high dissonance for tritone", () => {
    const chord = createChord(0, "maj", [
      { pc: 0, octave: 4 },
      { pc: 6 as PitchClass, octave: 4 },
    ]);
    expect(defaultDissonanceAlgorithm(chord)).toBeGreaterThanOrEqual(0.4);
  });

  it("clamps to 1.0 maximum", () => {
    const chord = createChord(0, "dim7", [
      { pc: 0, octave: 4 },
      { pc: 1 as PitchClass, octave: 4 },
      { pc: 2 as PitchClass, octave: 4 },
      { pc: 3 as PitchClass, octave: 4 },
      { pc: 4 as PitchClass, octave: 4 },
      { pc: 5 as PitchClass, octave: 4 },
      { pc: 6 as PitchClass, octave: 4 },
    ]);
    expect(defaultDissonanceAlgorithm(chord)).toBeLessThanOrEqual(1.0);
  });
});
