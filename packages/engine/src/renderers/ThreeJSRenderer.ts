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
 * - Input: Normalized coordinates (0-1) from lenses
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
  ChordPartial,
  MarginStyle,
} from "@synesthetica/contracts";
import {
  ChordShapeBuilder,
  getThreeDashParams,
  HUB_RADIUS,
  ARM_LENGTH,
  BASE_WIDTH,
} from "../utils/ChordShapeBuilder";
// Shared with HarmonyLens: the band gap also sizes the progression clock.
// Layer exemption until the scene coordinate contract lands (synesthetica-r3b1).
// eslint-disable-next-line no-restricted-imports
import { GLYPH_STEAM_BAND_GAP } from "../lenses/layout";
import { disposeObject } from "./disposal";

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
// Overtone steam (RFC 012)
// ============================================================================
//
// Overtone strips render as slow steam: procedural noise in the strip's
// fragment shader, no particles or extra entities. The noise lives in a
// shared field indexed by pitch position (x) and timeline time (y), so
// coincident strips sample the same steam and add up as denser haze of
// the same kind, and the field scrolls with the timeline. All strips
// follow the same rules; motion carries no meaning. Breakup is inward
// only: the strip's quad bounds the footprint.
//
// Spatial units are fractions of world width, so values read against
// the overtone strip width (~0.04 at 2.5 × note-strip width). Starting
// values were chosen from CPU-rendered previews; tune by eye in the app.

/** Noise frequency per unit of world width, horizontally and
 *  vertically. Lower vertical frequency stretches features upward into
 *  wisps (steam over a cup), rather than isotropic grain. */
const STEAM_SCALE_X = 18;
const STEAM_SCALE_Y = 6;

/** Noise octaves and per-octave amplitude. Few, soft octaves keep the
 *  haze smooth; more octaves read as grain or crumpled paper. */
const STEAM_OCTAVES = 3;
const STEAM_OCTAVE_GAIN = 0.55;

/** Upward drift of the steam within its strip, world-width units per
 *  second. Kept under one strip width per second and under the
 *  timeline's own scroll. */
const STEAM_RISE_PER_S = 0.012;

/** Rate at which the warp field evolves (noise units per second).
 *  0.25 gives wisps that change shape over a few seconds. */
const STEAM_SWIRL_PER_S = 0.25;

/** Domain-warp strength: how far wisps curl. 0 = plain fog. */
const STEAM_WARP = 2.4;

/** Density threshold for young steam (near NOW) and old steam (near the
 *  horizon). Raising the threshold with age breaks the haze into sparse
 *  wisps before it disappears. */
const STEAM_THRESHOLD_YOUNG = 0.32;
const STEAM_THRESHOLD_OLD = 0.6;

/** Half-width of the soft step around the threshold. */
const STEAM_THRESHOLD_SOFTNESS = 0.25;

/** How much the noise erodes the strip's side and end edges (inward). */
const STEAM_EDGE_BREAKUP = 0.6;

/** Soft fade at the strip's top and bottom ends, world-width units, so
 *  the haze has no hard horizontal cut. */
const STEAM_END_SOFTNESS = 0.006;

const glslFloat = (n: number): string =>
  Number.isInteger(n) ? n.toFixed(1) : String(n);

const OVERTONE_STEAM_VERTEX = `
  varying vec2 vUv;
  varying vec2 vWorld;
  void main() {
    vUv = uv;
    vWorld = (modelMatrix * vec4(position, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Noise lattice period (noise units, power of two). The field repeats
 *  every PERIOD units in x and y — about two screen heights of scroll —
 *  which lets the CPU wrap the growing timeline and time offsets so
 *  shader coordinates stay small and precise in long sessions. */
const STEAM_PERIOD = 64;

/** Noise shared by overtone strips and glyph steam: one set of field
 *  rules for every overtone surface. */
const STEAM_NOISE_GLSL = `
  const int OCTAVES = ${STEAM_OCTAVES};
  const float OCTAVE_GAIN = ${glslFloat(STEAM_OCTAVE_GAIN)};
  const float PERIOD = ${glslFloat(STEAM_PERIOD)};

  // Hash without sine (Dave Hoskins); precise for small inputs.
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Value noise, periodic with the given lattice period.
  float noise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 i0 = mod(i, period);
    vec2 i1 = mod(i + 1.0, period);
    return mix(
      mix(hash(i0), hash(vec2(i1.x, i0.y)), u.x),
      mix(hash(vec2(i0.x, i1.y)), hash(i1), u.x),
      u.y
    );
  }

  // Octave sum; doubling frequency and period keeps it periodic.
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    float norm = 0.0;
    float period = PERIOD;
    for (int k = 0; k < OCTAVES; k++) {
      v += a * noise(p, period);
      norm += a;
      p = p * 2.0 + vec2(17.0, 9.0);
      period *= 2.0;
      a *= OCTAVE_GAIN;
    }
    return v / norm;
  }
`;

const OVERTONE_STEAM_FRAGMENT = `
  uniform vec3 color;
  uniform float topOpacity;
  uniform float bottomOpacity;
  uniform float edgeSoftness;
  uniform float dissipationTop;
  uniform float dissipationBottom;
  uniform float fieldShift;   // timeline scroll + rise, noise units, wrapped to PERIOD
  uniform float swirlPhase;   // warp evolution, noise units, wrapped to PERIOD
  uniform float worldWidth;
  uniform float stripHeight;  // world units
  varying vec2 vUv;
  varying vec2 vWorld;

  const vec2 SCALE = vec2(${glslFloat(STEAM_SCALE_X)}, ${glslFloat(STEAM_SCALE_Y)});
  const float WARP = ${glslFloat(STEAM_WARP)};
  const float THRESH_YOUNG = ${glslFloat(STEAM_THRESHOLD_YOUNG)};
  const float THRESH_OLD = ${glslFloat(STEAM_THRESHOLD_OLD)};
  const float THRESH_SOFT = ${glslFloat(STEAM_THRESHOLD_SOFTNESS)};
  const float EDGE_BREAKUP = ${glslFloat(STEAM_EDGE_BREAKUP)};
  const float END_SOFT = ${glslFloat(STEAM_END_SOFTNESS)};

  ${STEAM_NOISE_GLSL}

  void main() {
    // Shared field: x = pitch position, y = timeline time (the scroll and
    // a slow upward rise are removed via fieldShift).
    vec2 p = vWorld / worldWidth * SCALE - vec2(0.0, fieldShift);
    vec2 q = vec2(
      fbm(p + vec2(0.0, swirlPhase)),
      fbm(p + vec2(5.2, 1.3) - vec2(swirlPhase, 0.0))
    );
    float n = fbm(p + WARP * (q - 0.5));

    // Age → sparser wisps (dissipation runs 0 near NOW to 1 at the horizon).
    float dissipation = mix(dissipationBottom, dissipationTop, vUv.y);
    float threshold = mix(THRESH_YOUNG, THRESH_OLD, dissipation);
    float density = smoothstep(threshold - THRESH_SOFT, threshold + THRESH_SOFT, n);

    // Footprint: peak at the real pitch, symmetric falloff, eroded inward.
    float d = clamp(abs(vUv.x - 0.5) * 2.0 + EDGE_BREAKUP * (n - 0.5), 0.0, 1.0);
    float footprint = 1.0 - smoothstep(min(1.0 - edgeSoftness, 0.999), 1.0, d);

    // Soft ends, eroded inward.
    float endSoft = END_SOFT * worldWidth;
    float endDist = min(vUv.y, 1.0 - vUv.y) * stripHeight;
    float ends = smoothstep(0.0, endSoft, endDist + endSoft * EDGE_BREAKUP * (n - 0.5));

    float opacity = mix(bottomOpacity, topOpacity, vUv.y) * density * footprint * ends;
    gl_FragColor = vec4(color, opacity);
  }
`;

// ============================================================================
// Glyph overtone steam (RFC 012)
// ============================================================================
//
// The chord glyph's overtones: a ring of steam outside the glyph (or,
// with "edge" placement, emitted from its outline) at each partial's
// angle (30° per semitone from the root, cents included).
// Same field rules as overtone strips, in polar form: x runs around the
// circle (one noise period per turn, so it wraps seamlessly), y runs
// outward from the emitting edge and rises outward over time. Density is
// the partial level; overlapping partials add. Fixed shape: radial
// length does not encode anything.

/** Glyph base radius in group-local units (spokes and hub scale by it). */
const GLYPH_BASE_RADIUS = 10;

/** Where glyph steam starts. "edge": the glyph outline at each angle —
 *  hub, spoke tip, or spoke side for near-misses. "band": a fixed ring
 *  just outside the longest spoke (RFC 012 option A). */
const GLYPH_STEAM_PLACEMENT: "edge" | "band" = "band";


/** Radial length of glyph steam (fraction of base radius). Equal to an
 *  extension spoke; the outward fade makes the visible steam shorter,
 *  so it never reads as a spoke. */
const GLYPH_STEAM_LENGTH = 0.3;

/** Brightness multiplier for glyph steam alone. The halo fades outward
 *  over a short distance, so at the same level it reads fainter than
 *  overtone strips; this compensates without touching the shared level. */
const GLYPH_STEAM_GAIN = 1.68;

/** Angular half-width of one partial's steam, degrees (30° per semitone). */
const GLYPH_STEAM_HALF_WIDTH_DEG = 11;

/** Radial noise frequency per base radius. */
const GLYPH_STEAM_SCALE_R = 6;

/** Outward rise, base radii per second. */
const GLYPH_STEAM_RISE_PER_S = 0.05;

const GLYPH_STEAM_MAX_ARMS = 12;
const GLYPH_STEAM_MAX_PARTIALS = 32;

const GLYPH_STEAM_VERTEX = `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLYPH_STEAM_FRAGMENT = `
  uniform float armAngles[${GLYPH_STEAM_MAX_ARMS}];   // math radians
  uniform float armTips[${GLYPH_STEAM_MAX_ARMS}];     // tip radius; 0 = not a spoke
  uniform int armCount;
  uniform float hubRadius;
  uniform float bandRadius;     // > 0 selects band placement
  uniform float steamLength;
  uniform float baseRadius;
  uniform float partialAngles[${GLYPH_STEAM_MAX_PARTIALS}];  // math radians
  uniform float partialLevels[${GLYPH_STEAM_MAX_PARTIALS}];
  uniform float partialColors[${GLYPH_STEAM_MAX_PARTIALS * 3}];
  uniform int partialCount;
  uniform float fade;           // glyph fade-out
  uniform float dissipation;    // 0 held .. 1 fully faded
  uniform float fieldShift;     // outward rise, noise units, wrapped
  uniform float swirlPhase;     // warp evolution, noise units, wrapped
  varying vec2 vLocal;

  const float PI = 3.14159265359;
  const float TWO_PI = 6.28318530718;
  const float HALF_ARM = ${glslFloat((BASE_WIDTH / 2) * (Math.PI / 180))};
  const float PUFF_HALF = ${glslFloat(GLYPH_STEAM_HALF_WIDTH_DEG * (Math.PI / 180))};
  const float SCALE_R = ${glslFloat(GLYPH_STEAM_SCALE_R)};
  const float WARP = ${glslFloat(STEAM_WARP)};
  const float THRESH_YOUNG = ${glslFloat(STEAM_THRESHOLD_YOUNG)};
  const float THRESH_OLD = ${glslFloat(STEAM_THRESHOLD_OLD)};
  const float THRESH_SOFT = ${glslFloat(STEAM_THRESHOLD_SOFTNESS)};
  const float EDGE_BREAKUP = ${glslFloat(STEAM_EDGE_BREAKUP)};
  const float GAIN = ${glslFloat(GLYPH_STEAM_GAIN)};

  ${STEAM_NOISE_GLSL}

  float wrapAngle(float a) {
    return a - TWO_PI * floor((a + PI) / TWO_PI);
  }

  // Radius of the glyph outline along angle theta: the hub, or the
  // triangular spoke's edge where theta falls within a spoke.
  float outlineRadius(float theta) {
    if (bandRadius > 0.0) return bandRadius;
    float r0 = hubRadius;
    vec2 dir = vec2(cos(theta), sin(theta));
    for (int i = 0; i < ${GLYPH_STEAM_MAX_ARMS}; i++) {
      if (i >= armCount) break;
      float tipR = armTips[i];
      if (tipR <= 0.0) continue;
      float d = wrapAngle(theta - armAngles[i]);
      if (abs(d) >= HALF_ARM) continue;
      float side = d < 0.0 ? -HALF_ARM : HALF_ARM;
      vec2 a = hubRadius * vec2(cos(armAngles[i] + side), sin(armAngles[i] + side));
      vec2 b = tipR * vec2(cos(armAngles[i]), sin(armAngles[i]));
      vec2 e = b - a;
      float den = dir.x * e.y - dir.y * e.x;
      if (abs(den) < 1e-6) continue;
      r0 = max(r0, (a.x * e.y - a.y * e.x) / den);
    }
    return r0;
  }

  void main() {
    float r = length(vLocal);
    float theta = atan(vLocal.y, vLocal.x);
    float s = r - outlineRadius(theta);
    if (s < 0.0 || s > steamLength) discard;

    // Shared polar field: around the circle, and outward from the edge.
    vec2 p = vec2((theta / TWO_PI + 0.5) * PERIOD, s / baseRadius * SCALE_R - fieldShift);
    vec2 q = vec2(
      fbm(p + vec2(0.0, swirlPhase)),
      fbm(p + vec2(5.2, 1.3) - vec2(swirlPhase, 0.0))
    );
    float n = fbm(p + WARP * (q - 0.5));

    float threshold = mix(THRESH_YOUNG, THRESH_OLD, dissipation);
    float density = smoothstep(threshold - THRESH_SOFT, threshold + THRESH_SOFT, n);

    // Dense at the emitting edge (after a short soft start), thinning outward.
    float u = s / steamLength;
    float radial = (1.0 - u) * smoothstep(0.0, 0.15, u + 0.1 * EDGE_BREAKUP * (n - 0.5));

    vec3 acc = vec3(0.0);
    for (int j = 0; j < ${GLYPH_STEAM_MAX_PARTIALS}; j++) {
      if (j >= partialCount) break;
      float d = abs(wrapAngle(theta - partialAngles[j])) / PUFF_HALF + EDGE_BREAKUP * (n - 0.5);
      float w = 1.0 - smoothstep(0.0, 1.0, clamp(d, 0.0, 1.0));
      vec3 c = vec3(partialColors[j * 3], partialColors[j * 3 + 1], partialColors[j * 3 + 2]);
      acc += c * partialLevels[j] * w;
    }

    gl_FragColor = vec4(acc * density * radial * fade * GAIN, 1.0);
  }
`;

// ============================================================================
// Text labels
// ============================================================================

/** Font stacks for text-label entities. "mono" matches the on-screen
 *  keyboard (web-app index.html .syn-onscreen-key). */
const TEXT_LABEL_MONO_FONT = "ui-monospace, SFMono-Regular, monospace";
const TEXT_LABEL_SANS_FONT = `"Lucida Sans Unicode", "Lucida Grande", "Lucida Sans", sans-serif`;

/** Canvas rasterisation size for text labels (pixels); mipmaps keep it
 *  crisp when scaled down. */
const TEXT_LABEL_CANVAS_PX = 64;

/** Font weight for text labels. Thin strokes lose contrast when the
 *  canvas is scaled down to ~10px on screen; a heavier weight keeps
 *  similar letters (E/F) distinct. */
const TEXT_LABEL_FONT_WEIGHT = 600;

/** ♭ and ♯ are drawn in the sans stack (Lucida has real music symbols;
 *  the monospace stack falls back to a tiny glyph), scaled by this
 *  relative to the letters. */
const TEXT_LABEL_ACCIDENTAL_SCALE = 1.1;

// ============================================================================
// Renderer Implementation
// ============================================================================

export class ThreeJSRenderer implements IRenderer {
  // Typed as `string` (not the literal "threejs") so the experimental
  // playful-branch subclasses (see renderers/README.md) can declare
  // their own identifier.
  readonly id: string = "threejs";

  // Deliberately `protected`: these are the canonical extension
  // points for playful-branch renderer experiments. Subclasses on
  // dedicated branches inject post-processing, modify the scene, or
  // hook into the render call through these. Do not widen further;
  // if a new experiment needs access to something else, promote that
  // member to `protected` and document why.
  protected config: Required<ThreeJSRendererConfig>;
  protected renderer: THREE.WebGLRenderer | null = null;
  protected scene: THREE.Scene | null = null;
  protected camera: THREE.PerspectiveCamera | null = null;

  // Entity object pools (keyed by entity id)
  private entityObjects: Map<string, THREE.Object3D> = new Map();

  // Entity ids that have already thrown from updateEntity this session.
  // The render loop swallows per-entity errors so one malformed entity
  // can't stall the RAF loop (Real-Time Respect: graceful degradation).
  // We log the first occurrence per id and stay quiet on repeats so a
  // persistently-broken entity doesn't flood the console.
  private erroredEntities: Set<string> = new Set();

  // Reusable geometries
  private circleGeometry: THREE.CircleGeometry | null = null;
  private planeGeometry: THREE.PlaneGeometry | null = null;
  /** Geometries owned by the renderer that outlive individual entities. */
  private readonly sharedGeometries = new Set<THREE.BufferGeometry>();

  // Viewport resolution for LineMaterial (thick lines)
  private resolution = new THREE.Vector2(800, 600);

  /** Session time of the frame being rendered, seconds; drives overtone
   *  steam. Stays 0 when the viewer prefers reduced motion. */
  private frameTimeSec = 0;
  private reducedMotion = false;

  constructor(config: ThreeJSRendererConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attach to a canvas element and initialize Three.js.
   */
  attach(canvas: HTMLCanvasElement): void {
    this.reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    // Position camera to view the world plane, containing it (see fitCamera)
    this.camera.position.set(
      this.config.worldWidth / 2,
      this.config.worldHeight / 2,
      0
    );
    this.fitCamera(aspect);
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
    this.sharedGeometries.add(this.circleGeometry).add(this.planeGeometry);
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
    this.erroredEntities.clear();

    // Dispose geometries
    this.circleGeometry?.dispose();
    this.planeGeometry?.dispose();
    this.circleGeometry = null;
    this.planeGeometry = null;
    this.sharedGeometries.clear();

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

    this.frameTimeSec = this.reducedMotion ? 0 : frame.t / 1000;

    // Track which entities are in this frame
    const currentIds = new Set<string>();

    // Update or create objects for each entity. Per-entity try/catch:
    // a single malformed entity must not tear down the RAF loop — the
    // rest of the frame still renders. First failure per entity id
    // logs; repeats stay quiet to avoid console flood.
    for (const entity of frame.entities) {
      currentIds.add(entity.id);
      try {
        this.updateEntity(entity);
      } catch (err) {
        if (!this.erroredEntities.has(entity.id)) {
          this.erroredEntities.add(entity.id);
          console.warn(
            `ThreeJSRenderer: entity '${entity.id}' (kind=${entity.kind}) failed to render; further frames of this entity id will retry silently.`,
            err,
          );
        }
      }
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
    this.fitCamera(width / height);
    this.camera.updateProjectionMatrix();

    // Update resolution on all cached LineMaterial instances so line widths
    // stay correct after resize (LineMaterial copies resolution at creation time)
    this.updateLineMaterialResolutions();
  }

  /**
   * Set the camera distance so the whole world is visible: full height on
   * wide viewports, full width (bands above and below) on viewports
   * narrower than the world's aspect. Never crops (synesthetica-50dc).
   */
  private fitCamera(aspect: number): void {
    if (!this.camera) return;
    const vFov = (this.config.fov * Math.PI) / 180;
    const visibleHeight = Math.max(
      this.config.worldHeight,
      this.config.worldWidth / aspect,
    );
    this.camera.position.z = visibleHeight / 2 / Math.tan(vFov / 2);
  }

  /**
   * Propagate current resolution to all LineMaterial instances in cached entity objects.
   */
  private updateLineMaterialResolutions(): void {
    for (const obj of this.entityObjects.values()) {
      obj.traverse((child) => {
        if (child instanceof Line2) {
          const mat = child.material;
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

    // Note strips and overtone strips render as rectangles, not circles
    if (
      entity.data?.type === "note-strip" ||
      entity.data?.type === "overtone-strip"
    ) {
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
   *
   * Overtone strips (RFC 012) share the geometry path but use the
   * steam shader (see OVERTONE_STEAM_FRAGMENT) with additive blending,
   * so coincident partials visibly sum. They draw before note strips so
   * a played note sits on top of its haze.
   */
  private updateNoteStrip(entity: Entity): void {
    if (!this.scene || !this.planeGeometry) return;

    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;

    const isOvertone = entity.data?.type === "overtone-strip";

    if (!mesh) {
      const material = isOvertone
        ? new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            uniforms: {
              color: { value: new THREE.Color() },
              topOpacity: { value: 1.0 },
              bottomOpacity: { value: 1.0 },
              edgeSoftness: { value: 1.0 },
              dissipationTop: { value: 0.0 },
              dissipationBottom: { value: 0.0 },
              fieldShift: { value: 0.0 },
              swirlPhase: { value: 0.0 },
              worldWidth: { value: this.config.worldWidth },
              stripHeight: { value: 0.0 },
            },
            vertexShader: OVERTONE_STEAM_VERTEX,
            fragmentShader: OVERTONE_STEAM_FRAGMENT,
          })
        : new THREE.ShaderMaterial({
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
      if (isOvertone) mesh.renderOrder = -1;
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
    if (isOvertone) {
      const u = material.uniforms;
      u.edgeSoftness.value = (entity.data?.edgeSoftness as number) ?? 1;
      u.dissipationTop.value = (entity.data?.dissipationTop as number) ?? 0;
      u.dissipationBottom.value = (entity.data?.dissipationBottom as number) ?? 0;
      // Offsets grow with session time; wrap them here (double precision)
      // so the shader's coordinates stay small. The field is periodic in
      // STEAM_PERIOD, so wrapping is seamless.
      const wrap = (v: number) => ((v % STEAM_PERIOD) + STEAM_PERIOD) % STEAM_PERIOD;
      const offsetWorld =
        ((entity.data?.fieldOffsetY as number) ?? 0) * this.config.worldHeight;
      u.fieldShift.value = wrap(
        (offsetWorld / this.config.worldWidth) * STEAM_SCALE_Y +
          this.frameTimeSec * STEAM_RISE_PER_S * STEAM_SCALE_Y,
      );
      u.swirlPhase.value = wrap(this.frameTimeSec * STEAM_SWIRL_PER_S);
      u.stripHeight.value = barHeight;
    }
  }

  /**
   * Render a field entity (lines, areas, effects).
   */
  private updateField(entity: Entity): void {
    const fieldType = entity.data?.type as string | undefined;

    if (
      fieldType === "beat-line" ||
      fieldType === "bar-line" ||
      fieldType === "now-line"
    ) {
      this.updateLine(entity);
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

    // Line spans from xLeft to xRight (normalized 0–1) at y position
    const y = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    const xLeft = ((entity.data?.xLeft as number) ?? 0) * this.config.worldWidth;
    const xRight = ((entity.data?.xRight as number) ?? 1) * this.config.worldWidth;
    const points = [
      new THREE.Vector3(xLeft, y, 0),
      new THREE.Vector3(xRight, y, 0),
    ];
    (line.geometry).setFromPoints(points);

    // Update material
    const material = line.material as THREE.LineBasicMaterial;
    const color = entity.style.color ?? { h: 0, s: 0, v: 0.5 };
    material.color.copy(this.hsvToThreeColor(color));
    material.opacity = entity.style.opacity ?? 0.3;
    material.linewidth = entity.style.size ?? 1;
  }

  /**
   * Render a thin guide ring at the progression wheel using Line2 +
   * LineMaterial so the stroke is anti-aliased (LineBasicMaterial draws
   * raw GL lines that read as jaggy on most GPUs).
   * data.radius is a normalized [0,1] x-axis length matching lens
   * coords; it scales to worldWidth so the ring is a true circle in
   * world space. linewidth is in screen pixels, so the line stays
   * crisp regardless of parent scale.
   */
  private updateProgressionGuideRing(entity: Entity): void {
    if (!this.scene) return;

    const normalizedRadius =
      (entity.data?.radius as number | undefined) ?? 0.1;
    const worldRadius = normalizedRadius * this.config.worldWidth;
    const cx = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const cy = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    const color = entity.style.color ?? { h: 0, s: 0, v: 0.55 };
    const threeColor = this.hsvToThreeColor(color);
    const opacity = entity.style.opacity ?? 0.18;

    let ring = this.entityObjects.get(entity.id) as Line2 | undefined;

    if (!ring) {
      // High segment count smooths out the small notches that appear
      // where Line2's per-segment tessellated quads meet at each join
      // (visible as casuarina-like indentations at lower segment counts
      // and higher opacity).
      const segments = 360;
      const positions: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        positions.push(Math.cos(angle), Math.sin(angle), 0);
      }
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const material = new LineMaterial({
        color: threeColor.getHex(),
        linewidth: 1.5,
        transparent: true,
        opacity,
        resolution: new THREE.Vector2(this.resolution.x, this.resolution.y),
      });
      ring = new Line2(geometry, material);
      ring.computeLineDistances();
      this.scene.add(ring);
      this.entityObjects.set(entity.id, ring);
    } else {
      const mat = ring.material;
      mat.color.copy(threeColor);
      mat.opacity = opacity;
      mat.resolution.set(this.resolution.x, this.resolution.y);
    }

    ring.position.set(cx, cy, 0);
    ring.scale.set(worldRadius, worldRadius, 1);
  }

  /**
   * Render a slot tick mark at a scale-degree position on the
   * diatonic ring using Line2 + LineMaterial for an anti-aliased
   * stroke. data.{innerRadius,outerRadius} are normalized
   * fractions; data.angleDeg is measured clockwise from 12 o'clock.
   */
  private updateProgressionSlotTick(entity: Entity): void {
    if (!this.scene) return;

    const cx = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const cy = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;

    const angleDeg = (entity.data?.angleDeg as number | undefined) ?? 0;
    const innerR = ((entity.data?.innerRadius as number | undefined) ?? 0.1) *
      this.config.worldWidth;
    const outerR = ((entity.data?.outerRadius as number | undefined) ?? 0.1) *
      this.config.worldWidth;
    // Same angle convention as connector strips: 0° at top, clockwise,
    // y-flipped sin to match Three.js y-up.
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    const rx = Math.cos(angleRad);
    const ry = -Math.sin(angleRad);

    const positions = [
      cx + innerR * rx, cy + innerR * ry, 0,
      cx + outerR * rx, cy + outerR * ry, 0,
    ];

    const color = entity.style.color ?? { h: 0, s: 0, v: 0.55 };
    const threeColor = this.hsvToThreeColor(color);
    const opacity = entity.style.opacity ?? 0.18;

    let line = this.entityObjects.get(entity.id) as Line2 | undefined;

    if (!line) {
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const material = new LineMaterial({
        color: threeColor.getHex(),
        linewidth: 1.5,
        transparent: true,
        opacity,
        resolution: new THREE.Vector2(this.resolution.x, this.resolution.y),
      });
      line = new Line2(geometry, material);
      line.computeLineDistances();
      this.scene.add(line);
      this.entityObjects.set(entity.id, line);
    } else {
      const geom = line.geometry;
      geom.setPositions(positions);
      const mat = line.material;
      mat.color.copy(threeColor);
      mat.opacity = opacity;
      mat.resolution.set(this.resolution.x, this.resolution.y);
    }
  }

  /**
   * Render a functional connector strip pair (SPEC 011). The entity
   * carries source + target strip geometries; each strip is a thin
   * tangent-oriented rectangle with a radial gradient — chord hue at
   * the numeral side, fading through the midpoint hue at the guide
   * ring side, and fading to transparent over the last 10% of the
   * radial axis where the strip approaches the numeral.
   */
  private updateConnectorStrip(entity: Entity): void {
    if (!this.scene) return;

    let group = this.entityObjects.get(entity.id) as THREE.Group | undefined;
    if (!group) {
      group = new THREE.Group();
      this.scene.add(group);
      this.entityObjects.set(entity.id, group);
    }

    // Position the group at the clock center
    const x = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const y = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    group.position.set(x, y, 0);

    const data = entity.data ?? {};
    const sourceHue = data.sourceHue as number;
    const targetHue = data.targetHue as number;
    const overallOpacity = entity.style.opacity ?? 1;

    // Single target strip carrying the full source ↔ target gradient.
    // The target chord's hue sits at its chord-side edge (where the
    // strip fades toward zero opacity); the source chord's hue sits
    // at the guide-ring side (where opacity is highest), so the
    // strip prominently gestures toward the chord that originated
    // the relationship.
    // plateauFraction is required on connector-strip entity data —
    // no fallback. The entity contract requires the lens to supply
    // it; treating missing as an error surfaces contract drift
    // immediately rather than silently rendering with a stale default.
    const plateau = data.plateauFraction as number | undefined;
    if (plateau === undefined) {
      throw new Error(
        `connector-strip entity ${entity.id} missing required plateauFraction`,
      );
    }
    this.upsertConnectorStripChild(
      group,
      0,
      data.targetAngleDeg as number,
      data.targetMidR as number,
      data.targetChordR as number,
      data.targetArcWidth as number,
      sourceHue,
      targetHue,
      overallOpacity,
      plateau,
    );
  }

  /**
   * Render a directional connector arc — a partial ring rendered as a
   * Line2 stroke that grows from `startAngleDeg` by `sweepDeg` along a
   * ring at `radius` (normalized clockRadius fraction of worldWidth).
   * `sweepDeg` is signed: positive = clockwise, negative = counter-
   * clockwise. Same angle convention as connector strips and slot
   * ticks — 0° at 12 o'clock, clockwise positive.
   */
  private updateConnectorArc(entity: Entity): void {
    if (!this.scene) return;

    const data = entity.data ?? {};
    const normalizedRadius = (data.radius as number | undefined) ?? 0.1;
    const worldRadius = normalizedRadius * this.config.worldWidth;
    const startAngleDeg = (data.startAngleDeg as number | undefined) ?? 0;
    const sweepDeg = (data.sweepDeg as number | undefined) ?? 0;
    const halfThickness = (data.halfThickness as number | undefined) ?? 0.002;
    const hue = (data.hue as number | undefined) ?? 0;
    const cx = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const cy = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    const opacity = entity.style.opacity ?? 1;

    // Skip near-zero sweeps to avoid degenerate ring geometry.
    const absSweep = Math.abs(sweepDeg);
    if (absSweep < 0.5) {
      const existing = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;
      if (existing) {
        (existing.material as THREE.MeshBasicMaterial).opacity = 0;
      }
      return;
    }

    // Ring segment: thin annulus from (worldRadius − halfWidth) to
    // (worldRadius + halfWidth), spanning `sweepDeg` degrees starting
    // at `startAngleDeg`. RingGeometry works in Three.js theta
    // (0 = +X axis, CCW positive), so we convert from our clock-face
    // angle convention (0 = 12 o'clock, CW positive):
    //   theta = π/2 − clockAngle
    // and negate the sweep to turn CW into CCW.
    const halfWidth = halfThickness * this.config.worldWidth;
    const innerR = Math.max(0.01, worldRadius - halfWidth);
    const outerR = worldRadius + halfWidth;
    const thetaStart = Math.PI / 2 - (startAngleDeg * Math.PI) / 180;
    const thetaLength = -(sweepDeg * Math.PI) / 180;
    const thetaSegments = Math.max(4, Math.ceil(absSweep / 3));

    const threeColor = this.hsvToThreeColor({ h: hue, s: 0.7, v: 0.9 });

    // Rebuild geometry when the shape changes (sweep grows during the
    // animation, or startAngle changes on reuse). Keyed on the same
    // fields as connector-strip's geomKey for consistency.
    const geomKey = `${innerR.toFixed(3)}|${outerR.toFixed(3)}|${thetaStart.toFixed(4)}|${thetaLength.toFixed(4)}|${thetaSegments}`;

    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;
    if (!mesh) {
      const geom = new THREE.RingGeometry(
        innerR,
        outerR,
        thetaSegments,
        1,
        thetaStart,
        thetaLength,
      );
      const material = new THREE.MeshBasicMaterial({
        color: threeColor,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      mesh = new THREE.Mesh(geom, material);
      mesh.position.set(cx, cy, 0);
      mesh.frustumCulled = false;
      // Render on top of the connector strip so the arc's stroke stays
      // visible where the two overlap (arc now extends through the strip
      // to its far edge).
      mesh.renderOrder = 1;
      mesh.userData.geomKey = geomKey;
      this.scene.add(mesh);
      this.entityObjects.set(entity.id, mesh);
    } else {
      if (mesh.userData.geomKey !== geomKey) {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.RingGeometry(
          innerR,
          outerR,
          thetaSegments,
          1,
          thetaStart,
          thetaLength,
        );
        mesh.userData.geomKey = geomKey;
      }
      mesh.position.set(cx, cy, 0);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(threeColor);
      mat.opacity = opacity;
    }
  }

  /**
   * Render an equilateral triangle indicator at the source end of a
   * connector arc, apex pointing radially at the source chord numeral.
   * The base sits flush against the arc's outer edge (on the numeral
   * side) so the triangle reads as a natural continuation of the arc
   * stroke pointing at the chord that emitted the edge.
   */
  private updateConnectorArrow(entity: Entity): void {
    if (!this.scene) return;

    const data = entity.data ?? {};
    const normalizedRadius = (data.radius as number | undefined) ?? 0.1;
    const angleDeg = (data.angleDeg as number | undefined) ?? 0;
    const pointRadial = (data.pointRadial as number | undefined) ?? 1;
    const heightNormalized = (data.heightNormalized as number | undefined) ?? 0.004;
    const arcHalfThickness = (data.arcHalfThicknessNormalized as number | undefined) ?? 0.001;
    const hue = (data.hue as number | undefined) ?? 0;
    const cx = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const cy = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    const opacity = entity.style.opacity ?? 1;

    const worldRadius = normalizedRadius * this.config.worldWidth;
    const height = heightNormalized * this.config.worldWidth;
    const arcHalfWidth = arcHalfThickness * this.config.worldWidth;

    // Radial + tangent unit vectors at angleDeg (clock convention:
    // 0° = 12 o'clock, CW positive). Matches the arc renderer's math.
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    const radialX = Math.cos(angleRad);
    const radialY = -Math.sin(angleRad);
    const tangentX = -Math.sin(angleRad);
    const tangentY = -Math.cos(angleRad);

    // Curved base: instead of a straight chord, the base follows the
    // arc's source-facing edge exactly, so every base vertex sits on
    // (a hair inside) the arc's edge. AA_OVERLAP_WORLD nudges the
    // base vertices INTO the arc by ~1 pixel worth of world units so
    // the two shapes' anti-aliased edges overlap by that thin band
    // rather than sharing a knife-edge boundary — which was leaving a
    // 1-2 pixel dark hairline gap. Alpha-doubling in the overlap band
    // is a fraction of a pixel wide, imperceptible.
    const AA_OVERLAP_WORLD = 0.03;
    const halfBase = height / Math.sqrt(3); // equilateral: base = h × 2/√3
    const arcSourceFacingR =
      worldRadius + pointRadial * arcHalfWidth - pointRadial * AA_OVERLAP_WORLD;
    const apexR = worldRadius + pointRadial * (arcHalfWidth + height);

    // Apex + 9 base vertices distributed along the arc's source-facing
    // edge from tangential −halfBase to +halfBase. Each base vertex
    // sits at distance arcSourceFacingR from the wheel center.
    const N_BASE_SEGMENTS = 8;
    const vertexCount = 1 + N_BASE_SEGMENTS + 1; // apex + (N+1) base verts
    const positions = new Float32Array(vertexCount * 3);
    // Apex (vertex 0)
    positions[0] = cx + apexR * radialX;
    positions[1] = cy + apexR * radialY;
    positions[2] = 0;
    // Base vertices (indices 1..vertexCount-1)
    for (let i = 0; i <= N_BASE_SEGMENTS; i++) {
      const t = -halfBase + (i * 2 * halfBase) / N_BASE_SEGMENTS;
      const localRadial = Math.sqrt(
        arcSourceFacingR * arcSourceFacingR - t * t,
      );
      const worldX = cx + localRadial * radialX + t * tangentX;
      const worldY = cy + localRadial * radialY + t * tangentY;
      const off = (1 + i) * 3;
      positions[off] = worldX;
      positions[off + 1] = worldY;
      positions[off + 2] = 0;
    }

    const threeColor = this.hsvToThreeColor({ h: hue, s: 0.7, v: 0.9 });

    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;
    if (!mesh) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      // Fan triangulation from apex (0) to consecutive base vertex
      // pairs. Fixed for the fixed N_BASE_SEGMENTS, so we set once
      // at construction and never touch again.
      const indices: number[] = [];
      for (let i = 1; i <= N_BASE_SEGMENTS; i++) indices.push(0, i, i + 1);
      geom.setIndex(indices);
      const material = new THREE.MeshBasicMaterial({
        color: threeColor,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      mesh = new THREE.Mesh(geom, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1; // same layer as the arc
      this.scene.add(mesh);
      this.entityObjects.set(entity.id, mesh);
    } else {
      const geom = mesh.geometry;
      const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
      posAttr.array.set(positions);
      posAttr.needsUpdate = true;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(threeColor);
      mat.opacity = opacity;
    }
  }

  /**
   * Three.js's RingGeometry assigns UVs based on bounding-box position
   * ((vertex.x / radius + 1) / 2 etc.), which doesn't map to radial
   * distance for our gradient. Replace UV.x with the actual radial
   * fraction (0 at innerR → 1 at outerR) so the connector-strip
   * shader can read radial position from vUv.x.
   */
  private remapRingGeometryUVsToRadial(
    geom: THREE.BufferGeometry,
    innerR: number,
    outerR: number,
  ): void {
    const positions = geom.attributes.position as THREE.BufferAttribute;
    const uvs = geom.attributes.uv as THREE.BufferAttribute;
    const span = outerR - innerR || 1;
    for (let i = 0; i < positions.count; i++) {
      const vx = positions.getX(i);
      const vy = positions.getY(i);
      const r = Math.sqrt(vx * vx + vy * vy);
      uvs.setXY(i, (r - innerR) / span, 0);
    }
    uvs.needsUpdate = true;
  }

  /** Build the ShaderMaterial used by both connector-strip arcs. */
  private makeConnectorStripMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        midColor: { value: new THREE.Color(1, 1, 1) },
        chordColor: { value: new THREE.Color(1, 1, 1) },
        overallOpacity: { value: 1 },
        // RingGeometry's UV.x runs 0=inner→1=outer. Whether "mid"
        // colour is at inner or outer depends on the strip direction.
        // 1.0 = mid at inner, 0.0 = mid at outer.
        midAtInner: { value: 1.0 },
        // Fraction of the strip's radial extent (from the arc-facing
        // edge) that holds peak opacity before the fade begins. Sized
        // to match the arc's stroke width so the strip's inner region
        // reads as a continuation of the arc line.
        plateauFraction: { value: 0.1 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 midColor;
        uniform vec3 chordColor;
        uniform float overallOpacity;
        uniform float midAtInner;
        uniform float plateauFraction;
        void main() {
          // t = 0 at midR side (guide ring, full opacity)
          // t = 1 at chord side (numeral edge, zero opacity)
          float t = midAtInner > 0.5 ? vUv.x : (1.0 - vUv.x);
          // Linear hue blend across the strip's radial axis.
          vec3 color = mix(midColor, chordColor, t);
          // Opacity: soft plateau then smoothstep fade. smoothstep is
          // C2-continuous at both bounds, so joining a flat plateau
          // (constant 1) to a smoothstep drop reads as one smooth
          // curve — no visible inflection at the plateau boundary.
          float alpha = 1.0 - smoothstep(plateauFraction, 1.0, t);
          gl_FragColor = vec4(color, alpha * overallOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Insert or update one connector-strip child mesh as a curved arc
   * (THREE.RingGeometry). The arc is a sector of an annulus from
   * innerR=min(midR,chordR) to outerR=max(midR,chordR), centred on
   * angleDeg with angular extent derived from arcWidth at the mean
   * radius. Geometry is rebuilt whenever the strip's angular/radial
   * inputs change.
   */
  private upsertConnectorStripChild(
    group: THREE.Group,
    childIndex: number,
    angleDeg: number,
    midR: number,
    chordR: number,
    arcWidth: number,
    midHue: number,
    chordHue: number,
    overallOpacity: number,
    plateauFraction: number,
  ): void {
    const midRWorld = midR * this.config.worldWidth;
    const chordRWorld = chordR * this.config.worldWidth;
    const innerR = Math.min(midRWorld, chordRWorld);
    const outerR = Math.max(midRWorld, chordRWorld);
    const midAtInner = midRWorld <= chordRWorld;

    // arcWidth is in world units. Convert to angular extent at the
    // strip's mean radius so its visible arc length matches arcWidth.
    const meanR = (innerR + outerR) / 2;
    const arcRad = arcWidth / Math.max(meanR, 0.001);

    // Convert clock-face angle (0=top, clockwise) to Three.js theta
    // (0=+X, counterclockwise): theta = π/2 − clockAngle (radians).
    const thetaCenter = Math.PI / 2 - (angleDeg * Math.PI) / 180;
    const thetaStart = thetaCenter - arcRad / 2;
    const thetaLength = arcRad;

    // Tag stored on the mesh's userData so we only rebuild geometry
    // when the inputs change. Cheap to compute, big saving on resize.
    const geomKey = `${innerR.toFixed(3)}|${outerR.toFixed(3)}|${thetaStart.toFixed(4)}|${thetaLength.toFixed(4)}`;

    let mesh = group.children[childIndex] as THREE.Mesh | undefined;
    if (!mesh) {
      const geom = new THREE.RingGeometry(
        innerR, outerR, 32, 1, thetaStart, thetaLength,
      );
      this.remapRingGeometryUVsToRadial(geom, innerR, outerR);
      mesh = new THREE.Mesh(geom, this.makeConnectorStripMaterial());
      mesh.frustumCulled = false;
      mesh.userData.geomKey = geomKey;
      group.add(mesh);
    } else if (mesh.userData.geomKey !== geomKey) {
      mesh.geometry.dispose();
      const geom = new THREE.RingGeometry(
        innerR, outerR, 32, 1, thetaStart, thetaLength,
      );
      this.remapRingGeometryUVsToRadial(geom, innerR, outerR);
      mesh.geometry = geom;
      mesh.userData.geomKey = geomKey;
    }

    const material = mesh.material as THREE.ShaderMaterial;
    (material.uniforms.midColor.value as THREE.Color).copy(
      this.hsvToThreeColor({ h: midHue, s: 0.7, v: 0.9 }),
    );
    (material.uniforms.chordColor.value as THREE.Color).copy(
      this.hsvToThreeColor({ h: chordHue, s: 0.7, v: 0.9 }),
    );
    material.uniforms.overallOpacity.value = overallOpacity;
    material.uniforms.midAtInner.value = midAtInner ? 1.0 : 0.0;
    material.uniforms.plateauFraction.value = plateauFraction;
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
    (line.geometry).setFromPoints(points);

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
    } else if (glyphType === "text-label") {
      this.updateTextLabel(entity);
    } else if (glyphType === "chord-label") {
      this.updateChordLabel(entity);
    } else if (glyphType === "tension-bar") {
      this.updateTensionBar(entity);
    } else if (glyphType === "dynamics-indicator") {
      this.updateDynamicsIndicator(entity);
    } else if (glyphType === "roman-numeral") {
      this.updateRomanNumeral(entity);
    } else if (glyphType === "progression-guide-ring") {
      this.updateProgressionGuideRing(entity);
    } else if (glyphType === "progression-slot-tick") {
      this.updateProgressionSlotTick(entity);
    } else if (glyphType === "connector-strip") {
      this.updateConnectorStrip(entity);
    } else if (glyphType === "connector-arc") {
      this.updateConnectorArc(entity);
    } else if (glyphType === "connector-arrow") {
      this.updateConnectorArrow(entity);
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

    // If no elements, treat this frame as "nothing to draw" — dispose
    // any cached geometry from a previous populated frame and skip.
    // The producer (HarmonyLens) avoids emitting empty-elements entities
    // during normal playback, so this is a defensive guard; the old
    // fallback was an 8-segment CircleGeometry that read as a grey
    // hexagon at the hub position — worse than rendering nothing.
    if (!elements || elements.length === 0) {
      const cached = this.entityObjects.get(entity.id);
      if (cached) {
        this.scene.remove(cached);
        this.disposeObject(cached);
        this.entityObjects.delete(entity.id);
      }
      return;
    }

    // Check if we need to rebuild geometry (elements or margin changed)
    let group = this.entityObjects.get(entity.id) as THREE.Group | undefined;
    const existingElementCount = group?.userData?.elementCount as number | undefined;
    const existingMargin = group?.userData?.margin as string | undefined;
    const existingBassIdx = group?.userData?.bassArmIndex as number | undefined;
    // Find which element (if any) is currently marked as bass. Voicing
    // changes that shift the bass while the same chord is held need to
    // rebuild so the thicker bass-arm stroke tracks.
    const bassIdx = elements.findIndex((e) => e.isBass === true);

    if (
      !group ||
      existingElementCount !== elements.length ||
      existingMargin !== margin ||
      existingBassIdx !== bassIdx
    ) {
      // Remove old group if it exists
      if (group) {
        this.scene.remove(group);
        this.disposeObject(group);
      }

      // Build new geometry
      group = this.buildChordShapeGroup(elements, margin);
      group.userData = {
        elementCount: elements.length,
        margin,
        bassArmIndex: bassIdx,
      };
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

    // Update material opacity. The gradient-fill body caps at 0.8 so the
    // brighter margin strokes (1.0) read clearly over it; during fade the
    // common entity opacity multiplies both so the body and margins reach
    // zero together, preserving their relative emphasis throughout.
    const entityOpacity = entity.style.opacity ?? 1;
    const bodyOpacity = entityOpacity * 0.8;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // instanceof narrows to Mesh<any, any>; restore the default generics.
        const mat = (child as THREE.Mesh).material;
        if (mat instanceof THREE.ShaderMaterial && mat.uniforms.opacity) {
          mat.uniforms.opacity.value = bodyOpacity;
        } else if (mat instanceof THREE.MeshBasicMaterial) {
          mat.opacity = bodyOpacity;
        }
      }
      // Line2/LineSegments2 store LineMaterial here; it doesn't extend
      // MeshBasicMaterial so the branches above don't catch it.
      if (child instanceof Line2) {
        const mat = child.material;
        mat.transparent = true;
        mat.opacity = entityOpacity;
      }
    });

    this.updateGlyphSteam(
      group,
      elements,
      entity.data?.partials as ChordPartial[] | undefined,
      entityOpacity,
      (entity.data?.overtoneDissipation as number) ?? 0,
    );
  }

  /**
   * Glyph overtone steam (RFC 012). Lives inside the chord-shape group so
   * it moves, scales and fades with the glyph; created on first use and
   * hidden when the overlay is off.
   */
  private updateGlyphSteam(
    group: THREE.Group,
    elements: ChordShapeElement[],
    partials: ChordPartial[] | undefined,
    fade: number,
    dissipation: number,
  ): void {
    const name = "overtone-steam";
    let mesh = group.getObjectByName(name) as THREE.Mesh | undefined;
    const count = Math.min(partials?.length ?? 0, GLYPH_STEAM_MAX_PARTIALS);
    if (count === 0) {
      if (mesh) mesh.visible = false;
      return;
    }

    const R = GLYPH_BASE_RADIUS;
    if (!mesh) {
      const extent =
        R * (HUB_RADIUS + ARM_LENGTH.triadic + GLYPH_STEAM_BAND_GAP + GLYPH_STEAM_LENGTH);
      const material = new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          armAngles: { value: new Float32Array(GLYPH_STEAM_MAX_ARMS) },
          armTips: { value: new Float32Array(GLYPH_STEAM_MAX_ARMS) },
          armCount: { value: 0 },
          hubRadius: { value: R * HUB_RADIUS },
          bandRadius: {
            value:
              GLYPH_STEAM_PLACEMENT === "band"
                ? R * (HUB_RADIUS + ARM_LENGTH.triadic + GLYPH_STEAM_BAND_GAP)
                : 0,
          },
          steamLength: { value: R * GLYPH_STEAM_LENGTH },
          baseRadius: { value: R },
          partialAngles: { value: new Float32Array(GLYPH_STEAM_MAX_PARTIALS) },
          partialLevels: { value: new Float32Array(GLYPH_STEAM_MAX_PARTIALS) },
          partialColors: { value: new Float32Array(GLYPH_STEAM_MAX_PARTIALS * 3) },
          partialCount: { value: 0 },
          fade: { value: 1 },
          dissipation: { value: 0 },
          fieldShift: { value: 0 },
          swirlPhase: { value: 0 },
        },
        vertexShader: GLYPH_STEAM_VERTEX,
        fragmentShader: GLYPH_STEAM_FRAGMENT,
      });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(extent * 2, extent * 2), material);
      mesh.name = name;
      mesh.renderOrder = -1;
      group.add(mesh);
    }
    mesh.visible = true;

    const toMathRad = (clockDeg: number) => ((90 - clockDeg) * Math.PI) / 180;
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    const armAngles = u.armAngles.value as Float32Array;
    const armTips = u.armTips.value as Float32Array;
    const arms = elements.slice(0, GLYPH_STEAM_MAX_ARMS);
    arms.forEach((el, i) => {
      armAngles[i] = toMathRad(el.angle);
      armTips[i] =
        el.style === "line"
          ? 0
          : R * (HUB_RADIUS + (ARM_LENGTH[el.tier] ?? ARM_LENGTH.triadic));
    });
    u.armCount.value = arms.length;

    const angles = u.partialAngles.value as Float32Array;
    const levels = u.partialLevels.value as Float32Array;
    const colors = u.partialColors.value as Float32Array;
    for (let i = 0; i < count; i++) {
      const p = partials![i];
      angles[i] = toMathRad(p.angle);
      levels[i] = p.level;
      const rgb = this.hsvToThreeColor(p.color);
      colors[i * 3] = rgb.r;
      colors[i * 3 + 1] = rgb.g;
      colors[i * 3 + 2] = rgb.b;
    }
    u.partialCount.value = count;
    u.fade.value = fade;
    u.dissipation.value = dissipation;

    const wrap = (v: number) => ((v % STEAM_PERIOD) + STEAM_PERIOD) % STEAM_PERIOD;
    u.fieldShift.value = wrap(this.frameTimeSec * GLYPH_STEAM_RISE_PER_S * GLYPH_STEAM_SCALE_R);
    u.swirlPhase.value = wrap(this.frameTimeSec * STEAM_SWIRL_PER_S);
  }

  /**
   * Build Three.js group for chord shape geometry using ChordShapeBuilder.
   * Arm edges use per-arm pitch-class colours, hub arcs use root colour,
   * fill uses radial+angular gradient with midpoint blend radius.
   */
  private buildChordShapeGroup(
    elements: ChordShapeElement[],
    margin: MarginStyle
  ): THREE.Group {
    const group = new THREE.Group();
    const baseRadius = GLYPH_BASE_RADIUS;

    const builder = new ChordShapeBuilder(elements, margin, {
      scale: baseRadius,
      center: { x: 0, y: 0 },
    });

    const shape = builder.toThreeShape();
    const geometry = new THREE.ShapeGeometry(shape, 64);

    const arms = builder.getArms();
    const rootArm = arms.find((a) => a.interval === "1") ?? arms[0];
    const rootColor = rootArm?.color ?? { h: 0, s: 0.5, v: 0.5, a: 1 };

    const MAX_ARMS = 8;
    const centerColorRGB = this.hsvToThreeColor(rootColor);
    const armColorsArray = new Float32Array(MAX_ARMS * 3);
    const armAnglesArray = new Float32Array(MAX_ARMS);

    const sortedArms = [...arms].sort((a, b) => a.angle - b.angle);
    for (let i = 0; i < MAX_ARMS; i++) {
      if (i < sortedArms.length) {
        const arm = sortedArms[i];
        const rgb = this.hsvToThreeColor(arm.color);
        armColorsArray[i * 3] = rgb.r;
        armColorsArray[i * 3 + 1] = rgb.g;
        armColorsArray[i * 3 + 2] = rgb.b;
        armAnglesArray[i] = ((90 - arm.angle) * Math.PI) / 180;
      } else {
        armColorsArray[i * 3] = centerColorRGB.r;
        armColorsArray[i * 3 + 1] = centerColorRGB.g;
        armColorsArray[i * 3 + 2] = centerColorRGB.b;
        armAnglesArray[i] = 0.0;
      }
    }

    const hubR = builder.getHub().radius;
    const maxTipR = hubR + baseRadius * 0.7;
    // Radial gradient reach: 0 = arm colours at hub edge, 1 = arm colours at tip
    const GRADIENT_REACH = 0.45;
    const blendRadius = hubR + (maxTipR - hubR) * GRADIENT_REACH;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        centerColor: { value: centerColorRGB },
        armColors: { value: armColorsArray },
        armAngles: { value: armAnglesArray },
        armCount: { value: sortedArms.length },
        hubRadius: { value: hubR },
        maxRadius: { value: blendRadius },
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

        float normAngle(float a) {
          return a - 6.28318530718 * floor((a + 3.14159265359) / 6.28318530718);
        }

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

          int leftIdx = 0;
          int rightIdx = 0;
          float minLeftDist = 6.3;
          float minRightDist = 6.3;

          for (int i = 0; i < ${MAX_ARMS}; i++) {
            if (i >= armCount) break;
            float dist = angleDist(armAngles[i], angle);
            if (dist >= 0.0 && dist < minLeftDist) {
              minLeftDist = dist;
              leftIdx = i;
            }
            float distR = angleDist(angle, armAngles[i]);
            if (distR >= 0.0 && distR < minRightDist) {
              minRightDist = distR;
              rightIdx = i;
            }
          }

          vec3 leftColor = vec3(armColors[leftIdx*3], armColors[leftIdx*3+1], armColors[leftIdx*3+2]);
          vec3 rightColor = vec3(armColors[rightIdx*3], armColors[rightIdx*3+1], armColors[rightIdx*3+2]);

          float totalSpan = minLeftDist + minRightDist;
          float angularT = totalSpan > 0.001 ? minLeftDist / totalSpan : 0.5;
          float smooth_t = angularT * angularT * (3.0 - 2.0 * angularT);
          vec3 angularBlend = mix(leftColor, rightColor, smooth_t);

          float radialT = smoothstep(0.0, maxRadius, r);
          vec3 finalColor = mix(centerColor, angularBlend, radialT);

          gl_FragColor = vec4(finalColor, opacity);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    // Outline: arm edges use per-arm pitch-class colours, hub paths gradient between neighbours
    const armEdges = builder.getThreeArmEdges();
    const dashParams = getThreeDashParams(margin, baseRadius);

    // Outline z-offset: just enough for depth ordering, small enough to
    // avoid parallax with the perspective camera when off-center.
    const outlineZ = 0.01;

    // Per-arm coloured wedge edges. The bass arm (inversion marker) gets
    // a slightly thicker stroke — a composition of the existing linewidth
    // parameter, not a new primitive.
    const BASS_LINEWIDTH_MULTIPLIER = 1.382;
    for (let i = 0; i < armEdges.length; i++) {
      const arm = sortedArms[i];
      const armColor = this.hsvToThreeColor(arm?.color ?? rootColor);
      const positions: number[] = [];
      for (const p of armEdges[i]) {
        positions.push(p.x, p.y, outlineZ);
      }
      const lineGeom = new LineGeometry();
      lineGeom.setPositions(positions);
      const lineMat = new LineMaterial({
        color: armColor.getHex(),
        linewidth: arm?.isBass ? 2 * BASS_LINEWIDTH_MULTIPLIER : 2,
        resolution: this.resolution,
      });
      const line = new Line2(lineGeom, lineMat);
      line.computeLineDistances();
      group.add(line);
    }

    // Hub paths — gradient between adjacent wedge colours, follows margin shape
    const hubPaths = builder.getThreeHubPaths();
    for (let i = 0; i < hubPaths.length; i++) {
      const hubPoints = hubPaths[i];
      const colorStart = this.hsvToThreeColor(sortedArms[i]?.color ?? rootColor);
      const colorEnd = this.hsvToThreeColor(sortedArms[(i + 1) % sortedArms.length]?.color ?? rootColor);

      const positions: number[] = [];
      const colors: number[] = [];
      for (let j = 0; j < hubPoints.length; j++) {
        const p = hubPoints[j];
        positions.push(p.x, p.y, outlineZ);
        const t = hubPoints.length > 1 ? j / (hubPoints.length - 1) : 0.5;
        colors.push(
          colorStart.r + (colorEnd.r - colorStart.r) * t,
          colorStart.g + (colorEnd.g - colorStart.g) * t,
          colorStart.b + (colorEnd.b - colorStart.b) * t,
        );
      }
      const lineGeom = new LineGeometry();
      lineGeom.setPositions(positions);
      lineGeom.setColors(colors);
      const lineMat = new LineMaterial({
        color: 0xffffff,
        vertexColors: true,
        linewidth: 2,
        resolution: this.resolution,
        ...(dashParams ? { dashed: true, dashSize: dashParams.dashSize, gapSize: dashParams.gapSize, dashScale: 1 } : {}),
      });
      const line = new Line2(lineGeom, lineMat);
      line.computeLineDistances();
      group.add(line);
    }

    // Chromatic lines (same width as chord outline)
    for (const lineData of builder.toThreeLines()) {
      const lineColor = this.hsvToThreeColor(lineData.color);
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
   * Render a tension bar.
   *
   * Currently no lens emits 'tension-bar' entities — the handler
   * exists ready for the harmony lens's tension extension to
   * light up. Producer + shape decisions live in
   * synesthetica-xc0 (harmony lens extension: tension from
   * functional harmony); it will draw on the tension value already
   * computed by HarmonyStabilizer.computeTension (also cross-
   * referenced there).
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
  // Dynamics Entities
  // ==========================================================================

  /**
   * Render a dynamics indicator as a PlaneGeometry rectangle.
   * Entity data: { x, y, w, h } in normalized coords (0–1).
   * Sharp quad edges — no end-cap overflow.
   */
  private updateDynamicsIndicator(entity: Entity): void {
    if (!this.scene) return;

    const nx = entity.data?.x as number | undefined;
    const ny = entity.data?.y as number | undefined;
    const nw = entity.data?.w as number | undefined;
    const nh = entity.data?.h as number | undefined;

    if (nx == null || ny == null || nw == null || nh == null) return;

    const worldW = nw * this.config.worldWidth;
    const worldH = nh * this.config.worldHeight;

    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;

    if (!mesh) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({ transparent: true });
      mesh = new THREE.Mesh(geometry, material);
      this.scene.add(mesh);
      this.entityObjects.set(entity.id, mesh);
    }

    // Position: center of the rect in world coords
    // Normalized y is top-down, Three.js y is bottom-up
    const cx = (nx + nw / 2) * this.config.worldWidth;
    const cy = (1 - (ny + nh / 2)) * this.config.worldHeight;
    mesh.position.set(cx, cy, 0.01);
    mesh.scale.set(worldW, worldH, 1);

    const material = mesh.material as THREE.MeshBasicMaterial;
    const color = entity.style.color ?? { h: 200, s: 0.5, v: 0.9 };
    material.color.copy(this.hsvToThreeColor(color));
    material.opacity = entity.style.opacity ?? 0.8;
  }


  // ==========================================================================
  // Chord Label (canvas-to-texture text at centre of progression wheel)
  // ==========================================================================

  /**
   * Render the current chord name (e.g. "EbM", "EbM/G", "Cmaj7") as
   * a canvas-rendered texture on a PlaneGeometry. The canvas is
   * regenerated only when the text changes, cached via mesh userData.
   */
  private updateChordLabel(entity: Entity): void {
    if (!this.scene) return;

    const text = entity.data?.text as string | undefined;
    if (!text) return;

    // Per-line height in world units. Slash chords (e.g. "EbM/G") split
    // across two lines with the slash on the second line, so total mesh
    // height is lineHeight × number of lines.
    // Lens may set style.size (the progression clock scales its label).
    const LINE_HEIGHT_WORLD = entity.style.size ?? 1.75;
    const CANVAS_TEXT_PX = 72;
    const LINE_GAP_FRACTION = 0.1; // Tight gap between stacked slash lines
    // Lucida Sans family — humanist sans that natively contains music
    // accidentals (U+266D ♭, U+266F ♯) so the whole chord label
    // renders in one font with consistent metrics. Lucida Sans Unicode
    // ships on Windows; Lucida Grande on macOS; both have music
    // symbols. sans-serif as last-resort fallback.
    const CANVAS_FONT = `${CANVAS_TEXT_PX}px "Lucida Sans Unicode", "Lucida Grande", "Lucida Sans", sans-serif`;

    // Slash chord split: "EbM/G" → ["EbM", "/G"]. Single slash only;
    // anything else renders on one line.
    const slashIdx = text.indexOf("/");
    const lines =
      slashIdx > 0 && slashIdx < text.length - 1
        ? [text.slice(0, slashIdx), text.slice(slashIdx)]
        : [text];

    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;
    const existingText = mesh?.userData?.chordLabelText as string | undefined;

    if (!mesh || existingText !== text) {
      // Dispose old resources before rebuilding
      if (mesh) {
        this.scene.remove(mesh);
        this.disposeObject(mesh);
      }

      // Lucida (and most fonts that include music symbols) renders ♭/♯
      // with wide built-in side-bearings — standard music-typography
      // spacing where accidentals normally sit on their own. Inline
      // with letters that reads as too-loose, so we tokenise each line
      // into text runs and accidental runs and advance the cursor by
      // a fraction of the accidental's natural width. The glyph itself
      // is still drawn by the font (textAlign:center at slot midpoint),
      // we just claim less horizontal space for it.
      const ACCIDENTAL_TIGHTEN = 0.55;
      const measureCanvas = document.createElement("canvas");
      const measureCtx = measureCanvas.getContext("2d");
      if (!measureCtx) return;
      measureCtx.font = CANVAS_FONT;

      type Run =
        | { kind: "text"; text: string; advance: number }
        | { kind: "accidental"; text: string; advance: number };

      const tokenize = (line: string): Run[] => {
        const runs: Run[] = [];
        let buf = "";
        const flushBuf = () => {
          if (buf) {
            runs.push({
              kind: "text",
              text: buf,
              advance: measureCtx.measureText(buf).width,
            });
            buf = "";
          }
        };
        for (const ch of line) {
          if (ch === "♭" || ch === "♯") {
            flushBuf();
            const natural = measureCtx.measureText(ch).width;
            runs.push({
              kind: "accidental",
              text: ch,
              advance: natural * ACCIDENTAL_TIGHTEN,
            });
          } else {
            buf += ch;
          }
        }
        flushBuf();
        return runs;
      };

      const lineRuns = lines.map(tokenize);
      const lineWidths = lineRuns.map((runs) =>
        runs.reduce((sum, r) => sum + r.advance, 0),
      );
      const maxLineWidth = Math.ceil(Math.max(...lineWidths));

      // actualBoundingBox metrics are per-content (the rendered ink's
      // top/bottom pixels), so "Fm" and "F5" produce different ascents
      // and descents — which made pxToWorld vary and chord labels
      // render at slightly different sizes. Measure a fixed reference
      // string covering cap height, descender, and accidentals so the
      // text-to-world ratio stays constant across chords.
      const refMetric = measureCtx.measureText("Hg♭♯");
      const ascent =
        refMetric.actualBoundingBoxAscent || CANVAS_TEXT_PX * 0.75;
      const descent =
        refMetric.actualBoundingBoxDescent || CANVAS_TEXT_PX * 0.25;
      const lineHeightPx = Math.ceil(ascent + descent);
      const lineGapPx = Math.round(lineHeightPx * LINE_GAP_FRACTION);
      const totalTextHeight =
        lineHeightPx * lines.length + lineGapPx * (lines.length - 1);

      const padding = 16;
      const canvas = document.createElement("canvas");
      canvas.width = maxLineWidth + padding * 2;
      canvas.height = totalTextHeight + padding * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = CANVAS_FONT;
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "alphabetic";
      const centerX = canvas.width / 2;
      for (let i = 0; i < lines.length; i++) {
        const runs = lineRuns[i];
        const baselineY = padding + ascent + i * (lineHeightPx + lineGapPx);
        let cursor = centerX - lineWidths[i] / 2;
        for (const run of runs) {
          if (run.kind === "accidental") {
            // Centre the natural-width glyph inside its narrower slot
            // so the same amount of bearing is trimmed from each side.
            ctx.textAlign = "center";
            ctx.fillText(run.text, cursor + run.advance / 2, baselineY);
          } else {
            ctx.textAlign = "left";
            ctx.fillText(run.text, cursor, baselineY);
          }
          cursor += run.advance;
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      // Mipmaps + anisotropic filtering preserve thin vertical strokes
      // (e.g. the legs of "m") when the canvas downsamples to screen
      // size at small chord-label scales. Without these, LinearFilter
      // alone aliases sub-pixel strokes away intermittently.
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      const maxAnisotropy =
        this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;

      // Scale plane so one canvas pixel of text = a constant world size.
      // Previously planeH = LINE_HEIGHT_WORLD × lines, but canvas height
      // includes padding + line gaps that don't scale linearly with line
      // count, so 2-line slash labels rendered ~10% larger than 1-line
      // labels. Tying world size directly to the per-line pixel count
      // keeps text height constant regardless of layout.
      const pxToWorld = LINE_HEIGHT_WORLD / lineHeightPx;
      const planeH = canvas.height * pxToWorld;
      const planeW = canvas.width * pxToWorld;

      const geometry = new THREE.PlaneGeometry(planeW, planeH);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { chordLabelText: text };
      this.scene.add(mesh);
      this.entityObjects.set(entity.id, mesh);
    }

    // Position at the entity's center (normalized → world, y flipped)
    const worldX = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const worldY = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    // Slight z offset so the label sits above the progression-clock glyphs
    mesh.position.set(worldX, worldY, 0.05);

    const material = mesh.material as THREE.MeshBasicMaterial;
    material.opacity = entity.style.opacity ?? 1;
  }

  // ==========================================================================
  // Text Labels
  // ==========================================================================

  /**
   * Render a single-line text label (note names, interval names).
   *
   * Entity contract:
   * - data.text: the string (music symbols allowed)
   * - data.font: "mono" (the on-screen keyboard's monospace stack) or
   *   omitted for the default sans
   * - data.anchor: "center" (default) or "baseline" — the position is the
   *   centre of the text, or the centre of its baseline
   * - data.rotationDeg: clock-style rotation (clockwise, degrees) about
   *   the anchor; 0 = upright
   * - style.size: line height in world units (cap height to descender)
   * - style.color / style.opacity: fill colour; colour alpha multiplies
   *   opacity (structural greys are defined as translucent colours)
   */
  private updateTextLabel(entity: Entity): void {
    if (!this.scene || typeof document === "undefined") return;
    const text = entity.data?.text as string | undefined;
    if (!text) return;

    const font = (entity.data?.font as string | undefined) === "mono"
      ? TEXT_LABEL_MONO_FONT
      : TEXT_LABEL_SANS_FONT;
    const anchor = (entity.data?.anchor as string | undefined) ?? "center";
    const lineHeight = entity.style.size ?? 1;
    const cacheKey = `${text}|${font}|${anchor}|${lineHeight}`;

    let mesh = this.entityObjects.get(entity.id) as THREE.Mesh | undefined;
    if (!mesh || mesh.userData?.textLabelKey !== cacheKey) {
      if (mesh) {
        this.scene.remove(mesh);
        this.disposeObject(mesh);
      }
      const canvasFont = `${TEXT_LABEL_FONT_WEIGHT} ${TEXT_LABEL_CANVAS_PX}px ${font}`;
      const accidentalFont = `${TEXT_LABEL_FONT_WEIGHT} ${Math.round(
        TEXT_LABEL_CANVAS_PX * TEXT_LABEL_ACCIDENTAL_SCALE,
      )}px ${TEXT_LABEL_SANS_FONT}`;
      const measure = document.createElement("canvas").getContext("2d");
      if (!measure) return;
      // Fixed reference metrics so every label shares one text-to-world
      // ratio regardless of its own ink (see updateChordLabel).
      measure.font = canvasFont;
      const ref = measure.measureText("Hg");
      const ascent = ref.actualBoundingBoxAscent || TEXT_LABEL_CANVAS_PX * 0.75;
      const descent = ref.actualBoundingBoxDescent || TEXT_LABEL_CANVAS_PX * 0.25;
      const lineHeightPx = Math.ceil(ascent + descent);

      // Split into letter runs and accidental runs; accidentals use the
      // sans font so they render as real music symbols.
      const runs: Array<{ text: string; font: string; width: number }> = [];
      for (const ch of text) {
        const runFont = ch === "♭" || ch === "♯" ? accidentalFont : canvasFont;
        const last = runs[runs.length - 1];
        if (last && last.font === runFont) last.text += ch;
        else runs.push({ text: ch, font: runFont, width: 0 });
      }
      for (const run of runs) {
        measure.font = run.font;
        run.width = measure.measureText(run.text).width;
      }
      const textWidth = runs.reduce((sum, r) => sum + r.width, 0);

      const padding = 8;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(textWidth) + padding * 2;
      canvas.height = lineHeightPx + padding * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const baselinePx = padding + ascent;
      let cursor = (canvas.width - textWidth) / 2;
      for (const run of runs) {
        ctx.font = run.font;
        ctx.fillText(run.text, cursor, baselinePx);
        cursor += run.width;
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
      texture.needsUpdate = true;

      const pxToWorld = lineHeight / lineHeightPx;
      const planeW = canvas.width * pxToWorld;
      const planeH = canvas.height * pxToWorld;
      const geometry = new THREE.PlaneGeometry(planeW, planeH);
      if (anchor === "baseline") {
        // Move the baseline's centre to the origin so position and
        // rotation are about the baseline.
        geometry.translate(0, -(planeH / 2 - baselinePx * pxToWorld), 0);
      }
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { textLabelKey: cacheKey };
      this.scene.add(mesh);
      this.entityObjects.set(entity.id, mesh);
    }

    const worldX = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const worldY = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;
    mesh.position.set(worldX, worldY, 0.05);
    mesh.rotation.z = -(((entity.data?.rotationDeg as number) ?? 0) * Math.PI) / 180;

    const color = entity.style.color ?? { h: 0, s: 0, v: 1, a: 1 };
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.color.copy(this.hsvToThreeColor(color));
    material.opacity = (entity.style.opacity ?? 1) * (color.a ?? 1);
  }

  // ==========================================================================
  // Roman Numeral Glyphs
  // ==========================================================================

  /**
   * Render a Roman numeral glyph from line segments and arcs.
   * Uses Line2/LineMaterial for segments, THREE.Line for arcs.
   */
  private updateRomanNumeral(entity: Entity): void {
    if (!this.scene) return;

    const polylines = entity.data?.polylines as Array<Array<{ x: number; y: number }>> | undefined;
    const arcs = entity.data?.arcs as Array<{ cx: number; cy: number; r: number }> | undefined;
    const glyphW = (entity.data?.width as number) ?? 0;
    const glyphH = (entity.data?.height as number) ?? 1;
    const strokeWidth = (entity.data?.strokeWidth as number) ?? 2;

    if (!polylines && !arcs) return;

    const color = entity.style.color ?? { h: 200, s: 0.5, v: 0.9 };
    const threeColor = this.hsvToThreeColor(color);
    const opacity = entity.style.opacity ?? 1;
    const size = entity.style.size ?? 20;

    // Position in world coords
    const worldX = (entity.position?.x ?? 0.5) * this.config.worldWidth;
    const worldY = (1 - (entity.position?.y ?? 0.5)) * this.config.worldHeight;

    // Scale: size maps glyph units to world units
    const scale = size / glyphH;

    // Remove old group if it exists (recreate each frame — geometry may change)
    let group = this.entityObjects.get(entity.id) as THREE.Group | undefined;
    if (group) {
      this.scene.remove(group);
      this.disposeObject(group);
    }

    group = new THREE.Group();

    // Center the glyph: offset by half width/height
    const offsetX = -(glyphW * scale) / 2;
    const offsetY = -(glyphH * scale) / 2;

    // Render polylines — each as a single Line2. Use Max blending so
    // overlapping segment quads at joints don't stack alpha (Line2 has
    // no built-in miter join, so adjacent segments overlap by ~half
    // linewidth at each vertex).
    // Pre-multiply colour by opacity so fade is baked into the material's
    // colour. LineMaterial's fragment shader doesn't reliably output
    // `opacity` as the alpha channel for our custom max-blending math to
    // use, so we encode the fade into the colour itself and run with
    // opacity=1.
    const fadedColor = threeColor.clone().multiplyScalar(opacity);

    const makeGlyphMaterial = () => {
      const mat = new LineMaterial({
        color: fadedColor.getHex(),
        linewidth: strokeWidth,
        transparent: true,
        opacity: 1,
        resolution: new THREE.Vector2(this.resolution.x, this.resolution.y),
      });
      // Per-channel max blending: overlapping segment quads at joints
      // produce max(src, dst) instead of stacking alpha. Source colour is
      // already pre-multiplied above, so we use OneFactor on src.
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.MaxEquation;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendEquationAlpha = THREE.MaxEquation;
      mat.blendSrcAlpha = THREE.OneFactor;
      mat.blendDstAlpha = THREE.OneFactor;
      return mat;
    };

    if (polylines) {
      for (const poly of polylines) {
        if (poly.length < 2) continue;
        const positions: number[] = [];
        for (const p of poly) {
          positions.push(p.x * scale + offsetX, p.y * scale + offsetY, 0);
        }
        const lineGeom = new LineGeometry();
        lineGeom.setPositions(positions);
        const line = new Line2(lineGeom, makeGlyphMaterial());
        group.add(line);
      }
    }

    // Render arcs (circles for ° and ø) using the same Max-blending
    // material so the closed loop's self-overlap at the seam doesn't
    // stack either.
    if (arcs) {
      for (const arc of arcs) {
        const arcSegments = 24;
        const positions: number[] = [];
        for (let i = 0; i <= arcSegments; i++) {
          const angle = (i / arcSegments) * Math.PI * 2;
          positions.push(
            (arc.cx + arc.r * Math.cos(angle)) * scale + offsetX,
            (arc.cy + arc.r * Math.sin(angle)) * scale + offsetY,
            0,
          );
        }
        const arcGeom = new LineGeometry();
        arcGeom.setPositions(positions);
        const arcLine = new Line2(arcGeom, makeGlyphMaterial());
        group.add(arcLine);
      }
    }

    group.position.set(worldX, worldY, 0.02);
    this.scene.add(group);
    this.entityObjects.set(entity.id, group);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Convert ColorHSVA to THREE.Color via correct HSV→RGB conversion.
   * The previous approach (setHSL with v/2) was an incorrect approximation
   * that made everything too dark and over-saturated.
   *
   * Deliberately `protected`: every entity render path calls this, so
   * playful-branch subclasses (warm tint, palette quantisation, etc.)
   * override it to skin the entire image in one place.
   */
  protected hsvToThreeColor(hsv: { h: number; s: number; v: number }): THREE.Color {
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
    disposeObject(obj, this.sharedGeometries);
  }
}
