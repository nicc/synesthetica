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
  MusicalFrame,
  Note,
  Pitch,
  PitchClass,
  AnnotatedNote,
} from "@synesthetica/contracts";
import { pcToHue } from "@synesthetica/contracts";

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
  return {
    t,
    part: "test-part",
    notes,
    chords: [],
    rhythmicAnalysis: {
      detectedDivision: null,
      onsetDrifts: [],
      stability: 0,
      confidence: 0,
    },
    dynamics: {
      level:
        notes.length > 0
          ? notes.reduce((sum, n) => sum + n.velocity, 0) / notes.length / 127
          : 0,
      trend: "stable",
    },
    prescribedTempo: null,
    prescribedMeter: null,
  };
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

  it("A (reference pitch) maps to hue 0 (red)", () => {
    const frame = makeFrame(0, [makeNote("n1", makePitch(9, 4), 100, "sustain")]);
    const annotated = getAnnotatedNote(ruleset, frame);

    expect(annotated).toBeDefined();
    expect(annotated!.visual.palette.primary.h).toBe(0);
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
    for (let pc = 0; pc < 12; pc++) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(pc as PitchClass, 4), 100, "sustain"),
      ]);
      const annotated = getAnnotatedNote(ruleset, frame);
      const expectedHue = pcToHue(pc as PitchClass, {
        referencePc: 9,
        referenceHue: 0,
        direction: "cw",
      });

      expect(annotated!.visual.palette.primary.h).toBe(expectedHue);
    }
  });

  it("counterclockwise direction inverts hue progression", () => {
    ruleset = new MusicalVisualVocabulary({ hueDirection: "ccw" });

    // B (pc=11) is 2 semitones above A
    // CW: 0 + 2*30 = 60°
    // CCW: 0 - 2*30 = -60 → 300°
    const frame = makeFrame(0, [
      makeNote("n1", makePitch(11, 4), 100, "sustain"),
    ]);
    const annotated = getAnnotatedNote(ruleset, frame);

    expect(annotated!.visual.palette.primary.h).toBe(300);
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

describe("Invariant: Velocity → brightness mapping", () => {
  let ruleset: MusicalVisualVocabulary;

  beforeEach(() => {
    ruleset = new MusicalVisualVocabulary();
  });

  it("higher velocity → higher brightness (monotonic)", () => {
    const velocities = [0, 32, 64, 96, 127];
    let previousBrightness = -1;

    for (const velocity of velocities) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, 4), velocity, "sustain"),
      ]);
      const annotated = getAnnotatedNote(ruleset, frame);

      expect(annotated!.visual.palette.primary.v).toBeGreaterThan(previousBrightness);
      previousBrightness = annotated!.visual.palette.primary.v;
    }
  });

  it("velocity 127 produces brightness near 1.0", () => {
    const frame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 127, "sustain"),
    ]);
    const annotated = getAnnotatedNote(ruleset, frame);

    expect(annotated!.visual.palette.primary.v).toBeCloseTo(1.0, 2);
  });

  it("velocity 0 produces brightness above 0 (visible)", () => {
    const frame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 0, "sustain"),
    ]);
    const annotated = getAnnotatedNote(ruleset, frame);

    // Min brightness is 0.3 per implementation
    expect(annotated!.visual.palette.primary.v).toBeGreaterThan(0);
    expect(annotated!.visual.palette.primary.v).toBeLessThan(0.5);
  });

  it("brightness stays within [0, 1] range for all velocities", () => {
    for (let v = 0; v <= 127; v++) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, 4), v, "sustain"),
      ]);
      const annotated = getAnnotatedNote(ruleset, frame);

      expect(annotated!.visual.palette.primary.v).toBeGreaterThanOrEqual(0);
      expect(annotated!.visual.palette.primary.v).toBeLessThanOrEqual(1);
    }
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

      // Flow should be [-1, 1]
      expect(annotated!.visual.motion.flow).toBeGreaterThanOrEqual(-1);
      expect(annotated!.visual.motion.flow).toBeLessThanOrEqual(1);
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
