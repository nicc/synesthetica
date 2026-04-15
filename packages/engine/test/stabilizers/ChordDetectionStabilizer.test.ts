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
  Note,
  PitchClass,
  NotePhase,
} from "@synesthetica/contracts";
import { createTestRawFrame, createTestMusicalFrame } from "../_harness/frames";

// ============================================================================
// Test Helpers
// ============================================================================

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

function createUpstreamFrame(t: number, notes: Note[]) {
  return createTestMusicalFrame(t, "main", { notes, progression: [] });
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
  // First pc placed at octave 3 so it's the MIDI-lowest (bass) note —
  // matches the "various roots" convention where first pc in the array
  // is the intended chord root/bass.
  const notes = pitchClasses.map((pc, i) => makeNote(pc, i === 0 ? 3 : 4, t));
  const upstream = createUpstreamFrame(t, notes);
  const raw = createTestRawFrame(t);

  // First frame: chord enters candidate state
  stabilizer.apply(raw, upstream);

  // Second frame after hysteresis: chord becomes displayed
  const t2 = t + 100;
  const notes2 = pitchClasses.map((pc, i) => makeNote(pc, i === 0 ? 3 : 4, t2));
  const upstream2 = createUpstreamFrame(t2, notes2);
  const raw2 = createTestRawFrame(t2);
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

  describe("key-aware spelling", () => {
    /**
     * Feed notes with a prescribed key and return the detected chord's
     * root pitch class (or null if no chord detected).
     */
    function detectRoot(
      pcs: PitchClass[],
      key: { root: PitchClass; mode: "ionian" | "aeolian" },
      t = 1000,
    ): PitchClass | null {
      // First pc placed at octave 3 so it's the MIDI-lowest (bass) note,
      // matching root-position voicings the tests describe.
      const notes = pcs.map((pc, i) => makeNote(pc, i === 0 ? 3 : 4, t));
      const raw1 = createTestRawFrame(t);
      const upstream1 = createTestMusicalFrame(t, "main", {
        notes,
        progression: [],
        prescribedKey: key,
      });
      stabilizer.apply(raw1, upstream1);

      const t2 = t + 100;
      const notes2 = pcs.map((pc, i) => makeNote(pc, i === 0 ? 3 : 4, t2));
      const raw2 = createTestRawFrame(t2);
      const upstream2 = createTestMusicalFrame(t2, "main", {
        notes: notes2,
        progression: [],
        prescribedKey: key,
      });
      const result = stabilizer.apply(raw2, upstream2);
      if (result.chords.length === 0) return null;
      return result.chords[0].root;
    }

    it("detects D major in D major key (sharp-key spelling)", () => {
      // D-F#-A (pc 2, 6, 9). Without key-aware spelling, pc 6 becomes
      // "Gb" and Tonal.Chord.detect fails to find a clean D triad.
      const root = detectRoot(
        [2, 6, 9] as PitchClass[],
        { root: 2 as PitchClass, mode: "ionian" },
      );
      expect(root).toBe(2); // D
    });

    it("detects A major in A major key", () => {
      // A-C#-E (pc 9, 1, 4)
      const root = detectRoot(
        [9, 1, 4] as PitchClass[],
        { root: 9 as PitchClass, mode: "ionian" },
      );
      expect(root).toBe(9); // A
    });

    it("uses bass note to disambiguate, not pc-set iteration order", () => {
      // Regression: pitch-class map insertion order was history-dependent,
      // so after playing a chord containing C (pc 0) the pc set iteration
      // order for a subsequent Ab-C-Eb voicing could put C first, causing
      // Tonal to return Cm#5 (C-rooted augmented) instead of AbM.
      // With bass-pc tracking, the actual lowest-pitch note dictates the
      // detection anchor.

      // Play a Caug first so C enters pitchClassLastSeen before Ab.
      stabilizer.init();
      const t1 = 1000;
      const caugNotes = [
        makeNote(0 as PitchClass, 4, t1),
        makeNote(4 as PitchClass, 4, t1),
        makeNote(8 as PitchClass, 4, t1),
      ];
      const ab: { root: PitchClass; mode: "ionian" | "aeolian" } = {
        root: 8 as PitchClass,
        mode: "ionian",
      };
      stabilizer.apply(
        createTestRawFrame(t1),
        createTestMusicalFrame(t1, "main", {
          notes: caugNotes,
          progression: [],
          prescribedKey: ab,
        }),
      );

      // Now play Ab-C-Eb with Ab as bass (octave 3).
      const t2 = 2000;
      const abmNotes: Note[] = [
        {
          ...makeNote(8 as PitchClass, 3, t2),
          pitch: { pc: 8 as PitchClass, octave: 3 },
        },
        makeNote(0 as PitchClass, 4, t2),
        makeNote(3 as PitchClass, 4, t2),
      ];
      stabilizer.apply(
        createTestRawFrame(t2),
        createTestMusicalFrame(t2, "main", {
          notes: abmNotes,
          progression: [],
          prescribedKey: ab,
        }),
      );
      const t3 = 2100;
      const result = stabilizer.apply(
        createTestRawFrame(t3),
        createTestMusicalFrame(t3, "main", {
          notes: abmNotes.map((n) => ({ ...n, onset: t3 })),
          progression: [],
          prescribedKey: ab,
        }),
      );

      // Should detect Ab major despite C being earlier in the pc map.
      const current = result.chords.find((c) => c.phase === "active");
      expect(current?.root).toBe(8);
      expect(current?.quality).toBe("maj");
    });

    it("still detects Bb major in Eb major key (flat-key spelling)", () => {
      // Bb-D-F (pc 10, 2, 5)
      const root = detectRoot(
        [10, 2, 5] as PitchClass[],
        { root: 3 as PitchClass, mode: "ionian" },
      );
      expect(root).toBe(10); // Bb
    });
  });

  describe("extended chord detection (expected failures, tracked in synesthetica-9eu)", () => {
    /**
     * Feed notes with a prescribed key, return detected root + quality.
     * Currently failing because our ChordQuality enum + scoring table
     * doesn't model extensions (9th, 11th, 13th). Extended chords fall
     * through to subset detection which picks a worse-fitting triad or
     * seventh from part of the voicing.
     */
    function detect(
      pcs: PitchClass[],
      key: { root: PitchClass; mode: "ionian" | "aeolian" },
      t = 1000,
    ): { root: PitchClass; quality: string } | null {
      // First pc placed at octave 3 so it's the MIDI-lowest (bass) note,
      // matching root-position voicings the tests describe.
      const notes = pcs.map((pc, i) => makeNote(pc, i === 0 ? 3 : 4, t));
      const raw1 = createTestRawFrame(t);
      const upstream1 = createTestMusicalFrame(t, "main", {
        notes,
        progression: [],
        prescribedKey: key,
      });
      stabilizer.apply(raw1, upstream1);

      const t2 = t + 100;
      const notes2 = pcs.map((pc, i) => makeNote(pc, i === 0 ? 3 : 4, t2));
      const raw2 = createTestRawFrame(t2);
      const upstream2 = createTestMusicalFrame(t2, "main", {
        notes: notes2,
        progression: [],
        prescribedKey: key,
      });
      const result = stabilizer.apply(raw2, upstream2);
      if (result.chords.length === 0) return null;
      return { root: result.chords[0].root, quality: result.chords[0].quality };
    }

    it("detects Ab9 in Ab major (Ab-C-Eb-Gb-Bb)", () => {
      // Ab9 = Ab(8) + C(0) + Eb(3) + Gb(6) + Bb(10)
      const result = detect(
        [8, 0, 3, 6, 10] as PitchClass[],
        { root: 8 as PitchClass, mode: "ionian" },
      );
      expect(result?.root).toBe(8); // Ab
    });

    it("detects Ab11 in Ab major (Ab-C-Eb-Gb-Bb-Db)", () => {
      // Ab11 = Ab(8) + C(0) + Eb(3) + Gb(6) + Bb(10) + Db(1)
      // Tonal's full-set match returns slash-chord candidates (Bbm11A/Ab,
      // Gb69#11/Ab). The key-aware scoring bias plus slash-chord
      // demotion lets the root-position Ab11 from subset detection win.
      const result = detect(
        [8, 0, 3, 6, 10, 1] as PitchClass[],
        { root: 8 as PitchClass, mode: "ionian" },
      );
      expect(result?.root).toBe(8); // Ab
    });

    it("detects Cmaj9 in C major (C-E-G-B-D)", () => {
      // Cmaj9 = C(0) + E(4) + G(7) + B(11) + D(2)
      const result = detect(
        [0, 4, 7, 11, 2] as PitchClass[],
        { root: 0 as PitchClass, mode: "ionian" },
      );
      expect(result?.root).toBe(0); // C
    });

    it("detects Dm9 in C major (D-F-A-C-E)", () => {
      // Dm9 = D(2) + F(5) + A(9) + C(0) + E(4)
      const result = detect(
        [2, 5, 9, 0, 4] as PitchClass[],
        { root: 0 as PitchClass, mode: "ionian" },
      );
      expect(result?.root).toBe(2); // D
    });

    it("detects a borrowed chord (Ab7 in C major) without over-biasing to key", () => {
      // Ab7 = Ab(8) + C(0) + Eb(3) + Gb(6). In C major, Ab is non-diatonic
      // (♭VI). A naive key-aware scorer might prefer a diatonic
      // interpretation — but Ab7 is the correct name for this voicing.
      const result = detect(
        [8, 0, 3, 6] as PitchClass[],
        { root: 0 as PitchClass, mode: "ionian" },
      );
      expect(result?.root).toBe(8); // Ab, not some diatonic alternative
    });

    it("detects a first-inversion triad as slash chord (Eb/G in Eb major)", () => {
      // G-Bb-Eb voicing. Tonal offers both EbM/G (standard inversion) and
      // Gm#5 (altered, rooted on bass). Harmonic interpretation prefers
      // the standard chord name even though it's a slash.
      const result = detect(
        [7, 10, 3] as PitchClass[],
        { root: 3 as PitchClass, mode: "ionian" },
      );
      expect(result?.root).toBe(3); // Eb, not G
      expect(result?.quality).toBe("maj");
    });

    it("detects a secondary dominant (D7 in C major)", () => {
      // D7 = D(2) + F#(6) + A(9) + C(0). F# is non-diatonic in C major.
      // D7 is V/V and should be detected as D7, not D (triad without 7th).
      const result = detect(
        [2, 6, 9, 0] as PitchClass[],
        { root: 0 as PitchClass, mode: "ionian" },
      );
      expect(result?.root).toBe(2); // D
      expect(result?.quality).toBe("dom7");
    });

    // G13 and Cadd9 already detect correctly under the current scoring
    // (subset-based), so they live outside the expected-failure block.
    it("detects G13 in C major (G-B-D-F-A-E) — already works", () => {
      // G13 = G(7) + B(11) + D(2) + F(5) + A(9) + E(4)
      const result = detect(
        [7, 11, 2, 5, 9, 4] as PitchClass[],
        { root: 0 as PitchClass, mode: "ionian" },
      );
      expect(result?.root).toBe(7); // G
    });

    it("detects Cadd9 (no 7th) C-E-G-D — already works", () => {
      // Cadd9 = C(0) + E(4) + G(7) + D(2). Tonal recognises this.
      const result = detect(
        [0, 4, 7, 2] as PitchClass[],
        { root: 0 as PitchClass, mode: "ionian" },
      );
      expect(result?.root).toBe(0); // C
    });
  });
});
