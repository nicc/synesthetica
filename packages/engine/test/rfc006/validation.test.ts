/**
 * RFC 006 Validation Test
 *
 * Tests the annotated musical frame architecture by:
 * 1. Running two toy grammars (rhythm-focused, chord-focused) on mock data
 * 2. Verifying each grammar produces coherent output
 * 3. Compositing both outputs and evaluating the result
 *
 * Success criteria:
 * - Each grammar produces valid SceneFrame with expected entity types
 * - Grammars correctly filter (rhythm ignores chords, chord ignores beats)
 * - Both respect visual annotations (palette colors are used)
 * - Composed output doesn't degrade into visual mud
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TestRhythmGrammar } from "../../src/grammars/TestRhythmGrammar";
import { TestChordProgressionGrammar } from "../../src/grammars/TestChordProgressionGrammar";
import { IdentityCompositor } from "../../src/stubs/IdentityCompositor";
import { mockFrameSequence, frame1, frame3 } from "./mock-data";
import type { GrammarContext, SceneFrame, Entity } from "@synesthetica/contracts";

describe("RFC 006 Validation", () => {
  const ctx: GrammarContext = {
    canvasSize: { width: 1920, height: 1080 },
    rngSeed: 12345,
    part: "main",
  };

  describe("TestRhythmGrammar", () => {
    let grammar: TestRhythmGrammar;

    beforeEach(() => {
      grammar = new TestRhythmGrammar();
      grammar.init(ctx);
    });

    it("produces entities for notes and beats", () => {
      const scene = grammar.update(frame1, null);

      expect(scene.t).toBe(0);
      expect(scene.entities.length).toBeGreaterThan(0);

      // Should have beat pulse
      const beatPulse = scene.entities.find(
        (e) => e.data?.type === "beat-pulse"
      );
      expect(beatPulse).toBeDefined();
      expect(beatPulse!.data!.isDownbeat).toBe(true);

      // Should have note markers for all 3 notes
      const noteMarkers = scene.entities.filter(
        (e) => e.data?.type === "timing-marker"
      );
      expect(noteMarkers.length).toBe(3);
    });

    it("ignores chords entirely", () => {
      const scene = grammar.update(frame3, null);

      // Frame 3 has 2 chords (C major decaying, A minor active)
      // But rhythm grammar should produce no chord-related entities
      const chordEntities = scene.entities.filter(
        (e) =>
          e.data?.type === "chord-glow" ||
          e.data?.type === "chord-history"
      );
      expect(chordEntities.length).toBe(0);

      // Should still have note markers though (6 notes in frame 3)
      const noteMarkers = scene.entities.filter(
        (e) => e.data?.type === "timing-marker"
      );
      expect(noteMarkers.length).toBe(6);
    });

    it("uses palette colors from annotations", () => {
      const scene = grammar.update(frame1, null);

      const noteMarker = scene.entities.find(
        (e) => e.data?.type === "timing-marker"
      );
      expect(noteMarker).toBeDefined();

      // Frame 1 notes have warm palette (orange hue ~30)
      expect(noteMarker!.style.color).toBeDefined();
      expect(noteMarker!.style.color!.h).toBeCloseTo(30, 0);
    });

    it("processes full sequence without errors", () => {
      let previousScene: SceneFrame | null = null;

      for (const frame of mockFrameSequence) {
        const scene = grammar.update(frame, previousScene);
        expect(scene.entities).toBeDefined();
        expect(scene.diagnostics).toEqual([]);
        previousScene = scene;
      }
    });
  });

  describe("TestChordProgressionGrammar", () => {
    let grammar: TestChordProgressionGrammar;

    beforeEach(() => {
      grammar = new TestChordProgressionGrammar();
      grammar.init(ctx);
    });

    it("produces entities for chords", () => {
      const scene = grammar.update(frame1, null);

      expect(scene.t).toBe(0);
      expect(scene.entities.length).toBeGreaterThan(0);

      // Should have chord glow for C major
      const chordGlow = scene.entities.find(
        (e) => e.data?.type === "chord-glow"
      );
      expect(chordGlow).toBeDefined();
      expect(chordGlow!.data!.label).toBe("Cmaj");
    });

    it("ignores beat information", () => {
      const scene = grammar.update(frame1, null);

      // Frame 1 has beat information
      // But chord grammar should produce no beat-related entities
      const beatEntities = scene.entities.filter(
        (e) => e.data?.type === "beat-pulse"
      );
      expect(beatEntities.length).toBe(0);
    });

    it("renders notes belonging to chords as particles", () => {
      const scene = grammar.update(frame1, null);

      // Frame 1 has 3 notes all belonging to C major chord
      const noteParticles = scene.entities.filter(
        (e) => e.data?.type === "chord-note"
      );
      expect(noteParticles.length).toBe(3);
    });

    it("builds chord history over time", () => {
      // Process frames 1-4 to build history
      let previousScene: SceneFrame | null = null;

      for (let i = 0; i < 4; i++) {
        previousScene = grammar.update(mockFrameSequence[i], previousScene);
      }

      // By frame 4, we should have history entries for C major and A minor
      const historyEntities = previousScene!.entities.filter(
        (e) => e.data?.type === "chord-history"
      );

      // Should have at least 2 history entries
      expect(historyEntities.length).toBeGreaterThanOrEqual(2);
    });

    it("uses palette colors from annotations", () => {
      // Process frame 4 which has A minor (cool palette)
      const scene = grammar.update(mockFrameSequence[3], null);

      const chordGlow = scene.entities.find(
        (e) => e.data?.type === "chord-glow"
      );
      expect(chordGlow).toBeDefined();

      // A minor has cool palette (blue hue ~220)
      expect(chordGlow!.style.color).toBeDefined();
      expect(chordGlow!.style.color!.h).toBeCloseTo(220, 0);
    });

    it("handles chord transitions (frame 3)", () => {
      // Frame 3 has both C major (decaying) and A minor (active)
      const scene = grammar.update(frame3, null);

      const chordGlows = scene.entities.filter(
        (e) => e.data?.type === "chord-glow"
      );

      // Should have 2 glows - one active, one decaying
      expect(chordGlows.length).toBe(2);

      const activeGlow = chordGlows.find((e) => e.data!.phase === "active");
      const decayingGlow = chordGlows.find((e) => e.data!.phase === "decaying");

      expect(activeGlow).toBeDefined();
      expect(decayingGlow).toBeDefined();
      expect(activeGlow!.data!.label).toBe("Am");
      expect(decayingGlow!.data!.label).toBe("Cmaj");
    });
  });

  describe("Composition", () => {
    let rhythmGrammar: TestRhythmGrammar;
    let chordGrammar: TestChordProgressionGrammar;
    let compositor: IdentityCompositor;

    beforeEach(() => {
      rhythmGrammar = new TestRhythmGrammar();
      chordGrammar = new TestChordProgressionGrammar();
      compositor = new IdentityCompositor();

      rhythmGrammar.init(ctx);
      chordGrammar.init(ctx);
    });

    it("composes both grammar outputs", () => {
      const rhythmScene = rhythmGrammar.update(frame1, null);
      const chordScene = chordGrammar.update(frame1, null);

      const composed = compositor.compose([rhythmScene, chordScene]);

      // Should have entities from both grammars
      expect(composed.entities.length).toBe(
        rhythmScene.entities.length + chordScene.entities.length
      );

      // Should have beat pulse from rhythm grammar
      const beatPulse = composed.entities.find(
        (e) => e.data?.type === "beat-pulse"
      );
      expect(beatPulse).toBeDefined();

      // Should have chord glow from chord grammar
      const chordGlow = composed.entities.find(
        (e) => e.data?.type === "chord-glow"
      );
      expect(chordGlow).toBeDefined();
    });

    it("maintains entity uniqueness across grammars", () => {
      const rhythmScene = rhythmGrammar.update(frame1, null);
      const chordScene = chordGrammar.update(frame1, null);

      const composed = compositor.compose([rhythmScene, chordScene]);

      // All entity IDs should be unique
      const ids = composed.entities.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("processes full sequence with both grammars", () => {
      let prevRhythm: SceneFrame | null = null;
      let prevChord: SceneFrame | null = null;

      for (const frame of mockFrameSequence) {
        const rhythmScene = rhythmGrammar.update(frame, prevRhythm);
        const chordScene = chordGrammar.update(frame, prevChord);
        const composed = compositor.compose([rhythmScene, chordScene]);

        expect(composed.entities.length).toBeGreaterThan(0);
        expect(composed.diagnostics).toEqual([]);

        prevRhythm = rhythmScene;
        prevChord = chordScene;
      }
    });

    it("produces non-overlapping entity types", () => {
      // Run full sequence and check that grammars produce distinct entity types
      let prevRhythm: SceneFrame | null = null;
      let prevChord: SceneFrame | null = null;

      for (const frame of mockFrameSequence) {
        const rhythmScene = rhythmGrammar.update(frame, prevRhythm);
        const chordScene = chordGrammar.update(frame, prevChord);

        // Get entity types from each grammar
        const rhythmTypes = new Set(
          rhythmScene.entities.map((e) => e.data?.type as string)
        );
        const chordTypes = new Set(
          chordScene.entities.map((e) => e.data?.type as string)
        );

        // Entity types should not overlap (different grammars produce different things)
        const overlap = [...rhythmTypes].filter((t) => chordTypes.has(t));
        expect(overlap.length).toBe(0);

        prevRhythm = rhythmScene;
        prevChord = chordScene;
      }
    });
  });

  describe("Annotation Respect", () => {
    it("both grammars use warm palette for major chords", () => {
      const rhythmGrammar = new TestRhythmGrammar();
      const chordGrammar = new TestChordProgressionGrammar();

      rhythmGrammar.init(ctx);
      chordGrammar.init(ctx);

      // Frame 1 has C major with warm palette
      const rhythmScene = rhythmGrammar.update(frame1, null);
      const chordScene = chordGrammar.update(frame1, null);

      // Rhythm grammar: note markers should be orange
      const noteMarker = rhythmScene.entities.find(
        (e) => e.data?.type === "timing-marker"
      );
      expect(noteMarker!.style.color!.h).toBeCloseTo(30, 5); // Orange

      // Chord grammar: chord glow should be orange
      const chordGlow = chordScene.entities.find(
        (e) => e.data?.type === "chord-glow"
      );
      expect(chordGlow!.style.color!.h).toBeCloseTo(30, 5); // Orange
    });

    it("both grammars use cool palette for minor chords", () => {
      const rhythmGrammar = new TestRhythmGrammar();
      const chordGrammar = new TestChordProgressionGrammar();

      rhythmGrammar.init(ctx);
      chordGrammar.init(ctx);

      // Frame 4 has A minor with cool palette
      const rhythmScene = rhythmGrammar.update(mockFrameSequence[3], null);
      const chordScene = chordGrammar.update(mockFrameSequence[3], null);

      // Rhythm grammar: note markers should be blue
      const noteMarker = rhythmScene.entities.find(
        (e) => e.data?.type === "timing-marker"
      );
      expect(noteMarker!.style.color!.h).toBeCloseTo(220, 5); // Blue

      // Chord grammar: chord glow should be blue
      const chordGlow = chordScene.entities.find(
        (e) => e.data?.type === "chord-glow"
      );
      expect(chordGlow!.style.color!.h).toBeCloseTo(220, 5); // Blue
    });
  });
});
