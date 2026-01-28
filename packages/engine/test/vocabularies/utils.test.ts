/**
 * Tests for vocabulary utilities
 */

import { describe, it, expect } from "vitest";
import { buildChordShape } from "../../src/vocabularies/utils";
import type {
  MusicalChord,
  PitchClass,
  PitchHueInvariant,
} from "@synesthetica/contracts";
import { pcToHue } from "@synesthetica/contracts";

// Default invariant for tests (A=red, clockwise)
const defaultInvariant: PitchHueInvariant = {
  referencePc: 9, // A
  referenceHue: 0, // Red
  direction: "cw",
};

// Helper to create a test chord
function makeChord(
  root: PitchClass,
  quality: MusicalChord["quality"],
  intervals: number[]
): MusicalChord {
  return {
    id: `test:0:${root}${quality}`,
    root,
    quality,
    bass: root,
    inversion: 0,
    voicing: intervals.map((semitones) => ({
      pc: ((root + semitones) % 12) as PitchClass,
      octave: 4,
    })),
    noteIds: [],
    onset: 0,
    duration: 1000,
    phase: "active",
    confidence: 1.0,
    provenance: { source: "test", stream: "test", version: "1.0" },
  };
}

describe("buildChordShape", () => {
  describe("element structure", () => {
    it("builds correct elements for major triad", () => {
      const chord = makeChord(0, "maj", [0, 4, 7]); // C-E-G
      const shape = buildChordShape(chord, defaultInvariant);

      expect(shape.elements).toHaveLength(3);
      expect(shape.margin).toBe("straight");
      expect(shape.rootAngle).toBe(0);

      // Check intervals
      const intervals = shape.elements.map((e) => e.interval);
      expect(intervals).toContain("1"); // root
      expect(intervals).toContain("3"); // major 3rd
      expect(intervals).toContain("5"); // perfect 5th
    });

    it("builds correct elements for minor triad", () => {
      const chord = makeChord(0, "min", [0, 3, 7]); // C-Eb-G
      const shape = buildChordShape(chord, defaultInvariant);

      expect(shape.elements).toHaveLength(3);
      expect(shape.margin).toBe("wavy");

      const intervals = shape.elements.map((e) => e.interval);
      expect(intervals).toContain("1");
      expect(intervals).toContain("♭3");
      expect(intervals).toContain("5");
    });

    it("builds correct elements for dominant 7th", () => {
      const chord = makeChord(0, "dom7", [0, 4, 7, 10]); // C-E-G-Bb
      const shape = buildChordShape(chord, defaultInvariant);

      expect(shape.elements).toHaveLength(4);
      expect(shape.margin).toBe("straight");

      // Check tiers
      const rootEl = shape.elements.find((e) => e.interval === "1");
      const thirdEl = shape.elements.find((e) => e.interval === "3");
      const fifthEl = shape.elements.find((e) => e.interval === "5");
      const seventhEl = shape.elements.find((e) => e.interval === "♭7");

      expect(rootEl?.tier).toBe("triadic");
      expect(thirdEl?.tier).toBe("triadic");
      expect(fifthEl?.tier).toBe("triadic");
      expect(seventhEl?.tier).toBe("seventh");
    });

    it("builds correct elements for diminished 7th", () => {
      const chord = makeChord(0, "dim7", [0, 3, 6, 9]); // C-Eb-Gb-Bbb
      const shape = buildChordShape(chord, defaultInvariant);

      expect(shape.elements).toHaveLength(4);
      expect(shape.margin).toBe("concave");

      // ♭5 should be triadic in diminished context
      const flatFifthEl = shape.elements.find((e) => e.interval === "♭5");
      expect(flatFifthEl?.tier).toBe("triadic");
    });
  });

  describe("context-aware tier classification", () => {
    it("classifies ♭5 as triadic in diminished chords", () => {
      const dim = makeChord(0, "dim", [0, 3, 6]);
      const shape = buildChordShape(dim, defaultInvariant);

      const flatFifth = shape.elements.find((e) => e.interval === "♭5");
      expect(flatFifth?.tier).toBe("triadic");
    });

    it("classifies ♭5 as triadic in half-diminished chords", () => {
      const hdim = makeChord(0, "hdim7", [0, 3, 6, 10]);
      const shape = buildChordShape(hdim, defaultInvariant);

      const flatFifth = shape.elements.find((e) => e.interval === "♭5");
      expect(flatFifth?.tier).toBe("triadic");
    });

    it("classifies 9th as extension", () => {
      const maj9 = makeChord(0, "maj7", [0, 4, 7, 11, 2]); // C-E-G-B-D
      const shape = buildChordShape(maj9, defaultInvariant);

      const ninth = shape.elements.find((e) => e.interval === "2"); // 9th = 2 semitones
      expect(ninth?.tier).toBe("extension");
    });
  });

  describe("per-element color", () => {
    it("computes color from pitch class of each element", () => {
      const chord = makeChord(0, "maj", [0, 4, 7]); // C-E-G (pc 0, 4, 7)
      const shape = buildChordShape(chord, defaultInvariant);

      // Root (C, pc=0) should have hue for C
      const rootEl = shape.elements.find((e) => e.interval === "1");
      const expectedRootHue = pcToHue(0 as PitchClass, defaultInvariant);
      expect(rootEl?.color.h).toBe(expectedRootHue);

      // Third (E, pc=4) should have hue for E
      const thirdEl = shape.elements.find((e) => e.interval === "3");
      const expectedThirdHue = pcToHue(4 as PitchClass, defaultInvariant);
      expect(thirdEl?.color.h).toBe(expectedThirdHue);

      // Fifth (G, pc=7) should have hue for G
      const fifthEl = shape.elements.find((e) => e.interval === "5");
      const expectedFifthHue = pcToHue(7 as PitchClass, defaultInvariant);
      expect(fifthEl?.color.h).toBe(expectedFifthHue);
    });

    it("respects custom pitch-hue invariant", () => {
      const customInvariant: PitchHueInvariant = {
        referencePc: 0, // C = red
        referenceHue: 0,
        direction: "cw",
      };

      const chord = makeChord(0, "maj", [0, 4, 7]);
      const shape = buildChordShape(chord, customInvariant);

      // Root (C) should be at reference hue (0 = red)
      const rootEl = shape.elements.find((e) => e.interval === "1");
      expect(rootEl?.color.h).toBe(0);

      // Third (E, 4 semitones up) should be 4 * 30 = 120° from reference
      const thirdEl = shape.elements.find((e) => e.interval === "3");
      expect(thirdEl?.color.h).toBe(120);
    });

    it("uses average octave brightness for all elements", () => {
      // Chord with mixed octaves
      const chord: MusicalChord = {
        id: "test:0:Cmaj",
        root: 0,
        quality: "maj",
        bass: 0,
        inversion: 0,
        voicing: [
          { pc: 0, octave: 3 }, // Low C
          { pc: 4, octave: 4 }, // Mid E
          { pc: 7, octave: 5 }, // High G
        ],
        noteIds: [],
        onset: 0,
        duration: 1000,
        phase: "active",
        confidence: 1.0,
        provenance: { source: "test", stream: "test", version: "1.0" },
      };

      const shape = buildChordShape(chord, defaultInvariant);

      // All elements should have the same brightness (from avg octave 4)
      const brightnesses = shape.elements.map((e) => e.color.v);
      expect(new Set(brightnesses).size).toBe(1); // All same value
    });
  });

  describe("margin styles", () => {
    const cases: Array<[MusicalChord["quality"], string]> = [
      ["maj", "straight"],
      ["maj7", "straight"],
      ["dom7", "straight"],
      ["min", "wavy"],
      ["min7", "wavy"],
      ["dim", "concave"],
      ["dim7", "concave"],
      ["hdim7", "concave"],
      ["aug", "convex"],
      ["sus2", "dash-short"],
      ["sus4", "dash-long"],
    ];

    it.each(cases)("maps %s quality to %s margin", (quality, expectedMargin) => {
      const chord = makeChord(0, quality, [0, 4, 7]);
      const shape = buildChordShape(chord, defaultInvariant);
      expect(shape.margin).toBe(expectedMargin);
    });
  });

  describe("angular positions", () => {
    it("places root at 0°", () => {
      const chord = makeChord(0, "maj", [0, 4, 7]);
      const shape = buildChordShape(chord, defaultInvariant);

      const rootEl = shape.elements.find((e) => e.interval === "1");
      expect(rootEl?.angle).toBe(0);
    });

    it("places intervals at correct angles (30° per semitone)", () => {
      const chord = makeChord(0, "maj", [0, 4, 7]);
      const shape = buildChordShape(chord, defaultInvariant);

      const thirdEl = shape.elements.find((e) => e.interval === "3");
      expect(thirdEl?.angle).toBe(120); // 4 semitones * 30°

      const fifthEl = shape.elements.find((e) => e.interval === "5");
      expect(fifthEl?.angle).toBe(210); // 7 semitones * 30°
    });
  });
});
