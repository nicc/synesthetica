/**
 * Chord Shape Geometry Builder
 *
 * Computes chord shape geometry once, outputs to multiple formats (SVG, Three.js).
 * This is the single source of truth for chord shape rendering.
 *
 * Usage:
 *   const builder = new ChordShapeBuilder(elements, margin, { scale, center });
 *   const svgPath = builder.toSVGPath();           // For snapshots
 *   const threeShape = builder.toThreeShape();     // For WebGL
 */

import * as THREE from "three";
import type {
  ChordShapeElement,
  MarginStyle,
  ColorHSVA,
} from "@synesthetica/contracts";

// ============================================================================
// Constants (from SPEC 010)
// ============================================================================

/** Hub radius as fraction of base radius */
export const HUB_RADIUS = 0.3;

/** Arm length by tier (as fraction of base radius, added to hub) */
export const ARM_LENGTH: Record<string, number> = {
  triadic: 0.7,
  seventh: 0.45,
  extension: 0.25,
};

/** Angular width of each arm in degrees */
export const BASE_WIDTH = 30;

// ============================================================================
// Types
// ============================================================================

export interface ChordShapeBuilderOptions {
  /** Base radius in pixels */
  scale: number;
  /** Center point */
  center: { x: number; y: number };
  /** Stroke width for lines (default: 2) */
  strokeWidth?: number;
}

interface Point {
  x: number;
  y: number;
}

interface ArmGeometry {
  interval: string;
  tier: "triadic" | "seventh" | "extension";
  color: ColorHSVA;
  angle: number;
  baseLeft: Point;
  baseRight: Point;
  tip: Point;
}

interface LineGeometry {
  angle: number;
  color: ColorHSVA;
  inner: Point;
  outer: Point;
}

// ============================================================================
// ChordShapeBuilder
// ============================================================================

export class ChordShapeBuilder {
  private readonly elements: ChordShapeElement[];
  private readonly margin: MarginStyle;
  private readonly scale: number;
  private readonly cx: number;
  private readonly cy: number;
  private readonly strokeWidth: number;
  private readonly hubR: number;

  // Computed geometry
  private readonly arms: ArmGeometry[];
  private readonly lines: LineGeometry[];

  constructor(
    elements: ChordShapeElement[],
    margin: MarginStyle,
    options: ChordShapeBuilderOptions
  ) {
    this.elements = elements;
    this.margin = margin;
    this.scale = options.scale;
    this.cx = options.center.x;
    this.cy = options.center.y;
    this.strokeWidth = options.strokeWidth ?? 2;
    this.hubR = this.scale * HUB_RADIUS;

    // Compute geometry
    this.arms = this.computeArms();
    this.lines = this.computeLines();
  }

  // ==========================================================================
  // Geometry Computation
  // ==========================================================================

  private computeArms(): ArmGeometry[] {
    const wedges = this.elements
      .filter((e) => e.style !== "line")
      .sort((a, b) => a.angle - b.angle);

    return wedges.map((el) => {
      const armLength = ARM_LENGTH[el.tier] ?? ARM_LENGTH.triadic;
      const tipR = this.hubR + this.scale * armLength;

      const armLeftAngle = el.angle - BASE_WIDTH / 2;
      const armRightAngle = el.angle + BASE_WIDTH / 2;

      return {
        interval: el.interval,
        tier: el.tier,
        color: el.color,
        angle: el.angle,
        baseLeft: this.polarToXY(armLeftAngle, this.hubR),
        baseRight: this.polarToXY(armRightAngle, this.hubR),
        tip: this.polarToXY(el.angle, tipR),
      };
    });
  }

  private computeLines(): LineGeometry[] {
    const lineElements = this.elements.filter((e) => e.style === "line");
    const outerR = this.hubR + this.scale * ARM_LENGTH.extension;
    const innerR = this.hubR + this.strokeWidth * 0.25;

    return lineElements.map((el) => ({
      angle: el.angle,
      color: el.color,
      inner: this.polarToXY(el.angle, innerR),
      outer: this.polarToXY(el.angle, outerR),
    }));
  }

  private polarToXY(angle: number, radius: number): Point {
    const rad = ((90 - angle) * Math.PI) / 180;
    return {
      x: this.cx + radius * Math.cos(rad),
      y: this.cy - radius * Math.sin(rad),
    };
  }

  // ==========================================================================
  // SVG Output
  // ==========================================================================

  /**
   * Generate SVG path string for the unified shape outline.
   */
  toSVGPath(): string {
    if (this.arms.length === 0) return "";

    let path = "";

    for (let i = 0; i < this.arms.length; i++) {
      const curr = this.arms[i];
      const next = this.arms[(i + 1) % this.arms.length];

      if (i === 0) {
        path += `M ${curr.baseLeft.x.toFixed(1)} ${curr.baseLeft.y.toFixed(1)}`;
      }

      // Straight edge to tip
      path += ` L ${curr.tip.x.toFixed(1)} ${curr.tip.y.toFixed(1)}`;

      // Straight edge to hub right
      path += ` L ${curr.baseRight.x.toFixed(1)} ${curr.baseRight.y.toFixed(1)}`;

      // Hub transition to next arm
      path += this.svgHubArc(curr, next);
    }

    path += " Z";
    return path;
  }

  /**
   * Generate SVG path strings for chromatic lines.
   */
  toSVGLines(): Array<{ path: string; color: ColorHSVA }> {
    return this.lines.map((line) => ({
      path: `M ${line.inner.x.toFixed(1)} ${line.inner.y.toFixed(1)} L ${line.outer.x.toFixed(1)} ${line.outer.y.toFixed(1)}`,
      color: line.color,
    }));
  }

  private svgHubArc(curr: ArmGeometry, next: ArmGeometry): string {
    const startAngle = curr.angle + BASE_WIDTH / 2;
    const endAngle = next.angle - BASE_WIDTH / 2;

    let arcSpan = endAngle - startAngle;
    if (arcSpan < 0) arcSpan += 360;

    const end = next.baseLeft;

    if (this.margin === "concave") {
      return this.svgSmoothConcave(curr.baseRight, curr.tip, next);
    }

    if (this.margin === "straight" || this.margin === "dash-short" || this.margin === "dash-long") {
      const largeArc = arcSpan > 180 ? 1 : 0;
      return ` A ${this.hubR.toFixed(1)} ${this.hubR.toFixed(1)} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    }

    if (this.margin === "wavy") {
      return this.svgWavyArc(startAngle, arcSpan);
    }

    if (this.margin === "convex") {
      // Larger-radius arc creates a gentler curve than the hub circle.
      // The hub boundary dips slightly inward between arms, giving a
      // subtle convex appearance relative to a straight chord.
      // Matches the HTML validation page's styledArc for convex.
      const expansionFactor = 1.5 + arcSpan * 0.008;
      const convexR = this.hubR * expansionFactor;
      return ` A ${convexR.toFixed(1)} ${convexR.toFixed(1)} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    }

    // Fallback: circular arc
    const largeArc = arcSpan > 180 ? 1 : 0;
    return ` A ${this.hubR.toFixed(1)} ${this.hubR.toFixed(1)} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }

  private svgSmoothConcave(start: Point, currTip: Point, next: ArmGeometry): string {
    const end = next.baseLeft;

    // Incoming tangent: direction from currTip to start
    const inDx = start.x - currTip.x;
    const inDy = start.y - currTip.y;
    const inLen = Math.sqrt(inDx * inDx + inDy * inDy);
    const inDirX = inDx / inLen;
    const inDirY = inDy / inLen;

    // Outgoing tangent: direction from end to nextTip
    const outDx = next.tip.x - end.x;
    const outDy = next.tip.y - end.y;
    const outLen = Math.sqrt(outDx * outDx + outDy * outDy);
    const outDirX = outDx / outLen;
    const outDirY = outDy / outLen;

    // Control point distance
    const chordLen = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    const controlDist = chordLen * 0.55;

    // Control points
    const cp1x = start.x + controlDist * inDirX;
    const cp1y = start.y + controlDist * inDirY;
    const cp2x = end.x - controlDist * outDirX;
    const cp2y = end.y - controlDist * outDirY;

    return ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }

  private svgWavyArc(startAngle: number, arcSpan: number): string {
    const steps = Math.max(3, Math.floor(arcSpan / 20));
    const amp = 4;
    let path = "";

    for (let i = 0; i < steps; i++) {
      const t1 = (i + 1) / steps;
      const angle1 = startAngle + arcSpan * t1;
      const midAngle = startAngle + arcSpan * (i + 0.5) / steps;

      const p1 = this.polarToXY(angle1, this.hubR);
      const waveR = this.hubR + (i % 2 === 0 ? amp : -amp);
      const ctrl = this.polarToXY(midAngle, waveR);

      path += ` Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }

    return path;
  }

  // ==========================================================================
  // Three.js Output
  // ==========================================================================

  /**
   * Convert SVG point to Three.js local coordinates.
   * - Removes center offset (shape at origin)
   * - Flips Y (SVG is Y-down, Three.js is Y-up)
   */
  private toThreePoint(p: Point): Point {
    return {
      x: p.x - this.cx,
      y: -(p.y - this.cy),
    };
  }

  /**
   * Convert polar to Three.js local coordinates directly.
   * Same as polarToXY but for Three.js coordinate system.
   */
  private polarToThree(angle: number, radius: number): Point {
    const rad = ((90 - angle) * Math.PI) / 180;
    return {
      x: radius * Math.cos(rad),
      y: radius * Math.sin(rad), // Y-up for Three.js
    };
  }

  /**
   * Generate THREE.Shape for WebGL rendering.
   * Shape is centered at origin with Y pointing up.
   */
  toThreeShape(): THREE.Shape {
    const shape = new THREE.Shape();

    if (this.arms.length === 0) return shape;

    for (let i = 0; i < this.arms.length; i++) {
      const curr = this.arms[i];
      const next = this.arms[(i + 1) % this.arms.length];

      const baseLeft = this.toThreePoint(curr.baseLeft);
      const tip = this.toThreePoint(curr.tip);
      const baseRight = this.toThreePoint(curr.baseRight);

      if (i === 0) {
        shape.moveTo(baseLeft.x, baseLeft.y);
      }

      // Straight edge to tip
      shape.lineTo(tip.x, tip.y);

      // Straight edge to hub right
      shape.lineTo(baseRight.x, baseRight.y);

      // Hub transition to next arm
      this.threeHubArc(shape, curr, next);
    }

    shape.closePath();
    return shape;
  }

  /**
   * Generate THREE.Line for chromatic lines.
   */
  toThreeLines(): Array<{ geometry: THREE.BufferGeometry; color: ColorHSVA }> {
    return this.lines.map((line) => {
      const inner = this.toThreePoint(line.inner);
      const outer = this.toThreePoint(line.outer);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(inner.x, inner.y, 0.1),
        new THREE.Vector3(outer.x, outer.y, 0.1),
      ]);
      return { geometry, color: line.color };
    });
  }

  private threeHubArc(shape: THREE.Shape, curr: ArmGeometry, next: ArmGeometry): void {
    const startAngle = curr.angle + BASE_WIDTH / 2;
    const endAngle = next.angle - BASE_WIDTH / 2;

    let arcSpan = endAngle - startAngle;
    if (arcSpan < 0) arcSpan += 360;

    const end = this.toThreePoint(next.baseLeft);

    if (this.margin === "concave") {
      this.threeSmoothConcave(shape, curr, next);
      return;
    }

    if (this.margin === "straight" || this.margin === "dash-short" || this.margin === "dash-long") {
      // Approximate arc with fine segments (3° each) to avoid visible
      // miter joints when rendered with thick Line2 outlines
      const segments = Math.max(8, Math.ceil(arcSpan / 3));
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + arcSpan * t;
        const pt = this.polarToThree(angle, this.hubR);
        shape.lineTo(pt.x, pt.y);
      }
      return;
    }

    if (this.margin === "wavy") {
      this.threeWavyArc(shape, startAngle, arcSpan);
      return;
    }

    if (this.margin === "convex") {
      // Replicate the SVG arc behavior: a larger-radius arc creates a
      // gentler curve than the hub circle, so the hub boundary dips
      // slightly inward between arms. Compute the arc midpoint distance
      // from center and interpolate using a sinusoidal profile.
      const expansionFactor = 1.5 + arcSpan * 0.008;
      const convexR = this.hubR * expansionFactor;
      const halfArcRad = (arcSpan / 2) * Math.PI / 180;
      const halfChord = this.hubR * Math.sin(halfArcRad);
      const sagitta = convexR - Math.sqrt(convexR * convexR - halfChord * halfChord);
      const chordMidDist = this.hubR * Math.cos(halfArcRad);
      const arcMidDist = chordMidDist + sagitta;

      const segments = Math.max(8, Math.ceil(arcSpan / 3));
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + arcSpan * t;
        // Sinusoidal profile: hubR at endpoints, arcMidDist at midpoint
        const profile = Math.sin(t * Math.PI);
        const r = this.hubR + (arcMidDist - this.hubR) * profile;
        const pt = this.polarToThree(angle, r);
        shape.lineTo(pt.x, pt.y);
      }
      return;
    }

    // Fallback: line to end
    shape.lineTo(end.x, end.y);
  }

  private threeSmoothConcave(shape: THREE.Shape, curr: ArmGeometry, next: ArmGeometry): void {
    const start = this.toThreePoint(curr.baseRight);
    const currTip = this.toThreePoint(curr.tip);
    const end = this.toThreePoint(next.baseLeft);
    const nextTip = this.toThreePoint(next.tip);

    // Incoming tangent: direction from currTip to start
    const inDx = start.x - currTip.x;
    const inDy = start.y - currTip.y;
    const inLen = Math.sqrt(inDx * inDx + inDy * inDy);
    const inDirX = inDx / inLen;
    const inDirY = inDy / inLen;

    // Outgoing tangent: direction from end to nextTip
    const outDx = nextTip.x - end.x;
    const outDy = nextTip.y - end.y;
    const outLen = Math.sqrt(outDx * outDx + outDy * outDy);
    const outDirX = outDx / outLen;
    const outDirY = outDy / outLen;

    // Control point distance
    const chordLen = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    const controlDist = chordLen * 0.55;

    // Control points
    const cp1x = start.x + controlDist * inDirX;
    const cp1y = start.y + controlDist * inDirY;
    const cp2x = end.x - controlDist * outDirX;
    const cp2y = end.y - controlDist * outDirY;

    shape.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
  }

  private threeWavyArc(shape: THREE.Shape, startAngle: number, arcSpan: number): void {
    const steps = Math.max(3, Math.floor(arcSpan / 20));
    const amp = 0.4;

    for (let i = 0; i < steps; i++) {
      const t1 = (i + 1) / steps;
      const angle1 = startAngle + arcSpan * t1;
      const midAngle = startAngle + arcSpan * (i + 0.5) / steps;

      const p1 = this.polarToThree(angle1, this.hubR);
      const waveR = this.hubR + (i % 2 === 0 ? amp : -amp);
      const ctrl = this.polarToThree(midAngle, waveR);

      shape.quadraticCurveTo(ctrl.x, ctrl.y, p1.x, p1.y);
    }
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  /** Get hub center and radius for gradient origins */
  getHub(): { center: Point; radius: number } {
    return {
      center: { x: this.cx, y: this.cy },
      radius: this.hubR,
    };
  }

  /** Get arm data for per-arm styling */
  getArms(): ReadonlyArray<ArmGeometry> {
    return this.arms;
  }

  /** Get the margin style */
  getMargin(): MarginStyle {
    return this.margin;
  }

  /**
   * Get hub arc segments in Three.js local coordinates.
   * Each arc is the hub section between two adjacent arms.
   * Angles are in compass degrees (0=north, clockwise).
   */
  getThreeHubArcs(): Array<{ startAngle: number; arcSpan: number }> {
    const arcs: Array<{ startAngle: number; arcSpan: number }> = [];
    for (let i = 0; i < this.arms.length; i++) {
      const curr = this.arms[i];
      const next = this.arms[(i + 1) % this.arms.length];
      const startAngle = curr.angle + BASE_WIDTH / 2;
      const endAngle = next.angle - BASE_WIDTH / 2;
      let arcSpan = endAngle - startAngle;
      if (arcSpan < 0) arcSpan += 360;
      arcs.push({ startAngle, arcSpan });
    }
    return arcs;
  }

  /**
   * Get arm edge paths in Three.js local coordinates.
   * Each arm has 3 points: baseLeft → tip → baseRight.
   */
  getThreeArmEdges(): Array<Array<{ x: number; y: number }>> {
    return this.arms.map((arm) => [
      this.toThreePoint(arm.baseLeft),
      this.toThreePoint(arm.tip),
      this.toThreePoint(arm.baseRight),
    ]);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert ColorHSVA to CSS color string.
 */
export function colorToCSS(color: ColorHSVA): string {
  const { h, s, v, a = 1 } = color;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);

  if (a < 1) {
    return `rgba(${R}, ${G}, ${B}, ${a.toFixed(2)})`;
  }
  return `rgb(${R}, ${G}, ${B})`;
}

/**
 * Get SVG dash array for dashed margin styles.
 */
export function getDashArray(margin: MarginStyle): string | undefined {
  if (margin === "dash-short") return "3,3";
  if (margin === "dash-long") return "6,3";
  return undefined;
}

/**
 * Get Three.js dash parameters for dashed margin styles.
 * Sizes are proportional to the shape scale.
 * Returns null for non-dashed styles.
 */
export function getThreeDashParams(
  margin: MarginStyle,
  scale: number
): { dashSize: number; gapSize: number } | null {
  // Dashes apply only to the hub arcs, not the full outline.
  // Hub circumference per arc ≈ hubR * arcSpan, much smaller than
  // total outline. Sizes are in world units. With baseRadius=10
  // and hubR=3, a triad hub arc ≈ 4.7 units, giving ~5 and ~3 dashes.
  if (margin === "dash-short") {
    return { dashSize: scale * 0.05, gapSize: scale * 0.05 };
  }
  if (margin === "dash-long") {
    return { dashSize: scale * 0.1, gapSize: scale * 0.05 };
  }
  return null;
}
