/**
 * Tests for ChordDetectionStabilizer
 *
 * Focuses on chord quality detection — verifying that Tonal.js output
 * is correctly mapped to our ChordQuality type, including edge cases
 * where Tonal returns quality="Unknown" (e.g. sus chords).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ChordDetectionStabilizer } from "../../src/stabilizers/ChordDetectionStabilizer";
import type {
  RawInputFrame,
  MusicalFrame,
  Note,
  PitchClass,
  NotePhase,
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

function makeNote(pc: PitchClass, octave: number, t: number): Note {
  return {
    id: `note-${pc}-${octave}-${t}`,
    pitch: { pc, octave },
    velocity: 80,
    onset: t,
    duration: 0,
    release: null,
    phase: "active" as NotePhase,
    confidence: 1.0,
    provenance: { source: "test", stream: "test", version: "1.0" },
  };
}

function createUpstreamFrame(t: number, notes: Note[]): MusicalFrame {
  return {
    t,
    part: "main",
    notes,
    chords: [],
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

/**
 * Feed notes into the stabilizer and return the detected chord quality.
 * Sends two frames separated by hysteresis window to ensure chord is displayed.
 */
function detectQuality(
  stabilizer: ChordDetectionStabilizer,
  pitchClasses: PitchClass[],
  t: number = 1000
): string | null {
  const notes = pitchClasses.map((pc) => makeNote(pc, 4, t));
  const upstream = createUpstreamFrame(t, notes);
  const raw = createRawFrame(t);

  // First frame: chord enters candidate state
  stabilizer.apply(raw, upstream);

  // Second frame after hysteresis: chord becomes displayed
  const t2 = t + 100;
  const notes2 = pitchClasses.map((pc) => makeNote(pc, 4, t2));
  const upstream2 = createUpstreamFrame(t2, notes2);
  const raw2 = createRawFrame(t2);
  const result = stabilizer.apply(raw2, upstream2);

  if (result.chords.length === 0) return null;
  return result.chords[0].quality;
}

// ============================================================================
// Tests
// ============================================================================

describe("ChordDetectionStabilizer", () => {
  let stabilizer: ChordDetectionStabilizer;

  beforeEach(() => {
    stabilizer = new ChordDetectionStabilizer({ partId: "main" });
    stabilizer.init();
  });

  describe("chord quality detection", () => {
    it("detects major triad", () => {
      // C-E-G (pc 0, 4, 7)
      expect(detectQuality(stabilizer, [0, 4, 7] as PitchClass[])).toBe("maj");
    });

    it("detects minor triad", () => {
      // C-Eb-G (pc 0, 3, 7)
      expect(detectQuality(stabilizer, [0, 3, 7] as PitchClass[])).toBe("min");
    });

    it("detects diminished triad", () => {
      // C-Eb-Gb (pc 0, 3, 6)
      expect(detectQuality(stabilizer, [0, 3, 6] as PitchClass[])).toBe("dim");
    });

    it("detects augmented triad", () => {
      // C-E-G# (pc 0, 4, 8)
      expect(detectQuality(stabilizer, [0, 4, 8] as PitchClass[])).toBe("aug");
    });

    it("detects sus2 chord", () => {
      // C-D-G (pc 0, 2, 7)
      expect(detectQuality(stabilizer, [0, 2, 7] as PitchClass[])).toBe("sus2");
    });

    it("detects sus4 chord", () => {
      // C-F-G (pc 0, 5, 7)
      expect(detectQuality(stabilizer, [0, 5, 7] as PitchClass[])).toBe("sus4");
    });

    it("detects dominant 7th", () => {
      // C-E-G-Bb (pc 0, 4, 7, 10)
      expect(detectQuality(stabilizer, [0, 4, 7, 10] as PitchClass[])).toBe(
        "dom7"
      );
    });

    it("detects major 7th", () => {
      // C-E-G-B (pc 0, 4, 7, 11)
      expect(detectQuality(stabilizer, [0, 4, 7, 11] as PitchClass[])).toBe(
        "maj7"
      );
    });

    it("detects minor 7th", () => {
      // C-Eb-G-Bb (pc 0, 3, 7, 10)
      expect(detectQuality(stabilizer, [0, 3, 7, 10] as PitchClass[])).toBe(
        "min7"
      );
    });

    it("detects diminished 7th", () => {
      // C-Eb-Gb-A (pc 0, 3, 6, 9)
      expect(detectQuality(stabilizer, [0, 3, 6, 9] as PitchClass[])).toBe(
        "dim7"
      );
    });

    it("detects half-diminished 7th", () => {
      // C-Eb-Gb-Bb (pc 0, 3, 6, 10)
      expect(detectQuality(stabilizer, [0, 3, 6, 10] as PitchClass[])).toBe(
        "hdim7"
      );
    });
  });

  describe("sus chord detection regression", () => {
    it("detects sus2 with various roots", () => {
      // D sus2: D-E-A (pc 2, 4, 9)
      expect(detectQuality(stabilizer, [2, 4, 9] as PitchClass[])).toBe("sus2");
    });

    it("detects sus4 with various roots", () => {
      // G sus4: G-C-D (pc 7, 0, 2)
      stabilizer.init(); // reset state
      expect(detectQuality(stabilizer, [7, 0, 2] as PitchClass[])).toBe("sus4");
    });

    it("detects sus2 with flat-named notes", () => {
      // Db sus2: Db-Eb-Ab (pc 1, 3, 8)
      expect(detectQuality(stabilizer, [1, 3, 8] as PitchClass[])).toBe("sus2");
    });
  });
});
