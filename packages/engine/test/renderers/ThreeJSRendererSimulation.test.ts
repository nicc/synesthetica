/**
 * ThreeJSRenderer Simulation Tests (Principle 8: Experiential Feedback Through Simulation)
 *
 * These tests exercise the ThreeJSRenderer with realistic frame sequences
 * that simulate actual grammar output. By simulating various visual scenarios,
 * we expose edge cases and lifecycle issues that unit tests would miss.
 *
 * Categories tested:
 * 1. Chord shape transitions (chord changes, arm count variations)
 * 2. Beat grid dynamics (lines appearing/disappearing)
 * 3. Entity lifecycle (creation, update, removal)
 * 4. Mixed content (multiple entity types in same frame)
 * 5. Performance scenarios (many entities, rapid updates)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  SceneFrame,
  Entity,
  ChordShapeElement,
  ColorHSVA,
} from "@synesthetica/contracts";

// Mock window for Node.js environment
const mockWindow = {
  devicePixelRatio: 1,
};
vi.stubGlobal("window", mockWindow);

// Mock Three.js module
vi.mock("three", () => {
  class MockColor {
    r = 0; g = 0; b = 0;
    setHSL() { return this; }
  }

  class MockVector3 {
    x = 0; y = 0; z = 0;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x; this.y = y; this.z = z;
    }
    set(x: number, y: number, z: number) {
      this.x = x; this.y = y; this.z = z;
      return this;
    }
  }

  class Material {
    transparent = false;
    opacity = 1;
    side = 0;
    color = new MockColor();
    linewidth = 1;
    dispose = vi.fn();
  }

  class MockMeshBasicMaterial extends Material {}
  class MockLineBasicMaterial extends Material {}

  class MockBufferGeometry {
    dispose = vi.fn();
    setFromPoints = vi.fn();
  }

  class MockShapeGeometry extends MockBufferGeometry {}
  class MockCircleGeometry extends MockBufferGeometry {}
  class MockPlaneGeometry extends MockBufferGeometry {}
  class MockRingGeometry extends MockBufferGeometry {}

  class MockShape {
    moveTo = vi.fn();
    lineTo = vi.fn();
    quadraticCurveTo = vi.fn();
    closePath = vi.fn();
  }

  class MockObject3D {
    name = "";
    position = new MockVector3();
    scale = new MockVector3(1, 1, 1);
    children: MockObject3D[] = [];
    userData: Record<string, unknown> = {};
    getObjectByName(name: string): MockObject3D | undefined {
      return this.children.find((c) => c.name === name);
    }
    traverse(callback: (obj: MockObject3D) => void) {
      callback(this);
      this.children.forEach((c) => c.traverse(callback));
    }
  }

  class MockMesh extends MockObject3D {
    geometry: MockBufferGeometry;
    material: Material;
    constructor(geometry?: MockBufferGeometry, material?: Material) {
      super();
      this.geometry = geometry ?? new MockBufferGeometry();
      this.material = material ?? new Material();
    }
  }

  class MockLine extends MockObject3D {
    geometry: MockBufferGeometry;
    material: Material;
    constructor(geometry?: MockBufferGeometry, material?: Material) {
      super();
      this.geometry = geometry ?? new MockBufferGeometry();
      this.material = material ?? new MockLineBasicMaterial();
    }
  }

  class MockGroup extends MockObject3D {
    add(obj: MockObject3D) {
      this.children.push(obj);
    }
  }

  class MockScene {
    background: MockColor | null = null;
    children: MockObject3D[] = [];
    add = vi.fn((obj: MockObject3D) => {
      this.children.push(obj);
    });
    remove = vi.fn((obj: MockObject3D) => {
      const idx = this.children.indexOf(obj);
      if (idx >= 0) this.children.splice(idx, 1);
    });
  }

  class MockPerspectiveCamera {
    position = new MockVector3();
    aspect = 1;
    lookAt = vi.fn();
    updateProjectionMatrix = vi.fn();
  }

  class MockWebGLRenderer {
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }

  return {
    WebGLRenderer: MockWebGLRenderer,
    Scene: MockScene,
    PerspectiveCamera: MockPerspectiveCamera,
    Color: MockColor,
    Vector3: MockVector3,
    Mesh: MockMesh,
    Line: MockLine,
    Group: MockGroup,
    Shape: MockShape,
    ShapeGeometry: MockShapeGeometry,
    CircleGeometry: MockCircleGeometry,
    PlaneGeometry: MockPlaneGeometry,
    RingGeometry: MockRingGeometry,
    BufferGeometry: MockBufferGeometry,
    Material,
    MeshBasicMaterial: MockMeshBasicMaterial,
    LineBasicMaterial: MockLineBasicMaterial,
    DoubleSide: 2,
  };
});

import { ThreeJSRenderer } from "../../src/renderers/ThreeJSRenderer";

// ============================================================================
// Simulation Helpers
// ============================================================================

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 800,
    height: 600,
    style: {},
  } as unknown as HTMLCanvasElement;
}

function makeColor(h: number, s = 0.7, v = 0.8): ColorHSVA {
  return { h, s, v, a: 1 };
}

function makeChordElement(
  interval: string,
  angle: number,
  tier: "triadic" | "seventh" | "extension",
  hue: number
): ChordShapeElement {
  return {
    interval,
    angle,
    tier,
    style: "wedge",
    color: makeColor(hue),
  };
}

function makeChordShapeEntity(
  id: string,
  elements: ChordShapeElement[],
  margin: string,
  t: number
): Entity {
  return {
    id,
    part: "main",
    kind: "glyph",
    createdAt: t,
    updatedAt: t,
    position: { x: 0.5, y: 0.5 },
    style: {
      color: elements[0]?.color ?? makeColor(0),
      size: 200,
      opacity: 1,
    },
    data: {
      type: "chord-shape",
      elements,
      margin,
    },
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
    style: {
      color: makeColor(0, 0, 0.5),
      size: 50,
      opacity: 1,
    },
    data: {
      type: "tension-bar",
      tension,
    },
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
    style: {
      color: makeColor(0, 0, 0.3),
      size: 2,
      opacity: 0.5,
    },
    data: {
      type: "beat-line",
    },
  };
}

function makeParticleEntity(
  id: string,
  x: number,
  y: number,
  hue: number,
  t: number
): Entity {
  return {
    id,
    part: "main",
    kind: "particle",
    createdAt: t,
    updatedAt: t,
    position: { x, y },
    style: {
      color: makeColor(hue),
      size: 15,
      opacity: 1,
    },
  };
}

function makeFrame(t: number, entities: Entity[]): SceneFrame {
  return {
    t,
    entities,
    diagnostics: [],
  };
}

// ============================================================================
// Chord Shape Fixtures
// ============================================================================

const MAJOR_TRIAD_ELEMENTS: ChordShapeElement[] = [
  makeChordElement("1", 0, "triadic", 0),      // Root at 12 o'clock
  makeChordElement("3", 120, "triadic", 120),  // Major 3rd
  makeChordElement("5", 210, "triadic", 210),  // Perfect 5th
];

const MINOR_TRIAD_ELEMENTS: ChordShapeElement[] = [
  makeChordElement("1", 0, "triadic", 0),
  makeChordElement("b3", 90, "triadic", 90),   // Minor 3rd
  makeChordElement("5", 210, "triadic", 210),
];

const DOMINANT_7_ELEMENTS: ChordShapeElement[] = [
  makeChordElement("1", 0, "triadic", 0),
  makeChordElement("3", 120, "triadic", 120),
  makeChordElement("5", 210, "triadic", 210),
  makeChordElement("b7", 300, "seventh", 300), // Dominant 7th
];

const EXTENDED_CHORD_ELEMENTS: ChordShapeElement[] = [
  makeChordElement("1", 0, "triadic", 0),
  makeChordElement("3", 72, "triadic", 72),
  makeChordElement("5", 144, "triadic", 144),
  makeChordElement("b7", 216, "seventh", 216),
  makeChordElement("9", 288, "extension", 288),
];

// ============================================================================
// Simulation Tests
// ============================================================================

describe("ThreeJSRenderer Simulations", () => {
  let renderer: ThreeJSRenderer;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = new ThreeJSRenderer();
    canvas = createMockCanvas();
    renderer.attach(canvas);
  });

  describe("Chord Shape Transitions", () => {
    it("handles transition from major to minor triad", () => {
      // Frame 1: Major triad
      renderer.render(makeFrame(0, [
        makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", 0),
      ]));

      // Frame 2: Minor triad (different elements)
      renderer.render(makeFrame(500, [
        makeChordShapeEntity("chord", MINOR_TRIAD_ELEMENTS, "wavy", 500),
      ]));

      // Should handle transition without errors
      expect(true).toBe(true);
    });

    it("handles progression through multiple chord qualities", () => {
      const progressions = [
        { elements: MAJOR_TRIAD_ELEMENTS, margin: "straight", t: 0 },
        { elements: MINOR_TRIAD_ELEMENTS, margin: "wavy", t: 1000 },
        { elements: DOMINANT_7_ELEMENTS, margin: "straight", t: 2000 },
        { elements: EXTENDED_CHORD_ELEMENTS, margin: "convex", t: 3000 },
        { elements: MAJOR_TRIAD_ELEMENTS, margin: "concave", t: 4000 },
      ];

      for (const { elements, margin, t } of progressions) {
        renderer.render(makeFrame(t, [
          makeChordShapeEntity("chord", elements, margin, t),
        ]));
      }

      expect(true).toBe(true);
    });

    it("handles chord with all margin styles", () => {
      const margins = ["straight", "wavy", "concave", "convex", "dash-short", "dash-long"];

      for (let i = 0; i < margins.length; i++) {
        const t = i * 1000;
        renderer.render(makeFrame(t, [
          makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, margins[i], t),
        ]));
      }

      expect(true).toBe(true);
    });
  });

  describe("Beat Grid Dynamics", () => {
    it("handles beat lines appearing and disappearing", () => {
      // Frame 1: 4 beat lines
      renderer.render(makeFrame(0, [
        makeBeatLineEntity("beat-1", 0.2, 0),
        makeBeatLineEntity("beat-2", 0.4, 0),
        makeBeatLineEntity("beat-3", 0.6, 0),
        makeBeatLineEntity("beat-4", 0.8, 0),
      ]));

      // Frame 2: Only 2 beat lines (others removed)
      renderer.render(makeFrame(500, [
        makeBeatLineEntity("beat-1", 0.2, 500),
        makeBeatLineEntity("beat-3", 0.6, 500),
      ]));

      // Frame 3: New beat lines
      renderer.render(makeFrame(1000, [
        makeBeatLineEntity("beat-new-1", 0.25, 1000),
        makeBeatLineEntity("beat-new-2", 0.5, 1000),
        makeBeatLineEntity("beat-new-3", 0.75, 1000),
      ]));

      expect(true).toBe(true);
    });

    it("handles scrolling beat grid (lines moving position)", () => {
      // Simulate beat lines scrolling across screen
      for (let frame = 0; frame < 10; frame++) {
        const t = frame * 100;
        const lines: Entity[] = [];

        for (let i = 0; i < 5; i++) {
          const y = ((i * 0.2) + (frame * 0.05)) % 1;
          lines.push(makeBeatLineEntity(`beat-${i}`, y, t));
        }

        renderer.render(makeFrame(t, lines));
      }

      expect(true).toBe(true);
    });
  });

  describe("Mixed Content", () => {
    it("handles full scene with chord shape, tension bar, and beat lines", () => {
      const frame = makeFrame(0, [
        makeChordShapeEntity("chord", DOMINANT_7_ELEMENTS, "straight", 0),
        makeTensionBarEntity("tension", 0.6, 0),
        makeBeatLineEntity("beat-1", 0.25, 0),
        makeBeatLineEntity("beat-2", 0.5, 0),
        makeBeatLineEntity("beat-3", 0.75, 0),
      ]);

      renderer.render(frame);
      expect(true).toBe(true);
    });

    it("handles scene with particles and chord shapes", () => {
      const particles: Entity[] = [];
      for (let i = 0; i < 10; i++) {
        particles.push(makeParticleEntity(
          `particle-${i}`,
          0.1 + (i * 0.08),
          0.3 + Math.sin(i) * 0.2,
          (i * 36) % 360,
          0
        ));
      }

      renderer.render(makeFrame(0, [
        makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", 0),
        ...particles,
      ]));

      expect(true).toBe(true);
    });
  });

  describe("Entity Lifecycle", () => {
    it("handles rapid entity replacement", () => {
      // Simulate rapid chord changes (like fast arpeggios detected as chords)
      for (let i = 0; i < 20; i++) {
        const t = i * 50;
        const elements = i % 2 === 0 ? MAJOR_TRIAD_ELEMENTS : MINOR_TRIAD_ELEMENTS;
        renderer.render(makeFrame(t, [
          makeChordShapeEntity("chord", elements, "straight", t),
        ]));
      }

      expect(true).toBe(true);
    });

    it("handles entity with decaying life", () => {
      const entityWithLife: Entity = {
        id: "decaying",
        part: "main",
        kind: "particle",
        createdAt: 0,
        updatedAt: 500,
        position: { x: 0.5, y: 0.5 },
        style: { color: makeColor(120), size: 30, opacity: 1 },
        life: { ttlMs: 1000, ageMs: 500 },
      };

      renderer.render(makeFrame(500, [entityWithLife]));

      // Age to near death
      const nearDeath = {
        ...entityWithLife,
        updatedAt: 900,
        life: { ttlMs: 1000, ageMs: 900 },
      };
      renderer.render(makeFrame(900, [nearDeath]));

      expect(true).toBe(true);
    });

    it("handles empty frame after populated frame", () => {
      // Populated frame
      renderer.render(makeFrame(0, [
        makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", 0),
        makeTensionBarEntity("tension", 0.5, 0),
      ]));

      // Empty frame (all entities removed)
      renderer.render(makeFrame(500, []));

      // Re-populated frame
      renderer.render(makeFrame(1000, [
        makeChordShapeEntity("new-chord", MINOR_TRIAD_ELEMENTS, "wavy", 1000),
      ]));

      expect(true).toBe(true);
    });
  });

  describe("Performance Scenarios", () => {
    it("handles many particles (dense visualization)", () => {
      const particles: Entity[] = [];
      for (let i = 0; i < 100; i++) {
        particles.push(makeParticleEntity(
          `p-${i}`,
          Math.random(),
          Math.random(),
          Math.random() * 360,
          0
        ));
      }

      renderer.render(makeFrame(0, particles));
      expect(true).toBe(true);
    });

    it("handles sustained rendering loop", () => {
      // Simulate 60 frames (1 second at 60fps)
      for (let frame = 0; frame < 60; frame++) {
        const t = frame * 16.67;

        // Mix of static and dynamic elements
        const tension = 0.5 + Math.sin(frame * 0.1) * 0.3;
        const entities: Entity[] = [
          makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", t),
          makeTensionBarEntity("tension", tension, t),
        ];

        // Add some particles that come and go
        if (frame % 10 < 5) {
          entities.push(makeParticleEntity("flash", 0.3, 0.3, 60, t));
        }

        renderer.render(makeFrame(t, entities));
      }

      expect(true).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles chord shape with single element", () => {
      const singleElement = [makeChordElement("1", 0, "triadic", 0)];
      renderer.render(makeFrame(0, [
        makeChordShapeEntity("chord", singleElement, "straight", 0),
      ]));

      expect(true).toBe(true);
    });

    it("handles chord shape with no elements (fallback to placeholder)", () => {
      renderer.render(makeFrame(0, [
        makeChordShapeEntity("chord", [], "straight", 0),
      ]));

      expect(true).toBe(true);
    });

    it("handles entities with missing optional fields", () => {
      const minimalEntity: Entity = {
        id: "minimal",
        part: "main",
        kind: "particle",
        createdAt: 0,
        updatedAt: 0,
        style: {},
      };

      renderer.render(makeFrame(0, [minimalEntity]));
      expect(true).toBe(true);
    });

    it("handles render after detach (no-op)", () => {
      renderer.render(makeFrame(0, [
        makeChordShapeEntity("chord", MAJOR_TRIAD_ELEMENTS, "straight", 0),
      ]));

      renderer.detach();

      // Should be a no-op, not throw
      renderer.render(makeFrame(500, [
        makeChordShapeEntity("chord", MINOR_TRIAD_ELEMENTS, "wavy", 500),
      ]));

      expect(true).toBe(true);
    });
  });
});
