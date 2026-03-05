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
      prescribedTempo: null,
      prescribedMeter: null,
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
    it("produces level marker even with empty dynamics", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);

      // Should always have a level marker
      const levelEntity = scene.entities.find(
        (e) => e.data?.type === "dynamics-level",
      );
      expect(levelEntity).toBeDefined();
    });

    it("does not produce contour with empty dynamics", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);

      const contourEntity = scene.entities.find(
        (e) => e.data?.type === "dynamics-contour",
      );
      expect(contourEntity).toBeUndefined();
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

    it("produces range band when events exist", () => {
      const dynamics: DynamicsState = {
        events: [{ t: 500, intensity: 0.5 }],
        level: 0.5,
        trend: "stable",
        contour: [{ t: 500, level: 0.5 }],
        range: { min: 0.3, max: 0.7, variance: 0.02 },
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const rangeEntity = scene.entities.find(
        (e) => e.data?.type === "dynamics-range",
      );
      expect(rangeEntity).toBeDefined();
      expect(rangeEntity!.kind).toBe("field");
    });
  });

  describe("entity ID stability", () => {
    it("produces stable entity IDs across frames", () => {
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
    it("positions level marker at NOW_X", () => {
      const dynamics: DynamicsState = {
        events: [],
        level: 0.5,
        trend: "stable",
        contour: [],
        range: { min: 0, max: 0, variance: 0 },
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const levelEntity = scene.entities.find(
        (e) => e.data?.type === "dynamics-level",
      );
      expect(levelEntity!.position!.x).toBeCloseTo(0.95, 2);
    });

    it("positions level marker higher for louder dynamics", () => {
      const loudFrame = createTestFrame(1000, {
        ...EMPTY_DYNAMICS,
        level: 0.9,
      });
      const quietFrame = createTestFrame(1000, {
        ...EMPTY_DYNAMICS,
        level: 0.1,
      });

      const loudScene = grammar.update(loudFrame, null);
      const quietScene = grammar.update(quietFrame, null);

      const loudY = loudScene.entities.find(
        (e) => e.data?.type === "dynamics-level",
      )!.position!.y;
      const quietY = quietScene.entities.find(
        (e) => e.data?.type === "dynamics-level",
      )!.position!.y;

      // Lower y = higher on screen = louder
      expect(loudY).toBeLessThan(quietY);
    });

    it("entities are positioned within the strip area", () => {
      const dynamics: DynamicsState = {
        events: [{ t: 500, intensity: 1.0 }],
        level: 1.0,
        trend: "stable",
        contour: [{ t: 500, level: 1.0 }],
        range: { min: 0.0, max: 1.0, variance: 0.1 },
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const levelEntity = scene.entities.find(
        (e) => e.data?.type === "dynamics-level",
      );
      // Strip is y: 0.0 to 0.12
      expect(levelEntity!.position!.y).toBeGreaterThanOrEqual(0.0);
      expect(levelEntity!.position!.y).toBeLessThanOrEqual(0.12);
    });
  });
});
