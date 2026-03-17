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

  describe("indicator production", () => {
    it("produces no entities with empty dynamics", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);

      expect(scene.entities).toHaveLength(0);
    });

    it("produces one indicator per recent event", () => {
      const dynamics: DynamicsState = {
        events: [
          { t: 800, intensity: 0.5 },
          { t: 900, intensity: 0.7 },
        ],
        level: 0.7,
        trend: "stable",
        contour: [
          { t: 800, level: 0.5 },
          { t: 900, level: 0.7 },
        ],
        range: { min: 0.5, max: 0.7, variance: 0.01 },
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      expect(scene.entities).toHaveLength(2);
    });

    it("omits events older than fade window", () => {
      const dynamics: DynamicsState = {
        events: [
          { t: 100, intensity: 0.5 },    // 2400ms old — past 2000ms fade
          { t: 2000, intensity: 0.7 },   // 500ms old — still visible
        ],
        level: 0.7,
        trend: "stable",
        contour: [
          { t: 100, level: 0.5 },
          { t: 2000, level: 0.7 },
        ],
        range: { min: 0.5, max: 0.7, variance: 0.01 },
      };

      const frame = createTestFrame(2500, dynamics);
      const scene = grammar.update(frame, null);

      expect(scene.entities).toHaveLength(1);
    });
  });

  describe("opacity", () => {
    it("opacity is intensity * fade fraction", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 500, intensity: 0.8 }],
      };

      // At t=1500, age=1000ms, fadeFraction=0.5
      // opacity = 0.8 * 0.5 = 0.4
      const frame = createTestFrame(1500, dynamics);
      const scene = grammar.update(frame, null);

      expect(scene.entities).toHaveLength(1);
      expect(scene.entities[0].style.opacity).toBeCloseTo(0.4, 2);
    });

    it("fresh event has opacity equal to intensity", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 1000, intensity: 0.9 }],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      expect(scene.entities[0].style.opacity).toBeCloseTo(0.9, 2);
    });

    it("louder notes are more opaque than quieter notes at same age", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [
          { t: 500, intensity: 0.9 },
          { t: 500, intensity: 0.3 },
        ],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const opacities = scene.entities.map((e) => e.style.opacity ?? 0);
      expect(opacities[0]).toBeGreaterThan(opacities[1]);
    });
  });

  describe("positioning", () => {
    it("fresh indicator spans the bar width", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 1000, intensity: 0.5 }],
      };

      // age=0 → no width growth
      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const points = scene.entities[0].data?.points as Array<{ x: number; y: number }>;
      expect(points).toHaveLength(2);
      expect(points[0].x).toBeCloseTo(0.005, 3);  // BAR_LEFT
      expect(points[1].x).toBeCloseTo(0.035, 3);  // BAR_RIGHT
    });

    it("aged indicator grows wider", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 0, intensity: 0.8 }],
      };

      // age=1000 → half of FADE_MS → ageFraction=0.5
      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const points = scene.entities[0].data?.points as Array<{ x: number; y: number }>;
      // Should be wider than BAR_LEFT/BAR_RIGHT
      expect(points[0].x).toBeLessThan(0.005);
      expect(points[1].x).toBeGreaterThan(0.035);
    });

    it("louder notes are higher on screen (lower y)", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [
          { t: 900, intensity: 0.9 },
          { t: 900, intensity: 0.1 },
        ],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      const loudY = (scene.entities[0].data?.points as Array<{ x: number; y: number }>)[0].y;
      const quietY = (scene.entities[1].data?.points as Array<{ x: number; y: number }>)[0].y;

      expect(loudY).toBeLessThan(quietY);
    });

    it("indicators are within the bar area", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [
          { t: 900, intensity: 1.0 },
          { t: 900, intensity: 0.0 },
        ],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      for (const entity of scene.entities) {
        const points = entity.data?.points as Array<{ x: number; y: number }>;
        for (const p of points) {
          // BAR_TOP = 1/6 ≈ 0.167, BAR_BOTTOM = 5/6 ≈ 0.833
          expect(p.y).toBeGreaterThanOrEqual(1 / 6 - 0.001);
          expect(p.y).toBeLessThanOrEqual(5 / 6 + 0.001);
        }
      }
    });
  });

  describe("line thickness", () => {
    it("fresh indicator has minimum line width", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 1000, intensity: 0.5 }],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      expect(scene.entities[0].style.size).toBeCloseTo(3, 1); // LINE_WIDTH_MIN
    });

    it("aged indicator has larger line width", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 0, intensity: 0.8 }],
      };

      // age=1000 → half fade → lineWidth = 3 + (5-3)*0.5 = 4
      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      expect(scene.entities[0].style.size).toBeCloseTo(4, 1);
    });
  });

  describe("entity IDs", () => {
    it("IDs are index-based and stable for same event set", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [
          { t: 800, intensity: 0.5 },
          { t: 900, intensity: 0.7 },
        ],
      };

      const scene1 = grammar.update(createTestFrame(1000, dynamics), null);
      const scene2 = grammar.update(createTestFrame(1100, dynamics), scene1);

      const ids1 = scene1.entities.map((e) => e.id).sort();
      const ids2 = scene2.entities.map((e) => e.id).sort();

      expect(ids1).toEqual(ids2);
    });
  });
});
