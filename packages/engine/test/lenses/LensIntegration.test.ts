/**
 * Lens Integration Tests
 *
 * Tests the annotated musical frame architecture by:
 * 1. Running lenses (rhythm, chord) on mock data
 * 2. Verifying each lens produces coherent output
 * 3. Compositing outputs and evaluating the result
 *
 * Success criteria:
 * - Each lens produces valid SceneFrame with expected entity types
 * - Lenses correctly filter (rhythm ignores chords, chord ignores beats)
 * - Both respect visual annotations (palette colors are used)
 * - Composed output doesn't degrade into visual mud
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RhythmLens } from "../../src/lenses/RhythmLens";
import { TestChordProgressionLens } from "../../src/lenses/TestChordProgressionLens";
import { IdentityCompositor } from "../../src/stubs/IdentityCompositor";
import { mockFrameSequence, frame1, frame3 } from "../_fixtures/frames/annotated-sequences";
import type { LensContext, SceneFrame } from "@synesthetica/contracts";

describe("Lens Integration", () => {
  const ctx: LensContext = {
    canvasSize: { width: 1920, height: 1080 },
    rngSeed: 12345,
    part: "main",
  };

  describe("TestChordProgressionLens", () => {
    let lens: TestChordProgressionLens;

    beforeEach(() => {
      lens = new TestChordProgressionLens();
      lens.init(ctx);
    });

    it("produces entities for chords", () => {
      const scene = lens.update(frame1, null);

      expect(scene.t).toBe(0);
      expect(scene.entities.length).toBeGreaterThan(0);

      // Should have chord glow for C major
      const chordGlow = scene.entities.find(
        (e) => e.data?.type === "chord-glow"
      );
      expect(chordGlow).toBeDefined();
      expect(chordGlow!.data!.label).toBe("Cmaj");
    });

    it("ignores rhythm information", () => {
      const scene = lens.update(frame1, null);

      // Frame 1 has rhythm information
      // But chord lens should produce no rhythm-related entities
      const rhythmEntities = scene.entities.filter(
        (e) => e.data?.type === "beat-line" ||
               e.data?.type === "bar-line" ||
               e.data?.type === "division-tick" ||
               e.data?.type === "drift-ring" ||
               e.data?.type === "downbeat-glow"
      );
      expect(rhythmEntities.length).toBe(0);
    });

    it("renders notes belonging to chords as particles", () => {
      const scene = lens.update(frame1, null);

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
        previousScene = lens.update(mockFrameSequence[i], previousScene);
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
      const scene = lens.update(mockFrameSequence[3], null);

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
      const scene = lens.update(frame3, null);

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
    let rhythmLens: RhythmLens;
    let chordLens: TestChordProgressionLens;
    let compositor: IdentityCompositor;

    beforeEach(() => {
      rhythmLens = new RhythmLens();
      chordLens = new TestChordProgressionLens();
      compositor = new IdentityCompositor();

      rhythmLens.init(ctx);
      chordLens.init(ctx);
    });

    it("composes both lens outputs", () => {
      const rhythmScene = rhythmLens.update(frame1, null);
      const chordScene = chordLens.update(frame1, null);

      const composed = compositor.compose([rhythmScene, chordScene]);

      // Should have entities from both lenses
      expect(composed.entities.length).toBe(
        rhythmScene.entities.length + chordScene.entities.length
      );

      // Should have now-line from rhythm lens
      const nowLine = composed.entities.find(
        (e) => e.data?.type === "now-line"
      );
      expect(nowLine).toBeDefined();

      // Should have chord glow from chord lens
      const chordGlow = composed.entities.find(
        (e) => e.data?.type === "chord-glow"
      );
      expect(chordGlow).toBeDefined();
    });

    it("maintains entity uniqueness across lenses", () => {
      const rhythmScene = rhythmLens.update(frame1, null);
      const chordScene = chordLens.update(frame1, null);

      const composed = compositor.compose([rhythmScene, chordScene]);

      // All entity IDs should be unique
      const ids = composed.entities.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("processes full sequence with both lenses", () => {
      let prevRhythm: SceneFrame | null = null;
      let prevChord: SceneFrame | null = null;

      for (const frame of mockFrameSequence) {
        const rhythmScene = rhythmLens.update(frame, prevRhythm);
        const chordScene = chordLens.update(frame, prevChord);
        const composed = compositor.compose([rhythmScene, chordScene]);

        expect(composed.entities.length).toBeGreaterThan(0);
        expect(composed.diagnostics).toEqual([]);

        prevRhythm = rhythmScene;
        prevChord = chordScene;
      }
    });
  });
});
