/**
 * Three.js WebGL Renderer
 *
 * Renders SceneFrame entities using Three.js for WebGL-powered visuals.
 * Designed for depth, gradients, and high-performance rendering.
 *
 * ## Design Principles
 *
 * - Uses Three.js scene graph to manage entities
 * - Perspective camera enables depth effects (z-axis)
 * - Object pooling for performance (reuse meshes)
 * - Materials support opacity, blending, and future shader effects
 *
 * ## Coordinate System
 *
 * - Input: Normalized coordinates (0-1) from grammars
 * - Output: World space where viewport maps to a configurable size
 * - Z-axis available for depth (0 = camera plane, negative = away)
 */

import * as THREE from "three";
import type {
  IRenderer,
  SceneFrame,
  Entity,
  ChordShapeElement,
  MarginStyle,
} from "@synesthetica/contracts";

// ============================================================================
// Chord Shape Constants (from SPEC 010)
// ============================================================================

const HUB_RADIUS = 0.3;
const ARM_LENGTH: Record<string, number> = {
  triadic: 0.7,
  seventh: 0.45,
  extension: 0.25,
};
const BASE_WIDTH_DEG = 30; // degrees

// ============================================================================
// Configuration
// ============================================================================

export interface ThreeJSRendererConfig {
  /** Background color */
  backgroundColor?: number;

  /** World width (normalized coords map to this) */
  worldWidth?: number;

  /** World height (normalized coords map to this) */
  worldHeight?: number;

  /** Camera field of view */
  fov?: number;

  /** Enable antialiasing */
  antialias?: boolean;
}

const DEFAULT_CONFIG: Required<ThreeJSRendererConfig> = {
  backgroundColor: 0x1a1a2e,
  worldWidth: 100,
  worldHeight: 75,
  fov: 50,
  antialias: true,
};

// ============================================================================
// Renderer Implementation
// ============================================================================

export class ThreeJSRenderer implements IRenderer {
  readonly id = "threejs";

  private config: Required<ThreeJSRendererConfig>;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  // Entity object pools (keyed by entity id)
  private entityObjects: Map<string, THREE.Object3D> = new Map();

  // Reusable geometries
  private circleGeometry: THREE.CircleGeometry | null = null;
  private planeGeometry: THREE.PlaneGeometry | null = null;

  constructor(config: ThreeJSRendererConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attach to a canvas element and initialize Three.js.
   */
  attach(canvas: HTMLCanvasElement): void {
    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.config.antialias,
      alpha: false,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(canvas.width, canvas.height);

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.config.backgroundColor);

    // Create camera
    const aspect = canvas.width / canvas.height;
    this.camera = new THREE.PerspectiveCamera(
      this.config.fov,
      aspect,
      0.1,
      1000
    );

    // Position camera to view the world plane
    // Calculate distance so worldHeight fits in view
    const vFov = (this.config.fov * Math.PI) / 180;
    const cameraZ = this.config.worldHeight / 2 / Math.tan(vFov / 2);
    this.camera.position.set(
      this.config.worldWidth / 2,
      this.config.worldHeight / 2,
      cameraZ
    );
    this.camera.lookAt(
      this.config.worldWidth / 2,
      this.config.worldHeight / 2,
      0
    );

    // Create reusable geometries
    this.circleGeometry = new THREE.CircleGeometry(1, 32);
    this.planeGeometry = new THREE.PlaneGeometry(1, 1);
  }

  /**
   * Detach and clean up resources.
   */
  detach(): void {
    // Dispose all entity objects
    for (const obj of this.entityObjects.values()) {
      this.disposeObject(obj);
    }
    this.entityObjects.clear();

    // Dispose geometries
    this.circleGeometry?.dispose();
    this.planeGeometry?.dispose();
    this.circleGeometry = null;
    this.planeGeometry = null;

    // Dispose renderer
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }

  /**
   * Render a scene frame.
   */
  render(frame: SceneFrame): void {
    if (!this.renderer || !this.scene || !this.camera) return;

    // Track which entities are in this frame
    const currentIds = new Set<string>();

    // Update or create objects for each entity
    for (const entity of frame.entities) {
      currentIds.add(entity.id);
      this.updateEntity(entity);
    }

    // Remove objects for entities no longer in scene
    for (const [id, obj] of this.entityObjects) {
      if (!currentIds.has(id)) {
        this.scene.remove(obj);
        this.disposeObject(obj);
        this.entityObjects.delete(id);
      }
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Resize the renderer to match canvas size.
   */
  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;

    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // ==========================================================================
  // Entity Rendering
  // ==========================================================================

  private updateEntity(entity: Entity): void {
    switch (entity.kind) {
      case "particle":
        this.updateParticle(entity);
        break;
      case "field":
        this.updateField(entity);
        break;
      case "trail":
        this.updateTrail(entity);
        break;
      case "glyph":
        this.updateGlyph(entity);
        break;
      case "group":
        // Not implemented yet
        break;
    }
  }

  /**
   * Render a particle as a circle/sphere.
   */
  private updateParticle(entity: Entity): void {
    if (!this.scene || !this.circleGeometry) return;

    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;

    if (!mesh) {
      // Create new mesh
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
      });
      mesh = new THREE.Mesh(this.circleGeometry, material);
      this.scene.add(mesh);
      this.entityObjects.set(entity.id, mesh);
    }

    // Update position (normalized to world coords)
    const x = (entity.position?.x ?? 0) * this.config.worldWidth;
    const y = (1 - (entity.position?.y ?? 0)) * this.config.worldHeight; // Flip Y
    const z = 0;
    mesh.position.set(x, y, z);

    // Update scale (size)
    const size = entity.style.size ?? 10;
    const scale = size / 10; // Normalize size
    mesh.scale.set(scale, scale, 1);

    // Update material
    const material = mesh.material as THREE.MeshBasicMaterial;
    const color = entity.style.color ?? { h: 0, s: 1, v: 1 };
    material.color.setHSL(color.h / 360, color.s, color.v / 2); // HSV to HSL approximation

    // Calculate opacity with life decay
    let opacity = entity.style.opacity ?? 1;
    if (entity.life) {
      const lifeRatio = 1 - entity.life.ageMs / entity.life.ttlMs;
      opacity *= Math.max(0, lifeRatio);
    }
    material.opacity = opacity * (color.a ?? 1);
  }

  /**
   * Render a field entity (lines, areas, effects).
   */
  private updateField(entity: Entity): void {
    const fieldType = entity.data?.type as string | undefined;

    if (
      fieldType === "beat-line" ||
      fieldType === "bar-line" ||
      fieldType === "division-tick"
    ) {
      this.updateLine(entity);
    } else if (fieldType === "now-line") {
      this.updateLine(entity);
    } else if (fieldType === "drift-ring") {
      this.updateRing(entity);
    } else {
      // Default field: glowing area
      this.updateGlowField(entity);
    }
  }

  /**
   * Render a horizontal line (beat/bar lines).
   */
  private updateLine(entity: Entity): void {
    if (!this.scene) return;

    let line = this.entityObjects.get(entity.id) as THREE.Line | undefined;

    if (!line) {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.LineBasicMaterial({ transparent: true });
      line = new THREE.Line(geometry, material);
      this.scene.add(line);
      this.entityObjects.set(entity.id, line);
    }

    // Line spans full width at y position
    const y = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    const points = [
      new THREE.Vector3(0, y, 0),
      new THREE.Vector3(this.config.worldWidth, y, 0),
    ];
    (line.geometry as THREE.BufferGeometry).setFromPoints(points);

    // Update material
    const material = line.material as THREE.LineBasicMaterial;
    const color = entity.style.color ?? { h: 0, s: 0, v: 0.5 };
    material.color.setHSL(color.h / 360, color.s, color.v / 2);
    material.opacity = entity.style.opacity ?? 0.3;
    material.linewidth = entity.style.size ?? 1;
  }

  /**
   * Render a ring (drift indicator).
   */
  private updateRing(entity: Entity): void {
    if (!this.scene) return;

    let ring = this.entityObjects.get(entity.id) as THREE.Line | undefined;

    if (!ring) {
      const geometry = new THREE.RingGeometry(0.9, 1, 32);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
      });
      ring = new THREE.Mesh(geometry, material) as unknown as THREE.Line;
      this.scene.add(ring);
      this.entityObjects.set(entity.id, ring);
    }

    // Position
    const x = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const y = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    ring.position.set(x, y, 0);

    // Scale
    const size = entity.style.size ?? 20;
    ring.scale.set(size / 20, size / 20, 1);

    // Material
    const material = (ring as unknown as THREE.Mesh)
      .material as THREE.MeshBasicMaterial;
    const color = entity.style.color ?? { h: 120, s: 0.7, v: 0.8 };
    material.color.setHSL(color.h / 360, color.s, color.v / 2);
    material.opacity = entity.style.opacity ?? 0.6;
  }

  /**
   * Render a glowing field effect.
   */
  private updateGlowField(entity: Entity): void {
    if (!this.scene || !this.circleGeometry) return;

    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;

    if (!mesh) {
      // Use a larger circle with gradient-like appearance
      const geometry = new THREE.CircleGeometry(1, 32);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
      });
      mesh = new THREE.Mesh(geometry, material);
      this.scene.add(mesh);
      this.entityObjects.set(entity.id, mesh);
    }

    // Position
    const x = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const y = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    mesh.position.set(x, y, -1); // Slightly behind

    // Scale
    const size = entity.style.size ?? 100;
    mesh.scale.set(size / 10, size / 10, 1);

    // Material
    const material = mesh.material as THREE.MeshBasicMaterial;
    const color = entity.style.color ?? { h: 0, s: 0, v: 1 };
    material.color.setHSL(color.h / 360, color.s, color.v / 2);

    let opacity = entity.style.opacity ?? 0.5;
    if (entity.life) {
      const lifeRatio = 1 - entity.life.ageMs / entity.life.ttlMs;
      opacity *= Math.max(0, lifeRatio);
    }
    material.opacity = opacity * 0.3; // Fields are more subtle
  }

  /**
   * Render a trail (line from position to position+velocity).
   */
  private updateTrail(entity: Entity): void {
    if (!this.scene) return;

    let line = this.entityObjects.get(entity.id) as THREE.Line | undefined;

    if (!line) {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.LineBasicMaterial({ transparent: true });
      line = new THREE.Line(geometry, material);
      this.scene.add(line);
      this.entityObjects.set(entity.id, line);
    }

    // Trail from position to position + velocity
    const x1 = (entity.position?.x ?? 0) * this.config.worldWidth;
    const y1 = (1 - (entity.position?.y ?? 0)) * this.config.worldHeight;
    const vx = (entity.velocity?.x ?? 0) * this.config.worldWidth;
    const vy = -(entity.velocity?.y ?? 0) * this.config.worldHeight;

    const points = [
      new THREE.Vector3(x1, y1, 0),
      new THREE.Vector3(x1 + vx, y1 + vy, 0),
    ];
    (line.geometry as THREE.BufferGeometry).setFromPoints(points);

    // Material
    const material = line.material as THREE.LineBasicMaterial;
    const color = entity.style.color ?? { h: 0, s: 1, v: 1 };
    material.color.setHSL(color.h / 360, color.s, color.v / 2);

    let opacity = entity.style.opacity ?? 0.8;
    if (entity.life) {
      const lifeRatio = 1 - entity.life.ageMs / entity.life.ttlMs;
      opacity *= Math.max(0, lifeRatio);
    }
    material.opacity = opacity;
  }

  /**
   * Render a glyph (complex shape like chord diagrams).
   * For now, renders as a colored circle at position.
   * TODO: Implement proper chord shape rendering.
   */
  private updateGlyph(entity: Entity): void {
    if (!this.scene || !this.circleGeometry) return;

    const glyphType = entity.data?.type as string | undefined;

    if (glyphType === "chord-shape") {
      this.updateChordShape(entity);
    } else if (glyphType === "tension-bar") {
      this.updateTensionBar(entity);
    } else {
      // Default glyph: circle
      this.updateParticle(entity);
    }
  }

  /**
   * Render a chord shape with arms radiating from a styled hub.
   * Uses ChordShapeElement data from entity.data.elements.
   */
  private updateChordShape(entity: Entity): void {
    if (!this.scene) return;

    const elements = entity.data?.elements as ChordShapeElement[] | undefined;
    const margin = (entity.data?.margin as MarginStyle) ?? "straight";

    // If no elements, fall back to placeholder
    if (!elements || elements.length === 0) {
      this.updateChordShapePlaceholder(entity);
      return;
    }

    // Check if we need to rebuild geometry (elements changed)
    let group = this.entityObjects.get(entity.id) as THREE.Group | undefined;
    const existingElementCount = group?.userData?.elementCount as number | undefined;

    if (!group || existingElementCount !== elements.length) {
      // Remove old group if it exists
      if (group) {
        this.scene.remove(group);
        this.disposeObject(group);
      }

      // Build new geometry
      group = this.buildChordShapeGroup(elements, margin);
      group.userData = { elementCount: elements.length };
      this.scene.add(group);
      this.entityObjects.set(entity.id, group);
    }

    // Position at center
    const x = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const y = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    group.position.set(x, y, 0);

    // Scale based on style.size (size is diameter, so /2 for radius)
    const size = entity.style.size ?? 100;
    const scale = size / 100; // Normalized scale
    group.scale.set(scale, scale, 1);

    // Update material opacity
    const opacity = (entity.style.opacity ?? 1) * 0.8;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshBasicMaterial;
        mat.opacity = opacity;
      }
    });
  }

  /**
   * Build Three.js group for chord shape geometry.
   */
  private buildChordShapeGroup(
    elements: ChordShapeElement[],
    margin: MarginStyle
  ): THREE.Group {
    const group = new THREE.Group();

    // Filter wedges (not lines) and sort by angle
    const wedges = elements
      .filter((e) => e.style !== "line")
      .sort((a, b) => a.angle - b.angle);

    if (wedges.length === 0) return group;

    // Base radius for the shape (in local units)
    const baseRadius = 10;
    const hubR = baseRadius * HUB_RADIUS;

    // Build the unified shape using THREE.Shape
    const shape = new THREE.Shape();
    this.buildChordShapePath(shape, wedges, margin, baseRadius, hubR);

    // Create geometry and mesh
    const geometry = new THREE.ShapeGeometry(shape);

    // Use root element color for fill
    const rootElement = wedges.find((e) => e.interval === "1") ?? wedges[0];
    const color = rootElement.color;

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      opacity: 0.8,
    });
    material.color.setHSL(color.h / 360, color.s, color.v / 2);

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    // Add chromatic lines
    const lines = elements.filter((e) => e.style === "line");
    for (const lineEl of lines) {
      const lineMesh = this.buildChromaticLine(lineEl, baseRadius, hubR);
      group.add(lineMesh);
    }

    return group;
  }

  /**
   * Build the path for the chord shape on a THREE.Shape.
   */
  private buildChordShapePath(
    shape: THREE.Shape,
    wedges: ChordShapeElement[],
    margin: MarginStyle,
    baseRadius: number,
    hubR: number
  ): void {
    for (let i = 0; i < wedges.length; i++) {
      const curr = wedges[i];
      const next = wedges[(i + 1) % wedges.length];

      const armLength = ARM_LENGTH[curr.tier] ?? ARM_LENGTH.triadic;
      const tipR = hubR + baseRadius * armLength;

      const armLeftAngle = curr.angle - BASE_WIDTH_DEG / 2;
      const armRightAngle = curr.angle + BASE_WIDTH_DEG / 2;

      const baseLeft = this.polarToXY(armLeftAngle, hubR);
      const baseRight = this.polarToXY(armRightAngle, hubR);
      const tip = this.polarToXY(curr.angle, tipR);

      if (i === 0) {
        shape.moveTo(baseLeft.x, baseLeft.y);
      }

      // Straight edge to tip
      shape.lineTo(tip.x, tip.y);

      // Straight edge to hub right
      shape.lineTo(baseRight.x, baseRight.y);

      // Styled hub arc to next arm
      const nextLeftAngle = next.angle - BASE_WIDTH_DEG / 2;
      this.addStyledArc(shape, armRightAngle, nextLeftAngle, hubR, margin);
    }

    shape.closePath();
  }

  /**
   * Add a styled arc to the shape (straight, wavy, concave, convex).
   */
  private addStyledArc(
    shape: THREE.Shape,
    startAngle: number,
    endAngle: number,
    hubR: number,
    margin: MarginStyle
  ): void {
    // Calculate arc span (going clockwise)
    let arcSpan = endAngle - startAngle;
    if (arcSpan < 0) arcSpan += 360;

    const end = this.polarToXY(endAngle, hubR);

    // For simple margins, use arc approximation with line segments
    if (margin === "straight" || margin === "dash-short" || margin === "dash-long") {
      // Approximate arc with segments
      const segments = Math.max(3, Math.ceil(arcSpan / 15));
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + arcSpan * t;
        const pt = this.polarToXY(angle, hubR);
        shape.lineTo(pt.x, pt.y);
      }
      return;
    }

    if (margin === "wavy") {
      // Wavy arc using quadratic curves
      const steps = Math.max(3, Math.floor(arcSpan / 20));
      const amp = 0.4; // Relative to hubR

      for (let i = 0; i < steps; i++) {
        const t1 = (i + 1) / steps;
        const angle1 = startAngle + arcSpan * t1;
        const midAngle = startAngle + arcSpan * (i + 0.5) / steps;

        const p1 = this.polarToXY(angle1, hubR);
        const waveR = hubR + (i % 2 === 0 ? amp : -amp);
        const ctrl = this.polarToXY(midAngle, waveR);

        shape.quadraticCurveTo(ctrl.x, ctrl.y, p1.x, p1.y);
      }
      return;
    }

    if (margin === "concave") {
      // Concave: curves inward - use bezier curve through inner control point
      const midAngle = startAngle + arcSpan / 2;
      const innerR = hubR * 0.7; // Pull inward
      const ctrl = this.polarToXY(midAngle, innerR);
      shape.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
      return;
    }

    if (margin === "convex") {
      // Convex: curves outward - use bezier curve through outer control point
      const midAngle = startAngle + arcSpan / 2;
      const outerR = hubR * 1.5; // Push outward
      const ctrl = this.polarToXY(midAngle, outerR);
      shape.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
      return;
    }

    // Fallback: straight line
    shape.lineTo(end.x, end.y);
  }

  /**
   * Build a chromatic line mesh.
   */
  private buildChromaticLine(
    element: ChordShapeElement,
    baseRadius: number,
    hubR: number
  ): THREE.Line {
    const outerR = hubR + baseRadius * (ARM_LENGTH.extension ?? 0.25);
    const innerR = hubR + 0.5;

    const inner = this.polarToXY(element.angle, innerR);
    const outer = this.polarToXY(element.angle, outerR);

    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(inner.x, inner.y, 0.1),
      new THREE.Vector3(outer.x, outer.y, 0.1),
    ]);

    const material = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.8,
    });
    material.color.setHSL(
      element.color.h / 360,
      element.color.s,
      element.color.v / 2
    );

    return new THREE.Line(geometry, material);
  }

  /**
   * Fallback placeholder for chord shape when no elements provided.
   */
  private updateChordShapePlaceholder(entity: Entity): void {
    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;

    if (!mesh) {
      const geometry = new THREE.CircleGeometry(1, 8);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
      });
      mesh = new THREE.Mesh(geometry, material);
      this.scene!.add(mesh);
      this.entityObjects.set(entity.id, mesh);
    }

    const x = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const y = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    mesh.position.set(x, y, 0);

    const size = entity.style.size ?? 100;
    const scale = size / 50;
    mesh.scale.set(scale, scale, 1);

    const material = mesh.material as THREE.MeshBasicMaterial;
    const color = entity.style.color ?? { h: 120, s: 0.7, v: 0.6 };
    material.color.setHSL(color.h / 360, color.s, color.v / 2);
    material.opacity = (entity.style.opacity ?? 1) * 0.8;
  }

  /**
   * Convert polar coordinates to XY (0° = 12 o'clock, clockwise).
   */
  private polarToXY(angle: number, radius: number): { x: number; y: number } {
    // Convert from clock-based angles (0° = up) to math angles
    const rad = ((90 - angle) * Math.PI) / 180;
    return {
      x: radius * Math.cos(rad),
      y: radius * Math.sin(rad),
    };
  }

  /**
   * Render a tension bar.
   */
  private updateTensionBar(entity: Entity): void {
    if (!this.scene) return;

    // Use a group for bar background + indicator
    let group = this.entityObjects.get(entity.id) as THREE.Group | undefined;

    if (!group) {
      group = new THREE.Group();

      // Background bar
      const bgGeometry = new THREE.PlaneGeometry(1, 4);
      const bgMaterial = new THREE.MeshBasicMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0.8,
      });
      const bg = new THREE.Mesh(bgGeometry, bgMaterial);
      bg.name = "background";
      group.add(bg);

      // Indicator line
      const indicatorGeometry = new THREE.PlaneGeometry(1.5, 0.1);
      const indicatorMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
      });
      const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
      indicator.name = "indicator";
      group.add(indicator);

      this.scene.add(group);
      this.entityObjects.set(entity.id, group);
    }

    // Position bar
    const x = (entity.position?.x ?? 0.9) * this.config.worldWidth;
    const y = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    group.position.set(x, y, 1); // In front

    // Position indicator based on tension
    const tension = (entity.data?.tension as number) ?? 0.5;
    const indicator = group.getObjectByName("indicator") as THREE.Mesh;
    if (indicator) {
      // Tension 0 = bottom, 1 = top of the 4-unit tall bar
      indicator.position.y = (tension - 0.5) * 4;
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private disposeObject(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh) {
      // Don't dispose shared geometries
      if (
        obj.geometry !== this.circleGeometry &&
        obj.geometry !== this.planeGeometry
      ) {
        obj.geometry.dispose();
      }
      if (obj.material instanceof THREE.Material) {
        obj.material.dispose();
      }
    } else if (obj instanceof THREE.Line) {
      obj.geometry.dispose();
      if (obj.material instanceof THREE.Material) {
        obj.material.dispose();
      }
    } else if (obj instanceof THREE.Group) {
      for (const child of obj.children) {
        this.disposeObject(child);
      }
    }
  }
}
