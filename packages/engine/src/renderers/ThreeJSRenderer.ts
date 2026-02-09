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
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type {
  IRenderer,
  SceneFrame,
  Entity,
  ChordShapeElement,
  MarginStyle,
} from "@synesthetica/contracts";
import { ChordShapeBuilder, getThreeDashParams } from "../utils/ChordShapeBuilder";

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

  // Viewport resolution for LineMaterial (thick lines)
  private resolution = new THREE.Vector2(800, 600);

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

    // Use CSS dimensions (clientWidth/Height), not buffer dimensions (width/height)
    // setSize expects CSS pixels when setPixelRatio is used
    const cssWidth = canvas.clientWidth || canvas.width;
    const cssHeight = canvas.clientHeight || canvas.height;
    this.renderer.setSize(cssWidth, cssHeight);

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.config.backgroundColor);

    // Create camera using CSS dimensions for aspect ratio
    const aspect = cssWidth / cssHeight;
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

    // Track viewport resolution for LineMaterial
    this.resolution.set(cssWidth, cssHeight);

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
   * @param width CSS pixel width (not device pixels)
   * @param height CSS pixel height (not device pixels)
   */
  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;

    // setSize expects CSS pixels when setPixelRatio is used
    this.renderer.setSize(width, height);
    this.resolution.set(width, height);
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

    // Check if we need to rebuild geometry (elements or margin changed)
    let group = this.entityObjects.get(entity.id) as THREE.Group | undefined;
    const existingElementCount = group?.userData?.elementCount as number | undefined;
    const existingMargin = group?.userData?.margin as string | undefined;

    if (!group || existingElementCount !== elements.length || existingMargin !== margin) {
      // Remove old group if it exists
      if (group) {
        this.scene.remove(group);
        this.disposeObject(group);
      }

      // Build new geometry
      group = this.buildChordShapeGroup(elements, margin);
      group.userData = { elementCount: elements.length, margin };
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
   * Build Three.js group for chord shape geometry using ChordShapeBuilder.
   */
  private buildChordShapeGroup(
    elements: ChordShapeElement[],
    margin: MarginStyle
  ): THREE.Group {
    const group = new THREE.Group();

    // Base radius for the shape (in local units)
    const baseRadius = 10;

    // Use ChordShapeBuilder to compute geometry
    const builder = new ChordShapeBuilder(elements, margin, {
      scale: baseRadius,
      center: { x: 0, y: 0 }, // Local coordinates, group handles positioning
    });

    // Get the unified shape
    const shape = builder.toThreeShape();
    const geometry = new THREE.ShapeGeometry(shape);

    // Find root element for fill color
    const arms = builder.getArms();
    const rootArm = arms.find((a) => a.interval === "1") ?? arms[0];
    const color = rootArm?.color ?? { h: 0, s: 0.5, v: 0.5, a: 1 };

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      opacity: 0.25,
    });
    material.color.setHSL(color.h / 360, color.s, color.v / 2);

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    // Add outline stroke
    const outlineColor = new THREE.Color().setHSL(
      color.h / 360, color.s * 0.6, Math.min(color.v / 2 + 0.25, 0.9)
    );
    const outlineHex = outlineColor.getHex();
    const dashParams = getThreeDashParams(margin, baseRadius);

    if (dashParams) {
      // Dashed margin: solid arms + dashed hub arcs (ring-segment meshes)
      const hubR = builder.getHub().radius;
      const halfWidth = baseRadius * 0.02;
      const outlineMat = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
      });
      outlineMat.color.copy(outlineColor);

      // Solid arm edges
      for (const armPts of builder.getThreeArmEdges()) {
        const positions: number[] = [];
        for (const p of armPts) {
          positions.push(p.x, p.y, 0.5);
        }
        const lineGeom = new LineGeometry();
        lineGeom.setPositions(positions);
        const lineMat = new LineMaterial({
          color: outlineHex,
          linewidth: 4,
          resolution: this.resolution,
        });
        const line = new Line2(lineGeom, lineMat);
        line.computeLineDistances();
        group.add(line);
      }

      // Dashed hub arcs as ring-segment meshes (square caps)
      for (const arc of builder.getThreeHubArcs()) {
        const arcLength = hubR * arc.arcSpan * Math.PI / 180;
        const cycle = dashParams.dashSize + dashParams.gapSize;
        let d = 0;
        while (d < arcLength) {
          const dashLen = Math.min(dashParams.dashSize, arcLength - d);
          if (dashLen < cycle * 0.1) break; // Skip tiny remnants
          const dashAngle = (dashLen / hubR) * (180 / Math.PI);
          // Convert compass angles to Three.js RingGeometry angles
          // compass: 0=north, CW. Math: 0=east, CCW.
          const compassStart = arc.startAngle + (d / hubR) * (180 / Math.PI);
          const mathStart = ((90 - compassStart - dashAngle) * Math.PI) / 180;
          const mathLength = (dashAngle * Math.PI) / 180;
          const segments = Math.max(4, Math.ceil(dashAngle / 5));
          const ring = new THREE.RingGeometry(
            hubR - halfWidth, hubR + halfWidth,
            segments, 1,
            mathStart, mathLength
          );
          const dashMesh = new THREE.Mesh(ring, outlineMat);
          dashMesh.position.z = 0.5;
          group.add(dashMesh);
          d += cycle;
        }
      }
    } else {
      // Solid outline
      const outlinePoints = shape.getPoints(64);
      if (outlinePoints.length > 0) {
        const positions: number[] = [];
        for (const p of outlinePoints) {
          positions.push(p.x, p.y, 0.5);
        }
        positions.push(outlinePoints[0].x, outlinePoints[0].y, 0.5);

        const lineGeom = new LineGeometry();
        lineGeom.setPositions(positions);
        const lineMat = new LineMaterial({
          color: outlineHex,
          linewidth: 4,
          resolution: this.resolution,
        });
        const line = new Line2(lineGeom, lineMat);
        line.computeLineDistances();
        group.add(line);
      }
    }

    // Add chromatic lines
    for (const lineData of builder.toThreeLines()) {
      const lineMaterial = new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.8,
      });
      lineMaterial.color.setHSL(
        lineData.color.h / 360,
        lineData.color.s,
        lineData.color.v / 2
      );
      const lineMesh = new THREE.Line(lineData.geometry, lineMaterial);
      group.add(lineMesh);
    }

    return group;
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
