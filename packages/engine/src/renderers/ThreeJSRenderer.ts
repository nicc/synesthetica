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

    // LineMaterial needs device pixel resolution for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    this.resolution.set(cssWidth * dpr, cssHeight * dpr);

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
    const dpr = this.renderer.getPixelRatio?.() ?? 1;
    this.resolution.set(width * dpr, height * dpr);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Update resolution on all cached LineMaterial instances so line widths
    // stay correct after resize (LineMaterial copies resolution at creation time)
    this.updateLineMaterialResolutions();
  }

  /**
   * Propagate current resolution to all LineMaterial instances in cached entity objects.
   */
  private updateLineMaterialResolutions(): void {
    for (const obj of this.entityObjects.values()) {
      obj.traverse((child) => {
        if (child instanceof Line2) {
          const mat = child.material as LineMaterial;
          mat.resolution.copy(this.resolution);
        }
      });
    }
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

    // Note strips render as rectangles, not circles
    if (entity.data?.type === "note-strip") {
      this.updateNoteStrip(entity);
      return;
    }

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
    material.color.copy(this.hsvToThreeColor(color));

    // Calculate opacity with life decay
    let opacity = entity.style.opacity ?? 1;
    if (entity.life) {
      const lifeRatio = 1 - entity.life.ageMs / entity.life.ttlMs;
      opacity *= Math.max(0, lifeRatio);
    }
    material.opacity = opacity * (color.a ?? 1);
  }

  /**
   * Render a note strip as a rectangle spanning from onset to end time.
   * Position is at onsetY (top of bar); rectangle extends downward by barHeight.
   * Uses a gradient shader: top edge (onset/horizon) fades, bottom edge (NOW) stays bright.
   */
  private updateNoteStrip(entity: Entity): void {
    if (!this.scene || !this.planeGeometry) return;

    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;

    if (!mesh) {
      const material = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
          color: { value: new THREE.Color() },
          topOpacity: { value: 1.0 },
          bottomOpacity: { value: 1.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          uniform float topOpacity;
          uniform float bottomOpacity;
          varying vec2 vUv;
          void main() {
            float opacity = mix(bottomOpacity, topOpacity, vUv.y);
            gl_FragColor = vec4(color, opacity);
          }
        `,
      });
      mesh = new THREE.Mesh(this.planeGeometry, material);
      this.scene.add(mesh);
      this.entityObjects.set(entity.id, mesh);
    }

    // Position at onsetY (top of bar)
    const x = (entity.position?.x ?? 0) * this.config.worldWidth;
    const topY = (1 - (entity.position?.y ?? 0)) * this.config.worldHeight;

    // Bar dimensions in world coordinates
    const barWidth = (entity.style.size ?? 10) / 1000 * this.config.worldWidth;
    const barHeight = ((entity.data?.barHeight as number) ?? 0.01) * this.config.worldHeight;

    // Shift down by half bar height so top edge aligns with onsetY
    mesh.position.set(x, topY - barHeight / 2, 0);
    mesh.scale.set(barWidth, barHeight, 1);

    // Update shader uniforms
    const material = mesh.material as THREE.ShaderMaterial;
    const color = entity.style.color ?? { h: 0, s: 1, v: 1 };
    (material.uniforms.color.value as THREE.Color).copy(this.hsvToThreeColor(color));
    material.uniforms.topOpacity.value =
      (entity.data?.topOpacity as number) ?? (entity.style.opacity ?? 1);
    material.uniforms.bottomOpacity.value =
      (entity.data?.bottomOpacity as number) ?? (entity.style.opacity ?? 1);
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
    material.color.copy(this.hsvToThreeColor(color));
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
    material.color.copy(this.hsvToThreeColor(color));
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
    material.color.copy(this.hsvToThreeColor(color));

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
    material.color.copy(this.hsvToThreeColor(color));

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

    // Update material opacity (gradient fill uses ShaderMaterial, others use MeshBasicMaterial)
    const opacity = (entity.style.opacity ?? 1) * 0.8;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material;
        if (mat instanceof THREE.ShaderMaterial && mat.uniforms.opacity) {
          mat.uniforms.opacity.value = opacity;
        } else if (mat instanceof THREE.MeshBasicMaterial) {
          mat.opacity = opacity;
        }
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
    // High curve segments for smooth bezier/quadratic arcs (default 12 is blocky)
    const geometry = new THREE.ShapeGeometry(shape, 64);

    // Find root element for fill color and build per-arm colour data
    const arms = builder.getArms();
    const rootArm = arms.find((a) => a.interval === "1") ?? arms[0];
    const rootColor = rootArm?.color ?? { h: 0, s: 0.5, v: 0.5, a: 1 };

    // Build gradient shader material for radial+angular chord fill
    const MAX_ARMS = 8;
    const centerColorRGB = this.hsvToThreeColor(rootColor);
    const armColorsArray = new Float32Array(MAX_ARMS * 3);
    const armAnglesArray = new Float32Array(MAX_ARMS);

    // Sort arms by angle for correct angular interpolation
    const sortedArms = [...arms].sort((a, b) => a.angle - b.angle);
    for (let i = 0; i < MAX_ARMS; i++) {
      if (i < sortedArms.length) {
        const arm = sortedArms[i];
        const rgb = this.hsvToThreeColor(arm.color);
        armColorsArray[i * 3] = rgb.r;
        armColorsArray[i * 3 + 1] = rgb.g;
        armColorsArray[i * 3 + 2] = rgb.b;
        // Convert compass angle (0=north, CW) to math angle (0=east, CCW) in radians
        armAnglesArray[i] = ((90 - arm.angle) * Math.PI) / 180;
      } else {
        // Pad unused slots with center color
        armColorsArray[i * 3] = centerColorRGB.r;
        armColorsArray[i * 3 + 1] = centerColorRGB.g;
        armColorsArray[i * 3 + 2] = centerColorRGB.b;
        armAnglesArray[i] = 0.0;
      }
    }

    const hubR = builder.getHub().radius;
    // Max tip distance: hub + longest arm (triadic)
    const maxTipR = hubR + baseRadius * 0.7;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        centerColor: { value: centerColorRGB },
        armColors: { value: armColorsArray },
        armAngles: { value: armAnglesArray },
        armCount: { value: sortedArms.length },
        hubRadius: { value: hubR },
        maxRadius: { value: maxTipR },
        opacity: { value: 0.8 },
      },
      vertexShader: `
        varying vec2 vLocalPos;
        void main() {
          vLocalPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 centerColor;
        uniform float armColors[${MAX_ARMS * 3}];
        uniform float armAngles[${MAX_ARMS}];
        uniform int armCount;
        uniform float hubRadius;
        uniform float maxRadius;
        uniform float opacity;
        varying vec2 vLocalPos;

        // Normalize angle to [-PI, PI]
        float normAngle(float a) {
          return a - 6.28318530718 * floor((a + 3.14159265359) / 6.28318530718);
        }

        // Signed angular distance from a to b, normalized to [-PI, PI]
        float angleDist(float a, float b) {
          return normAngle(b - a);
        }

        void main() {
          float r = length(vLocalPos);
          float angle = atan(vLocalPos.y, vLocalPos.x);

          if (armCount < 1) {
            gl_FragColor = vec4(centerColor, opacity);
            return;
          }

          // Find the two flanking arms for angular interpolation
          // Arms are sorted by math-angle order
          int leftIdx = 0;
          int rightIdx = 0;
          float minLeftDist = 6.3;
          float minRightDist = 6.3;

          for (int i = 0; i < ${MAX_ARMS}; i++) {
            if (i >= armCount) break;
            float dist = angleDist(armAngles[i], angle);
            // dist > 0 means arm is to our left (CW in math coords)
            if (dist >= 0.0 && dist < minLeftDist) {
              minLeftDist = dist;
              leftIdx = i;
            }
            // dist < 0 means arm is to our right (CCW)
            float distR = angleDist(angle, armAngles[i]);
            if (distR >= 0.0 && distR < minRightDist) {
              minRightDist = distR;
              rightIdx = i;
            }
          }

          // Get flanking arm colours
          vec3 leftColor = vec3(armColors[leftIdx*3], armColors[leftIdx*3+1], armColors[leftIdx*3+2]);
          vec3 rightColor = vec3(armColors[rightIdx*3], armColors[rightIdx*3+1], armColors[rightIdx*3+2]);

          // Angular blend between flanking arms (hermite for smooth transition)
          float totalSpan = minLeftDist + minRightDist;
          float angularT = totalSpan > 0.001 ? minLeftDist / totalSpan : 0.5;
          float smooth_t = angularT * angularT * (3.0 - 2.0 * angularT);
          vec3 angularBlend = mix(leftColor, rightColor, smooth_t);

          // Radial blend: center colour at hub, arm colour at tips
          float radialT = smoothstep(0.0, maxRadius, r);
          vec3 finalColor = mix(centerColor, angularBlend, radialT);

          gl_FragColor = vec4(finalColor, opacity);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    // Add outline stroke — root note's pitch-class colour (no desaturation)
    const outlineColor = this.hsvToThreeColor(rootColor);
    const outlineHex = outlineColor.getHex();
    const dashParams = getThreeDashParams(margin, baseRadius);

    if (dashParams) {
      // Dashed margin: solid arms + dashed hub arcs (ring-segment meshes)
      const hubR = builder.getHub().radius;
      const halfWidth = baseRadius * 0.014;
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
          linewidth: 2,
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
          linewidth: 2,
          resolution: this.resolution,
        });
        const line = new Line2(lineGeom, lineMat);
        line.computeLineDistances();
        group.add(line);
      }
    }

    // Add chromatic lines (same width as chord outline)
    for (const lineData of builder.toThreeLines()) {
      const lineColor = this.hsvToThreeColor(lineData.color);
      // Extract positions from BufferGeometry
      const posAttr = lineData.geometry.getAttribute("position");
      const positions: number[] = [];
      for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      }
      lineData.geometry.dispose();

      const lineGeom = new LineGeometry();
      lineGeom.setPositions(positions);
      const lineMat = new LineMaterial({
        color: lineColor.getHex(),
        linewidth: 2,
        resolution: this.resolution,
      });
      const line = new Line2(lineGeom, lineMat);
      line.computeLineDistances();
      group.add(line);
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
    material.color.copy(this.hsvToThreeColor(color));
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

  /**
   * Convert ColorHSVA to THREE.Color via correct HSV→RGB conversion.
   * The previous approach (setHSL with v/2) was an incorrect approximation
   * that made everything too dark and over-saturated.
   */
  private hsvToThreeColor(hsv: { h: number; s: number; v: number }): THREE.Color {
    const { h, s, v } = hsv;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return new THREE.Color(r + m, g + m, b + m);
  }

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
