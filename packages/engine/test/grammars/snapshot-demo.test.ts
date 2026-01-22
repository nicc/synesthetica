/**
 * Snapshot Demo Test
 *
 * Demonstrates the SVG snapshot renderer and metrics extraction.
 * Run with GENERATE_SNAPSHOTS=1 to write SVG files for visual review.
 */

import { describe, it, expect } from "vitest";
import { TestRhythmGrammar } from "../../src/grammars/TestRhythmGrammar";
import { TestChordProgressionGrammar } from "../../src/grammars/TestChordProgressionGrammar";
import { frame1, frame3 } from "../_fixtures/frames/annotated-sequences";
import {
  maybeWriteSnapshot,
  extractMetrics,
  formatMetrics,
} from "../_harness/svg-snapshot";
import type { GrammarContext } from "@synesthetica/contracts";

describe("Snapshot Demo", () => {
  const ctx: GrammarContext = {
    canvasSize: { width: 1920, height: 1080 },
    rngSeed: 12345,
    part: "main",
  };

  describe("SVG rendering", () => {
    it("renders rhythm grammar output", () => {
      const grammar = new TestRhythmGrammar();
      grammar.init(ctx);

      const scene = grammar.update(frame1, null);
      const svg = maybeWriteSnapshot("rhythm-frame1", scene);

      // SVG should be valid and contain entities
      expect(svg).toContain("<?xml");
      expect(svg).toContain("<svg");
      expect(svg).toContain("entities");
    });

    it("renders chord grammar output", () => {
      const grammar = new TestChordProgressionGrammar();
      grammar.init(ctx);

      const scene = grammar.update(frame1, null);
      const svg = maybeWriteSnapshot("chord-frame1", scene);

      expect(svg).toContain("<?xml");
      expect(svg).toContain("<svg");
    });

    it("renders chord transition (frame 3)", () => {
      const grammar = new TestChordProgressionGrammar();
      grammar.init(ctx);

      const scene = grammar.update(frame3, null);
      const svg = maybeWriteSnapshot("chord-frame3-transition", scene);

      // Frame 3 has both decaying and active chords
      expect(svg).toContain("chord-glow");
    });
  });

  describe("Metrics extraction", () => {
    it("extracts metrics from rhythm grammar", () => {
      const grammar = new TestRhythmGrammar();
      grammar.init(ctx);

      const scene = grammar.update(frame1, null);
      const metrics = extractMetrics(scene);

      // Frame 1 has 3 notes, should produce onset markers
      expect(metrics.entityCount).toBeGreaterThan(0);
      expect(metrics.byType["onset-marker"]).toBe(3);

      // Should have beat-line (tier 3 data)
      expect(metrics.byType["beat-line"]).toBeGreaterThan(0);

      console.log("\nRhythm Grammar Metrics (frame1):\n" + formatMetrics(metrics));
    });

    it("extracts metrics from chord grammar", () => {
      const grammar = new TestChordProgressionGrammar();
      grammar.init(ctx);

      const scene = grammar.update(frame1, null);
      const metrics = extractMetrics(scene);

      // Frame 1 has C major chord
      expect(metrics.byType["chord-glow"]).toBe(1);

      // Notes belonging to chord should produce chord-note particles
      expect(metrics.byType["chord-note"]).toBe(3);

      console.log("\nChord Grammar Metrics (frame1):\n" + formatMetrics(metrics));
    });

    it("shows position distribution", () => {
      const grammar = new TestRhythmGrammar();
      grammar.init(ctx);

      const scene = grammar.update(frame1, null);
      const metrics = extractMetrics(scene);

      // Entities should be distributed across the canvas, not all at center
      console.log("\nPosition stats:");
      console.log(`  Mean: (${metrics.positions.meanX.toFixed(3)}, ${metrics.positions.meanY.toFixed(3)})`);
      console.log(`  Std:  (${metrics.positions.stdX.toFixed(3)}, ${metrics.positions.stdY.toFixed(3)})`);

      // At least some spread expected
      expect(
        metrics.positions.stdX > 0 || metrics.positions.stdY > 0
      ).toBe(true);
    });
  });
});
