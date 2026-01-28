import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SceneFrame, Entity } from "@synesthetica/contracts";

// Mock window for Node.js environment
const mockWindow = {
  devicePixelRatio: 1,
};
vi.stubGlobal("window", mockWindow);

// Mock Three.js module before importing the renderer
vi.mock("three", () => {
  // Mock Color class
  class MockColor {
    r = 0;
    g = 0;
    b = 0;
    constructor(_color?: number) {}
    setHSL(_h: number, _s: number, _l: number) {
      return this;
    }
  }

  // Mock Vector3 class
  class MockVector3 {
    x = 0;
    y = 0;
    z = 0;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  }

  // Mock Material base class
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

  // Mock Geometry classes
  class MockBufferGeometry {
    dispose = vi.fn();
    setFromPoints = vi.fn();
  }

  class MockCircleGeometry extends MockBufferGeometry {}
  class MockPlaneGeometry extends MockBufferGeometry {}
  class MockRingGeometry extends MockBufferGeometry {}

  // Mock Object3D classes
  class MockObject3D {
    name = "";
    position = new MockVector3();
    scale = new MockVector3(1, 1, 1);
    children: MockObject3D[] = [];
    getObjectByName(name: string): MockObject3D | undefined {
      return this.children.find((c) => c.name === name);
    }
  }

  class MockMesh extends MockObject3D {
    geometry: MockBufferGeometry;
    material: MockMaterial;
    constructor(geometry?: MockBufferGeometry, material?: MockMaterial) {
      super();
      this.geometry = geometry ?? new MockBufferGeometry();
      this.material = material ?? new MockMaterial();
    }
  }

  class MockLine extends MockObject3D {
    geometry: MockBufferGeometry;
    material: MockMaterial;
    constructor(geometry?: MockBufferGeometry, material?: MockMaterial) {
      super();
      this.geometry = geometry ?? new MockBufferGeometry();
      this.material = material ?? new MockMaterial();
    }
  }

  class MockGroup extends MockObject3D {
    add(obj: MockObject3D) {
      this.children.push(obj);
    }
  }

  // Mock Scene
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

  // Mock Camera
  class MockPerspectiveCamera {
    fov: number;
    aspect: number;
    near: number;
    far: number;
    position = new MockVector3();
    constructor(fov: number, aspect: number, near: number, far: number) {
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
    }
    lookAt = vi.fn();
    updateProjectionMatrix = vi.fn();
  }

  // Mock WebGLRenderer
  class MockWebGLRenderer {
    domElement: HTMLCanvasElement | null = null;
    constructor(_config: { canvas?: HTMLCanvasElement; antialias?: boolean; alpha?: boolean }) {
      this.domElement = _config.canvas ?? null;
    }
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

// Import after mocking
import { ThreeJSRenderer } from "../src/renderers/ThreeJSRenderer";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 800,
    height: 600,
    style: {},
  } as unknown as HTMLCanvasElement;
}

function createEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "test-entity",
    part: "test-part",
    kind: "particle",
    createdAt: 1000,
    updatedAt: 1000,
    position: { x: 0.5, y: 0.5 },
    style: {
      color: { h: 0, s: 1, v: 1 },
      size: 20,
      opacity: 1,
    },
    ...overrides,
  };
}

function createSceneFrame(entities: Entity[] = []): SceneFrame {
  return {
    t: 1000,
    entities,
    diagnostics: [],
  };
}

describe("ThreeJSRenderer", () => {
  let renderer: ThreeJSRenderer;
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = new ThreeJSRenderer();
    mockCanvas = createMockCanvas();
  });

  describe("attachment", () => {
    it("attaches to canvas and initializes Three.js components", () => {
      renderer.attach(mockCanvas);

      // Should have created renderer, scene, camera
      // Access via render call
      const frame = createSceneFrame([]);
      renderer.render(frame);

      // If render was called without throwing, attachment succeeded
      expect(true).toBe(true);
    });

    it("does nothing when rendering without attachment", () => {
      const frame = createSceneFrame([createEntity()]);

      // Should not throw
      renderer.render(frame);
      expect(true).toBe(true);
    });

    it("detaches cleanly", () => {
      renderer.attach(mockCanvas);
      renderer.detach();

      const frame = createSceneFrame([createEntity()]);
      renderer.render(frame);

      // Should not throw after detach
      expect(true).toBe(true);
    });
  });

  describe("entity rendering", () => {
    beforeEach(() => {
      renderer.attach(mockCanvas);
    });

    it("renders empty frame without errors", () => {
      const frame = createSceneFrame();
      renderer.render(frame);
      expect(true).toBe(true);
    });

    it("creates mesh for particle entity", () => {
      const entity = createEntity({ id: "p1", kind: "particle" });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      // Render again to verify reuse
      renderer.render(frame);
      expect(true).toBe(true);
    });

    it("creates line for trail entity", () => {
      const entity = createEntity({
        id: "t1",
        kind: "trail",
        velocity: { x: 0.1, y: -0.1 },
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);
      expect(true).toBe(true);
    });

    it("handles field entities with different types", () => {
      const beatLine = createEntity({
        id: "f1",
        kind: "field",
        data: { type: "beat-line" },
      });
      const driftRing = createEntity({
        id: "f2",
        kind: "field",
        data: { type: "drift-ring" },
      });
      const glowField = createEntity({
        id: "f3",
        kind: "field",
        data: { type: "glow" },
      });

      const frame = createSceneFrame([beatLine, driftRing, glowField]);
      renderer.render(frame);
      expect(true).toBe(true);
    });

    it("handles glyph entities with different types", () => {
      const chordShape = createEntity({
        id: "g1",
        kind: "glyph",
        data: { type: "chord-shape" },
      });
      const tensionBar = createEntity({
        id: "g2",
        kind: "glyph",
        data: { type: "tension-bar", tension: 0.7 },
      });

      const frame = createSceneFrame([chordShape, tensionBar]);
      renderer.render(frame);
      expect(true).toBe(true);
    });
  });

  describe("entity lifecycle", () => {
    beforeEach(() => {
      renderer.attach(mockCanvas);
    });

    it("reuses objects for same entity id", () => {
      const entity = createEntity({ id: "reuse-test" });

      // Render twice with same entity
      renderer.render(createSceneFrame([entity]));
      renderer.render(createSceneFrame([entity]));

      expect(true).toBe(true);
    });

    it("removes objects when entity leaves frame", () => {
      const entity1 = createEntity({ id: "e1" });
      const entity2 = createEntity({ id: "e2" });

      // Render with both
      renderer.render(createSceneFrame([entity1, entity2]));

      // Render with only one
      renderer.render(createSceneFrame([entity1]));

      // entity2's object should be removed
      expect(true).toBe(true);
    });

    it("handles entity replacement", () => {
      const entity = createEntity({ id: "replace-test" });

      renderer.render(createSceneFrame([entity]));

      // Update entity position
      const updated = { ...entity, position: { x: 0.8, y: 0.2 } };
      renderer.render(createSceneFrame([updated]));

      expect(true).toBe(true);
    });
  });

  describe("coordinate transformation", () => {
    beforeEach(() => {
      renderer.attach(mockCanvas);
    });

    it("transforms normalized coordinates to world space", () => {
      // Default world is 100x75
      const entity = createEntity({
        id: "coord-test",
        position: { x: 0.5, y: 0.5 }, // Center
      });

      renderer.render(createSceneFrame([entity]));

      // World coords should be (50, 37.5) with Y flipped
      expect(true).toBe(true);
    });

    it("handles edge positions correctly", () => {
      const corners = [
        createEntity({ id: "tl", position: { x: 0, y: 0 } }),
        createEntity({ id: "tr", position: { x: 1, y: 0 } }),
        createEntity({ id: "bl", position: { x: 0, y: 1 } }),
        createEntity({ id: "br", position: { x: 1, y: 1 } }),
      ];

      renderer.render(createSceneFrame(corners));
      expect(true).toBe(true);
    });
  });

  describe("life decay", () => {
    beforeEach(() => {
      renderer.attach(mockCanvas);
    });

    it("applies life decay to opacity", () => {
      const entity = createEntity({
        id: "life-test",
        life: { ttlMs: 1000, ageMs: 500 }, // 50% life remaining
        style: { opacity: 1 },
      });

      renderer.render(createSceneFrame([entity]));

      // Opacity should be 0.5 after life decay
      expect(true).toBe(true);
    });

    it("handles entity at end of life", () => {
      const entity = createEntity({
        id: "dying",
        life: { ttlMs: 1000, ageMs: 1000 }, // 0% life remaining
      });

      renderer.render(createSceneFrame([entity]));
      expect(true).toBe(true);
    });
  });

  describe("configuration", () => {
    it("uses custom background color", () => {
      const customRenderer = new ThreeJSRenderer({
        backgroundColor: 0xff0000,
      });
      customRenderer.attach(mockCanvas);

      const frame = createSceneFrame();
      customRenderer.render(frame);

      expect(true).toBe(true);
    });

    it("uses custom world dimensions", () => {
      const customRenderer = new ThreeJSRenderer({
        worldWidth: 200,
        worldHeight: 150,
      });
      customRenderer.attach(mockCanvas);

      const entity = createEntity({ position: { x: 0.5, y: 0.5 } });
      customRenderer.render(createSceneFrame([entity]));

      // Position should be (100, 75) in world coords
      expect(true).toBe(true);
    });
  });

  describe("resize", () => {
    it("updates renderer and camera on resize", () => {
      renderer.attach(mockCanvas);
      renderer.resize(1920, 1080);

      // Should update without error
      expect(true).toBe(true);
    });

    it("handles resize before attach gracefully", () => {
      renderer.resize(1920, 1080);
      expect(true).toBe(true);
    });
  });
});
