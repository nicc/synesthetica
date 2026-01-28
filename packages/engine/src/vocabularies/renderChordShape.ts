/**
 * Chord Shape Rendering Utility
 *
 * Renders ChordShapeGeometry to SVG paths. This utility is called BY grammars,
 * not the vocabulary. Grammars can use this for standard rendering or implement
 * their own rendering logic using the geometry data directly.
 *
 * Implements the hub-styled chord shape visualization from SPEC_010.
 */

import type {
  ChordShapeGeometry,
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
export const ARM_LENGTH = {
  triadic: 0.7,
  seventh: 0.45,
  extension: 0.25,
} as const;

/** Angular width of each arm in degrees */
export const BASE_WIDTH = 30;

// ============================================================================
// Rendering Options
// ============================================================================

export interface ChordShapeRenderOptions {
  /** Base radius in pixels (arms and hub scale relative to this) */
  scale: number;
  /** Center point */
  center: { x: number; y: number };
  /** Stroke width for outline (default: 2) */
  strokeWidth?: number;
}

// ============================================================================
// Render Output
// ============================================================================

export interface ChordShapeRenderResult {
  /** Combined SVG path for filled shape (arms + hub) */
  fillPath: string;
  /** SVG paths for chromatic lines (if any) */
  linePaths: Array<{ path: string; color: ColorHSVA }>;
  /** Per-element paths with colors (for grammars that want per-arm control) */
  elements: Array<{
    path: string;
    color: ColorHSVA;
    interval: string;
    tier: ChordShapeElement["tier"];
  }>;
  /** Hub radius in pixels (for reference) */
  hubRadius: number;
  /** Margin style (for stroke styling) */
  margin: MarginStyle;
}

// ============================================================================
// Coordinate Helpers
// ============================================================================

function toRadians(degrees: number): number {
  // Convert from clock-based angles (0° = 12 o'clock) to math angles
  return ((90 - degrees) * Math.PI) / 180;
}

function polarToXY(
  cx: number,
  cy: number,
  angle: number,
  radius: number
): { x: number; y: number } {
  const rad = toRadians(angle);
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),
  };
}

// ============================================================================
// Styled Arc Generation
// ============================================================================

/**
 * Generate an arc along the hub between two angles with the given style.
 */
function styledArc(
  startAngle: number,
  endAngle: number,
  hubR: number,
  style: MarginStyle,
  cx: number,
  cy: number
): string {
  // Calculate arc span (going clockwise)
  let arcSpan = endAngle - startAngle;
  if (arcSpan < 0) arcSpan += 360;

  const start = polarToXY(cx, cy, startAngle, hubR);
  const end = polarToXY(cx, cy, endAngle, hubR);

  if (style === "straight" || style === "dash-short" || style === "dash-long") {
    // Simple arc
    const largeArc = arcSpan > 180 ? 1 : 0;
    return ` A ${hubR.toFixed(1)} ${hubR.toFixed(1)} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }

  if (style === "wavy") {
    // Wavy arc - smooth sine wave
    const steps = Math.max(3, Math.floor(arcSpan / 20));
    let path = "";
    const amp = 4;

    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const angle0 = startAngle + arcSpan * t0;
      const angle1 = startAngle + arcSpan * t1;
      const midAngle = (angle0 + angle1) / 2;

      const p1 = polarToXY(cx, cy, angle1, hubR);

      // Wave in/out alternating
      const waveR = hubR + (i % 2 === 0 ? amp : -amp);
      const ctrl = polarToXY(cx, cy, midAngle, waveR);

      path += ` Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    return path;
  }

  if (style === "concave") {
    // Large gaps: flat line to avoid awkward hub bulge
    if (arcSpan >= 150) {
      return ` L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    }

    const chordLen = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    const minR = chordLen / 2 + 1;

    // Scale radius up for larger gaps - gentler concave
    const scaleFactor = 1 + arcSpan * 0.03;
    const targetR = hubR * scaleFactor;
    const concaveR = Math.max(targetR, minR);

    const largeArc = arcSpan > 180 ? 1 : 0;
    // sweep=0 = curves INWARD (concave)
    return ` A ${concaveR.toFixed(1)} ${concaveR.toFixed(1)} 0 ${largeArc} 0 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }

  if (style === "convex") {
    // Convex = dome rising from hub
    const expansionFactor = 1.5 + arcSpan * 0.008;
    const convexR = hubR * expansionFactor;

    // sweep=1 curves outward
    return ` A ${convexR.toFixed(1)} ${convexR.toFixed(1)} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }

  // Fallback: simple arc
  const largeArc = arcSpan > 180 ? 1 : 0;
  return ` A ${hubR.toFixed(1)} ${hubR.toFixed(1)} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

// ============================================================================
// Main Render Functions
// ============================================================================

/**
 * Generate unified shape path for arms + hub arcs.
 */
function generateUnifiedShape(
  elements: ChordShapeElement[],
  margin: MarginStyle,
  baseRadius: number,
  cx: number,
  cy: number
): string {
  const hubR = baseRadius * HUB_RADIUS;

  // Sort elements by angle
  const sorted = [...elements]
    .filter((e) => e.style !== "line")
    .sort((a, b) => a.angle - b.angle);

  if (sorted.length === 0) return "";

  let path = "";

  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    const next = sorted[(i + 1) % sorted.length];

    const armLeftAngle = curr.angle - BASE_WIDTH / 2;
    const armRightAngle = curr.angle + BASE_WIDTH / 2;
    const armLength = ARM_LENGTH[curr.tier];
    const tipR = hubR + baseRadius * armLength;

    const baseLeft = polarToXY(cx, cy, armLeftAngle, hubR);
    const baseRight = polarToXY(cx, cy, armRightAngle, hubR);
    const tip = polarToXY(cx, cy, curr.angle, tipR);

    if (i === 0) {
      path += `M ${baseLeft.x.toFixed(1)} ${baseLeft.y.toFixed(1)}`;
    }

    // Left edge of arm (base to tip) - ALWAYS STRAIGHT
    path += ` L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;

    // Right edge of arm (tip to base) - ALWAYS STRAIGHT
    path += ` L ${baseRight.x.toFixed(1)} ${baseRight.y.toFixed(1)}`;

    // Arc along hub to next arm's left edge - STYLED
    const nextLeftAngle = next.angle - BASE_WIDTH / 2;
    path += styledArc(armRightAngle, nextLeftAngle, hubR, margin, cx, cy);
  }

  path += " Z";
  return path;
}

/**
 * Generate path for a single arm (for per-element coloring).
 */
function generateArmPath(
  element: ChordShapeElement,
  baseRadius: number,
  cx: number,
  cy: number
): string {
  const hubR = baseRadius * HUB_RADIUS;
  const armLength = ARM_LENGTH[element.tier];
  const tipR = hubR + baseRadius * armLength;

  const armLeftAngle = element.angle - BASE_WIDTH / 2;
  const armRightAngle = element.angle + BASE_WIDTH / 2;

  const baseLeft = polarToXY(cx, cy, armLeftAngle, hubR);
  const baseRight = polarToXY(cx, cy, armRightAngle, hubR);
  const tip = polarToXY(cx, cy, element.angle, tipR);

  // Closed arm path (triangle)
  return `M ${baseLeft.x.toFixed(1)} ${baseLeft.y.toFixed(1)} L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L ${baseRight.x.toFixed(1)} ${baseRight.y.toFixed(1)} Z`;
}

/**
 * Generate path for a chromatic line.
 */
function generateLinePath(
  element: ChordShapeElement,
  baseRadius: number,
  cx: number,
  cy: number,
  strokeWidth: number
): string {
  const hubR = baseRadius * HUB_RADIUS;
  // Match extension arm length
  const outerR = hubR + baseRadius * ARM_LENGTH.extension;
  // Position so round cap is hidden behind hub stroke
  // Cap radius is strokeWidth * 0.5, so start at hubR + strokeWidth * 0.25
  const innerR = hubR + strokeWidth * 0.25;

  const inner = polarToXY(cx, cy, element.angle, innerR);
  const outer = polarToXY(cx, cy, element.angle, outerR);

  return `M ${inner.x.toFixed(1)} ${inner.y.toFixed(1)} L ${outer.x.toFixed(1)} ${outer.y.toFixed(1)}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Render chord shape geometry to SVG paths.
 *
 * @param geometry - ChordShapeGeometry from vocabulary
 * @param options - Rendering options (scale, center, strokeWidth)
 * @returns SVG paths and per-element data for rendering
 */
export function renderChordShape(
  geometry: ChordShapeGeometry,
  options: ChordShapeRenderOptions
): ChordShapeRenderResult {
  const { scale, center } = options;
  const strokeWidth = options.strokeWidth ?? 2;
  const cx = center.x;
  const cy = center.y;

  const hubRadius = scale * HUB_RADIUS;

  // Separate wedges from lines
  const wedges = geometry.elements.filter((e) => e.style !== "line");
  const lines = geometry.elements.filter((e) => e.style === "line");

  // Generate unified fill path
  const fillPath = generateUnifiedShape(
    wedges,
    geometry.margin,
    scale,
    cx,
    cy
  );

  // Generate line paths
  const linePaths = lines.map((element) => ({
    path: generateLinePath(element, scale, cx, cy, strokeWidth),
    color: element.color,
  }));

  // Generate per-element paths
  const elements = wedges.map((element) => ({
    path: generateArmPath(element, scale, cx, cy),
    color: element.color,
    interval: element.interval,
    tier: element.tier,
  }));

  return {
    fillPath,
    linePaths,
    elements,
    hubRadius,
    margin: geometry.margin,
  };
}

/**
 * Convert ColorHSVA to CSS color string.
 * Useful for grammars rendering to SVG or Canvas.
 */
export function colorToCSS(color: ColorHSVA): string {
  const { h, s, v, a = 1 } = color;

  // HSV to RGB conversion
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);

  if (a < 1) {
    return `rgba(${R}, ${G}, ${B}, ${a.toFixed(2)})`;
  }
  return `rgb(${R}, ${G}, ${B})`;
}

/**
 * Get dash array for dashed margin styles.
 */
export function getDashArray(margin: MarginStyle): string | undefined {
  if (margin === "dash-short") return "3,3";
  if (margin === "dash-long") return "6,3";
  return undefined;
}
