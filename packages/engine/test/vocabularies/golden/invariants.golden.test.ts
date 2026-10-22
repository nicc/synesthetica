/**
 * Vocabulary Invariant Tests (RFC 006)
 *
 * Property tests for vocabulary invariants. These verify that instrument invariants hold,
 * not exact output values. The vocabulary interface may evolve; we test properties.
 *
 * Updated for RFC 006: Tests annotate() returning AnnotatedMusicalFrame
 * instead of map() returning VisualIntentFrame.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MusicalVisualVocabulary } from "../../../src/vocabularies/MusicalVisualVocabulary";
import type {
  Note,
  Pitch,
  PitchClass,
  AnnotatedNote,
  MusicalFrame,
} from "@synesthetica/contracts";
import {
  pcToHue,
  octaveToBrightness,
  velocityToSizeMultiplier,
  velocityToAttackMs,
} from "@synesthetica/contracts";
import { createTestMusicalFrame } from "../../_harness/frames";

// ============================================================================
// Test Helpers
// ============================================================================

function makePitch(pc: PitchClass, octave: number): Pitch {
  return { pc, octave };
}

function makeNote(
  id: string,
  pitch: Pitch,
  velocity: number,
  phase: Note["phase"],
  onset = 0,
  duration = 100,
  release: number | null = null
): Note {
  return {
    id,
    pitch,
    velocity,
    onset,
    duration,
    release,
    phase,
    confidence: 1.0,
    provenance: { source: "test", stream: "test" },
  };
}

function makeFrame(t: number, notes: Note[]): MusicalFrame {
  return createTestMusicalFrame(t, "test-part", { notes });
}

function getAnnotatedNote(
  ruleset: MusicalVisualVocabulary,
  frame: MusicalFrame
): AnnotatedNote | undefined {
  const result = ruleset.annotate(frame);
  return result.notes[0];
}

// ============================================================================
// Invariant 1: Pitch Class → Hue Mapping
// ============================================================================

describe("Invariant: Pitch class → hue mapping", () => {
  let ruleset: MusicalVisualVocabulary;

  beforeEach(() => {
    ruleset = new MusicalVisualVocabulary();
  });

  /** Hue the vocabulary gives pitch class `pc`. */
  const hueOf = (pc: number) =>
    getAnnotatedNote(
      ruleset,
      makeFrame(0, [makeNote("n1", makePitch(pc as PitchClass, 4), 100, "sustain")]),
    )!.visual.palette.primary.h;

  /** The invariant the vocabulary reports — not a retyped default
   *  (defaults are checked once, in wiringCoverage.test.ts). */
  const invariantOf = (vocab: MusicalVisualVocabulary) =>
    vocab.annotate(makeFrame(0, [])).hueInvariant;

  it("the reference pitch class maps to the reference hue", () => {
    const inv = invariantOf(ruleset);
    expect(hueOf(inv.referencePc)).toBe(inv.referenceHue);
  });

  it("all 12 pitch classes map to distinct hues", () => {
    const hues = new Set<number>();

    for (let pc = 0; pc < 12; pc++) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(pc as PitchClass, 4), 100, "sustain"),
      ]);
      const annotated = getAnnotatedNote(ruleset, frame);
      expect(annotated).toBeDefined();
      hues.add(annotated!.visual.palette.primary.h);
    }

    expect(hues.size).toBe(12);
  });

  it("each semitone step equals 30° hue rotation", () => {
    const inv = invariantOf(ruleset);
    const step = inv.direction === "ccw" ? -30 : 30;
    for (let pc = 0; pc < 12; pc++) {
      expect(hueOf(pc)).toBe(pcToHue(pc as PitchClass, inv));
      expect(hueOf((pc + 1) % 12)).toBe((hueOf(pc) + step + 360) % 360);
    }
  });

  it("counterclockwise direction inverts hue progression", () => {
    const { referencePc, referenceHue } = invariantOf(ruleset);
    const above = (referencePc + 1) % 12;
    const cwHue = hueOf(above);
    ruleset = new MusicalVisualVocabulary({ hueDirection: "ccw" });

    // One semitone above the reference: +30° clockwise, −30° counterclockwise.
    expect(hueOf(referencePc)).toBe(referenceHue);
    expect(hueOf(above)).toBe((2 * referenceHue - cwHue + 720) % 360);
    expect(hueOf(above)).not.toBe(cwHue);
  });

  it("custom reference point shifts all hues equally", () => {
    // C (pc=0) as reference at red (0°)
    ruleset = new MusicalVisualVocabulary({ referencePc: 0, referenceHue: 0 });

    const frameC = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "sustain"),
    ]);
    const frameD = makeFrame(0, [
      makeNote("n1", makePitch(2, 4), 100, "sustain"),
    ]);

    const annotatedC = getAnnotatedNote(ruleset, frameC);
    const annotatedD = getAnnotatedNote(ruleset, frameD);

    expect(annotatedC!.visual.palette.primary.h).toBe(0); // C = reference
    expect(annotatedD!.visual.palette.primary.h).toBe(60); // D = 2 semitones = 60°
  });
});

// ============================================================================
// Invariant 2: Velocity → Brightness Mapping
// ============================================================================

describe("Invariant I15: Octave → brightness mapping", () => {
  let ruleset: MusicalVisualVocabulary;

  beforeEach(() => {
    ruleset = new MusicalVisualVocabulary();
  });

  it("higher octave → higher brightness (monotonic)", () => {
    const octaves = [1, 2, 3, 4, 5, 6, 7, 8];
    let previousBrightness = -1;

    for (const octave of octaves) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, octave), 64, "sustain"),
      ]);
      const annotated = getAnnotatedNote(ruleset, frame);

      expect(annotated!.visual.palette.primary.v).toBeGreaterThan(previousBrightness);
      previousBrightness = annotated!.visual.palette.primary.v;
    }
  });

  // SPEC 010's endpoints (0.3 / 0.95) live in the contracts mapping;
  // these tests check the vocabulary uses it and the clamping
  // properties, rather than retyping the numbers.
  const brightnessAt = (octave: number) =>
    getAnnotatedNote(
      ruleset,
      makeFrame(0, [makeNote("n1", makePitch(0, octave), 64, "sustain")]),
    )!.visual.palette.primary.v;

  it("brightness follows the SPEC 010 octave mapping", () => {
    for (let oct = 0; oct <= 9; oct++) {
      expect(brightnessAt(oct)).toBe(octaveToBrightness(oct));
    }
  });

  it("brightness saturates at both ends and stays visible", () => {
    // Clamped: octaves past the range don't keep getting brighter or darker.
    expect(brightnessAt(9)).toBe(brightnessAt(8));
    expect(brightnessAt(0)).toBe(brightnessAt(1));
    expect(brightnessAt(1)).toBeGreaterThan(0);
    expect(brightnessAt(8)).toBeLessThanOrEqual(1);
    for (let oct = 0; oct <= 9; oct++) {
      expect(brightnessAt(oct)).toBeGreaterThanOrEqual(brightnessAt(1));
      expect(brightnessAt(oct)).toBeLessThanOrEqual(brightnessAt(8));
    }
  });
});

describe("Invariant I16: Velocity → size/attack mapping", () => {
  let ruleset: MusicalVisualVocabulary;

  beforeEach(() => {
    ruleset = new MusicalVisualVocabulary();
  });

  it("higher velocity → larger size multiplier (monotonic)", () => {
    const velocities = [0, 32, 64, 96, 127];
    let previousSize = -1;

    for (const velocity of velocities) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, 4), velocity, "sustain"),
      ]);
      const annotated = getAnnotatedNote(ruleset, frame);

      expect(annotated!.velocity.sizeMultiplier).toBeGreaterThan(previousSize);
      previousSize = annotated!.velocity.sizeMultiplier;
    }
  });

  it("size multiplier follows the SPEC 010 velocity mapping", () => {
    for (const velocity of [0, 32, 64, 96, 127]) {
      const annotated = getAnnotatedNote(
        ruleset,
        makeFrame(0, [makeNote("n1", makePitch(0, 4), velocity, "sustain")]),
      );
      expect(annotated!.velocity.sizeMultiplier).toBe(velocityToSizeMultiplier(velocity));
      expect(annotated!.velocity.attackMs).toBe(velocityToAttackMs(velocity));
    }
  });

  it("higher velocity → shorter attack (sharper onset)", () => {
    const frame127 = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 127, "sustain"),
    ]);
    const frame0 = makeFrame(0, [
      makeNote("n2", makePitch(0, 4), 0, "sustain"),
    ]);

    const annotated127 = getAnnotatedNote(ruleset, frame127);
    const annotated0 = getAnnotatedNote(ruleset, frame0);

    expect(annotated127!.velocity.attackMs).toBeLessThan(annotated0!.velocity.attackMs);
    expect(annotated127!.velocity.attackMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Invariant 3: Note Phase → Motion/Texture Mapping
// ============================================================================

describe("Invariant: Note phase → motion mapping", () => {
  let ruleset: MusicalVisualVocabulary;

  beforeEach(() => {
    ruleset = new MusicalVisualVocabulary();
  });

  it("attack phase has higher jitter than sustain", () => {
    const attackFrame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "attack"),
    ]);
    const sustainFrame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "sustain"),
    ]);

    const attackAnnotated = getAnnotatedNote(ruleset, attackFrame);
    const sustainAnnotated = getAnnotatedNote(ruleset, sustainFrame);

    expect(attackAnnotated!.visual.motion.jitter).toBeGreaterThan(
      sustainAnnotated!.visual.motion.jitter
    );
  });

  it("sustain phase has lowest jitter", () => {
    const phases: Note["phase"][] = ["attack", "sustain", "release"];
    let minJitter = Infinity;
    let minPhase: Note["phase"] | null = null;

    for (const phase of phases) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, 4), 100, phase, 0, 100, phase === "release" ? 50 : null),
      ]);
      const annotated = getAnnotatedNote(ruleset, frame);

      if (annotated!.visual.motion.jitter < minJitter) {
        minJitter = annotated!.visual.motion.jitter;
        minPhase = phase;
      }
    }

    expect(minPhase).toBe("sustain");
  });

  it("motion values are within valid ranges", () => {
    const phases: Note["phase"][] = ["attack", "sustain", "release"];

    for (const phase of phases) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, 4), 100, phase, 0, 100, phase === "release" ? 50 : null),
      ]);
      const annotated = getAnnotatedNote(ruleset, frame);

      // Jitter should be [0, 1]
      expect(annotated!.visual.motion.jitter).toBeGreaterThanOrEqual(0);
      expect(annotated!.visual.motion.jitter).toBeLessThanOrEqual(1);

      // Pulse should be [0, 1]
      expect(annotated!.visual.motion.pulse).toBeGreaterThanOrEqual(0);
      expect(annotated!.visual.motion.pulse).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// Invariant 4: Octave Equivalence (Same Hue)
// ============================================================================

describe("Invariant: Octave equivalence for hue", () => {
  let ruleset: MusicalVisualVocabulary;

  beforeEach(() => {
    ruleset = new MusicalVisualVocabulary();
  });

  it("same pitch class in different octaves produces same hue", () => {
    const octaves = [2, 3, 4, 5, 6];

    for (const pc of [0, 4, 7, 9] as PitchClass[]) {
      const hues: number[] = [];

      for (const octave of octaves) {
        const frame = makeFrame(0, [
          makeNote("n1", makePitch(pc, octave), 100, "sustain"),
        ]);
        const annotated = getAnnotatedNote(ruleset, frame);
        hues.push(annotated!.visual.palette.primary.h);
      }

      // All hues should be identical
      expect(new Set(hues).size).toBe(1);
    }
  });

  it("C4 and C5 have identical hue", () => {
    const frameC4 = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "sustain"),
    ]);
    const frameC5 = makeFrame(0, [
      makeNote("n1", makePitch(0, 5), 100, "sustain"),
    ]);

    const annotatedC4 = getAnnotatedNote(ruleset, frameC4);
    const annotatedC5 = getAnnotatedNote(ruleset, frameC5);

    expect(annotatedC4!.visual.palette.primary.h).toBe(annotatedC5!.visual.palette.primary.h);
  });

  it("all pitch classes maintain octave equivalence", () => {
    for (let pc = 0; pc < 12; pc++) {
      const frame3 = makeFrame(0, [
        makeNote("n1", makePitch(pc as PitchClass, 3), 100, "sustain"),
      ]);
      const frame6 = makeFrame(0, [
        makeNote("n1", makePitch(pc as PitchClass, 6), 100, "sustain"),
      ]);

      const annotated3 = getAnnotatedNote(ruleset, frame3);
      const annotated6 = getAnnotatedNote(ruleset, frame6);

      expect(annotated3!.visual.palette.primary.h).toBe(annotated6!.visual.palette.primary.h);
    }
  });
});

// ============================================================================
// Invariant 5: Pure Function (Deterministic Output)
// ============================================================================

describe("Invariant: Pure function - deterministic output", () => {
  it("same input produces same output", () => {
    const ruleset1 = new MusicalVisualVocabulary();
    const ruleset2 = new MusicalVisualVocabulary();

    const frame = makeFrame(0, [
      makeNote("consistent-note-id", makePitch(0, 4), 100, "sustain"),
    ]);

    const result1 = ruleset1.annotate(frame);
    const result2 = ruleset2.annotate(frame);

    // Should produce identical annotations
    expect(result1.notes[0].visual.palette.primary.h).toBe(
      result2.notes[0].visual.palette.primary.h
    );
    expect(result1.notes[0].visual.palette.primary.v).toBe(
      result2.notes[0].visual.palette.primary.v
    );
  });

  it("different notes produce different annotations", () => {
    const ruleset = new MusicalVisualVocabulary();

    const frame = makeFrame(0, [
      makeNote("note-a", makePitch(0, 4), 100, "sustain"),
      makeNote("note-b", makePitch(4, 4), 100, "sustain"),
    ]);

    const result = ruleset.annotate(frame);

    // Different pitch classes should produce different hues
    expect(result.notes[0].visual.palette.primary.h).not.toBe(
      result.notes[1].visual.palette.primary.h
    );
  });

  it("annotations are consistent across frames for same note", () => {
    const ruleset = new MusicalVisualVocabulary();
    const noteId = "stable-note";

    const frame1 = makeFrame(0, [
      makeNote(noteId, makePitch(0, 4), 100, "attack"),
    ]);
    const frame2 = makeFrame(50, [
      makeNote(noteId, makePitch(0, 4), 100, "sustain"),
    ]);

    const result1 = ruleset.annotate(frame1);
    const result2 = ruleset.annotate(frame2);

    // Hue should be the same (based on pitch class)
    expect(result1.notes[0].visual.palette.primary.h).toBe(
      result2.notes[0].visual.palette.primary.h
    );
    // Brightness should be the same (based on velocity)
    expect(result1.notes[0].visual.palette.primary.v).toBe(
      result2.notes[0].visual.palette.primary.v
    );
  });
});
