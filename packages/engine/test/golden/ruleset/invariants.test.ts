/**
 * Ruleset Invariant Tests
 *
 * Property tests for ruleset invariants. These verify that instrument invariants hold,
 * not exact output values. The ruleset interface may evolve; we test properties.
 *
 * See synesthetica-i60 for specification.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MusicalVisualRuleset } from "../../../src/rulesets/MusicalVisualRuleset";
import type {
  MusicalFrame,
  Note,
  Pitch,
  PitchClass,
  PaletteIntent,
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
    beat: null,
    dynamics: {
      level:
        notes.length > 0
          ? notes.reduce((sum, n) => sum + n.velocity, 0) / notes.length / 127
          : 0,
      trend: "stable",
    },
  };
}

function getPaletteIntent(
  ruleset: MusicalVisualRuleset,
  frame: MusicalFrame
): PaletteIntent | undefined {
  const result = ruleset.map(frame);
  return result.intents.find((i) => i.type === "palette") as
    | PaletteIntent
    | undefined;
}

// ============================================================================
// Invariant 1: Pitch Class → Hue Mapping
// ============================================================================

describe("Invariant: Pitch class → hue mapping", () => {
  let ruleset: MusicalVisualRuleset;

  beforeEach(() => {
    ruleset = new MusicalVisualRuleset();
  });

  it("A (reference pitch) maps to hue 0 (red)", () => {
    const frame = makeFrame(0, [makeNote("n1", makePitch(9, 4), 100, "sustain")]);
    const palette = getPaletteIntent(ruleset, frame);

    expect(palette).toBeDefined();
    expect(palette!.base.h).toBe(0);
  });

  it("all 12 pitch classes map to distinct hues", () => {
    const hues = new Set<number>();

    for (let pc = 0; pc < 12; pc++) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(pc as PitchClass, 4), 100, "sustain"),
      ]);
      const palette = getPaletteIntent(ruleset, frame);
      expect(palette).toBeDefined();
      hues.add(palette!.base.h);
    }

    expect(hues.size).toBe(12);
  });

  it("each semitone step equals 30° hue rotation", () => {
    for (let pc = 0; pc < 12; pc++) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(pc as PitchClass, 4), 100, "sustain"),
      ]);
      const palette = getPaletteIntent(ruleset, frame);
      const expectedHue = pcToHue(pc as PitchClass, {
        referencePc: 9,
        referenceHue: 0,
        direction: "cw",
      });

      expect(palette!.base.h).toBe(expectedHue);
    }
  });

  it("counterclockwise direction inverts hue progression", () => {
    ruleset = new MusicalVisualRuleset({ hueDirection: "ccw" });

    // B (pc=11) is 2 semitones above A
    // CW: 0 + 2*30 = 60°
    // CCW: 0 - 2*30 = -60 → 300°
    const frame = makeFrame(0, [
      makeNote("n1", makePitch(11, 4), 100, "sustain"),
    ]);
    const palette = getPaletteIntent(ruleset, frame);

    expect(palette!.base.h).toBe(300);
  });

  it("custom reference point shifts all hues equally", () => {
    // C (pc=0) as reference at red (0°)
    ruleset = new MusicalVisualRuleset({ referencePc: 0, referenceHue: 0 });

    const frameC = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "sustain"),
    ]);
    const frameD = makeFrame(0, [
      makeNote("n1", makePitch(2, 4), 100, "sustain"),
    ]);

    const paletteC = getPaletteIntent(ruleset, frameC);
    const paletteD = getPaletteIntent(ruleset, frameD);

    expect(paletteC!.base.h).toBe(0); // C = reference
    expect(paletteD!.base.h).toBe(60); // D = 2 semitones = 60°
  });
});

// ============================================================================
// Invariant 2: Velocity → Brightness Mapping
// ============================================================================

describe("Invariant: Velocity → brightness mapping", () => {
  let ruleset: MusicalVisualRuleset;

  beforeEach(() => {
    ruleset = new MusicalVisualRuleset();
  });

  it("higher velocity → higher brightness (monotonic)", () => {
    const velocities = [0, 32, 64, 96, 127];
    let previousBrightness = -1;

    for (const velocity of velocities) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, 4), velocity, "sustain"),
      ]);
      const palette = getPaletteIntent(ruleset, frame);

      expect(palette!.base.v).toBeGreaterThan(previousBrightness);
      previousBrightness = palette!.base.v;
    }
  });

  it("velocity 127 produces brightness near 1.0", () => {
    const frame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 127, "sustain"),
    ]);
    const palette = getPaletteIntent(ruleset, frame);

    expect(palette!.base.v).toBeCloseTo(1.0, 2);
  });

  it("velocity 0 produces brightness above 0 (visible)", () => {
    const frame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 0, "sustain"),
    ]);
    const palette = getPaletteIntent(ruleset, frame);

    // Min brightness is 0.3 per implementation
    expect(palette!.base.v).toBeGreaterThan(0);
    expect(palette!.base.v).toBeLessThan(0.5);
  });

  it("brightness stays within [0, 1] range for all velocities", () => {
    for (let v = 0; v <= 127; v++) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, 4), v, "sustain"),
      ]);
      const palette = getPaletteIntent(ruleset, frame);

      expect(palette!.base.v).toBeGreaterThanOrEqual(0);
      expect(palette!.base.v).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// Invariant 3: Note Phase → Stability Mapping
// ============================================================================

describe("Invariant: Note phase → stability mapping", () => {
  let ruleset: MusicalVisualRuleset;

  beforeEach(() => {
    ruleset = new MusicalVisualRuleset();
  });

  it("attack phase has lower stability than sustain", () => {
    const attackFrame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "attack"),
    ]);
    const sustainFrame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "sustain"),
    ]);

    const attackPalette = getPaletteIntent(ruleset, attackFrame);
    const sustainPalette = getPaletteIntent(ruleset, sustainFrame);

    expect(attackPalette!.stability).toBeLessThan(sustainPalette!.stability);
  });

  it("sustain phase has highest stability", () => {
    const phases: Note["phase"][] = ["attack", "sustain", "release"];
    let maxStability = -1;
    let maxPhase: Note["phase"] | null = null;

    for (const phase of phases) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, 4), 100, phase, 0, 100, phase === "release" ? 50 : null),
      ]);
      const palette = getPaletteIntent(ruleset, frame);

      if (palette!.stability > maxStability) {
        maxStability = palette!.stability;
        maxPhase = phase;
      }
    }

    expect(maxPhase).toBe("sustain");
  });

  it("release phase has intermediate stability", () => {
    const attackFrame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "attack"),
    ]);
    const sustainFrame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "sustain"),
    ]);
    const releaseFrame = makeFrame(0, [
      makeNote("n1", makePitch(0, 4), 100, "release", 0, 100, 50),
    ]);

    const attackStability = getPaletteIntent(ruleset, attackFrame)!.stability;
    const sustainStability = getPaletteIntent(ruleset, sustainFrame)!.stability;
    const releaseStability = getPaletteIntent(ruleset, releaseFrame)!.stability;

    expect(releaseStability).toBeGreaterThan(attackStability);
    expect(releaseStability).toBeLessThan(sustainStability);
  });

  it("stability values are within [0, 1] range", () => {
    const phases: Note["phase"][] = ["attack", "sustain", "release"];

    for (const phase of phases) {
      const frame = makeFrame(0, [
        makeNote("n1", makePitch(0, 4), 100, phase, 0, 100, phase === "release" ? 50 : null),
      ]);
      const palette = getPaletteIntent(ruleset, frame);

      expect(palette!.stability).toBeGreaterThanOrEqual(0);
      expect(palette!.stability).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// Invariant 4: Octave Equivalence (Same Hue)
// ============================================================================

describe("Invariant: Octave equivalence for hue", () => {
  let ruleset: MusicalVisualRuleset;

  beforeEach(() => {
    ruleset = new MusicalVisualRuleset();
  });

  it("same pitch class in different octaves produces same hue", () => {
    const octaves = [2, 3, 4, 5, 6];

    for (const pc of [0, 4, 7, 9] as PitchClass[]) {
      const hues: number[] = [];

      for (const octave of octaves) {
        const frame = makeFrame(0, [
          makeNote("n1", makePitch(pc, octave), 100, "sustain"),
        ]);
        const palette = getPaletteIntent(ruleset, frame);
        hues.push(palette!.base.h);
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

    const paletteC4 = getPaletteIntent(ruleset, frameC4);
    const paletteC5 = getPaletteIntent(ruleset, frameC5);

    expect(paletteC4!.base.h).toBe(paletteC5!.base.h);
  });

  it("all pitch classes maintain octave equivalence", () => {
    for (let pc = 0; pc < 12; pc++) {
      const frame3 = makeFrame(0, [
        makeNote("n1", makePitch(pc as PitchClass, 3), 100, "sustain"),
      ]);
      const frame6 = makeFrame(0, [
        makeNote("n1", makePitch(pc as PitchClass, 6), 100, "sustain"),
      ]);

      const palette3 = getPaletteIntent(ruleset, frame3);
      const palette6 = getPaletteIntent(ruleset, frame6);

      expect(palette3!.base.h).toBe(palette6!.base.h);
    }
  });
});

// ============================================================================
// Invariant 5: Deterministic Intent IDs
// ============================================================================

describe("Invariant: Deterministic intent IDs", () => {
  it("same NoteId produces same VisualIntentId", () => {
    const ruleset1 = new MusicalVisualRuleset();
    const ruleset2 = new MusicalVisualRuleset();

    const frame = makeFrame(0, [
      makeNote("consistent-note-id", makePitch(0, 4), 100, "sustain"),
    ]);

    const result1 = ruleset1.map(frame);
    const result2 = ruleset2.map(frame);

    const palette1 = result1.intents.find((i) => i.type === "palette");
    const palette2 = result2.intents.find((i) => i.type === "palette");

    expect(palette1!.id).toBe(palette2!.id);
  });

  it("intent ID contains note ID for correlation", () => {
    const ruleset = new MusicalVisualRuleset();
    const noteId = "test-note-123";

    const frame = makeFrame(0, [
      makeNote(noteId, makePitch(0, 4), 100, "sustain"),
    ]);

    const result = ruleset.map(frame);
    const palette = result.intents.find((i) => i.type === "palette");

    expect(palette!.id).toContain(noteId);
  });

  it("different NoteIds produce different VisualIntentIds", () => {
    const ruleset = new MusicalVisualRuleset();

    const frame = makeFrame(0, [
      makeNote("note-a", makePitch(0, 4), 100, "sustain"),
      makeNote("note-b", makePitch(4, 4), 100, "sustain"),
    ]);

    const result = ruleset.map(frame);
    const palettes = result.intents.filter((i) => i.type === "palette");

    expect(palettes[0].id).not.toBe(palettes[1].id);
  });

  it("intent IDs are stable across frames for same note", () => {
    const ruleset = new MusicalVisualRuleset();
    const noteId = "stable-note";

    const frame1 = makeFrame(0, [
      makeNote(noteId, makePitch(0, 4), 100, "attack"),
    ]);
    const frame2 = makeFrame(50, [
      makeNote(noteId, makePitch(0, 4), 100, "sustain"),
    ]);

    const result1 = ruleset.map(frame1);
    const result2 = ruleset.map(frame2);

    const palette1 = result1.intents.find((i) => i.type === "palette");
    const palette2 = result2.intents.find((i) => i.type === "palette");

    expect(palette1!.id).toBe(palette2!.id);
  });
});
