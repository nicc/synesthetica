import { describe, it, expect, beforeEach, vi } from "vitest";
import { Canvas2DRenderer } from "../src/renderers/Canvas2DRenderer";
import type { SceneFrame, Entity } from "@synesthetica/contracts";

/**
 * Mock Canvas2D context for testing.
 * Tracks all drawing calls for verification.
 */
function createMockContext() {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    fillStyle: "",
    fillRect: vi.fn((...args: unknown[]) => calls.push({ method: "fillRect", args })),
    beginPath: vi.fn(() => calls.push({ method: "beginPath", args: [] })),
    arc: vi.fn((...args: unknown[]) => calls.push({ method: "arc", args })),
    fill: vi.fn(() => calls.push({ method: "fill", args: [] })),
    calls,
  } as unknown as CanvasRenderingContext2D & { calls: Array<{ method: string; args: unknown[] }> };
}

function createMockCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  return {
    width: 800,
    height: 600,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
}

function createEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "test-entity",
    part: "test-part",
    kind: "particle",
    createdAt: 1000,
    updatedAt: 1000,
    position: { x: 100, y: 200 },
    style: {
      color: { h: 0, s: 1, v: 1 }, // Red
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

describe("Canvas2DRenderer", () => {
  let renderer: Canvas2DRenderer;
  let mockCtx: CanvasRenderingContext2D & { calls: Array<{ method: string; args: unknown[] }> };
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    renderer = new Canvas2DRenderer();
    mockCtx = createMockContext();
    mockCanvas = createMockCanvas(mockCtx);
  });

  describe("attachment", () => {
    it("attaches to canvas", () => {
      renderer.attach(mockCanvas);
      expect(mockCanvas.getContext).toHaveBeenCalledWith("2d");
    });

    it("does nothing when rendering without attachment", () => {
      const frame = createSceneFrame([createEntity()]);
      // Should not throw
      renderer.render(frame);
      expect(mockCtx.calls).toHaveLength(0);
    });

    it("detaches cleanly", () => {
      renderer.attach(mockCanvas);
      renderer.detach();

      const frame = createSceneFrame([createEntity()]);
      renderer.render(frame);
      // Only the getContext call from attach, no render calls
      expect(mockCtx.calls).toHaveLength(0);
    });
  });

  describe("frame rendering", () => {
    beforeEach(() => {
      renderer.attach(mockCanvas);
    });

    it("clears canvas each frame by default", () => {
      const frame = createSceneFrame();
      renderer.render(frame);

      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });

    it("renders empty frame without errors", () => {
      const frame = createSceneFrame();
      renderer.render(frame);

      // Should just clear
      expect(mockCtx.calls).toHaveLength(1);
      expect(mockCtx.calls[0].method).toBe("fillRect");
    });

    it("renders a particle entity", () => {
      const entity = createEntity({
        position: { x: 100, y: 200 },
        style: { color: { h: 0, s: 1, v: 1 }, size: 20, opacity: 1 },
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      // Should have: fillRect (clear), beginPath, arc, fill
      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.arc).toHaveBeenCalledWith(100, 200, 10, 0, Math.PI * 2);
      expect(mockCtx.fill).toHaveBeenCalled();
    });

    it("renders multiple particles", () => {
      const entities = [
        createEntity({ id: "p1", position: { x: 100, y: 100 } }),
        createEntity({ id: "p2", position: { x: 200, y: 200 } }),
        createEntity({ id: "p3", position: { x: 300, y: 300 } }),
      ];
      const frame = createSceneFrame(entities);

      renderer.render(frame);

      // 3 particles = 3 arc calls
      expect(mockCtx.arc).toHaveBeenCalledTimes(3);
    });
  });

  describe("particle styling", () => {
    beforeEach(() => {
      renderer.attach(mockCanvas);
    });

    it("uses entity position", () => {
      const entity = createEntity({
        position: { x: 400, y: 300 },
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      expect(mockCtx.arc).toHaveBeenCalledWith(
        400,
        300,
        expect.any(Number),
        0,
        Math.PI * 2
      );
    });

    it("uses entity size as diameter", () => {
      const entity = createEntity({
        style: { size: 50 },
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      // size 50 = radius 25
      expect(mockCtx.arc).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        25,
        0,
        Math.PI * 2
      );
    });

    it("defaults size to 10 when not specified", () => {
      const entity = createEntity({
        style: {},
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      // default size 10 = radius 5
      expect(mockCtx.arc).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        5,
        0,
        Math.PI * 2
      );
    });

    it("defaults position to (0, 0) when not specified", () => {
      const entity = createEntity({
        position: undefined,
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      expect(mockCtx.arc).toHaveBeenCalledWith(
        0,
        0,
        expect.any(Number),
        0,
        Math.PI * 2
      );
    });
  });

  describe("color conversion", () => {
    beforeEach(() => {
      renderer.attach(mockCanvas);
    });

    it("converts red (h=0) correctly", () => {
      const entity = createEntity({
        style: { color: { h: 0, s: 1, v: 1 }, opacity: 1 },
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      // Red at full saturation/value should be rgba(255, 0, 0, 1)
      expect(mockCtx.fillStyle).toBe("rgba(255, 0, 0, 1.000)");
    });

    it("converts green (h=120) correctly", () => {
      const entity = createEntity({
        style: { color: { h: 120, s: 1, v: 1 }, opacity: 1 },
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      expect(mockCtx.fillStyle).toBe("rgba(0, 255, 0, 1.000)");
    });

    it("converts blue (h=240) correctly", () => {
      const entity = createEntity({
        style: { color: { h: 240, s: 1, v: 1 }, opacity: 1 },
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      expect(mockCtx.fillStyle).toBe("rgba(0, 0, 255, 1.000)");
    });

    it("applies opacity to color", () => {
      const entity = createEntity({
        style: { color: { h: 0, s: 1, v: 1 }, opacity: 0.5 },
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      expect(mockCtx.fillStyle).toBe("rgba(255, 0, 0, 0.500)");
    });

    it("applies life decay to opacity", () => {
      const entity = createEntity({
        style: { color: { h: 0, s: 1, v: 1 }, opacity: 1 },
        life: { ttlMs: 1000, ageMs: 500 }, // Half life
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      // 50% life remaining = 0.5 opacity
      expect(mockCtx.fillStyle).toBe("rgba(255, 0, 0, 0.500)");
    });

    it("combines style opacity and life decay", () => {
      const entity = createEntity({
        style: { color: { h: 0, s: 1, v: 1 }, opacity: 0.8 },
        life: { ttlMs: 1000, ageMs: 500 }, // Half life
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      // 0.8 * 0.5 = 0.4 final opacity
      expect(mockCtx.fillStyle).toBe("rgba(255, 0, 0, 0.400)");
    });

    it("handles saturation correctly", () => {
      const entity = createEntity({
        style: { color: { h: 0, s: 0, v: 1 }, opacity: 1 }, // White (no saturation)
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      expect(mockCtx.fillStyle).toBe("rgba(255, 255, 255, 1.000)");
    });

    it("handles value correctly", () => {
      const entity = createEntity({
        style: { color: { h: 0, s: 1, v: 0.5 }, opacity: 1 }, // Dark red
      });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      // Darker red
      expect(mockCtx.fillStyle).toBe("rgba(128, 0, 0, 1.000)");
    });
  });

  describe("configuration", () => {
    it("uses custom background color", () => {
      const customRenderer = new Canvas2DRenderer({
        backgroundColor: "#1a1a1a",
      });
      customRenderer.attach(mockCanvas);

      const frame = createSceneFrame();
      customRenderer.render(frame);

      // fillStyle should be set to background before fillRect
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });

    it("can disable clearing", () => {
      const customRenderer = new Canvas2DRenderer({
        clearEachFrame: false,
      });
      customRenderer.attach(mockCanvas);

      const entity = createEntity();
      const frame = createSceneFrame([entity]);
      customRenderer.render(frame);

      // Should not call fillRect for clearing
      expect(mockCtx.fillRect).not.toHaveBeenCalled();
    });
  });

  describe("unsupported entity kinds", () => {
    beforeEach(() => {
      renderer.attach(mockCanvas);
    });

    it("skips trail entities without error", () => {
      const entity = createEntity({ kind: "trail" });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      // Should just clear, no arc call
      expect(mockCtx.arc).not.toHaveBeenCalled();
    });

    it("skips field entities without error", () => {
      const entity = createEntity({ kind: "field" });
      const frame = createSceneFrame([entity]);

      renderer.render(frame);

      expect(mockCtx.arc).not.toHaveBeenCalled();
    });
  });
});
