/**
 * Harmonic series model and vocabulary annotation (RFC 012).
 */

import { describe, it, expect } from "vitest";
import {
  modelPartialLevels,
  partialPitch,
  PARTIAL_CAP,
} from "../../src/vocabularies/harmonicSeries";
import { MusicalVisualVocabulary } from "../../src/vocabularies/MusicalVisualVocabulary";
import { createTestMusicalFrame } from "../_harness/frames";
import type { Note, PitchClass } from "@synesthetica/contracts";
import { pcToHue } from "@synesthetica/contracts";

function note(id: string, pc: PitchClass, onset = 0): Note {
  return {
    id,
    pitch: { pc, octave: 4 },
    velocity: 80,
    onset,
    duration: 500,
    release: null,
    phase: "sustain",
    confidence: 1,
    provenance: { source: "test", stream: "test" },
  };
}

describe("modelPartialLevels", () => {
  it("returns nothing when gain is 0", () => {
    expect(modelPartialLevels(0, 1)).toEqual([]);
  });

  it("models partials 3, 5, 7, 9 at the default cap, skipping powers of two", () => {
    const levels = modelPartialLevels(1, 1);
    expect(levels.map((p) => p.n)).toEqual([3, 5, 7, 9]);
    expect(PARTIAL_CAP).toBe(9);
  });

  it("folds octave duplicates into their odd partial (6 into 3)", () => {
    const byN = new Map(modelPartialLevels(1, 1).map((p) => [p.n, p.level]));
    expect(byN.get(3)).toBeCloseTo(1 / 3 + 1 / 6);
    expect(byN.get(5)).toBeCloseTo(1 / 5);
    expect(byN.get(7)).toBeCloseTo(1 / 7);
    expect(byN.get(9)).toBeCloseTo(1 / 9);
  });

  it("scales by gain and steepens with rolloff", () => {
    const half = modelPartialLevels(0.5, 1);
    expect(half[0].level).toBeCloseTo(0.25);
    const steep = new Map(modelPartialLevels(1, 2).map((p) => [p.n, p.level]));
    expect(steep.get(7)).toBeCloseTo(1 / 49);
  });

  it("clamps levels to 1 (flat rolloff folds 3 + 6 to 2)", () => {
    const flat = modelPartialLevels(1, 0);
    expect(flat.every((p) => p.level <= 1)).toBe(true);
  });
});

describe("partialPitch", () => {
  it("places partials at real pitch as nearest pc + cents", () => {
    const fifth = partialPitch(0, 3);
    expect(fifth.pc).toBe(7);
    expect(fifth.cents).toBeCloseTo(1.96, 1);

    const third = partialPitch(0, 5);
    expect(third.pc).toBe(4);
    expect(third.cents).toBeCloseTo(-13.69, 1);

    const seventh = partialPitch(0, 7);
    expect(seventh.pc).toBe(10);
    expect(seventh.cents).toBeCloseTo(-31.17, 1);
  });

  it("puts a partial just flat of C on C with negative cents, not on B", () => {
    // D's 7th partial: 2 + 9.69 = 11.69 semitones → C −31¢
    const p = partialPitch(2, 7);
    expect(p.pc).toBe(0);
    expect(p.cents).toBeCloseTo(-31.17, 1);
  });
});

describe("MusicalVisualVocabulary partial annotation", () => {
  const frame = createTestMusicalFrame(100, "main", { notes: [note("c", 0)] });

  it("annotates no partials by default (overlay off)", () => {
    const vocab = new MusicalVisualVocabulary();
    const annotated = vocab.annotate(frame);
    expect(annotated.notes[0].partials).toBeUndefined();
  });

  it("annotates partials when enabled, at the level macro's gain", () => {
    const vocab = new MusicalVisualVocabulary();
    vocab.setMacro("system:harmonic-series:enabled", true);
    vocab.setMacro("system:harmonic-series:level", 0.5);
    vocab.setMacro("system:harmonic-series:rolloff", 1);
    const partials = vocab.annotate(frame).notes[0].partials ?? [];
    expect(partials.map((p) => p.pc)).toEqual([7, 4, 10, 2]);
    expect(partials[0].level).toBeCloseTo(0.25);
  });

  it("does not add partials to the note list (partials are not notes)", () => {
    const vocab = new MusicalVisualVocabulary({ harmonicSeriesEnabled: true });
    vocab.setMacro("system:harmonic-series:level", 1);
    expect(vocab.annotate(frame).notes).toHaveLength(1);
  });

  it("reads back the overlay macros", () => {
    const vocab = new MusicalVisualVocabulary();
    expect(vocab.readMacros()["system:harmonic-series:enabled"]).toBe(false);
    vocab.setMacro("system:harmonic-series:enabled", true);
    expect(vocab.readMacros()["system:harmonic-series:enabled"]).toBe(true);
    vocab.setMacro("system:harmonic-series:level", 0.3);
    vocab.setMacro("system:harmonic-series:rolloff", 2);
    const macros = vocab.readMacros();
    expect(macros["system:harmonic-series:level"]).toBe(0.3);
    expect(macros["system:harmonic-series:rolloff"]).toBe(2);
  });

  it("colours partials by pitch or by fundamental", () => {
    const hueConfig = { referencePc: 0 as PitchClass, referenceHue: 0, direction: "cw" as const };
    const vocab = new MusicalVisualVocabulary({ harmonicSeriesEnabled: true, harmonicSeriesLevel: 1 });
    expect(vocab.readMacros()["system:harmonic-series:colour"]).toBe("pitch");
    const fifthPitch = vocab.annotate(frame).notes[0].partials![0];
    expect(fifthPitch.color.h).toBe(pcToHue(7, hueConfig));

    vocab.setMacro("system:harmonic-series:colour", "fundamental");
    const fifthFund = vocab.annotate(frame).notes[0].partials![0];
    expect(fifthFund.color.h).toBe(pcToHue(0, hueConfig));

    vocab.setMacro("system:harmonic-series:colour", "nonsense");
    expect(vocab.readMacros()["system:harmonic-series:colour"]).toBe("fundamental");
  });
});
