import type {
  IRenderer,
  SceneFrame,
  Entity,
  ColorHSVA,
} from "@synesthetica/contracts";

export interface Canvas2DRendererConfig {
  /** Background color in CSS format */
  backgroundColor?: string;
  /** Whether to clear canvas each frame */
  clearEachFrame?: boolean;
}

const DEFAULT_CONFIG: Required<Canvas2DRendererConfig> = {
  backgroundColor: "#000000",
  clearEachFrame: true,
};

/**
 * Minimal Canvas2D renderer that draws SceneFrame entities.
 * Implements IRenderer interface.
 *
 * Supports:
 * - Particles drawn as filled circles
 * - Color (HSVA), size, and opacity from entity style
 */
export class Canvas2DRenderer implements IRenderer {
  readonly id = "canvas2d";

  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private config: Required<Canvas2DRendererConfig>;

  constructor(config: Canvas2DRendererConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attach to a canvas element.
   * Must be called before render().
   */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) {
      throw new Error("Failed to get 2D rendering context");
    }
  }

  /**
   * Detach from canvas.
   */
  detach(): void {
    this.ctx = null;
    this.canvas = null;
  }

  /**
   * Render a scene frame to the attached canvas.
   */
  render(scene: SceneFrame): void {
    if (!this.ctx || !this.canvas) {
      return;
    }

    const { width, height } = this.canvas;

    // Clear canvas
    if (this.config.clearEachFrame) {
      this.ctx.fillStyle = this.config.backgroundColor;
      this.ctx.fillRect(0, 0, width, height);
    }

    // Draw each entity
    for (const entity of scene.entities) {
      this.drawEntity(entity);
    }
  }

  private drawEntity(entity: Entity): void {
    if (!this.ctx || !this.canvas) return;

    switch (entity.kind) {
      case "particle":
        this.drawParticle(entity);
        break;
      case "field": {
        // Check data.type to determine rendering style
        const fieldType = entity.data?.type as string | undefined;
        if (fieldType === "beat-line" || fieldType === "bar-line" || fieldType === "division-tick") {
          this.drawVerticalLine(entity);
        } else if (fieldType === "drift-ring") {
          this.drawRing(entity);
        } else {
          // Default field rendering (glow)
          this.drawField(entity);
        }
        break;
      }
      case "trail":
      case "glyph":
      case "group":
        // Not implemented for Phase 0
        break;
    }
  }

  private drawParticle(entity: Entity): void {
    if (!this.ctx || !this.canvas) return;

    // Convert normalized coordinates (0-1) to pixel coordinates
    const x = (entity.position?.x ?? 0) * this.canvas.width;
    const y = (entity.position?.y ?? 0) * this.canvas.height;
    const size = entity.style.size ?? 10;
    const opacity = entity.style.opacity ?? 1;
    const color = entity.style.color ?? { h: 0, s: 1, v: 1 };

    // Apply opacity from entity style and life decay
    let finalOpacity = opacity;
    if (entity.life) {
      const lifeRatio = 1 - entity.life.ageMs / entity.life.ttlMs;
      finalOpacity *= lifeRatio;
    }

    // Convert HSVA to CSS color
    const cssColor = hsvaToRgba(color, finalOpacity);

    this.ctx.beginPath();
    this.ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = cssColor;
    this.ctx.fill();
  }

  /**
   * Draw a vertical line entity (beat-line, bar-line, division-tick).
   * Line spans full canvas height at x position.
   */
  private drawVerticalLine(entity: Entity): void {
    if (!this.ctx || !this.canvas) return;

    const x = (entity.position?.x ?? 0.5) * this.canvas.width;
    const size = entity.style.size ?? 2;
    const opacity = entity.style.opacity ?? 0.3;
    const color = entity.style.color ?? { h: 0, s: 0, v: 0.5 };

    const cssColor = hsvaToRgba(color, opacity);

    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, this.canvas.height);
    this.ctx.strokeStyle = cssColor;
    this.ctx.lineWidth = size;
    this.ctx.stroke();
  }

  /**
   * Draw a ring entity (drift-ring).
   * Ring is centered at entity position with stroke (not fill).
   */
  private drawRing(entity: Entity): void {
    if (!this.ctx || !this.canvas) return;

    const x = (entity.position?.x ?? 0.5) * this.canvas.width;
    const y = (entity.position?.y ?? 0.5) * this.canvas.height;
    const size = entity.style.size ?? 20;
    const opacity = entity.style.opacity ?? 0.6;
    const color = entity.style.color ?? { h: 120, s: 0.7, v: 0.8 };

    const cssColor = hsvaToRgba(color, opacity);

    this.ctx.beginPath();
    this.ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    this.ctx.strokeStyle = cssColor;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  /**
   * Draw a field entity as a radial gradient circle.
   * Fields represent ambient effects like beat pulses or chord glows.
   */
  private drawField(entity: Entity): void {
    if (!this.ctx || !this.canvas) return;

    // Convert normalized coordinates (0-1) to pixel coordinates
    const x = (entity.position?.x ?? 0.5) * this.canvas.width;
    const y = (entity.position?.y ?? 0.5) * this.canvas.height;
    const size = entity.style.size ?? 100;
    const opacity = entity.style.opacity ?? 0.5;
    const color = entity.style.color ?? { h: 0, s: 0, v: 1 };

    // Apply opacity from entity style and life decay
    let finalOpacity = opacity;
    if (entity.life) {
      const lifeRatio = 1 - entity.life.ageMs / entity.life.ttlMs;
      finalOpacity *= lifeRatio;
    }

    // Create radial gradient
    const radius = size / 2;
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);

    const centerColor = hsvaToRgba(color, finalOpacity);
    const edgeColor = hsvaToRgba(color, 0);

    gradient.addColorStop(0, centerColor);
    gradient.addColorStop(1, edgeColor);

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
  }
}

/**
 * Convert HSVA color to CSS rgba string.
 */
function hsvaToRgba(hsva: ColorHSVA, opacity: number): string {
  const { h, s, v, a = 1 } = hsva;
  const finalAlpha = a * opacity;

  // Convert HSV to RGB
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const red = Math.round((r + m) * 255);
  const green = Math.round((g + m) * 255);
  const blue = Math.round((b + m) * 255);

  return `rgba(${red}, ${green}, ${blue}, ${finalAlpha.toFixed(3)})`;
}
