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
    harmonicContext: { tension: 0, keyAware: false, currentFunction: null, functionalProgression: [] },
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
      prescribedKey: null,
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
const BAR_WIDTH_FRACTION = 0.19;
const BAR_WIDTH = LEFT_MARGIN * BAR_WIDTH_FRACTION;
const BAR_CENTER = LEFT_MARGIN / 2;
const BAR_LEFT = BAR_CENTER - BAR_WIDTH / 2;
const BAR_TOP = 1 / 6;
const BAR_BOTTOM = 5 / 6;
const BAR_HEIGHT = BAR_BOTTOM - BAR_TOP;

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

      // 4 outline edges + 6 ticks (left + right at 25%, 50%, 75%)
      expect(chromeEnts).toHaveLength(10);
    });

    it("outline is four rect edges using dynamics-indicator type", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);
      const outlines = scene.entities.filter((e) => e.id.includes(":outline-"));

      expect(outlines).toHaveLength(4);
      for (const o of outlines) {
        expect(o.data?.type).toBe("dynamics-indicator");
      }
    });

    it("outline sits within left 1/6 margin", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);
      const outlines = scene.entities.filter((e) => e.id.includes(":outline-"));

      for (const o of outlines) {
        const x = o.data?.x as number;
        const w = o.data?.w as number;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThan(LEFT_MARGIN);
      }
    });

    it("ticks are at 25%, 50%, 75% of bar height", () => {
      const frame = createTestFrame(1000, EMPTY_DYNAMICS);
      const scene = grammar.update(frame, null);
      const ticks = scene.entities.filter((e) => e.id.includes(":tick:"));

      expect(ticks).toHaveLength(3);

      const OT = 0.001; // OUTLINE_THICKNESS
      const expectedYs = [0.25, 0.5, 0.75].map(
        (f) => BAR_BOTTOM - f * BAR_HEIGHT - OT / 2,
      );

      for (let i = 0; i < ticks.length; i++) {
        const tickY = ticks[i].data?.y as number;
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

  describe("indicator rect geometry", () => {
    it("uses dynamics-indicator type with x/y/w/h", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 1000, intensity: 0.5 }],
      };

      const frame = createTestFrame(1000, dynamics);
      const scene = grammar.update(frame, null);
      const ind = indicators(scene.entities)[0];

      expect(ind.data?.type).toBe("dynamics-indicator");
      expect(ind.data?.x).toBeCloseTo(BAR_LEFT, 3);
      expect(ind.data?.w).toBeCloseTo(BAR_WIDTH, 3);
      expect(typeof ind.data?.y).toBe("number");
      expect(typeof ind.data?.h).toBe("number");
    });

    it("rect width equals bar width (no horizontal overflow)", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 0, intensity: 0.8 }],
      };

      // At significant age the width still stays constant
      const frame = createTestFrame(1500, dynamics);
      const scene = grammar.update(frame, null);
      const ind = indicators(scene.entities)[0];

      expect(ind.data?.x).toBeCloseTo(BAR_LEFT, 3);
      expect(ind.data?.w).toBeCloseTo(BAR_WIDTH, 3);
    });

    it("rect stays within BAR_TOP..BAR_BOTTOM vertically", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [
          { t: 0, intensity: 1.0 }, // at BAR_TOP edge
          { t: 0, intensity: 0.0 }, // at BAR_BOTTOM edge
        ],
      };

      // Aged so thickness is near max
      const frame = createTestFrame(1500, dynamics);
      const scene = grammar.update(frame, null);
      const inds = indicators(scene.entities);

      for (const ind of inds) {
        const y = ind.data?.y as number;
        const h = ind.data?.h as number;
        expect(y).toBeGreaterThanOrEqual(BAR_TOP - 0.001);
        expect(y + h).toBeLessThanOrEqual(BAR_BOTTOM + 0.001);
      }
    });

    it("thickness grows with age", () => {
      const dynamics: DynamicsState = {
        ...EMPTY_DYNAMICS,
        events: [{ t: 500, intensity: 0.5 }],
      };

      const fresh = grammar.update(createTestFrame(500, dynamics), null);
      const aged = grammar.update(createTestFrame(1500, dynamics), null);

      const freshH = indicators(fresh.entities)[0].data?.h as number;
      const agedH = indicators(aged.entities)[0].data?.h as number;

      expect(agedH).toBeGreaterThan(freshH);
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
  });

  describe("positioning", () => {
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

      const loudY = inds[0].data?.y as number;
      const quietY = inds[1].data?.y as number;

      expect(loudY).toBeLessThan(quietY);
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
