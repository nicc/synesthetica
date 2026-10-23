import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mock } from "vitest";
import type { SceneFrame, Entity } from "@synesthetica/contracts";

const DEVICE_PIXEL_RATIO = 2;
const mockWindow: { devicePixelRatio: number; matchMedia?: (q: string) => { matches: boolean } } = {
  devicePixelRatio: DEVICE_PIXEL_RATIO,
};
vi.stubGlobal("window", mockWindow);

// Three.js mocks: see test/_harness/threeMocks.ts.
vi.mock("three", async () => (await import("./_harness/threeMocks")).mockThree());
vi.mock("three/examples/jsm/lines/Line2.js", async () => (await import("./_harness/threeMocks")).mockLine2(await import("three")));
vi.mock("three/examples/jsm/lines/LineMaterial.js", async () => (await import("./_harness/threeMocks")).mockLineMaterial(await import("three")));
vi.mock("three/examples/jsm/lines/LineGeometry.js", async () => (await import("./_harness/threeMocks")).mockLineGeometry());

import * as THREE from "three";
import { ThreeJSRenderer } from "../src/renderers/ThreeJSRenderer";
import type { ThreeJSRendererConfig } from "../src/renderers/ThreeJSRenderer";

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

// ============================================================================
// Fixtures
// ============================================================================

function createMockCanvas(): HTMLCanvasElement {
  return { width: 800, height: 600, style: {} } as unknown as HTMLCanvasElement;
}

function createEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "test-entity",
    part: "test-part",
    kind: "particle",
    createdAt: 1000,
    updatedAt: 1000,
    position: { x: 0.5, y: 0.5 },
    style: { color: { h: 0, s: 1, v: 1 }, size: 20, opacity: 1 },
    ...overrides,
  };
}

function frameAt(t: number, entities: Entity[]): SceneFrame {
  return { t, entities, diagnostics: [] };
}

function createSceneFrame(entities: Entity[] = []): SceneFrame {
  return frameAt(1000, entities);
}

const strip = (id: string, type: string, extra: Record<string, unknown> = {}) =>
  createEntity({
    id,
    kind: "particle",
    data: { type, barHeight: 0.2, topOpacity: 0.3, bottomOpacity: 0.5, ...extra },
  });

/** World-space y for a normalised y (y = 0 is the top of the screen). */
const worldY = (cfg: Required<Pick<ThreeJSRendererConfig, "worldHeight">>, y: number) =>
  (1 - y) * cfg.worldHeight;

// ============================================================================
// Tests
// ============================================================================

describe("ThreeJSRenderer", () => {
  const world = { worldWidth: 200, worldHeight: 120 };
  let renderer: ThreeJSRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = new ThreeJSRenderer(world);
    renderer.attach(createMockCanvas());
  });

  afterEach(() => {
    delete mockWindow.matchMedia;
  });

  describe("placement", () => {
    it("maps normalised position into the configured world, y flipped", () => {
      const points = [
        { id: "tl", x: 0, y: 0 },
        { id: "br", x: 1, y: 1 },
        { id: "mid", x: 0.25, y: 0.75 },
      ];
      renderer.render(createSceneFrame(
        points.map(({ id, x, y }) => createEntity({ id, position: { x, y } })),
      ));

      for (const { id, x, y } of points) {
        const pos = objectFor(renderer, id).position;
        expect(pos.x).toBeCloseTo(x * world.worldWidth);
        expect(pos.y).toBeCloseTo(worldY(world, y));
      }
    });

    it("scales particles in proportion to style.size", () => {
      renderer.render(createSceneFrame([
        createEntity({ id: "small", style: { size: 10 } }),
        createEntity({ id: "large", style: { size: 40 } }),
      ]));
      const small = objectFor(renderer, "small").scale;
      const large = objectFor(renderer, "large").scale;
      expect(large.x / small.x).toBeCloseTo(4);
      expect(large.y).toBeCloseTo(large.x);
    });

    it("hangs a note strip below its onset: top edge at the position, height from barHeight", () => {
      const onsetY = 0.3;
      const barHeight = 0.2;
      renderer.render(createSceneFrame([
        { ...strip("ns", "note-strip", { barHeight }), position: { x: 0.4, y: onsetY } },
      ]));
      const mesh = objectFor(renderer, "ns");
      expect(mesh.scale.y).toBeCloseTo(barHeight * world.worldHeight);
      expect(mesh.position.y + mesh.scale.y / 2).toBeCloseTo(worldY(world, onsetY));
      expect(mesh.position.x).toBeCloseTo(0.4 * world.worldWidth);
      expect(mesh.material.uniforms.topOpacity.value).toBe(0.3);
      expect(mesh.material.uniforms.bottomOpacity.value).toBe(0.5);
    });

    it("draws a trail from the position along the velocity", () => {
      const position = { x: 0.2, y: 0.4 };
      const velocity = { x: 0.1, y: 0.25 };
      renderer.render(createSceneFrame([
        createEntity({ id: "t", kind: "trail", position, velocity }),
      ]));
      const [start, end] = objectFor(renderer, "t").geometry.points;
      expect(start.x).toBeCloseTo(position.x * world.worldWidth);
      expect(start.y).toBeCloseTo(worldY(world, position.y));
      expect(end.x).toBeCloseTo((position.x + velocity.x) * world.worldWidth);
      expect(end.y).toBeCloseTo(worldY(world, position.y + velocity.y));
    });
  });

  describe("style", () => {
    it("particle opacity is style.opacity × remaining life × colour alpha", () => {
      const life = { ttlMs: 1000, ageMs: 250 };
      renderer.render(createSceneFrame([
        createEntity({ id: "p", life, style: { opacity: 0.8, color: { h: 0, s: 1, v: 1, a: 0.5 } } }),
      ]));
      const expected = 0.8 * (1 - life.ageMs / life.ttlMs) * 0.5;
      expect(objectFor(renderer, "p").material.opacity).toBeCloseTo(expected);
    });

    it("clamps opacity at zero past the end of life", () => {
      renderer.render(createSceneFrame([
        createEntity({ id: "p", life: { ttlMs: 1000, ageMs: 1500 }, style: { opacity: 1 } }),
      ]));
      expect(objectFor(renderer, "p").material.opacity).toBe(0);
    });

    it("colours every render path through hsvToThreeColor", () => {
      // The documented single point subclasses override to reskin the image.
      class HueAsRed extends ThreeJSRenderer {
        protected override hsvToThreeColor(hsv: { h: number }) {
          return new THREE.Color(hsv.h / 360, 0, 0);
        }
      }
      const tinted = new HueAsRed(world);
      tinted.attach(createMockCanvas());
      const hue = (h: number) => ({ color: { h, s: 1, v: 1 } });
      tinted.render(createSceneFrame([
        createEntity({ id: "p", style: hue(90) }),
        createEntity({ id: "beat", kind: "field", data: { type: "beat-line" }, style: hue(180) }),
        { ...strip("ns", "note-strip"), style: hue(270) },
      ]));
      expect(objectFor(tinted, "p").material.color.r).toBeCloseTo(90 / 360);
      expect(objectFor(tinted, "beat").material.color.r).toBeCloseTo(180 / 360);
      const stripColor = objectFor(tinted, "ns").material.uniforms.color.value as { r: number };
      expect(stripColor.r).toBeCloseTo(270 / 360);
    });
  });

  describe("entity lifecycle", () => {
    it("creates one scene object per entity and reuses it across frames", () => {
      const { scene } = internals(renderer);
      renderer.render(createSceneFrame([createEntity({ id: "e", position: { x: 0.1, y: 0.1 } })]));
      const first = objectFor(renderer, "e");
      expect(scene.children).toEqual([first]);

      renderer.render(createSceneFrame([createEntity({ id: "e", position: { x: 0.8, y: 0.2 } })]));
      expect(objectFor(renderer, "e")).toBe(first);
      expect(scene.children).toEqual([first]);
      expect(scene.add).toHaveBeenCalledTimes(1);
      expect(first.position.x).toBeCloseTo(0.8 * world.worldWidth);
    });

    it("removes and disposes objects whose entity left the frame, sparing shared geometries", () => {
      const kept = createEntity({ id: "kept" });
      renderer.render(createSceneFrame([
        kept,
        createEntity({ id: "particle" }),
        strip("note", "note-strip"),
        createEntity({ id: "trail", kind: "trail", velocity: { x: 0.1, y: 0.1 } }),
      ]));
      const particle = objectFor(renderer, "particle");
      const note = objectFor(renderer, "note");
      const trail = objectFor(renderer, "trail");

      renderer.render(createSceneFrame([kept]));

      expect(internals(renderer).scene.children).toEqual([objectFor(renderer, "kept")]);
      for (const gone of [particle, note, trail]) {
        expect(gone.material.dispose).toHaveBeenCalled();
      }
      expect(trail.geometry.dispose).toHaveBeenCalled();
      // Particles share the circle and note strips the plane; both outlive the entity.
      expect(particle.geometry.dispose).not.toHaveBeenCalled();
      expect(note.geometry.dispose).not.toHaveBeenCalled();
      expect(objectFor(renderer, "kept").material.dispose).not.toHaveBeenCalled();
    });

    it("keeps rendering the rest of the frame when one entity throws, logging once per id", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      // connector-strip requires plateauFraction and throws without it.
      const broken = createEntity({ id: "broken", kind: "glyph", data: { type: "connector-strip" } });
      const healthy = createEntity({ id: "healthy", position: { x: 0.25, y: 0.5 } });

      renderer.render(createSceneFrame([broken, healthy]));
      renderer.render(createSceneFrame([broken, healthy]));

      expect(objectFor(renderer, "healthy").position.x).toBeCloseTo(0.25 * world.worldWidth);
      expect(internals(renderer).renderer.render).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("broken");
      warn.mockRestore();
    });

    it("detach disposes entity resources and shared geometries; later renders draw nothing", () => {
      renderer.render(createSceneFrame([
        createEntity({ id: "p" }),
        createEntity({ id: "t", kind: "trail" }),
      ]));
      const { scene, renderer: gl } = internals(renderer);
      const particle = objectFor(renderer, "p");
      const trail = objectFor(renderer, "t");

      renderer.detach();

      expect(particle.material.dispose).toHaveBeenCalled();
      expect(trail.material.dispose).toHaveBeenCalled();
      expect(trail.geometry.dispose).toHaveBeenCalled();
      expect(particle.geometry.dispose).toHaveBeenCalled(); // shared circle, freed with the renderer

      const adds = scene.add.mock.calls.length;
      const draws = gl.render.mock.calls.length;
      renderer.render(createSceneFrame([createEntity({ id: "after" })]));
      expect(scene.add).toHaveBeenCalledTimes(adds);
      expect(gl.render).toHaveBeenCalledTimes(draws);
    });
  });

  describe("overtone strips (RFC 012)", () => {
    it("render as additive steam beneath clean note strips", () => {
      renderer.render(createSceneFrame([
        strip("ot", "overtone-strip", { edgeSoftness: 1, dissipationTop: 0.6, dissipationBottom: 0.1 }),
        strip("ns", "note-strip"),
      ]));
      const overtone = objectFor(renderer, "ot");
      const note = objectFor(renderer, "ns");

      expect(overtone.material.blending).toBe(THREE.AdditiveBlending);
      expect(overtone.material.depthWrite).toBe(false);
      expect(overtone.renderOrder).toBeLessThan(note.renderOrder);
      expect(overtone.material.fragmentShader).toContain("fbm");
      const u = overtone.material.uniforms;
      expect(u.edgeSoftness.value).toBe(1);
      expect(u.dissipationTop.value).toBe(0.6);
      expect(u.dissipationBottom.value).toBe(0.1);

      expect(note.material.blending).toBe(THREE.NormalBlending);
      expect(note.material.fragmentShader).not.toContain("fbm");
    });

    const steamAt = (r: ThreeJSRenderer, t: number, fieldOffsetY: number) => {
      r.render(frameAt(t, [strip("ot", "overtone-strip", { fieldOffsetY })]));
      const u = objectFor(r, "ot").material.uniforms;
      return { shift: u.fieldShift.value as number, swirl: u.swirlPhase.value as number };
    };

    it("scrolls the steam field with fieldOffsetY and evolves it with session time", () => {
      expect(steamAt(renderer, 0, 0)).toEqual({ shift: 0, swirl: 0 });
      const offset = steamAt(renderer, 0, 0.05).shift;
      expect(offset).toBeGreaterThan(0);
      expect(steamAt(renderer, 0, 0.1).shift).toBeCloseTo(2 * offset);

      const later = steamAt(renderer, 1000, 0);
      expect(later.shift).toBeGreaterThan(0);
      expect(later.swirl).toBeGreaterThan(0);
    });

    it("holds steam still when the viewer prefers reduced motion", () => {
      mockWindow.matchMedia = () => ({ matches: true });
      const still = new ThreeJSRenderer(world);
      still.attach(createMockCanvas());
      const atStart = steamAt(still, 0, 0.05);
      expect(steamAt(still, 5000, 0.05)).toEqual(atStart);
    });
  });

  describe("resize", () => {
    const cfg = { fov: 40, worldWidth: 120, worldHeight: 60 };

    /** Ratio of world to visible extent on each axis at the camera's distance. */
    const coverage = (r: ThreeJSRenderer) => {
      const { camera } = internals(r);
      const visibleH = 2 * camera.position.z * Math.tan((cfg.fov * Math.PI) / 360);
      const visibleW = visibleH * camera.aspect;
      return { w: cfg.worldWidth / visibleW, h: cfg.worldHeight / visibleH };
    };

    it("contains the whole world, tight on the limiting axis", () => {
      const r = new ThreeJSRenderer(cfg);
      r.attach(createMockCanvas());

      r.resize(1600, 400); // wider than the world: height limits
      expect(internals(r).camera.aspect).toBeCloseTo(4);
      expect(coverage(r).h).toBeCloseTo(1);
      expect(coverage(r).w).toBeLessThan(1);

      r.resize(400, 800); // narrower than the world: width limits
      expect(coverage(r).w).toBeCloseTo(1);
      expect(coverage(r).h).toBeLessThan(1);
    });

    it("updates the resolution of existing line materials", () => {
      renderer.render(createSceneFrame([
        createEntity({ id: "ring", kind: "glyph", data: { type: "progression-guide-ring" } }),
      ]));
      renderer.resize(1000, 500);
      expect(objectFor(renderer, "ring").material.resolution).toEqual({
        x: 1000 * DEVICE_PIXEL_RATIO,
        y: 500 * DEVICE_PIXEL_RATIO,
      });
    });
  });
});
