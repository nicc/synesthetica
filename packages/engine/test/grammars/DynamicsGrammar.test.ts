import { describe, it, expect, beforeEach } from "vitest";
import { DynamicsGrammar } from "../../src/grammars/DynamicsGrammar";
import type {
  AnnotatedMusicalFrame,
  GrammarContext,
  DynamicsState,
} from "@synesthetica/contracts";

const ctx: GrammarContext = {
  canvasSize: { width: 800, height: 600 },
  rngSeed: 12345,
  part: "main",
};

function createTestFrame(
  t: number,
  dynamics: DynamicsState,
  opts?: { prescribedTempo?: number | null; prescribedMeter?: { beatsPerBar: number; beatUnit: number } | null },
): AnnotatedMusicalFrame {
  return {
    t,
    part: "main",
    notes: [],
    chords: [],
    progression: [],
    harmonicContext: { tension: 0, keyAware: false, detectedKey: null },
    rhythm: {
      analysis: {
        detectedDivision: null,
        onsetDrifts: [],
        stability: 0,
        confidence: 0,
      },
      visual: {
        palette: { id: "rhythm", primary: { h: 0, s: 0, v: 0.5, a: 1 } },
        texture: { id: "rhythm", grain: 0, smoothness: 1, density: 0 },
        motion: { jitter: 0, pulse: 0, flow: 0 },
        uncertainty: 0,
      },
      prescribedTempo: opts?.prescribedTempo ?? null,
      prescribedMeter: opts?.prescribedMeter ?? null,
    },
    bars: [],
    phrases: [],
    dynamics: {
      dynamics,
      visual: {
        palette: { id: "dynamics", primary: { h: 0, s: 0, v: 0.5, a: 1 } },
        texture: { id: "dynamics", grain: 0.1, smoothness: 0.8, density: 0.5 },
        motion: { jitter: 0.05, pulse: 0.5, flow: 0 },
        uncertainty: 0.1,
      },
    },
  };
}

const EMPTY_DYNAMICS: DynamicsState = {
  events: [],
  level: 0,
  trend: "stable",
  contour: [],
  range: { min: 0, max: 0, variance: 0 },
};

describe("DynamicsGrammar", () => {
  let grammar: DynamicsGrammar;

  beforeEach(() => {
    grammar = new DynamicsGrammar();
    grammar.init(ctx);
  });

  describe("entity production", () => {
    it("produces no entities with empty dynamics", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);

      expect(scene.entities).toHaveLength(0);
    });

    it("does not produce contour with fewer than 2 points", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        contour: [{ t: 500, level: 0.5 }],
      };
      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      expect(scene.entities).toHaveLength(0);
    });

    it("produces contour entity when contour data exists", () => {
      const dynamics: DynamicsState = {
        events: [
          { t: 500, intensity: 0.5 },
          { t: 800, intensity: 0.7 },
        ],
        level: 0.6,
        trend: "rising",
        contour: [
          { t: 500, level: 0.5 },
          { t: 800, level: 0.6 },
        ],
        range: { min: 0.5, max: 0.7, variance: 0.01 },
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const contourEntity = scene.entities.find(
        (e) => e.data?.type === "dynamics-contour",
      );
      expect(contourEntity).toBeDefined();
      expect(contourEntity!.kind).toBe("glyph");

      const points = contourEntity!.data?.points as Array<{
        x: number;
        y: number;
      }>;
      expect(points.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("gap-based line breaking", () => {
    it("breaks into separate segments when gap exceeds 4s (no BPM)", () => {
      const dynamics: DynamicsState = {
        events: [
          { t: 100, intensity: 0.5 },
          { t: 200, intensity: 0.6 },
          { t: 5000, intensity: 0.7 },
          { t: 5100, intensity: 0.8 },
        ],
        level: 0.8,
        trend: "rising",
        contour: [
          { t: 100, level: 0.5 },
          { t: 200, level: 0.55 },
          // gap > 4000ms
          { t: 5000, level: 0.7 },
          { t: 5100, level: 0.75 },
        ],
        range: { min: 0.5, max: 0.8, variance: 0.01 },
      };

      const frame = createTestFrame(6000, dynamics);
      const scene = grammar.update(frame, null);

      const contourEntities = scene.entities.filter(
        (e) => e.data?.type === "dynamics-contour",
      );
      expect(contourEntities).toHaveLength(2);
    });

    it("keeps contiguous line when gap is under threshold", () => {
      const dynamics: DynamicsState = {
        events: [
          { t: 100, intensity: 0.5 },
          { t: 1000, intensity: 0.6 },
          { t: 2000, intensity: 0.7 },
        ],
        level: 0.7,
        trend: "rising",
        contour: [
          { t: 100, level: 0.5 },
          { t: 1000, level: 0.55 },
          { t: 2000, level: 0.65 },
        ],
        range: { min: 0.5, max: 0.7, variance: 0.01 },
      };

      const frame = createTestFrame(3000, dynamics);
      const scene = grammar.update(frame, null);

      const contourEntities = scene.entities.filter(
        (e) => e.data?.type === "dynamics-contour",
      );
      expect(contourEntities).toHaveLength(1);
    });

    it("uses bar duration as gap threshold when BPM is prescribed", () => {
      // 120 BPM, 4/4 → one bar = 2000ms
      const dynamics: DynamicsState = {
        events: [
          { t: 100, intensity: 0.5 },
          { t: 200, intensity: 0.6 },
          { t: 3000, intensity: 0.7 },
          { t: 3100, intensity: 0.8 },
        ],
        level: 0.8,
        trend: "rising",
        contour: [
          { t: 100, level: 0.5 },
          { t: 200, level: 0.55 },
          // gap = 2800ms > 2000ms (one bar at 120 BPM 4/4)
          { t: 3000, level: 0.7 },
          { t: 3100, level: 0.75 },
        ],
        range: { min: 0.5, max: 0.8, variance: 0.01 },
      };

      const frame = createTestFrame(4000, dynamics, {
        prescribedTempo: 120,
        prescribedMeter: { beatsPerBar: 4, beatUnit: 4 },
      });
      const scene = grammar.update(frame, null);

      const contourEntities = scene.entities.filter(
        (e) => e.data?.type === "dynamics-contour",
      );
      expect(contourEntities).toHaveLength(2);
    });
  });

  describe("entity ID stability", () => {
    it("produces stable segment IDs across frames", () => {
      const dynamics: DynamicsState = {
        events: [{ t: 500, intensity: 0.5 }],
        level: 0.5,
        trend: "stable",
        contour: [
          { t: 500, level: 0.5 },
          { t: 600, level: 0.5 },
        ],
        range: { min: 0.5, max: 0.5, variance: 0 },
      };

      const frame1 = createTestFrame(1000, dynamics);
      const scene1 = grammar.update(frame1, null);

      const frame2 = createTestFrame(1100, dynamics);
      const scene2 = grammar.update(frame2, scene1);

      const ids1 = scene1.entities.map((e) => e.id).sort();
      const ids2 = scene2.entities.map((e) => e.id).sort();

      expect(ids1).toEqual(ids2);
    });
  });

  describe("positioning", () => {
    it("contour points are within the strip area (y: 0.0 to 0.24)", () => {
      const dynamics: DynamicsState = {
        events: [
          { t: 500, intensity: 1.0 },
          { t: 600, intensity: 0.0 },
        ],
        level: 0.5,
        trend: "stable",
        contour: [
          { t: 500, level: 1.0 },
          { t: 600, level: 0.0 },
        ],
        range: { min: 0.0, max: 1.0, variance: 0.1 },
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const contourEntity = scene.entities.find(
        (e) => e.data?.type === "dynamics-contour",
      );
      const points = contourEntity!.data?.points as Array<{ x: number; y: number }>;

      for (const p of points) {
        expect(p.y).toBeGreaterThanOrEqual(0.0);
        expect(p.y).toBeLessThanOrEqual(0.24);
      }
    });

    it("louder levels produce lower y values (higher on screen)", () => {
      const dynamics: DynamicsState = {
        events: [
          { t: 500, intensity: 0.9 },
          { t: 600, intensity: 0.1 },
        ],
        level: 0.5,
        trend: "stable",
        contour: [
          { t: 500, level: 0.9 },
          { t: 600, level: 0.1 },
        ],
        range: { min: 0.1, max: 0.9, variance: 0.1 },
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const contourEntity = scene.entities.find(
        (e) => e.data?.type === "dynamics-contour",
      );
      const points = contourEntity!.data?.points as Array<{ x: number; y: number }>;

      // First point (loud, level=0.9) should have lower y than second (quiet, level=0.1)
      expect(points[0].y).toBeLessThan(points[1].y);
    });
  });
});
