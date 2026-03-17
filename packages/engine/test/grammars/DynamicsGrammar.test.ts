import { describe, it, expect, beforeEach } from "vitest";
import { DynamicsGrammar } from "../../src/grammars/DynamicsGrammar";
import type {
  AnnotatedMusicalFrame,
  GrammarContext,
  DynamicsState,
  Entity,
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

// Derived layout values (must match DynamicsGrammar constants)
const LEFT_MARGIN = 1 / 6;
const BAR_WIDTH_FRACTION = 0.3;
const BAR_WIDTH = LEFT_MARGIN * BAR_WIDTH_FRACTION;
const BAR_CENTER = LEFT_MARGIN / 2;
const BAR_LEFT = BAR_CENTER - BAR_WIDTH / 2;
const BAR_RIGHT = BAR_CENTER + BAR_WIDTH / 2;
const INDICATOR_INSET = 0.003;
const INDICATOR_LEFT = BAR_LEFT + INDICATOR_INSET;
const INDICATOR_RIGHT = BAR_RIGHT - INDICATOR_INSET;

/** Filter to just indicator entities (exclude outline + ticks) */
function indicators(entities: Entity[]): Entity[] {
  return entities.filter((e) => e.id.includes(":ind:"));
}

/** Filter to chrome entities (outline + ticks) */
function chrome(entities: Entity[]): Entity[] {
  return entities.filter(
    (e) => e.id.includes(":outline") || e.id.includes(":tick"),
  );
}

describe("DynamicsGrammar", () => {
  let grammar: DynamicsGrammar;

  beforeEach(() => {
    grammar = new DynamicsGrammar();
    grammar.init(ctx);
  });

  describe("outline and ticks", () => {
    it("always emits outline and tick entities", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);
      const chromeEnts = chrome(scene.entities);

      // 1 outline + 6 ticks (left + right at 25%, 50%, 75%)
      expect(chromeEnts).toHaveLength(7);
    });

    it("outline forms a closed rectangle", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);
      const outline = scene.entities.find((e) => e.id.includes(":outline"));

      const points = outline!.data?.points as Array<{ x: number; y: number }>;
      expect(points).toHaveLength(5);
      expect(points[0].x).toBeCloseTo(points[4].x, 5);
      expect(points[0].y).toBeCloseTo(points[4].y, 5);
    });

    it("outline sits within left 1/6 margin", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);
      const outline = scene.entities.find((e) => e.id.includes(":outline"));
      const points = outline!.data?.points as Array<{ x: number; y: number }>;

      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(LEFT_MARGIN);
      }
    });

    it("ticks are at 25%, 50%, 75% of bar height", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);
      const ticks = scene.entities.filter((e) => e.id.includes(":tick:"));

      expect(ticks).toHaveLength(3);

      const BAR_TOP = 1 / 6;
      const BAR_BOTTOM = 5 / 6;
      const BAR_HEIGHT = BAR_BOTTOM - BAR_TOP;
      const expectedYs = [0.25, 0.5, 0.75].map(
        (f) => BAR_BOTTOM - f * BAR_HEIGHT,
      );

      for (let i = 0; i < ticks.length; i++) {
        const points = ticks[i].data?.points as Array<{
          x: number;
          y: number;
        }>;
        const tickY = points[0].y;
        expect(expectedYs).toContainEqual(expect.closeTo(tickY, 3));
      }
    });
  });

  describe("indicator production", () => {
    it("produces no indicator entities with empty dynamics", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);

      expect(indicators(scene.entities)).toHaveLength(0);
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

      expect(indicators(scene.entities)).toHaveLength(2);
    });

    it("omits events older than fade window", () => {
      const dynamics: DynamicsState = {
        events: [
          { t: 100, intensity: 0.5 },
          { t: 2000, intensity: 0.7 },
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

      expect(indicators(scene.entities)).toHaveLength(1);
    });
  });

  describe("opacity", () => {
    it("opacity uses min floor for quiet notes", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 1000, intensity: 0.1 }],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);
      const inds = indicators(scene.entities);

      expect(inds[0].style.opacity).toBeCloseTo(0.25, 2);
    });

    it("loud notes use their actual intensity as opacity", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 1000, intensity: 0.9 }],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      expect(indicators(scene.entities)[0].style.opacity).toBeCloseTo(0.9, 2);
    });

    it("opacity fades over time", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 500, intensity: 0.8 }],
      };

      const frame = createTestFrame(1500, dynamics);
      const scene = grammar.update(frame, null);
      const inds = indicators(scene.entities);

      expect(inds).toHaveLength(1);
      expect(inds[0].style.opacity).toBeCloseTo(0.4, 2);
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
      const inds = indicators(scene.entities);

      const opacities = inds.map((e) => e.style.opacity ?? 0);
      expect(opacities[0]).toBeGreaterThan(opacities[1]);
    });
  });

  describe("positioning", () => {
    it("indicators span full bar width with end-cap inset", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 1000, intensity: 0.5 }],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);
      const inds = indicators(scene.entities);

      const points = inds[0].data?.points as Array<{ x: number; y: number }>;
      expect(points).toHaveLength(2);
      expect(points[0].x).toBeCloseTo(INDICATOR_LEFT, 3);
      expect(points[1].x).toBeCloseTo(INDICATOR_RIGHT, 3);
    });

    it("indicator endpoints are within outline bounds", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 1000, intensity: 0.5 }],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);
      const inds = indicators(scene.entities);

      const points = inds[0].data?.points as Array<{ x: number; y: number }>;
      expect(points[0].x).toBeGreaterThan(BAR_LEFT);
      expect(points[1].x).toBeLessThan(BAR_RIGHT);
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
      const inds = indicators(scene.entities);

      const loudY = (inds[0].data?.points as Array<{ x: number; y: number }>)[0]
        .y;
      const quietY = (inds[1].data?.points as Array<{ x: number; y: number }>)[0]
        .y;

      expect(loudY).toBeLessThan(quietY);
    });

    it("indicators are within the bar area vertically", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [
          { t: 900, intensity: 1.0 },
          { t: 900, intensity: 0.0 },
        ],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);
      const inds = indicators(scene.entities);

      for (const entity of inds) {
        const points = entity.data?.points as Array<{ x: number; y: number }>;
        for (const p of points) {
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

      expect(indicators(scene.entities)[0].style.size).toBeCloseTo(3, 1);
    });

    it("aged indicator has larger line width", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 0, intensity: 0.5 }],
      };

      // age=1000 → half fade → lineWidth = 3 + (7-3)*0.5 = 5
      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);

      expect(indicators(scene.entities)[0].style.size).toBeCloseTo(5, 1);
    });

    it("thickness is clamped near bar edges", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 0, intensity: 1.0 }],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);
      const inds = indicators(scene.entities);

      expect(inds[0].style.size).toBeCloseTo(3, 1);
    });
  });

  describe("entity IDs", () => {
    it("indicator IDs are index-based and stable for same event set", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [
          { t: 800, intensity: 0.5 },
          { t: 900, intensity: 0.7 },
        ],
      };

      const scene1 = grammar.update(createTestFrame(1000, dynamics), null);
      const scene2 = grammar.update(createTestFrame(1100, dynamics), scene1);

      const ids1 = indicators(scene1.entities)
        .map((e) => e.id)
        .sort();
      const ids2 = indicators(scene2.entities)
        .map((e) => e.id)
        .sort();

      expect(ids1).toEqual(ids2);
    });
  });
});
