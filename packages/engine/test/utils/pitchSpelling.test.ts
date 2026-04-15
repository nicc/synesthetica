import { describe, it, expect } from "vitest";
import type { PrescribedKey, PitchClass } from "@synesthetica/contracts";
import {
  buildSpellingTable,
  pitchClassToNoteName,
} from "../../src/utils/pitchSpelling";

describe("pitchSpelling", () => {
  describe("default (no key)", () => {
    it("uses flat-preferring spelling", () => {
      expect(pitchClassToNoteName(6 as PitchClass)).toBe("Gb");
      expect(pitchClassToNoteName(1 as PitchClass)).toBe("Db");
      expect(pitchClassToNoteName(0 as PitchClass)).toBe("C");
    });
  });

  describe("major keys", () => {
    it("D major uses F# not Gb", () => {
      const key: PrescribedKey = { root: 2 as PitchClass, mode: "ionian" };
      const table = buildSpellingTable(key);
      expect(table[6 as PitchClass]).toBe("F#");
      expect(table[1 as PitchClass]).toBe("C#");
    });

    it("A major uses sharps for all diatonic tones", () => {
      const key: PrescribedKey = { root: 9 as PitchClass, mode: "ionian" };
      const table = buildSpellingTable(key);
      expect(table[6 as PitchClass]).toBe("F#");
      expect(table[1 as PitchClass]).toBe("C#");
      expect(table[8 as PitchClass]).toBe("G#");
    });

    it("Eb major uses flats", () => {
      const key: PrescribedKey = { root: 3 as PitchClass, mode: "ionian" };
      const table = buildSpellingTable(key);
      expect(table[3 as PitchClass]).toBe("Eb");
      expect(table[10 as PitchClass]).toBe("Bb");
      expect(table[8 as PitchClass]).toBe("Ab");
    });

    it("C major uses naturals and falls back to flats for non-diatonic", () => {
      const key: PrescribedKey = { root: 0 as PitchClass, mode: "ionian" };
      const table = buildSpellingTable(key);
      expect(table[0 as PitchClass]).toBe("C");
      expect(table[2 as PitchClass]).toBe("D");
      expect(table[1 as PitchClass]).toBe("Db"); // non-diatonic, default flat
      expect(table[6 as PitchClass]).toBe("Gb");
    });
  });

  describe("minor keys", () => {
    it("A natural minor uses no accidentals for diatonic tones", () => {
      const key: PrescribedKey = { root: 9 as PitchClass, mode: "aeolian" };
      const table = buildSpellingTable(key);
      expect(table[0 as PitchClass]).toBe("C");
      expect(table[9 as PitchClass]).toBe("A");
    });

    it("E minor uses F# for the 2nd degree", () => {
      const key: PrescribedKey = { root: 4 as PitchClass, mode: "aeolian" };
      const table = buildSpellingTable(key);
      expect(table[6 as PitchClass]).toBe("F#");
    });
  });

  describe("pitchClassToNoteName", () => {
    it("uses the provided table", () => {
      const key: PrescribedKey = { root: 2 as PitchClass, mode: "ionian" };
      const table = buildSpellingTable(key);
      expect(pitchClassToNoteName(6 as PitchClass, table)).toBe("F#");
    });

    it("falls back to default when table is undefined", () => {
      expect(pitchClassToNoteName(6 as PitchClass, undefined)).toBe("Gb");
    });
  });
});
