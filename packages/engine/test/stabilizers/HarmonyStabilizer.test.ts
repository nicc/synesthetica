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

    it("marks Gm in C major as borrowed (diatonic root, non-diatonic quality)", () => {
      // G is diatonic (V) but the diatonic V quality is major. Gm is
      // borrowed even though G is in the scale. No ♭/♯ prefix because
      // the root is diatonic.
      const raw = createTestRawFrame(1000);
      const chord = createChord(7 as PitchClass, "min", [
        { pc: 7 as PitchClass, octave: 3 },
        { pc: 10 as PitchClass, octave: 3 },
        { pc: 2 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(5);
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(true);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("v");
    });

    it("marks Caug in C major as borrowed (diatonic root, non-diatonic quality)", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(0 as PitchClass, "aug", [
        { pc: 0 as PitchClass, octave: 4 },
        { pc: 4 as PitchClass, octave: 4 },
        { pc: 8 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(1);
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(true);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("I+");
    });

    it("keeps V7 (dom7 at V) as diatonic in major", () => {
      // G7 in C major — the canonical cadential dominant. Quality is
      // dom7 which differs from the table's "maj" but it's the
      // accepted V chord in major.
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
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("V7");
    });

    it("treats C5 (power chord) in C major as diatonic (I5)", () => {
      // C + G — both notes are scale tones at maj-quality slot.
      const raw = createTestRawFrame(1000);
      const chord = createChord(0 as PitchClass, "5", [
        { pc: 0 as PitchClass, octave: 3 },
        { pc: 7 as PitchClass, octave: 3 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(1);
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("I5");
    });

    it("treats D5 in C major as diatonic (II5 at minor slot)", () => {
      // D + A — at degree 2 (ii is min). 5 chord is quality-ambiguous,
      // both notes are scale tones, so it's diatonic.
      const raw = createTestRawFrame(1000);
      const chord = createChord(2 as PitchClass, "5", [
        { pc: 2 as PitchClass, octave: 3 },
        { pc: 9 as PitchClass, octave: 3 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(2);
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(false);
      expect(result.harmonicContext?.currentFunction?.roman).toBe("II5");
    });

    it("treats B5 in C major as borrowed (P5 above vii° lands outside scale)", () => {
      // B + F♯ — P5 above the leading tone is F♯, which isn't in
      // C major. So B5 is non-diatonic even though B is a scale tone.
      const raw = createTestRawFrame(1000);
      const chord = createChord(11 as PitchClass, "5", [
        { pc: 11 as PitchClass, octave: 3 },
        { pc: 6 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(7);
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(true);
    });

    it("marks C7 in C major as borrowed (V/IV — dom7 only diatonic at V)", () => {
      // C7 — root is C (diatonic I) but quality is dom7. dom7 is only
      // diatonic at V; here it's V/IV (the dominant of IV).
      const raw = createTestRawFrame(1000);
      const chord = createChord(0 as PitchClass, "dom7", [
        { pc: 0 as PitchClass, octave: 3 },
        { pc: 4 as PitchClass, octave: 3 },
        { pc: 7 as PitchClass, octave: 3 },
        { pc: 10 as PitchClass, octave: 3 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.currentFunction?.degree).toBe(1);
      expect(result.harmonicContext?.currentFunction?.borrowed).toBe(true);
    });
  });

  describe("functional edges (SPEC 011)", () => {
    const cMajor: PrescribedKey = { root: 0 as PitchClass, mode: "ionian" };

    it("emits no edges for diatonic chords", () => {
      const raw = createTestRawFrame(1000);
      const chord = createChord(0 as PitchClass, "maj", [
        { pc: 0 as PitchClass, octave: 4 },
        { pc: 4 as PitchClass, octave: 4 },
        { pc: 7 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.functionalEdges).toEqual([]);
    });

    it("emits ♭VII → IV edge (subdominant borrowing)", () => {
      // B♭ major in C major
      const raw = createTestRawFrame(1000);
      const chord = createChord(10 as PitchClass, "maj", [
        { pc: 10 as PitchClass, octave: 3 },
        { pc: 2 as PitchClass, octave: 4 },
        { pc: 5 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      const edges = result.harmonicContext?.functionalEdges ?? [];
      expect(edges).toHaveLength(1);
      expect(edges[0].targetDegree).toBe(4);
      expect(edges[0].targetPc).toBe(5); // F
      expect(edges[0].targetDiatonic).toBe(true);
      expect(edges[0].type).toBe("subdominant-borrowing");
      expect(edges[0].weight).toBeGreaterThan(0.8);
    });

    it("emits V/V → V edge (secondary dominant)", () => {
      // D major in C major
      const raw = createTestRawFrame(1000);
      const chord = createChord(2 as PitchClass, "maj", [
        { pc: 2 as PitchClass, octave: 3 },
        { pc: 6 as PitchClass, octave: 3 },
        { pc: 9 as PitchClass, octave: 3 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      const edges = result.harmonicContext?.functionalEdges ?? [];
      expect(edges).toHaveLength(1);
      expect(edges[0].targetDegree).toBe(5);
      expect(edges[0].targetPc).toBe(7); // G
      expect(edges[0].targetDiatonic).toBe(true);
      expect(edges[0].type).toBe("secondary-dominant");
      expect(edges[0].weight).toBeGreaterThan(0.9);
    });

    it("emits both diatonic + chain edges for V/ii (fan-out)", () => {
      // A major in C major. Target is D (degree 2), whose diatonic
      // quality is minor. The conventional reading is V/ii → ii
      // (diatonic D minor); the chain reading is V/V/V → V/V (D
      // played as borrowed major, itself a V of V). Both are emitted.
      const raw = createTestRawFrame(1000);
      const chord = createChord(9 as PitchClass, "maj", [
        { pc: 9 as PitchClass, octave: 3 },
        { pc: 1 as PitchClass, octave: 4 }, // C#
        { pc: 4 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      const edges = result.harmonicContext?.functionalEdges ?? [];
      expect(edges).toHaveLength(2);
      // Both edges target the same degree/pc (D, degree 2)
      for (const e of edges) {
        expect(e.targetDegree).toBe(2);
        expect(e.targetPc).toBe(2);
        expect(e.type).toBe("secondary-dominant");
      }
      // One goes to diatonic ring, the other to borrowed
      const rings = edges.map((e) => e.targetDiatonic).sort();
      expect(rings).toEqual([false, true]);
      // Conventional edge has higher weight than chain edge
      const diatonicEdge = edges.find((e) => e.targetDiatonic)!;
      const chainEdge = edges.find((e) => !e.targetDiatonic)!;
      expect(diatonicEdge.weight).toBeGreaterThan(chainEdge.weight);
    });

    it("does NOT fan out when target's diatonic quality is major (V/V)", () => {
      // D major in C major → target G (degree 5), diatonic quality
      // major. No chain ambiguity — single edge to diatonic V.
      const raw = createTestRawFrame(1000);
      const chord = createChord(2 as PitchClass, "maj", [
        { pc: 2 as PitchClass, octave: 3 },
        { pc: 6 as PitchClass, octave: 3 },
        { pc: 9 as PitchClass, octave: 3 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      const edges = result.harmonicContext?.functionalEdges ?? [];
      expect(edges).toHaveLength(1);
      expect(edges[0].targetDiatonic).toBe(true);
    });

    it("emits V/IV → IV edge from C7", () => {
      // C7 in C major — V/IV (the dominant of IV)
      const raw = createTestRawFrame(1000);
      const chord = createChord(0 as PitchClass, "dom7", [
        { pc: 0 as PitchClass, octave: 3 },
        { pc: 4 as PitchClass, octave: 3 },
        { pc: 7 as PitchClass, octave: 3 },
        { pc: 10 as PitchClass, octave: 3 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      const edges = result.harmonicContext?.functionalEdges ?? [];
      expect(edges).toHaveLength(1);
      expect(edges[0].targetDegree).toBe(4);
      expect(edges[0].targetPc).toBe(5); // F
      expect(edges[0].type).toBe("secondary-dominant");
    });

    it("emits ♭VI → ii AND ♭VI → IV edges (fan-out)", () => {
      // A♭ major in C major
      const raw = createTestRawFrame(1000);
      const chord = createChord(8 as PitchClass, "maj", [
        { pc: 8 as PitchClass, octave: 3 },
        { pc: 0 as PitchClass, octave: 4 },
        { pc: 3 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      const edges = result.harmonicContext?.functionalEdges ?? [];
      expect(edges).toHaveLength(2);
      const targets = edges.map((e) => e.targetDegree).sort();
      expect(targets).toEqual([2, 4]);
    });

    it("emits no edge for borrowed chord without a known relationship", () => {
      // Gm in C major — borrowed via quality (G is V root, but Gm has
      // wrong quality). Not in modal interchange table; quality isn't
      // major/dom7/maj7 so secondary dominant rule doesn't fire.
      const raw = createTestRawFrame(1000);
      const chord = createChord(7 as PitchClass, "min", [
        { pc: 7 as PitchClass, octave: 3 },
        { pc: 10 as PitchClass, octave: 3 },
        { pc: 2 as PitchClass, octave: 4 },
      ]);
      const upstream = createUpstreamFrame(1000, [chord], cMajor);
      const result = stabilizer.apply(raw, upstream);

      expect(result.harmonicContext?.functionalEdges).toEqual([]);
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
