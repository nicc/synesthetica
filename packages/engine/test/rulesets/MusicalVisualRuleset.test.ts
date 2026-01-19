import { describe, it, expect, beforeEach } from "vitest";
import { MusicalVisualRuleset } from "../../src/rulesets/MusicalVisualRuleset";
import type { MusicalFrame, Note, Pitch, PitchClass } from "@synesthetica/contracts";

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
      level: notes.length > 0
        ? notes.reduce((sum, n) => sum + n.velocity, 0) / notes.length / 127
        : 0,
      trend: "stable",
    },
  };
}

describe("MusicalVisualRuleset", () => {
  let ruleset: MusicalVisualRuleset;

  beforeEach(() => {
    ruleset = new MusicalVisualRuleset();
  });

  describe("basic functionality", () => {
    it("returns empty intents for empty notes", () => {
      const frame = makeFrame(0, []);
      const result = ruleset.map(frame);

      expect(result.intents).toHaveLength(0);
      expect(result.t).toBe(0);
    });

    it("generates palette intent for each note", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "sustain"),
      ]);

      const result = ruleset.map(frame);

      const paletteIntents = result.intents.filter(i => i.type === "palette");
      expect(paletteIntents).toHaveLength(1);
    });

    it("generates motion intent for attack phase notes", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "attack"),
      ]);

      const result = ruleset.map(frame);

      const motionIntents = result.intents.filter(i => i.type === "motion");
      // One for the note attack, one for dynamics
      expect(motionIntents.length).toBeGreaterThanOrEqual(2);
    });

    it("does not generate note motion for sustain phase", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "sustain"),
      ]);

      const result = ruleset.map(frame);

      // Should only have dynamics motion, not note motion
      const motionIntents = result.intents.filter(i => i.type === "motion");
      expect(motionIntents).toHaveLength(1);
      expect(motionIntents[0].id).toContain("dynamics");
    });
  });

  describe("pitch to hue mapping", () => {
    it("maps A to red (hue 0) by default", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(9, 4), 100, "sustain"), // A
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      expect(palette?.type).toBe("palette");
      if (palette?.type === "palette") {
        expect(palette.base.h).toBe(0);
      }
    });

    it("maps pitch classes around the color wheel", () => {
      // A (9) = 0°, B (11) = 60°, C (0) = 90°, etc.
      const testCases = [
        { pc: 9, expectedHue: 0 },    // A
        { pc: 11, expectedHue: 60 },  // B (2 steps from A)
        { pc: 0, expectedHue: 90 },   // C (3 steps from A)
      ];

      for (const { pc, expectedHue } of testCases) {
        const frame = makeFrame(100, [
          makeNote("n1", makePitch(pc as PitchClass, 4), 100, "sustain"),
        ]);

        const result = ruleset.map(frame);
        const palette = result.intents.find(i => i.type === "palette");

        if (palette?.type === "palette") {
          expect(palette.base.h).toBe(expectedHue);
        }
      }
    });
  });

  describe("velocity to brightness mapping", () => {
    it("maps max velocity to max brightness", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 127, "sustain"),
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      if (palette?.type === "palette") {
        expect(palette.base.v).toBeCloseTo(1.0, 1);
      }
    });

    it("maps min velocity to min brightness (0.3)", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 0, "sustain"),
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      if (palette?.type === "palette") {
        expect(palette.base.v).toBeCloseTo(0.3, 1);
      }
    });
  });

  describe("phase to stability mapping", () => {
    it("maps attack phase to low stability", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "attack"),
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      if (palette?.type === "palette") {
        expect(palette.stability).toBe(0.3);
      }
    });

    it("maps sustain phase to high stability", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "sustain"),
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      if (palette?.type === "palette") {
        expect(palette.stability).toBe(0.8);
      }
    });

    it("maps release phase to medium stability", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "release", 0, 600, 500),
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      if (palette?.type === "palette") {
        expect(palette.stability).toBe(0.5);
      }
    });
  });

  describe("release alpha calculation", () => {
    it("has full alpha for sustain notes", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "sustain"),
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      if (palette?.type === "palette") {
        expect(palette.base.a).toBe(1);
      }
    });

    it("fades alpha during release phase", () => {
      // Note released at 500ms, now at 750ms (250ms into release)
      const frame = makeFrame(750, [
        makeNote("n1", makePitch(0, 4), 100, "release", 0, 750, 500),
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      if (palette?.type === "palette") {
        // 250ms into 500ms release = 0.5 progress = 0.5 alpha
        expect(palette.base.a).toBeCloseTo(0.5, 1);
      }
    });
  });

  describe("intent IDs", () => {
    it("generates IDs for palette intents", () => {
      const frame = makeFrame(100, [
        makeNote("test-note-1", makePitch(0, 4), 100, "sustain"),
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      expect(palette?.id).toBeDefined();
      expect(palette?.id).toContain("palette");
    });

    it("generates unique IDs for multiple notes", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "sustain"),
        makeNote("n2", makePitch(4, 4), 100, "sustain"),
      ]);

      const result = ruleset.map(frame);
      const ids = result.intents.map(i => i.id);

      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("multiple notes", () => {
    it("generates intents for all notes", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "sustain"),  // C
        makeNote("n2", makePitch(4, 4), 90, "sustain"),   // E
        makeNote("n3", makePitch(7, 4), 80, "sustain"),   // G
      ]);

      const result = ruleset.map(frame);

      // 3 palette intents + 1 dynamics motion
      expect(result.intents).toHaveLength(4);
    });
  });

  describe("uncertainty calculation", () => {
    it("returns 0 uncertainty for confident notes", () => {
      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "sustain"),
      ]);

      const result = ruleset.map(frame);

      expect(result.uncertainty).toBe(0);
    });

    it("returns 0 uncertainty for empty frame", () => {
      const frame = makeFrame(100, []);

      const result = ruleset.map(frame);

      expect(result.uncertainty).toBe(0);
    });
  });

  describe("configuration", () => {
    it("allows custom reference pitch class", () => {
      ruleset = new MusicalVisualRuleset({ referencePc: 0 }); // C

      const frame = makeFrame(100, [
        makeNote("n1", makePitch(0, 4), 100, "sustain"), // C
      ]);

      const result = ruleset.map(frame);
      const palette = result.intents.find(i => i.type === "palette");

      if (palette?.type === "palette") {
        expect(palette.base.h).toBe(0); // C is now reference
      }
    });
  });
});
