/**
 * AsciiRenderer — experimental character-grid renderer.
 *
 * Renders SceneFrame entities into a 2D grid of characters inside a
 * monospace `<pre>` element. Colours are replicated via inline CSS
 * spans, computed from each entity's HSV+opacity against a black
 * background.
 *
 * No canvas, no WebGL, no SVG — just text. Lower visual fidelity
 * than the Three.js renderer by definition, but a different
 * aesthetic register entirely. Uses Unicode block-drawing chars
 * for shapes (block elements, box drawing, geometric shapes).
 *
 * Coverage:
 *   - note-strip            → vertical blocks
 *   - now-line              → heavy horizontal rule (with pulse)
 *   - beat-line, bar-line   → lighter horizontal rules
 *   - reference-line, streak → short lines
 *   - dynamics-indicator    → filled rect
 *   - dynamics-contour      → polyline as connected chars
 *   - chord-label           → text directly
 *   - roman-numeral         → text from entity.data.text
 *   - progression-guide-ring → midpoint-circle rasterisation
 *   - progression-slot-tick → short radial line
 *   - connection-strip      → arc segment along guide ring
 *   - chord-shape           → centre marker + radial spokes
 *   - chord-history (test)  → ignored
 *   - drift-ring            → small ring at position
 *   - default field (glow)  → soft dot
 *
 * Performance: this is DOM-based, ~30fps at 160×60. Acceptable for
 * an experimental view.
 */

import type {
  IRenderer,
  SceneFrame,
  Entity,
  ColorHSVA,
} from "@synesthetica/contracts";

interface Cell {
  ch: string;
  r: number;
  g: number;
  b: number;
}

const EMPTY_CELL: Cell = { ch: " ", r: 0, g: 0, b: 0 };

export interface AsciiRendererConfig {
  /** Grid width in characters. @default 160 */
  cols?: number;
  /** Grid height in rows. @default 60 */
  rows?: number;
  /** Background colour as CSS string. @default "#000" */
  background?: string;
  /** Optional override font size in px. By default fits the viewport. */
  fontSizePx?: number;
}

const DEFAULT_COLS = 160;
const DEFAULT_ROWS = 60;

export class AsciiRenderer implements IRenderer {
  readonly id = "ascii";

  private cols: number;
  private rows: number;
  private background: string;
  private fontSizeOverride: number | null;

  private container: HTMLElement | null = null;
  private pre: HTMLPreElement | null = null;
  private grid: Cell[][] = [];

  constructor(config: AsciiRendererConfig = {}) {
    this.cols = config.cols ?? DEFAULT_COLS;
    this.rows = config.rows ?? DEFAULT_ROWS;
    this.background = config.background ?? "#000";
    this.fontSizeOverride = config.fontSizePx ?? null;
    this.allocateGrid();
  }

  /**
   * Attach to a container. Replaces (hides) any existing canvas inside
   * by absolute-positioning the `<pre>` over it.
   */
  attach(container: HTMLElement): void {
    this.container = container;
    const pre = document.createElement("pre");
    pre.style.position = "absolute";
    pre.style.inset = "0";
    pre.style.margin = "0";
    pre.style.padding = "0";
    pre.style.background = this.background;
    pre.style.color = "#fff";
    pre.style.fontFamily =
      "ui-monospace, 'SF Mono', Menlo, 'Cascadia Mono', Consolas, monospace";
    pre.style.fontWeight = "400";
    pre.style.lineHeight = "1";
    pre.style.letterSpacing = "0";
    pre.style.whiteSpace = "pre";
    pre.style.overflow = "hidden";
    pre.style.userSelect = "none";
    pre.style.pointerEvents = "none";
    pre.style.zIndex = "5";
    pre.dataset.renderer = "ascii";
    container.appendChild(pre);
    this.pre = pre;
    this.fitFont();
    window.addEventListener("resize", this.fitFont);
  }

  detach(): void {
    window.removeEventListener("resize", this.fitFont);
    if (this.pre && this.pre.parentElement) {
      this.pre.parentElement.removeChild(this.pre);
    }
    this.pre = null;
    this.container = null;
  }

  resize(_w: number, _h: number): void {
    this.fitFont();
  }

  render(frame: SceneFrame): void {
    if (!this.pre) return;

    this.clearGrid();

    // Render in a stable z-ish order: structural lines first, then
    // notes, then text glyphs on top.
    const order = [
      "now-line",
      "beat-line",
      "bar-line",
      "reference-line",
      "streak",
      "drift-ring",
      "progression-guide-ring",
      "progression-slot-tick",
      "connection-strip",
      "chord-shape",
      "dynamics-indicator",
      "dynamics-contour",
      "note-strip",
      "chord-label",
      "roman-numeral",
    ];
    const buckets = new Map<string, Entity[]>();
    for (const e of frame.entities) {
      const t = (e.data?.type as string | undefined) ?? "_default";
      if (!buckets.has(t)) buckets.set(t, []);
      buckets.get(t)!.push(e);
    }
    for (const key of order) {
      const list = buckets.get(key);
      if (!list) continue;
      for (const e of list) this.drawEntity(e, key);
      buckets.delete(key);
    }
    // Anything left over (unknown types) — render as a dot.
    for (const list of buckets.values()) {
      for (const e of list) this.drawDefault(e);
    }

    this.pre.innerHTML = this.gridToHtml();
  }

  // ==========================================================================
  // Setup
  // ==========================================================================

  private allocateGrid(): void {
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row: Cell[] = new Array(this.cols);
      for (let c = 0; c < this.cols; c++) row[c] = { ...EMPTY_CELL };
      this.grid.push(row);
    }
  }

  private clearGrid(): void {
    for (let r = 0; r < this.rows; r++) {
      const row = this.grid[r];
      for (let c = 0; c < this.cols; c++) {
        row[c].ch = " ";
        row[c].r = 0;
        row[c].g = 0;
        row[c].b = 0;
      }
    }
  }

  private fitFont = (): void => {
    if (!this.pre || !this.container) return;
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    // Character cell ratio: monospace chars are typically ~0.6 wide
    // per em. We want N cols to fit width and M rows to fit height.
    // font-size in px ≈ min(cellHeight, cellWidth / 0.6).
    const cellW = cw / this.cols;
    const cellH = ch / this.rows;
    const fromWidth = cellW / 0.6;
    const fromHeight = cellH;
    const fontSize = this.fontSizeOverride ?? Math.floor(
      Math.min(fromWidth, fromHeight),
    );
    this.pre.style.fontSize = `${fontSize}px`;
    this.pre.style.lineHeight = `${fontSize}px`;
  };

  // ==========================================================================
  // Entity dispatch
  // ==========================================================================

  private drawEntity(entity: Entity, type: string): void {
    switch (type) {
      case "note-strip":
        return this.drawNoteStrip(entity);
      case "now-line":
        return this.drawHorizontalRule(entity, "━");
      case "beat-line":
        return this.drawHorizontalRule(entity, "─");
      case "bar-line":
        return this.drawHorizontalRule(entity, "═");
      case "reference-line":
        return this.drawTrail(entity, "─");
      case "streak":
        return this.drawTrail(entity, "·");
      case "drift-ring":
        return this.drawDriftRing(entity);
      case "progression-guide-ring":
        return this.drawGuideRing(entity);
      case "progression-slot-tick":
        return this.drawSlotTick(entity);
      case "connection-strip":
        return this.drawConnectionStrip(entity);
      case "chord-shape":
        return this.drawChordShape(entity);
      case "dynamics-indicator":
        return this.drawDynamicsIndicator(entity);
      case "dynamics-contour":
        return this.drawDynamicsContour(entity);
      case "chord-label":
        return this.drawChordLabel(entity);
      case "roman-numeral":
        return this.drawRomanNumeral(entity);
      default:
        return this.drawDefault(entity);
    }
  }

  // ==========================================================================
  // Entity renderers
  // ==========================================================================

  private drawNoteStrip(e: Entity): void {
    const x = e.position?.x ?? 0.5;
    // Width: entity.style.size is barWidth × 1000 (RhythmGrammar convention).
    const widthNorm = (e.style.size ?? 0.02 * 1000) / 1000;
    const barTop = (e.data?.barTop as number | undefined) ?? (e.position?.y ?? 0);
    const barHeight = (e.data?.barHeight as number | undefined) ?? 0.05;
    const endY = barTop + barHeight;
    const topOpacity = (e.data?.topOpacity as number | undefined) ?? e.style.opacity ?? 1;
    const bottomOpacity = (e.data?.bottomOpacity as number | undefined) ?? topOpacity;
    const color = e.style.color ?? { h: 0, s: 0, v: 1, a: 1 };

    const c0 = this.normX(x - widthNorm / 2);
    const c1 = this.normX(x + widthNorm / 2);
    const r0 = this.normY(barTop);
    const r1 = this.normY(endY);
    if (r1 < r0) return;
    const span = Math.max(1, r1 - r0);
    for (let r = r0; r <= r1; r++) {
      // interpolate opacity along the strip
      const t = (r - r0) / span;
      const op = topOpacity + (bottomOpacity - topOpacity) * t;
      const rgb = hsvToRgb(color, op);
      for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
        this.put(r, c, "█", rgb);
      }
    }
  }

  private drawHorizontalRule(e: Entity, ch: string): void {
    const y = e.position?.y ?? 0.5;
    const xLeft = (e.data?.xLeft as number | undefined) ?? 0;
    const xRight = (e.data?.xRight as number | undefined) ?? 1;
    const opacity = e.style.opacity ?? 1;
    const color = e.style.color ?? { h: 0, s: 0, v: 1, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    const row = this.normY(y);
    const c0 = this.normX(xLeft);
    const c1 = this.normX(xRight);
    for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
      this.put(row, c, ch, rgb);
    }
  }

  private drawTrail(e: Entity, ch: string): void {
    const x0 = e.position?.x ?? 0;
    const y0 = e.position?.y ?? 0;
    const vx = e.velocity?.x ?? 0;
    const vy = e.velocity?.y ?? 0;
    const opacity = e.style.opacity ?? 0.8;
    const color = e.style.color ?? { h: 0, s: 0, v: 1, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    this.line(x0, y0, x0 + vx, y0 + vy, ch, rgb);
  }

  private drawDynamicsIndicator(e: Entity): void {
    const x = (e.data?.x as number | undefined) ?? (e.position?.x ?? 0);
    const y = (e.data?.y as number | undefined) ?? (e.position?.y ?? 0);
    const w = (e.data?.w as number | undefined) ?? 0.02;
    const h = (e.data?.h as number | undefined) ?? 0.02;
    const opacity = e.style.opacity ?? 1;
    const color = e.style.color ?? { h: 0, s: 0, v: 0.5, a: 1 };
    const rgb = hsvToRgb(color, opacity);

    const c0 = this.normX(x);
    const c1 = this.normX(x + w);
    const r0 = this.normY(y);
    const r1 = this.normY(y + h);
    // For very thin rects (outline strokes), draw a single line.
    if (r0 === r1) {
      for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
        this.put(r0, c, "─", rgb);
      }
      return;
    }
    if (c0 === c1) {
      for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
        this.put(r, c0, "│", rgb);
      }
      return;
    }
    for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
        this.put(r, c, "█", rgb);
      }
    }
  }

  private drawDynamicsContour(e: Entity): void {
    const points = e.data?.points as Array<{ x: number; y: number }> | undefined;
    if (!points || points.length < 2) return;
    const opacity = e.style.opacity ?? 1;
    const color = e.style.color ?? { h: 0, s: 0, v: 1, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      this.line(a.x, a.y, b.x, b.y, "•", rgb);
    }
  }

  private drawChordLabel(e: Entity): void {
    const text = e.data?.text as string | undefined;
    if (!text) return;
    const cx = this.normX(e.position?.x ?? 0.5);
    const cy = this.normY(e.position?.y ?? 0.5);
    const opacity = e.style.opacity ?? 1;
    const color = e.style.color ?? { h: 0, s: 0, v: 1, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    // Multi-line if it contains "/"
    const slashIdx = text.indexOf("/");
    const lines =
      slashIdx > 0 && slashIdx < text.length - 1
        ? [text.slice(0, slashIdx), text.slice(slashIdx)]
        : [text];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const row = cy + i - Math.floor(lines.length / 2);
      const startCol = cx - Math.floor(line.length / 2);
      for (let j = 0; j < line.length; j++) {
        this.put(row, startCol + j, line[j], rgb);
      }
    }
  }

  private drawRomanNumeral(e: Entity): void {
    const text = e.data?.text as string | undefined;
    if (!text) {
      // Older entity without text — fall back to a dot.
      const opacity = e.style.opacity ?? 1;
      const color = e.style.color ?? { h: 0, s: 0, v: 1, a: 1 };
      const rgb = hsvToRgb(color, opacity);
      this.put(
        this.normY(e.position?.y ?? 0.5),
        this.normX(e.position?.x ?? 0.5),
        "●",
        rgb,
      );
      return;
    }
    const cx = this.normX(e.position?.x ?? 0.5);
    const cy = this.normY(e.position?.y ?? 0.5);
    const opacity = e.style.opacity ?? 1;
    const color = e.style.color ?? { h: 0, s: 0, v: 1, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    const startCol = cx - Math.floor(text.length / 2);
    for (let i = 0; i < text.length; i++) {
      this.put(cy, startCol + i, text[i], rgb);
    }
  }

  private drawGuideRing(e: Entity): void {
    const cx = e.position?.x ?? 0.5;
    const cy = e.position?.y ?? 0.5;
    const radius = (e.data?.radius as number | undefined) ?? 0.1;
    const opacity = e.style.opacity ?? 0.4;
    const color = e.style.color ?? { h: 200, s: 0.2, v: 0.5, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    this.ring(cx, cy, radius, "·", rgb);
  }

  private drawSlotTick(e: Entity): void {
    const cx = e.position?.x ?? 0.5;
    const cy = e.position?.y ?? 0.5;
    const angleDeg = (e.data?.angleDeg as number | undefined) ?? 0;
    const innerR = (e.data?.innerRadius as number | undefined) ?? 0.1;
    const outerR = (e.data?.outerRadius as number | undefined) ?? 0.12;
    const opacity = e.style.opacity ?? 0.4;
    const color = e.style.color ?? { h: 200, s: 0.2, v: 0.5, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = -Math.sin(rad); // Y-flip for screen coords (angleDeg is Three.js Y-up)
    // angleDeg in the grammar is clockwise from 12 o'clock; in screen coords, that maps
    // to negative Y delta at the top. The ThreeJSRenderer applies its own Y-flip, so to
    // mimic visually here we flip Y too.
    const x0 = cx + innerR * dx;
    const y0 = cy - innerR * dy;
    const x1 = cx + outerR * dx;
    const y1 = cy - outerR * dy;
    this.line(x0, y0, x1, y1, "│", rgb);
  }

  private drawConnectionStrip(e: Entity): void {
    const cx = e.position?.x ?? 0.5;
    const cy = e.position?.y ?? 0.5;
    const targetAngleDeg = (e.data?.targetAngleDeg as number | undefined) ?? 0;
    const targetMidR = (e.data?.targetMidR as number | undefined) ?? 0.1;
    const targetChordR = (e.data?.targetChordR as number | undefined) ?? 0.08;
    const sourceHue = (e.data?.sourceHue as number | undefined) ?? 0;
    const targetHue = (e.data?.targetHue as number | undefined) ?? 0;
    const overallOpacity = e.style.opacity ?? 1;

    // Strip sits radially between targetChordR and targetMidR at the
    // target's angular position. Width is along the tangent.
    // We approximate as a few dots along the radial axis, gradient
    // from source hue (outer) to target hue (inner).
    const rad = ((targetAngleDeg - 90) * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = -Math.sin(rad);
    const STEPS = 5;
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      const r = targetMidR + (targetChordR - targetMidR) * t;
      const x = cx + r * dx;
      const y = cy - r * dy;
      // t=0 at guide-ring side (source hue, full opacity)
      // t=1 at chord side (target hue, fading)
      const hue = sourceHue + (targetHue - sourceHue) * t;
      const localOpacity = overallOpacity * (1 - Math.pow(t, 4));
      const rgb = hsvToRgb({ h: hue, s: 0.7, v: 0.9, a: 1 }, localOpacity);
      this.put(this.normY(y), this.normX(x), "■", rgb);
    }
  }

  private drawChordShape(e: Entity): void {
    // Lossy — we just mark the centre with a starburst sized to the
    // shape's nominal extent.
    const cx = e.position?.x ?? 0.5;
    const cy = e.position?.y ?? 0.5;
    const opacity = e.style.opacity ?? 1;
    const color = e.style.color ?? { h: 0, s: 0, v: 1, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    const ccol = this.normX(cx);
    const crow = this.normY(cy);
    this.put(crow, ccol, "✦", rgb);
    // A few short spokes
    const elems = e.data?.elements as
      | Array<{ semitone: number; color?: ColorHSVA }>
      | undefined;
    const armCount = elems?.length ?? 4;
    for (let i = 0; i < armCount; i++) {
      const angle = (i / armCount) * Math.PI * 2 - Math.PI / 2;
      const dx = Math.cos(angle);
      const dy = -Math.sin(angle);
      const armColor = elems?.[i]?.color ?? color;
      const armRgb = hsvToRgb(armColor, opacity);
      for (let r = 1; r <= 3; r++) {
        const x = cx + dx * 0.02 * r;
        const y = cy - dy * 0.02 * r;
        this.put(this.normY(y), this.normX(x), "·", armRgb);
      }
    }
  }

  private drawDriftRing(e: Entity): void {
    const cx = e.position?.x ?? 0.5;
    const cy = e.position?.y ?? 0.5;
    const opacity = e.style.opacity ?? 1;
    const color = e.style.color ?? { h: 0, s: 0, v: 1, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    this.put(this.normY(cy), this.normX(cx), "○", rgb);
  }

  private drawDefault(e: Entity): void {
    const opacity = e.style.opacity ?? 0.5;
    const color = e.style.color ?? { h: 0, s: 0, v: 0.5, a: 1 };
    const rgb = hsvToRgb(color, opacity);
    this.put(
      this.normY(e.position?.y ?? 0.5),
      this.normX(e.position?.x ?? 0.5),
      "·",
      rgb,
    );
  }

  // ==========================================================================
  // Drawing primitives
  // ==========================================================================

  private put(row: number, col: number, ch: string, rgb: [number, number, number]): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;
    const cell = this.grid[row][col];
    cell.ch = ch;
    cell.r = rgb[0];
    cell.g = rgb[1];
    cell.b = rgb[2];
  }

  /** Bresenham-style line on the grid using normalized (0..1) coords. */
  private line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    ch: string,
    rgb: [number, number, number],
  ): void {
    let c0 = this.normX(x0);
    let r0 = this.normY(y0);
    const c1 = this.normX(x1);
    const r1 = this.normY(y1);
    const dx = Math.abs(c1 - c0);
    const dy = Math.abs(r1 - r0);
    const sx = c0 < c1 ? 1 : -1;
    const sy = r0 < r1 ? 1 : -1;
    let err = dx - dy;
    // Bresenham guaranteed termination after at most (dx + dy + 1) steps.
    const maxSteps = dx + dy + 1;
    for (let step = 0; step < maxSteps; step++) {
      this.put(r0, c0, ch, rgb);
      if (c0 === c1 && r0 === r1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        c0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        r0 += sy;
      }
    }
  }

  /** Midpoint-circle on the grid. */
  private ring(
    cx: number,
    cy: number,
    radius: number,
    ch: string,
    rgb: [number, number, number],
  ): void {
    // Sample around the circle at enough angles that no col is skipped.
    const samples = Math.max(
      16,
      Math.floor(2 * Math.PI * radius * Math.max(this.cols, this.rows)),
    );
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      // Aspect correction: ASCII chars are ~2× as tall as wide, so a
      // visual "circle" in chars needs y radius half-doubled relative
      // to x — but we're rendering in normalized coords against a
      // 4:3 aspect output. The grid is sized so cell aspect ratio
      // approximates a square viewport pixel, so a circle in
      // normalized coords renders close to a circle on screen.
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      this.put(this.normY(y), this.normX(x), ch, rgb);
    }
  }

  private normX(x: number): number {
    return Math.round(x * (this.cols - 1));
  }
  private normY(y: number): number {
    return Math.round(y * (this.rows - 1));
  }

  // ==========================================================================
  // HTML emission
  // ==========================================================================

  private gridToHtml(): string {
    // Batch consecutive cells with the same colour into a single
    // <span> for both perf and readability.
    const parts: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      const row = this.grid[r];
      let runStart = 0;
      while (runStart < this.cols) {
        const startCell = row[runStart];
        let runEnd = runStart + 1;
        while (
          runEnd < this.cols &&
          row[runEnd].r === startCell.r &&
          row[runEnd].g === startCell.g &&
          row[runEnd].b === startCell.b
        ) {
          runEnd++;
        }
        const text = collectRow(row, runStart, runEnd);
        if (startCell.r === 0 && startCell.g === 0 && startCell.b === 0) {
          parts.push(escapeHtml(text));
        } else {
          parts.push(
            `<span style="color:rgb(${startCell.r},${startCell.g},${startCell.b})">${escapeHtml(text)}</span>`,
          );
        }
        runStart = runEnd;
      }
      if (r < this.rows - 1) parts.push("\n");
    }
    return parts.join("");
  }
}

// ============================================================================
// Helpers
// ============================================================================

function collectRow(row: Cell[], start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i++) s += row[i].ch;
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * HSV → RGB, then composite against black at the given opacity.
 * Returns [r, g, b] in 0..255 integers.
 */
function hsvToRgb(color: ColorHSVA, opacity: number): [number, number, number] {
  const h = ((color.h % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, color.s));
  const v = Math.max(0, Math.min(1, color.v));
  const c = v * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rp = 0, gp = 0, bp = 0;
  if (hp < 1) {
    rp = c; gp = x; bp = 0;
  } else if (hp < 2) {
    rp = x; gp = c; bp = 0;
  } else if (hp < 3) {
    rp = 0; gp = c; bp = x;
  } else if (hp < 4) {
    rp = 0; gp = x; bp = c;
  } else if (hp < 5) {
    rp = x; gp = 0; bp = c;
  } else {
    rp = c; gp = 0; bp = x;
  }
  const m = v - c;
  // Composite against black: rgb_out = rgb * alpha.
  const a = Math.max(0, Math.min(1, opacity * (color.a ?? 1)));
  return [
    Math.round((rp + m) * 255 * a),
    Math.round((gp + m) * 255 * a),
    Math.round((bp + m) * 255 * a),
  ];
}
