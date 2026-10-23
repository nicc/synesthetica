/**
 * ThreeJSRenderer simulation tests (Principle 8: Experiential Feedback Through Simulation)
 *
 * Frame sequences shaped like real lens output, asserting what the scene
 * graph holds after each frame: which objects exist, which are reused,
 * and which were removed and disposed.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import type { SceneFrame, Entity, ChordShapeElement, ColorHSVA } from "@synesthetica/contracts";
import { RADIUS_BY_TIER } from "@synesthetica/contracts";

vi.stubGlobal("window", { devicePixelRatio: 1 });

// Three.js mocks: see test/_harness/threeMocks.ts.
vi.mock("three", async () => (await import("../_harness/threeMocks")).mockThree());
vi.mock("three/examples/jsm/lines/Line2.js", async () => (await import("../_harness/threeMocks")).mockLine2(await import("three")));
vi.mock("three/examples/jsm/lines/LineMaterial.js", async () => (await import("../_harness/threeMocks")).mockLineMaterial(await import("three")));
vi.mock("three/examples/jsm/lines/LineGeometry.js", async () => (await import("../_harness/threeMocks")).mockLineGeometry());

import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { ThreeJSRenderer } from "../../src/renderers/ThreeJSRenderer";

// ============================================================================
// Mock-state views
// ============================================================================

interface Vec3 { x: number; y: number; z: number }
interface MockMaterial {
  opacity: number;
  blending: number;
  depthWrite: boolean;
  color: { r: number; g: number; b: number };
  dispose: Mock;
  uniforms: Record<string, { value: unknown }>;
  fragmentShader: string;
  resolution: { x: number; y: number };
}
interface MockObject {
  position: Vec3;
  scale: Vec3;
  renderOrder: number;
  geometry: { dispose: Mock; points: Vec3[] };
  material: MockMaterial;
}
interface Internals {
  scene: { children: MockObject[]; add: Mock };
  camera: { fov: number; aspect: number; position: Vec3 };
  renderer: { render: Mock };
  entityObjects: Map<string, MockObject>;
}

const internals = (r: ThreeJSRenderer) => r as unknown as Internals;
const objectFor = (r: ThreeJSRenderer, id: string) => internals(r).entityObjects.get(id)!;

interface MockNode extends MockObject {
  name: string;
  visible: boolean;
  children: MockNode[];
  getObjectByName(name: string): MockNode | undefined;
}
const nodeFor = (r: ThreeJSRenderer, id: string) => objectFor(r, id) as unknown as MockNode;

// ============================================================================
// Fixtures
// ============================================================================

function createMockCanvas(): HTMLCanvasElement {
  return { width: 800, height: 600, style: {} } as unknown as HTMLCanvasElement;
}

/** Deterministic PRNG (mulberry32) so dense scenes are reproducible. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeColor(h: number, s = 0.7, v = 0.8): ColorHSVA {
  return { h, s, v, a: 1 };
}

function makeChordElement(
  interval: string,
  angle: number,
  tier: "triadic" | "seventh" | "extension",
  hue: number,
): ChordShapeElement {
  return { interval, angle, radius: RADIUS_BY_TIER[tier], tier, style: "wedge", color: makeColor(hue) };
}

function makeChordShapeEntity(id: string, elements: ChordShapeElement[], margin: string, t: number): Entity {
  return {
    id,
    part: "main",
    kind: "glyph",
    createdAt: t,
    updatedAt: t,
    position: { x: 0.5, y: 0.5 },
    style: { color: elements[0]?.color ?? makeColor(0), size: 200, opacity: 1 },
    data: { type: "chord-shape", elements, margin },
  };
}

function makeTensionBarEntity(id: string, tension: number, t: number): Entity {
  return {
    id,
    part: "main",
    kind: "glyph",
    createdAt: t,
    updatedAt: t,
    position: { x: 0.9, y: 0.5 },
    style: { color: makeColor(0, 0, 0.5), size: 50, opacity: 1 },
    data: { type: "tension-bar", tension },
  };
}

function makeBeatLineEntity(id: string, y: number, t: number): Entity {
  return {
    id,
    part: "main",
    kind: "field",
    createdAt: t,
    updatedAt: t,
    position: { x: 0.5, y },
    style: { color: makeColor(0, 0, 0.3), size: 2, opacity: 0.5 },
    data: { type: "beat-line" },
  };
}

function makeParticleEntity(id: string, x: number, y: number, hue: number, t: number): Entity {
  return {
    id,
    part: "main",
    kind: "particle",
    createdAt: t,
    updatedAt: t,
    position: { x, y },
    style: { color: makeColor(hue), size: 15, opacity: 1 },
  };
}

function makeFrame(t: number, entities: Entity[]): SceneFrame {
  return { t, entities, diagnostics: [] };
}

const MAJOR_TRIAD_ELEMENTS: ChordShapeElement[] = [
  makeChordElement("1", 0, "triadic", 0),
  makeChordElement("3", 120, "triadic", 120),
  makeChordElement("5", 210, "triadic", 210),
];

const DOMINANT_7_ELEMENTS: ChordShapeElement[] = [
  ...MAJOR_TRIAD_ELEMENTS,
  makeChordElement("b7", 300, "seventh", 300),
];

// ============================================================================
// Simulation Tests
// ============================================================================

describe("ThreeJSRenderer Simulations", () => {
  const world = { worldWidth: 200, worldHeight: 120 };
  let renderer: ThreeJSRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = new ThreeJSRenderer(world);
    renderer.attach(createMockCanvas());
  });

  const sceneChildren = () => internals(renderer).scene.children;

  /** The scene holds exactly the objects for these entity ids. */
  const expectSceneHolds = (ids: string[]) => {
    expect(sceneChildren()).toHaveLength(ids.length);
    for (const id of ids) expect(sceneChildren()).toContain(objectFor(renderer, id));
  };

  /** Every geometry and material in the object (recursively) was disposed. */
  const expectFullyDisposed = (obj: MockNode) => {
    const parts = obj.children.length > 0 ? obj.children : [obj];
    for (const part of parts) {
      expect(part.geometry.dispose).toHaveBeenCalled();
      expect(part.material.dispose).toHaveBeenCalled();
    }
  };

  describe("Chord shape transitions", () => {
    it("keeps one group for a held chord across frames", () => {
      for (const t of [0, 16, 33]) {
        renderer.render(makeFrame(t, [makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", t)]));
      }
      expectSceneHolds(["chord"]);
      expect(internals(renderer).scene.add).toHaveBeenCalledTimes(1);
    });

    it("rebuilds when arm count, margin or bass changes, disposing the replaced group", () => {
      const withBassOnThird = DOMINANT_7_ELEMENTS.map((el, i) => ({ ...el, isBass: i === 1 }));
      const steps: Array<[ChordShapeElement[], string]> = [
        [MAJOR_TRIAD_ELEMENTS, "straight"],
        [DOMINANT_7_ELEMENTS, "straight"], // arm count
        [DOMINANT_7_ELEMENTS, "wavy"], // margin
        [withBassOnThird, "wavy"], // bass (inversion)
      ];

      let previous: MockNode | undefined;
      steps.forEach(([elements, margin], i) => {
        renderer.render(makeFrame(i * 500, [makeChordShapeEntity("chord", elements, margin, i * 500)]));
        const group = nodeFor(renderer, "chord");
        expectSceneHolds(["chord"]);
        if (previous) {
          expect(group).not.toBe(previous);
          expectFullyDisposed(previous);
        }
        previous = group;
      });
    });

    it("dashes the hub outline only for dashed margins", () => {
      const margins = ["straight", "wavy", "dash-short", "dash-long"];
      renderer.render(makeFrame(0, margins.map((m) => makeChordShapeEntity(m, MAJOR_TRIAD_ELEMENTS, m, 0))));
      const hasDashes = (id: string) =>
        nodeFor(renderer, id).children.some(
          (c) => c instanceof Line2 && (c.material as unknown as { dashed?: boolean }).dashed === true,
        );
      expect(margins.filter(hasDashes)).toEqual(["dash-short", "dash-long"]);
    });

    it("fades fill and outline together, keeping the outline brighter", () => {
      const opacities = (opacity: number) => {
        const entity = makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", 0);
        entity.style.opacity = opacity;
        renderer.render(makeFrame(0, [entity]));
        const group = nodeFor(renderer, "chord");
        const fill = group.children.find((c) => c.material.uniforms?.opacity)!;
        const outline = group.children.find((c) => c instanceof Line2)!;
        return { fill: fill.material.uniforms.opacity.value as number, outline: outline.material.opacity };
      };
      const full = opacities(1);
      const half = opacities(0.5);
      expect(full.fill).toBeLessThan(full.outline);
      expect(half.fill / full.fill).toBeCloseTo(0.5);
      expect(half.outline / full.outline).toBeCloseTo(0.5);
    });

    it("removes the drawn glyph when its elements empty", () => {
      renderer.render(makeFrame(0, [makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", 0)]));
      const group = nodeFor(renderer, "chord");
      renderer.render(makeFrame(16, [makeChordShapeEntity("chord", [], "straight", 16)]));
      expect(sceneChildren()).toHaveLength(0);
      expectFullyDisposed(group);
    });
  });

  describe("Glyph overtone steam (RFC 012)", () => {
    const steamOf = () => nodeFor(renderer, "chord").getObjectByName("overtone-steam");
    const withPartials = (opacity: number, dissipation: number) => {
      const entity = makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", 0);
      entity.style.opacity = opacity;
      entity.data = {
        ...entity.data,
        partials: [
          { n: 3, pc: 7, cents: 2, level: 0.3, color: makeColor(210), sourcePc: 0, angle: 210.6 },
          { n: 7, pc: 10, cents: -31, level: 0.15, color: makeColor(300), sourcePc: 0, angle: 290.7 },
        ],
        overtoneDissipation: dissipation,
      };
      return entity;
    };

    it("adds no steam when the overlay is off", () => {
      renderer.render(makeFrame(0, [makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", 0)]));
      expect(steamOf()).toBeUndefined();
    });

    it("adds additive steam inside the glyph group, faded and dissipated with the glyph", () => {
      renderer.render(makeFrame(1000, [withPartials(0.5, 0.5)]));
      const steam = steamOf()!;
      expect(steam.visible).toBe(true);
      expect(steam.material.blending).toBe(2); // AdditiveBlending
      const u = steam.material.uniforms;
      expect(u.partialCount.value).toBe(2);
      expect(u.armCount.value).toBe(MAJOR_TRIAD_ELEMENTS.length);
      expect(u.fade.value).toBe(0.5);
      expect(u.dissipation.value).toBe(0.5);
      // Clock angle 210.6° → math radians (90 − 210.6)°
      expect((u.partialAngles.value as Float32Array)[0]).toBeCloseTo(((90 - 210.6) * Math.PI) / 180, 5);
    });

    it("hides the steam when partials disappear", () => {
      renderer.render(makeFrame(0, [withPartials(1, 0)]));
      renderer.render(makeFrame(16, [makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", 16)]));
      expect(steamOf()!.visible).toBe(false);
    });
  });

  describe("Beat grid dynamics", () => {
    it("tracks beat lines as they appear and disappear, disposing the departed", () => {
      const lines = (t: number, spec: Array<[string, number]>) =>
        makeFrame(t, spec.map(([id, y]) => makeBeatLineEntity(id, y, t)));

      renderer.render(lines(0, [["beat-1", 0.2], ["beat-2", 0.4], ["beat-3", 0.6], ["beat-4", 0.8]]));
      const first = new Map(["beat-1", "beat-2", "beat-3", "beat-4"].map((id) => [id, nodeFor(renderer, id)]));

      renderer.render(lines(500, [["beat-1", 0.2], ["beat-3", 0.6]]));
      expectSceneHolds(["beat-1", "beat-3"]);
      expect(nodeFor(renderer, "beat-1")).toBe(first.get("beat-1"));
      expect(nodeFor(renderer, "beat-3")).toBe(first.get("beat-3"));
      expectFullyDisposed(first.get("beat-2")!);
      expectFullyDisposed(first.get("beat-4")!);

      renderer.render(lines(1000, [["beat-new-1", 0.25], ["beat-new-2", 0.5], ["beat-new-3", 0.75]]));
      expectSceneHolds(["beat-new-1", "beat-new-2", "beat-new-3"]);
      expectFullyDisposed(first.get("beat-1")!);
      expectFullyDisposed(first.get("beat-3")!);
    });

    it("moves a scrolling beat line in place, spanning the world width", () => {
      const line = () => nodeFor(renderer, "beat");
      renderer.render(makeFrame(0, [makeBeatLineEntity("beat", 0, 0)]));
      const object = line();
      for (let frame = 1; frame <= 10; frame++) {
        const y = frame * 0.05;
        renderer.render(makeFrame(frame * 100, [makeBeatLineEntity("beat", y, frame * 100)]));
        expect(line()).toBe(object);
        const [left, right] = object.geometry.points;
        expect(left.y).toBeCloseTo((1 - y) * world.worldHeight);
        expect(right.y).toBeCloseTo(left.y);
        expect(left.x).toBeCloseTo(0);
        expect(right.x).toBeCloseTo(world.worldWidth);
      }
    });
  });

  describe("Tension bar", () => {
    it("raises the indicator with tension, centred at 0.5", () => {
      const indicatorY = (tension: number) => {
        renderer.render(makeFrame(0, [makeTensionBarEntity("tension", tension, 0)]));
        return nodeFor(renderer, "tension").getObjectByName("indicator")!.position.y;
      };
      const [low, mid, high] = [0, 0.5, 1].map(indicatorY);
      expect(low).toBeLessThan(mid);
      expect(mid).toBeLessThan(high);
      expect(mid).toBeCloseTo(0);
    });
  });

  describe("Dense and sustained scenes", () => {
    it("places every particle of a dense frame at its own position", () => {
      const random = seededRandom(12345);
      const particles = Array.from({ length: 100 }, (_, i) =>
        makeParticleEntity(`p-${i}`, random(), random(), random() * 360, 0),
      );
      renderer.render(makeFrame(0, particles));

      expect(sceneChildren()).toHaveLength(particles.length);
      for (const p of particles) {
        const pos = objectFor(renderer, p.id).position;
        expect(pos.x).toBeCloseTo(p.position!.x * world.worldWidth);
        expect(pos.y).toBeCloseTo((1 - p.position!.y) * world.worldHeight);
      }
    });

    it("keeps steady objects over a sustained loop while a flashing particle is recreated and disposed", () => {
      const steady: Record<string, unknown> = {};
      const flashes = new Set<MockNode>();
      const FRAMES = 60;
      const FRAME_MS = 1000 / 60;

      for (let frame = 0; frame < FRAMES; frame++) {
        const t = frame * FRAME_MS;
        const flashing = frame % 10 < 5;
        const entities: Entity[] = [
          makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", t),
          makeTensionBarEntity("tension", 0.5 + Math.sin(frame * 0.1) * 0.3, t),
        ];
        if (flashing) entities.push(makeParticleEntity("flash", 0.3, 0.3, 60, t));
        renderer.render(makeFrame(t, entities));

        expectSceneHolds(entities.map((e) => e.id));
        for (const id of ["chord", "tension"]) {
          steady[id] ??= objectFor(renderer, id);
          expect(objectFor(renderer, id)).toBe(steady[id]);
        }
        if (flashing) flashes.add(nodeFor(renderer, "flash"));
      }

      // One object per appearance (6 in 60 frames), each disposed once it went.
      expect(flashes.size).toBe(FRAMES / 10);
      for (const flash of flashes) expect(flash.material.dispose).toHaveBeenCalled();
    });
  });
});
