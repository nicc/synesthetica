/**
 * Web App Smoke Tests
 *
 * Basic tests to verify the web-app package is correctly configured
 * and can import its dependencies.
 *
 * Note: Most web-app functionality requires browser APIs (Web MIDI, Canvas)
 * and is better tested via manual testing or browser-based e2e tests.
 * These tests verify the package structure and imports work correctly.
 */

import { describe, it, expect } from "vitest";

describe("Web App Smoke Tests", () => {
  describe("dependency imports", () => {
    it("can import from @synesthetica/contracts", async () => {
      const contracts = await import("@synesthetica/contracts");
      expect(contracts).toBeDefined();
      expect(typeof contracts.pcToHue).toBe("function");
    });

    it("can import from @synesthetica/engine", async () => {
      const engine = await import("@synesthetica/engine");
      expect(engine).toBeDefined();
      expect(engine.VisualPipeline).toBeDefined();
      expect(engine.NoteTrackingStabilizer).toBeDefined();
      expect(engine.ChordDetectionStabilizer).toBeDefined();
      expect(engine.BeatDetectionStabilizer).toBeDefined();
      expect(engine.MusicalVisualRuleset).toBeDefined();
      expect(engine.TestRhythmGrammar).toBeDefined();
      expect(engine.TestChordProgressionGrammar).toBeDefined();
      expect(engine.Canvas2DRenderer).toBeDefined();
    });

    it("can import from @synesthetica/adapters", async () => {
      const adapters = await import("@synesthetica/adapters");
      expect(adapters).toBeDefined();
      expect(adapters.RawMidiAdapter).toBeDefined();
    });
  });

  describe("engine component instantiation", () => {
    it("can create a VisualPipeline", async () => {
      const { VisualPipeline } = await import("@synesthetica/engine");

      const pipeline = new VisualPipeline({
        canvasSize: { width: 800, height: 600 },
        rngSeed: 12345,
        partId: "test",
      });

      expect(pipeline).toBeDefined();
      pipeline.dispose();
    });

    it("can create stabilizers", async () => {
      const {
        NoteTrackingStabilizer,
        ChordDetectionStabilizer,
        BeatDetectionStabilizer,
      } = await import("@synesthetica/engine");

      const noteStabilizer = new NoteTrackingStabilizer({ partId: "test" });
      const chordStabilizer = new ChordDetectionStabilizer({ partId: "test" });
      const beatStabilizer = new BeatDetectionStabilizer({ partId: "test" });

      expect(noteStabilizer).toBeDefined();
      expect(chordStabilizer).toBeDefined();
      expect(beatStabilizer).toBeDefined();

      noteStabilizer.dispose();
      chordStabilizer.dispose();
      beatStabilizer.dispose();
    });

    it("can create a ruleset", async () => {
      const { MusicalVisualRuleset } = await import("@synesthetica/engine");

      const ruleset = new MusicalVisualRuleset();
      expect(ruleset).toBeDefined();
      expect(ruleset.id).toBe("musical-visual");
    });

    it("can create grammars", async () => {
      const { TestRhythmGrammar, TestChordProgressionGrammar } = await import(
        "@synesthetica/engine"
      );

      const rhythmGrammar = new TestRhythmGrammar();
      const chordGrammar = new TestChordProgressionGrammar();

      expect(rhythmGrammar).toBeDefined();
      expect(rhythmGrammar.id).toBe("test-rhythm-grammar");

      expect(chordGrammar).toBeDefined();
      expect(chordGrammar.id).toBe("test-chord-progression-grammar");

      rhythmGrammar.dispose();
      chordGrammar.dispose();
    });
  });

  describe("pcToHue function", () => {
    it("maps pitch classes to hues", async () => {
      const { pcToHue } = await import("@synesthetica/contracts");

      // Default invariant: A=red, clockwise
      const defaultInvariant = { referencePc: 9, referenceHue: 0, direction: "cw" as const };

      // A (pc=9) should map to hue 0 (red) with default settings
      const aHue = pcToHue(9, defaultInvariant);
      expect(aHue).toBe(0);

      // C (pc=0) should be 90° from A (3 semitones * 30°)
      const cHue = pcToHue(0, defaultInvariant);
      expect(cHue).toBe(90);
    });
  });
});
