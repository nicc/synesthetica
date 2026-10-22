/**
 * Three.js module mocks for renderer tests.
 *
 * Records the state the renderer writes (positions, scales, material
 * and uniform values, scene membership, dispose calls) so tests can
 * assert on it without WebGL. Use from a test file as:
 *
 *   vi.mock("three", async () => (await import("./_harness/threeMocks")).mockThree());
 *
 * The Line2 and LineMaterial mocks build on the mocked three module,
 * which the caller passes in: an `import("three")` made from this file
 * would resolve to the real module, not the mock.
 */

import { vi } from "vitest";
import type * as Three from "three";

export function mockThree() {
  class Color {
    r = 0;
    g = 0;
    b = 0;
    constructor(r?: number, g?: number, b?: number) {
      if (r !== undefined && g !== undefined && b !== undefined) {
        this.r = r; this.g = g; this.b = b;
      }
    }
    copy(o: Color) {
      this.r = o.r; this.g = o.g; this.b = o.b;
      return this;
    }
    getHex() { return 0; }
  }

  class Vector2 {
    constructor(public x = 0, public y = 0) {}
    set(x: number, y: number) { this.x = x; this.y = y; return this; }
    copy(o: Vector2) { this.x = o.x; this.y = o.y; return this; }
  }

  class Vector3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
  }

  class Material {
    transparent = false;
    opacity = 1;
    blending = 1;
    depthWrite = true;
    color = new Color();
    dispose = vi.fn();
    constructor(params: Record<string, unknown> = {}) {
      Object.assign(this, params);
    }
  }
  class MeshBasicMaterial extends Material {}
  class LineBasicMaterial extends Material {}
  class ShaderMaterial extends Material {
    declare uniforms: Record<string, { value: unknown }>;
    declare fragmentShader: string;
  }

  class Texture { dispose = vi.fn(); }

  class BufferGeometry {
    dispose = vi.fn();
    points: Vector3[] = [];
    setFromPoints(points: Vector3[]) { this.points = points; return this; }
    setAttribute() { return this; }
    setIndex() { return this; }
    translate() { return this; }
  }
  class CircleGeometry extends BufferGeometry {}
  class PlaneGeometry extends BufferGeometry {}
  class RingGeometry extends BufferGeometry {}
  class ShapeGeometry extends BufferGeometry {}

  class Object3D {
    name = "";
    visible = true;
    renderOrder = 0;
    position = new Vector3();
    scale = new Vector3(1, 1, 1);
    children: Object3D[] = [];
    userData: Record<string, unknown> = {};
    add(obj: Object3D) { this.children.push(obj); }
    getObjectByName(name: string) { return this.children.find((c) => c.name === name); }
    traverse(cb: (o: Object3D) => void) {
      cb(this);
      this.children.forEach((c) => c.traverse(cb));
    }
  }
  class Mesh extends Object3D {
    constructor(public geometry = new BufferGeometry(), public material: Material = new Material()) {
      super();
    }
  }
  class Line extends Mesh {}
  class Group extends Object3D {}

  class Scene {
    background: Color | null = null;
    children: Object3D[] = [];
    add = vi.fn((obj: Object3D) => { this.children.push(obj); });
    remove = vi.fn((obj: Object3D) => {
      const i = this.children.indexOf(obj);
      if (i >= 0) this.children.splice(i, 1);
    });
  }

  class PerspectiveCamera {
    position = new Vector3();
    constructor(public fov: number, public aspect: number) {}
    lookAt = vi.fn();
    updateProjectionMatrix = vi.fn();
  }

  class WebGLRenderer {
    private pixelRatio = 1;
    setPixelRatio = vi.fn((r: number) => { this.pixelRatio = r; });
    getPixelRatio = () => this.pixelRatio;
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }

  class Shape {
    moveTo = vi.fn();
    lineTo = vi.fn();
    quadraticCurveTo = vi.fn();
    bezierCurveTo = vi.fn();
    closePath = vi.fn();
    curves: unknown[] = [];
    getPoints = vi.fn(() => []);
  }

  return {
    WebGLRenderer, Scene, PerspectiveCamera, Color, Vector2, Vector3,
    Object3D, Mesh, Line, Group, Shape, ShapeGeometry, CircleGeometry,
    PlaneGeometry, RingGeometry, BufferGeometry, Texture, Material,
    MeshBasicMaterial, ShaderMaterial, LineBasicMaterial,
    DoubleSide: 2, NormalBlending: 1, AdditiveBlending: 2,
  };
}

/** Real Line2 is a Mesh. */
export function mockLine2(THREE: typeof Three) {
  class Line2 extends THREE.Mesh {
    computeLineDistances() { return this; }
  }
  return { Line2 };
}

/** LineMaterial copies the resolution it is given, as the real one does. */
export function mockLineMaterial(THREE: typeof Three) {
  class LineMaterial {
    color = new THREE.Color();
    opacity = 1;
    transparent = false;
    resolution = new THREE.Vector2();
    dispose = vi.fn();
    constructor({ color: _color, resolution, ...rest }: Record<string, unknown> = {}) {
      Object.assign(this, rest);
      if (resolution) this.resolution.copy(resolution as InstanceType<typeof THREE.Vector2>);
    }
  }
  return { LineMaterial };
}

export function mockLineGeometry() {
  class LineGeometry {
    dispose = vi.fn();
    setPositions() { return this; }
    setColors() { return this; }
  }
  return { LineGeometry };
}
