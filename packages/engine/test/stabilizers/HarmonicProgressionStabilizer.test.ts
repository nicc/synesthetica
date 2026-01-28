/**
 * Tests for HarmonicProgressionStabilizer
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  HarmonicProgressionStabilizer,
  defaultDissonanceAlgorithm,
} from "../../src/stabilizers/HarmonicProgressionStabilizer";
import type {
  RawInputFrame,
  MusicalFrame,
  MusicalChord,
  PitchClass,
} from "@synesthetica/contracts";

// ============================================================================
// Test Helpers
// ============================================================================

function createRawFrame(t: number): RawInputFrame {
  return {
    t,
    events: [],
    provenance: { source: "test", stream: "test" },
  };
}

function createChord(
  root: PitchClass,
  quality: MusicalChord["quality"],
  voicing: Array<{ pc: PitchClass; octave: number }>
): MusicalChord {
  return {
    id: `test:0:${root}${quality}`,
    root,
    quality,
    bass: voicing[0].pc,
    inversion: 0,
    voicing: voicing.map((p) => ({ pc: p.pc, octave: p.octave })),
    noteIds: [],
    onset: 0,
    duration: 1000,
    phase: "active",
    confidence: 1.0,
    provenance: { source: "test", stream: "test", version: "1.0" },
  };
}

function createUpstreamFrame(
  t: number,
  chords: MusicalChord[]
): MusicalFrame {
  return {
    t,
    part: "main",
    notes: [],
    chords,
    rhythmicAnalysis: {
      detectedDivision: null,
      onsetDrifts: [],
      stability: 0,
      confidence: 0,
    },
    dynamics: { level: 0.5, trend: "stable" },
    prescribedTempo: null,
    prescribedMeter: null,
    progression: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("HarmonicProgressionStabilizer", () => {
  let stabilizer: HarmonicProgressionStabilizer;

  beforeEach(() => {
    stabilizer = new HarmonicProgressionStabilizer({ partId: "main" });
    stabilizer.init();
  });

  describe("basic functionality", () => {
    it("has correct id and dependencies", () => {
      expect(stabilizer.id).toBe("harmonic-progression");
      expect(stabilizer.dependencies).toEqual(["chord-detection"]);
    });

    it("returns empty frame with no upstream", () => {
      const raw = createRawFrame(1000);
      const result = stabilizer.apply(raw, null);

      expect(result.t).toBe(1000);
      expect(result.chords).toEqual([]);
      expect(result.harmonicContext).toBeUndefined();
    });

    it("returns zero tension with no chords", () => {
      const raw = createRawFrame(1000);
      const upstream = createUpstreamFrame(1000, []);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.tension).toBe(0);
      expect(result.harmonicContext?.keyAware).toBe(false);
      expect(result.harmonicContext?.detectedKey).toBeNull();
    });
  });

  describe("tension computation", () => {
    it("computes low tension for major triad", () => {
      const raw = createRawFrame(1000);
      // C major: C-E-G (pc 0, 4, 7)
      const chord = createChord(0, "maj", [
        { pc: 0, octave: 4 },
        { pc: 4, octave: 4 },
        { pc: 7, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord]);
      const result = stabilizer.apply(raw, upstream);

      // Major triad has consonant intervals: major 3rd (4), perfect 5th (7), minor 3rd (3)
      // Expected: low tension
      expect(result.harmonicContext?.tension).toBeLessThan(0.3);
    });

    it("computes moderate tension for dominant 7th", () => {
      const raw = createRawFrame(1000);
      // G7: G-B-D-F (pc 7, 11, 2, 5)
      const chord = createChord(7, "dom7", [
        { pc: 7, octave: 3 },
        { pc: 11, octave: 3 },
        { pc: 2, octave: 4 },
        { pc: 5, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord]);
      const result = stabilizer.apply(raw, upstream);

      // Dominant 7th has tritone (B-F) and minor 7th
      // Tension: 0.65 (intervals) + 0.15 (dom7 quality) = 0.80
      // Expected: moderate-high tension (tritone is highly dissonant)
      expect(result.harmonicContext?.tension).toBeGreaterThan(0.2);
      expect(result.harmonicContext?.tension).toBeLessThan(0.85);
    });

    it("computes high tension for diminished 7th", () => {
      const raw = createRawFrame(1000);
      // Cdim7: C-Eb-Gb-Bbb (pc 0, 3, 6, 9)
      const chord = createChord(0, "dim7", [
        { pc: 0, octave: 4 },
        { pc: 3, octave: 4 },
        { pc: 6, octave: 4 },
        { pc: 9, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord]);
      const result = stabilizer.apply(raw, upstream);

      // Diminished 7th has two tritones and is highly unstable
      // Expected: high tension
      expect(result.harmonicContext?.tension).toBeGreaterThan(0.5);
    });

    it("uses active chord over decaying", () => {
      const raw = createRawFrame(1000);
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

      // Should use the active dim7, which has higher tension than the decaying major
      expect(result.harmonicContext?.tension).toBeGreaterThan(0.4);
    });
  });

  describe("custom dissonance algorithm", () => {
    it("accepts custom algorithm", () => {
      const customAlgorithm = (_chord: MusicalChord) => 0.42;
      const customStabilizer = new HarmonicProgressionStabilizer({
        partId: "main",
        dissonanceAlgorithm: customAlgorithm,
      });
      customStabilizer.init();

      const raw = createRawFrame(1000);
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

  it("computes interval dissonance for tritone", () => {
    // C and F# (tritone only)
    const chord = createChord(0, "maj", [
      { pc: 0, octave: 4 },
      { pc: 6, octave: 4 },
    ]);
    const tension = defaultDissonanceAlgorithm(chord);
    // Tritone has 0.4 dissonance
    expect(tension).toBeGreaterThanOrEqual(0.4);
  });

  it("computes quality modifier for diminished", () => {
    // Simple minor third (low interval dissonance) but diminished quality
    const dimChord = createChord(0, "dim", [
      { pc: 0, octave: 4 },
      { pc: 3, octave: 4 },
    ]);
    const majChord = createChord(0, "maj", [
      { pc: 0, octave: 4 },
      { pc: 3, octave: 4 },
    ]);

    const dimTension = defaultDissonanceAlgorithm(dimChord);
    const majTension = defaultDissonanceAlgorithm(majChord);

    // Diminished quality adds 0.2, major adds 0
    expect(dimTension).toBeGreaterThan(majTension);
  });

  it("clamps to 1.0 maximum", () => {
    // Highly dissonant cluster chord
    const chord = createChord(0, "dim7", [
      { pc: 0, octave: 4 },
      { pc: 1, octave: 4 },
      { pc: 2, octave: 4 },
      { pc: 3, octave: 4 },
      { pc: 4, octave: 4 },
      { pc: 5, octave: 4 },
      { pc: 6, octave: 4 },
    ]);
    const tension = defaultDissonanceAlgorithm(chord);
    expect(tension).toBeLessThanOrEqual(1.0);
  });
});
