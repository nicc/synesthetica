/**
 * GhibliRenderer — experimental painterly WebGL renderer.
 *
 * Subclasses ThreeJSRenderer and applies the visual register of
 * Studio Ghibli's hand-painted backgrounds:
 *
 *   - Warm magic-hour sky gradient instead of pure black background
 *   - All colours nudged toward a softer painterly palette (slight
 *     warm cast, gently desaturated, lifted blacks)
 *   - UnrealBloomPass for the soft luminous glow on bright shapes
 *   - Drifting dust motes / light particles in the background plane
 *   - Subtle film grain via a custom shader pass
 *
 * Pure aesthetic experiment — no spec, no tests, just a fork of the
 * Three.js renderer. All the entity rendering logic is inherited
 * unchanged from the parent; only the global look-and-feel is
 * modified through the protected hooks (scene, camera, renderer,
 * hsvToThreeColor).
 */

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { SceneFrame } from "@synesthetica/contracts";

import { ThreeJSRenderer, type ThreeJSRendererConfig } from "./ThreeJSRenderer";

// ============================================================================
// Tunables
// ============================================================================

// Bloom params. The sky is excluded from the bloom pass entirely
// (it's hidden during the bloom render), so we don't need a high
// threshold to protect it — keep threshold low so subtle entity
// highlights still glow.
const BLOOM_STRENGTH = 0.05;
const BLOOM_RADIUS = 0.2;
const BLOOM_THRESHOLD = 0.0;

/** Warm cast applied to every colour. Mixes the colour with this hue. */
const WARM_TINT_R = 1.0;
const WARM_TINT_G = 0.86;
const WARM_TINT_B = 0.72;
/** Mix weight: 0 = no tint, 1 = pure tint. */
const WARM_MIX = 0.18;
/** Slight desaturation toward warm grey. */
const DESATURATE = 0.12;

/** Sky gradient — top and bottom colours, slowly shifting over time. */
const SKY_TOP = new THREE.Color(0.96, 0.85, 0.78); // peach
const SKY_BOTTOM = new THREE.Color(0.55, 0.7, 0.85); // soft sky blue
const SKY_SHIFT_PERIOD_S = 60; // gentle drift

/** Dust mote field. */
const MOTE_COUNT = 240;
const MOTE_DRIFT_SPEED = 0.7; // world units / second

/** Film grain shader. */
const GRAIN_AMOUNT = 0.05;

// ============================================================================
// Custom post-processing: subtle film grain
// ============================================================================

const GrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    amount: { value: GRAIN_AMOUNT },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float amount;
    varying vec2 vUv;
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      // Time-jittered grain
      float g = rand(vUv * vec2(time * 0.5 + 1.0, time * 0.7 + 2.0)) - 0.5;
      gl_FragColor = vec4(base.rgb + g * amount, base.a);
    }
  `,
};

/**
 * Combine shader: reads the full scene (sky + entities) and adds the
 * bloom texture (entities-only-bloomed) on top. The bloom texture is
 * computed in a parallel composer where the sky is hidden, so its
 * RGB contains only the soft glows around bright entity pixels.
 */
const CombineShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    bloomTexture: { value: null as THREE.Texture | null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec4 bloom = texture2D(bloomTexture, vUv);
      gl_FragColor = vec4(base.rgb + bloom.rgb, base.a);
    }
  `,
};

// ============================================================================
// GhibliRenderer
// ============================================================================

export interface GhibliRendererConfig extends ThreeJSRendererConfig {
  /** Bloom strength override (default 0.5). */
  bloomStrength?: number;
  /** Bloom radius override (default 0.4). */
  bloomRadius?: number;
  /** Film grain amount override (default 0.05). */
  grainAmount?: number;
  /** Number of drifting dust motes (default 240). */
  moteCount?: number;
}

export class GhibliRenderer extends ThreeJSRenderer {
  readonly id = "ghibli";

  /** Bloom pass: renders scene with sky hidden, then blooms.
   *  Its output texture is sampled by the final composer. */
  private bloomComposer: EffectComposer | null = null;
  /** Final composer: renders the full scene (sky visible), composites
   *  the bloom texture on top, then applies grain. Renders to screen. */
  private finalComposer: EffectComposer | null = null;
  private grainPass: ShaderPass | null = null;
  private combinePass: ShaderPass | null = null;
  private skyMesh: THREE.Mesh | null = null;
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private moteSystem: THREE.Points | null = null;
  private moteData: { vx: number; vy: number }[] = [];
  private bloomStrength: number;
  private bloomRadius: number;
  private grainAmount: number;
  private moteCount: number;
  private startTime: number = performance.now();

  constructor(config: GhibliRendererConfig = {}) {
    // Sky-gradient background — we render it as a quad behind
    // everything; the WebGLRenderer's clear colour doesn't matter
    // (it'll be overdrawn). Pass black so any gaps look intentional.
    super({ ...config, backgroundColor: 0x000000 });
    this.bloomStrength = config.bloomStrength ?? BLOOM_STRENGTH;
    this.bloomRadius = config.bloomRadius ?? BLOOM_RADIUS;
    this.grainAmount = config.grainAmount ?? GRAIN_AMOUNT;
    this.moteCount = config.moteCount ?? MOTE_COUNT;
  }

  attach(canvas: HTMLCanvasElement): void {
    super.attach(canvas);
    if (!this.renderer || !this.scene || !this.camera) return;

    this.buildSky();
    this.buildMotes();
    this.buildComposer(canvas);
  }

  detach(): void {
    this.bloomComposer?.dispose?.();
    this.finalComposer?.dispose?.();
    this.bloomComposer = null;
    this.finalComposer = null;
    this.grainPass = null;
    this.combinePass = null;
    if (this.skyMesh) {
      this.scene?.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      this.skyMaterial?.dispose();
      this.skyMesh = null;
      this.skyMaterial = null;
    }
    if (this.moteSystem) {
      this.scene?.remove(this.moteSystem);
      this.moteSystem.geometry.dispose();
      (this.moteSystem.material as THREE.Material).dispose();
      this.moteSystem = null;
      this.moteData = [];
    }
    super.detach();
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    const dpr = this.renderer?.getPixelRatio?.() ?? 1;
    this.bloomComposer?.setSize(width * dpr, height * dpr);
    this.finalComposer?.setSize(width * dpr, height * dpr);
    if (this.skyMaterial && this.scene && this.camera) {
      this.skyMaterial.uniforms.resolution.value.set(width, height);
    }
  }

  render(frame: SceneFrame): void {
    if (!this.renderer || !this.scene || !this.camera) return;

    // Drive time-based uniforms (sky shift + grain seed + mote drift)
    const t = (performance.now() - this.startTime) / 1000;
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.time.value = t;
    }
    if (this.grainPass) {
      (this.grainPass.uniforms.time as { value: number }).value = t;
    }
    this.driftMotes(t);

    // Run the parent's entity update loop, but suppress its render
    // call so we can drive the composers instead.
    const realRenderer = this.renderer;
    const noopRenderer = realRenderer as unknown as {
      render: (...args: unknown[]) => void;
    };
    const savedRender = noopRenderer.render;
    noopRenderer.render = () => {
      /* no-op while parent's render() walks the scene */
    };
    try {
      super.render(frame);
    } finally {
      noopRenderer.render = savedRender;
    }

    if (this.bloomComposer && this.finalComposer) {
      // Pass 1: hide only the SKY (the bright gradient would dominate
      // the bright-pass and wash out the whole bloom). Motes stay
      // visible so they pick up the subtle glow even at low bloom
      // strength — they're point-of-light particles, glow is what
      // makes them read as "dust catching the light."
      const skyWasVisible = this.skyMesh?.visible ?? true;
      if (this.skyMesh) this.skyMesh.visible = false;
      this.bloomComposer.render();
      if (this.skyMesh) this.skyMesh.visible = skyWasVisible;

      // Pass 2: render the full scene (sky + motes + entities), add
      // the bloom texture on top, then film grain. Renders to screen.
      this.finalComposer.render();
    } else {
      realRenderer.render(this.scene, this.camera);
    }
  }

  // ==========================================================================
  // Colour treatment — every entity colour flows through this.
  // ==========================================================================

  /**
   * Warm tint + slight desaturation. Every entity that uses the
   * inherited hsvToThreeColor flows through this — the visual unity
   * of the Ghibli register comes from this one function.
   */
  protected hsvToThreeColor(hsv: {
    h: number;
    s: number;
    v: number;
  }): THREE.Color {
    const base = super.hsvToThreeColor(hsv);
    // Desaturate toward warm grey
    const lum = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
    base.r = base.r + (lum - base.r) * DESATURATE;
    base.g = base.g + (lum - base.g) * DESATURATE;
    base.b = base.b + (lum - base.b) * DESATURATE;
    // Mix in warm tint
    base.r = base.r + (WARM_TINT_R - base.r) * WARM_MIX;
    base.g = base.g + (WARM_TINT_G - base.g) * WARM_MIX;
    base.b = base.b + (WARM_TINT_B - base.b) * WARM_MIX;
    return base;
  }

  // ==========================================================================
  // Sky background — large quad rendered behind everything.
  // ==========================================================================

  private buildSky(): void {
    if (!this.scene) return;
    const worldW = this.config.worldWidth;
    const worldH = this.config.worldHeight;
    // Cover plenty larger than the world to avoid showing the gap
    // when the camera is at default position.
    const geom = new THREE.PlaneGeometry(worldW * 3, worldH * 3);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: SKY_TOP },
        bottom: { value: SKY_BOTTOM },
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 bottom;
        uniform float time;
        varying vec2 vUv;
        void main() {
          // Slow drift in the gradient mix
          float shift = 0.04 * sin(time * (6.2831853 / ${SKY_SHIFT_PERIOD_S.toFixed(
            1,
          )}));
          float t = clamp(vUv.y + shift, 0.0, 1.0);
          // Smoothstep gives the painterly soft band at the horizon
          float eased = smoothstep(0.0, 1.0, t);
          vec3 c = mix(bottom, top, eased);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false,
    });
    this.skyMaterial = mat;
    const mesh = new THREE.Mesh(geom, mat);
    // Position the sky quad far behind everything. The camera looks
    // along -Z, so a large negative Z is "behind."
    mesh.position.set(worldW / 2, worldH / 2, -50);
    mesh.renderOrder = -1000; // very first
    this.scene.add(mesh);
    this.skyMesh = mesh;
  }

  // ==========================================================================
  // Drifting dust motes — small points of light gently moving.
  // ==========================================================================

  private buildMotes(): void {
    if (!this.scene) return;
    const positions = new Float32Array(this.moteCount * 3);
    const colors = new Float32Array(this.moteCount * 3);
    this.moteData = [];
    const worldW = this.config.worldWidth;
    const worldH = this.config.worldHeight;
    // Per-mote size (in world units), driven into the sized-attribute
    // below so motes can vary individually rather than via a single
    // PointsMaterial.size.
    const sizes = new Float32Array(this.moteCount);
    for (let i = 0; i < this.moteCount; i++) {
      positions[i * 3 + 0] = Math.random() * worldW;
      positions[i * 3 + 1] = Math.random() * worldH;
      positions[i * 3 + 2] = -20 - Math.random() * 20;
      // Near-white with a slightly cool tint (slight blue lift) so
      // motes contrast against the warm peach sky. The bloom pass
      // gives them a soft halo on top of this.
      const v = 0.92 + Math.random() * 0.08;
      colors[i * 3 + 0] = v * (0.96 + Math.random() * 0.04);
      colors[i * 3 + 1] = v * (0.96 + Math.random() * 0.04);
      colors[i * 3 + 2] = v;
      // Size variation: most motes small (~0.4 units), occasional
      // larger ones (~1.0 units) for visual texture.
      sizes[i] = 0.4 + Math.pow(Math.random(), 3) * 1.4;
      // Gentle drift
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.3 + Math.random() * 0.7) * MOTE_DRIFT_SPEED;
      this.moteData.push({
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      });
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    // Custom shader so motes render as soft circular gaussians (a
    // PointsMaterial without a map gives square dots, which read as
    // "pixel art" rather than "dust in light"). Per-mote size via
    // the aSize attribute. Additive blending keeps the "catching
    // light" feel.
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // gl_PointSize is in pixels; scale aSize (world units) by
          // canvas height / near-plane heuristic so it stays roughly
          // size-stable across viewports. The 320.0 factor is tuned
          // empirically — bigger numbers give larger motes.
          gl_PointSize = aSize * (320.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          // gl_PointCoord is (0,0)..(1,1) across the point quad.
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d) * 2.0;
          if (r > 1.0) discard;
          // Soft gaussian falloff: bright centre, dim edges.
          float alpha = exp(-r * r * 4.0);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      vertexColors: true,
    });

    const points = new THREE.Points(geom, mat);
    points.renderOrder = -500;
    this.scene.add(points);
    this.moteSystem = points;
  }

  private driftMotes(t: number): void {
    if (!this.moteSystem) return;
    void t;
    const dt = 1 / 60; // approximate
    const positions = this.moteSystem.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const worldW = this.config.worldWidth;
    const worldH = this.config.worldHeight;
    for (let i = 0; i < this.moteCount; i++) {
      const d = this.moteData[i];
      let x = positions.getX(i) + d.vx * dt;
      let y = positions.getY(i) + d.vy * dt;
      // Wrap softly at world edges
      if (x < -2) x = worldW + 2;
      if (x > worldW + 2) x = -2;
      if (y < -2) y = worldH + 2;
      if (y > worldH + 2) y = -2;
      positions.setX(i, x);
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
  }

  // ==========================================================================
  // Effect composer — RenderPass + Bloom + Grain
  // ==========================================================================

  private buildComposer(canvas: HTMLCanvasElement): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    const dpr = this.renderer.getPixelRatio?.() ?? 1;
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    const size = new THREE.Vector2(cssW * dpr, cssH * dpr);

    // Bloom-only composer. Renders the scene (with sky/motes hidden by
    // the render() method before invoking) and applies bloom. Output
    // is consumed as a texture by the final composer, not drawn to
    // screen directly.
    this.bloomComposer = new EffectComposer(this.renderer);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.setSize(cssW * dpr, cssH * dpr);
    this.bloomComposer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomComposer.addPass(
      new UnrealBloomPass(
        size,
        this.bloomStrength,
        this.bloomRadius,
        BLOOM_THRESHOLD,
      ),
    );

    // Final composer: full scene → combine with bloom texture → grain.
    this.finalComposer = new EffectComposer(this.renderer);
    this.finalComposer.setSize(cssW * dpr, cssH * dpr);
    this.finalComposer.addPass(new RenderPass(this.scene, this.camera));

    const combine = new ShaderPass(CombineShader);
    (combine.uniforms.bloomTexture as { value: THREE.Texture | null }).value =
      this.bloomComposer.renderTarget2.texture;
    this.combinePass = combine;
    this.finalComposer.addPass(combine);

    const grain = new ShaderPass(GrainShader);
    (grain.uniforms.amount as { value: number }).value = this.grainAmount;
    this.grainPass = grain;
    this.finalComposer.addPass(grain);
  }
}
