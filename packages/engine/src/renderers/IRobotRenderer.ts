/**
 * IRobotRenderer — experimental flat-shaded arcade renderer.
 *
 * Aesthetic register: Atari I, Robot (1984). Flat-shaded faceted
 * polygons, saturated primary colours, chunky low-res pixels, pure
 * black void, no antialiasing. Leans toward the rougher arcade
 * register rather than the polished cabinet art — no bloom, no
 * grain, no atmospheric effects. Just hard-edged colour blocks.
 *
 * Two cheap moves do most of the work:
 *   - Every entity colour is snapped to the nearest of a fixed
 *     primary palette via an overridden hsvToThreeColor.
 *   - The WebGLRenderer is built with antialias: false and a low
 *     pixel ratio so geometry rasterises with visible blocks
 *     rather than smooth edges.
 *
 * Pure aesthetic fork — no spec, no tests.
 */

import type * as THREE from "three";
import { ThreeJSRenderer, type ThreeJSRendererConfig } from "./ThreeJSRenderer";

// ============================================================================
// Palette
// ============================================================================

/**
 * Limited primary palette pulled from the I, Robot arcade screenshots.
 * Every entity colour will be snapped to whichever of these is nearest
 * in RGB Euclidean distance. The closer the palette is to "Atari
 * primaries", the more recognisable the register.
 */
const PALETTE: [number, number, number][] = [
  // R, G, B in 0..1
  [1.0, 0.0, 0.0], // pure red
  [0.0, 0.0, 1.0], // pure blue
  [0.0, 0.85, 0.0], // pure green
  [1.0, 1.0, 0.0], // yellow
  [0.0, 0.85, 0.85], // cyan
  [1.0, 0.0, 0.8], // magenta / pink
  [1.0, 0.55, 0.0], // orange
  [1.0, 1.0, 1.0], // white (highlights / structure)
  // Two darker variants so adjacent flat polygons read as "faceted"
  // rather than "merged":
  [0.55, 0.0, 0.0], // dark red
  [0.0, 0.0, 0.55], // dark blue
];

/**
 * Pixel ratio override for the WebGL framebuffer. Real device pixel
 * ratios are typically 1–3; forcing a lower value makes the rendered
 * image use bigger pixel blocks. The browser then upscales (with
 * smoothing) on its way to screen — we counter that with
 * imageRendering: pixelated on the canvas's CSS so the blocks stay
 * crisp.
 */
const PIXEL_RATIO = 0.45;

// ============================================================================
// IRobotRenderer
// ============================================================================

export type IRobotRendererConfig = ThreeJSRendererConfig;

export class IRobotRenderer extends ThreeJSRenderer {
  readonly id: string = "i-robot";

  constructor(config: IRobotRendererConfig = {}) {
    super({
      ...config,
      // Pure black void. The renderer's antialias flag isn't on the
      // public config, so we have to override the WebGLRenderer
      // construction in attach() — see below.
      backgroundColor: config.backgroundColor ?? 0x000000,
    });
  }

  attach(canvas: HTMLCanvasElement): void {
    super.attach(canvas);
    if (!this.renderer) return;

    // Drop the pixel ratio so the framebuffer is intentionally low-res.
    this.renderer.setPixelRatio(PIXEL_RATIO);
    // Re-apply size so the renderer reallocates buffers at the new ratio.
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    this.renderer.setSize(cssW, cssH);

    // Force nearest-neighbour upscale on the canvas itself so the
    // pixel blocks render crisp instead of being browser-smoothed.
    canvas.style.imageRendering = "pixelated";
    // The standardised value is "pixelated"; some older browsers use
    // "crisp-edges". Set both via setProperty so they coexist.
    canvas.style.setProperty("image-rendering", "pixelated");
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    // Re-apply the low pixel ratio — the parent resize calls
    // renderer.setSize which can reset internal state. Resetting the
    // ratio here is idempotent and cheap.
    this.renderer?.setPixelRatio(PIXEL_RATIO);
  }

  /**
   * Snap every colour to the nearest palette entry. This is the move
   * that does most of the aesthetic lifting — every shape on screen,
   * regardless of original hue, lands on one of ten primary colours,
   * so the whole image reads as a faceted arcade scene.
   */
  protected hsvToThreeColor(hsv: {
    h: number;
    s: number;
    v: number;
  }): THREE.Color {
    const base = super.hsvToThreeColor(hsv);
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < PALETTE.length; i++) {
      const [pr, pg, pb] = PALETTE[i];
      const dr = base.r - pr;
      const dg = base.g - pg;
      const db = base.b - pb;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    const [r, g, b] = PALETTE[bestIdx];
    base.r = r;
    base.g = g;
    base.b = b;
    return base;
  }
}
