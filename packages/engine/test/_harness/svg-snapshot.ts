/**
 * SVG Snapshot Generator
 *
 * Renders SceneFrame entities to SVG for visual review during grammar development.
 * SVG files can be opened in a browser to see the visual output without running the app.
 *
 * Usage:
 *   const svg = renderSceneToSVG(scene, { width: 800, height: 600 });
 *   writeSnapshot('my-test', svg);
 *
 * To generate snapshots:
 *   GENERATE_SNAPSHOTS=1 npm test
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import type { SceneFrame, Entity, ColorHSVA } from "@synesthetica/contracts";

// ============================================================================
// Types
// ============================================================================

export interface SVGOptions {
  /** Canvas width in pixels */
  width?: number;
  /** Canvas height in pixels */
  height?: number;
  /** Background color (CSS format) */
  background?: string;
  /** Show entity labels (from data.type or data.label) */
  showLabels?: boolean;
  /** Show a legend of entity types */
  showLegend?: boolean;
  /** Show coordinate grid */
  showGrid?: boolean;
}

const DEFAULT_OPTIONS: Required<SVGOptions> = {
  width: 800,
  height: 600,
  background: "#0d0d14", // Darker blue-black for better contrast
  showLabels: false, // Labels clutter the view at small sizes
  showLegend: true,
  showGrid: false, // Disabled - reference grid obscures actual content
};

// ============================================================================
// Color Conversion
// ============================================================================

/**
 * Convert HSVA to CSS color string.
 */
function hsvaToCSS(color: ColorHSVA): string {
  const { h, s, v, a = 1 } = color;

  // HSV to RGB conversion
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const red = Math.round((r + m) * 255);
  const green = Math.round((g + m) * 255);
  const blue = Math.round((b + m) * 255);

  if (a < 1) {
    return `rgba(${red}, ${green}, ${blue}, ${a.toFixed(2)})`;
  }
  return `rgb(${red}, ${green}, ${blue})`;
}

// ============================================================================
// Entity Rendering
// ============================================================================

/**
 * Render a single entity to SVG elements.
 * Positions are in normalized coordinates (0-1), scaled to canvas size.
 *
 * The grammar's entity `type` (from data.type) is used to determine special rendering:
 * - "now-line", "beat-line", "bar-line": Rendered as horizontal lines across canvas
 * - "reference-line": Rendered as short horizontal line through note position
 * - "streak": Rendered as tapered line using velocity for direction
 * - Default: Rendered based on entity.kind
 */
function renderEntity(entity: Entity, width: number, height: number, showLabels: boolean): string {
  const x = (entity.position?.x ?? 0.5) * width;
  const y = (entity.position?.y ?? 0.5) * height;
  // Much smaller base size - divide by 1000 instead of 100 for reasonable pixel sizes
  const size = (entity.style.size ?? 10) * Math.min(width, height) / 1000;
  const color = entity.style.color ? hsvaToCSS(entity.style.color) : "#888";
  const opacity = entity.style.opacity ?? 1;
  const type = (entity.data?.type as string) ?? entity.kind;

  const elements: string[] = [];

  // Check for special rhythm grammar types first
  if (type === "now-line") {
    // NOW line: bright horizontal line across full width
    elements.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" ` +
      `stroke="${color}" stroke-width="2" opacity="${opacity}" />`
    );
    return elements.join("\n    ");
  }

  if (type === "beat-line") {
    // Beat line: subtle horizontal line across full width
    elements.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" ` +
      `stroke="${color}" stroke-width="1" opacity="${opacity}" stroke-dasharray="4,4" />`
    );
    return elements.join("\n    ");
  }

  if (type === "bar-line") {
    // Bar line: emphasized horizontal line across full width
    elements.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" ` +
      `stroke="${color}" stroke-width="2" opacity="${opacity}" />`
    );
    return elements.join("\n    ");
  }

  if (type === "reference-line") {
    // Reference line: short horizontal line through note (tight timing indicator)
    const halfWidth = 15;
    elements.push(
      `<line x1="${x - halfWidth}" y1="${y}" x2="${x + halfWidth}" y2="${y}" ` +
      `stroke="${color}" stroke-width="1" opacity="${opacity}" />`
    );
    return elements.join("\n    ");
  }

  if (type === "streak") {
    // Streak: line from position in direction of velocity
    // Position is the anchor point (onset), velocity encodes direction and length
    const vel = entity.velocity ?? { x: 0, y: 0 };
    const velMag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (velMag > 0) {
      // Scale velocity to pixel coordinates
      const endX = x + vel.x * width;
      const endY = y + vel.y * height;

      elements.push(
        `<line x1="${x}" y1="${y}" x2="${endX}" y2="${endY}" ` +
        `stroke="${color}" stroke-width="${Math.max(size * 0.5, 1)}" opacity="${opacity}" stroke-linecap="round" />`
      );
    }
    return elements.join("\n    ");
  }

  if (type === "note-strip") {
    // Note bar: vertical rectangle representing sustained note
    // Position is center of bar, barHeight is in normalized coordinates
    const barHeight = ((entity.data?.barHeight as number) ?? 0.01) * height;
    const barWidth = Math.max(size, 4); // Use size as width, minimum 4px

    // Rectangle: y is center, so offset by half height to get top
    const rectTop = y - barHeight / 2;
    elements.push(
      `<rect x="${x - barWidth / 2}" y="${rectTop}" width="${barWidth}" height="${barHeight}" ` +
      `fill="${color}" opacity="${opacity}" rx="2" />`
    );
    return elements.join("\n    ");
  }

  // Standard entity rendering based on kind
  switch (entity.kind) {
    case "particle":
      // Render as circle - notes, particles
      elements.push(
        `<circle cx="${x}" cy="${y}" r="${Math.max(size, 3)}" fill="${color}" opacity="${opacity}" />`
      );
      break;

    case "field":
      // Render as larger, semi-transparent circle with glow effect
      elements.push(
        `<circle cx="${x}" cy="${y}" r="${size * 3}" fill="${color}" opacity="${opacity * 0.3}" />`,
        `<circle cx="${x}" cy="${y}" r="${size * 2}" fill="${color}" opacity="${opacity * 0.5}" />`,
        `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" opacity="${opacity}" />`
      );
      break;

    case "trail": {
      // Render as line using velocity for direction, fallback to horizontal
      const vel = entity.velocity ?? { x: 1, y: 0 };
      const velMag = Math.sqrt(vel.x * vel.x + vel.y * vel.y) || 1;
      const trailLength = size * 5;
      const dirX = (vel.x / velMag) * trailLength;
      const dirY = (vel.y / velMag) * trailLength;
      elements.push(
        `<line x1="${x - dirX}" y1="${y - dirY}" x2="${x}" y2="${y}" ` +
        `stroke="${color}" stroke-width="${Math.max(size / 2, 1)}" opacity="${opacity}" stroke-linecap="round" />`
      );
      break;
    }

    case "glyph": {
      // Render as text or marker
      const label = (entity.data?.label as string) ?? "?";
      elements.push(
        `<text x="${x}" y="${y}" fill="${color}" opacity="${opacity}" ` +
        `font-size="${Math.max(size * 2, 10)}" text-anchor="middle" dominant-baseline="middle">${escapeXML(label)}</text>`
      );
      break;
    }

    case "group":
      // Render as rectangle outline
      elements.push(
        `<rect x="${x - size * 2}" y="${y - size * 2}" width="${size * 4}" height="${size * 4}" ` +
        `fill="none" stroke="${color}" stroke-width="1" opacity="${opacity}" />`
      );
      break;

    default:
      // Fallback: small square
      elements.push(
        `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" ` +
        `fill="${color}" opacity="${opacity}" />`
      );
  }

  // Add label if requested
  if (showLabels && type) {
    elements.push(
      `<text x="${x}" y="${y + size + 12}" fill="#666" font-size="10" ` +
      `text-anchor="middle" font-family="monospace">${escapeXML(type)}</text>`
    );
  }

  return elements.join("\n    ");
}

/**
 * Render coordinate grid for reference.
 */
function renderGrid(width: number, height: number): string {
  const lines: string[] = [];
  const step = 0.1; // 10% increments

  // Vertical lines
  for (let x = 0; x <= 1; x += step) {
    const px = x * width;
    const isCenter = Math.abs(x - 0.5) < 0.001;
    lines.push(
      `<line x1="${px}" y1="0" x2="${px}" y2="${height}" ` +
      `stroke="${isCenter ? '#444' : '#333'}" stroke-width="${isCenter ? 1 : 0.5}" />`
    );
  }

  // Horizontal lines
  for (let y = 0; y <= 1; y += step) {
    const py = y * height;
    const isCenter = Math.abs(y - 0.5) < 0.001;
    lines.push(
      `<line x1="0" y1="${py}" x2="${width}" y2="${py}" ` +
      `stroke="${isCenter ? '#444' : '#333'}" stroke-width="${isCenter ? 1 : 0.5}" />`
    );
  }

  // Axis labels
  lines.push(`<text x="5" y="15" fill="#555" font-size="10" font-family="monospace">0,0</text>`);
  lines.push(`<text x="${width - 25}" y="15" fill="#555" font-size="10" font-family="monospace">1,0</text>`);
  lines.push(`<text x="5" y="${height - 5}" fill="#555" font-size="10" font-family="monospace">0,1</text>`);
  lines.push(`<text x="${width - 25}" y="${height - 5}" fill="#555" font-size="10" font-family="monospace">1,1</text>`);

  return lines.join("\n    ");
}

/**
 * Render legend showing entity types and their counts.
 */
function renderLegend(entities: Entity[], width: number): string {
  // Count entities by type
  const counts = new Map<string, { count: number; color: string; kind: string }>();
  for (const entity of entities) {
    const type = (entity.data?.type as string) ?? entity.kind;
    const existing = counts.get(type);
    if (existing) {
      existing.count++;
    } else {
      counts.set(type, {
        count: 1,
        color: entity.style.color ? hsvaToCSS(entity.style.color) : "#888",
        kind: entity.kind,
      });
    }
  }

  const items: string[] = [];
  let y = 20;

  items.push(
    `<rect x="${width - 150}" y="5" width="140" height="${counts.size * 18 + 10}" ` +
    `fill="#222" stroke="#444" rx="3" />`
  );

  for (const [type, info] of counts) {
    items.push(
      `<circle cx="${width - 135}" cy="${y}" r="4" fill="${info.color}" />`,
      `<text x="${width - 125}" y="${y + 4}" fill="#aaa" font-size="11" font-family="monospace">` +
      `${escapeXML(type)} (${info.count})</text>`
    );
    y += 18;
  }

  return items.join("\n    ");
}

/**
 * Escape special XML characters.
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escape string for use in XML comments (no -- allowed).
 */
function escapeXMLComment(str: string): string {
  return str.replace(/--/g, "—"); // Replace double-hyphen with em-dash
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render a SceneFrame to SVG string.
 */
export function renderSceneToSVG(scene: SceneFrame, options: SVGOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { width, height, background, showLabels, showLegend, showGrid } = opts;

  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="100%" height="100%" fill="${background}" />`,
    `  <!-- Frame t=${scene.t}ms, ${scene.entities.length} entities -->`,
  ];

  // Grid layer
  if (showGrid) {
    parts.push(`  <g id="grid">`);
    parts.push(`    ${renderGrid(width, height)}`);
    parts.push(`  </g>`);
  }

  // Entities layer (sorted by kind for consistent z-order)
  const sortedEntities = [...scene.entities].sort((a, b) => {
    const kindOrder = { field: 0, trail: 1, group: 2, particle: 3, glyph: 4 };
    return (kindOrder[a.kind] ?? 5) - (kindOrder[b.kind] ?? 5);
  });

  parts.push(`  <g id="entities">`);
  for (const entity of sortedEntities) {
    parts.push(`    <!-- ${escapeXMLComment(entity.id)} (${entity.kind}) -->`);
    parts.push(`    ${renderEntity(entity, width, height, showLabels)}`);
  }
  parts.push(`  </g>`);

  // Legend layer
  if (showLegend && scene.entities.length > 0) {
    parts.push(`  <g id="legend">`);
    parts.push(`    ${renderLegend(scene.entities, width)}`);
    parts.push(`  </g>`);
  }

  // Frame info
  parts.push(`  <text x="5" y="${height - 25}" fill="#555" font-size="10" font-family="monospace">`);
  parts.push(`    t=${scene.t}ms | entities=${scene.entities.length}`);
  parts.push(`  </text>`);

  parts.push(`</svg>`);

  return parts.join("\n");
}

// ============================================================================
// Snapshot File Management
// ============================================================================

const SNAPSHOTS_DIR = resolve(__dirname, "../_snapshots");

/**
 * Check if snapshots should be generated (GENERATE_SNAPSHOTS=1 env var).
 */
export function shouldGenerateSnapshots(): boolean {
  return process.env.GENERATE_SNAPSHOTS === "1";
}

/**
 * Write an SVG snapshot to disk.
 * Creates the snapshots directory if needed.
 *
 * @param name - Snapshot name (will be used as filename)
 * @param svg - SVG content
 * @param subdir - Optional subdirectory under _snapshots/
 */
export function writeSnapshot(name: string, svg: string, subdir = "grammars"): void {
  const dir = resolve(SNAPSHOTS_DIR, subdir);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = `${name}.svg`;
  const fullPath = resolve(dir, filename);

  writeFileSync(fullPath, svg, "utf-8");
  console.log(`Wrote snapshot: ${subdir}/${filename}`);
}

/**
 * Conditionally write a snapshot if GENERATE_SNAPSHOTS=1 is set.
 * Returns the SVG string for further inspection if needed.
 */
export function maybeWriteSnapshot(
  name: string,
  scene: SceneFrame,
  options: SVGOptions = {},
  subdir = "grammars"
): string {
  const svg = renderSceneToSVG(scene, options);

  if (shouldGenerateSnapshots()) {
    writeSnapshot(name, svg, subdir);
  }

  return svg;
}

// ============================================================================
// Metrics Extraction (Simulation Analysis)
// ============================================================================

export interface SceneMetrics {
  /** Total entity count */
  entityCount: number;
  /** Entity counts by kind */
  byKind: Record<string, number>;
  /** Entity counts by type (from data.type) */
  byType: Record<string, number>;
  /** Position statistics */
  positions: {
    /** Average x position (0-1) */
    meanX: number;
    /** Average y position (0-1) */
    meanY: number;
    /** Standard deviation of x positions */
    stdX: number;
    /** Standard deviation of y positions */
    stdY: number;
    /** Bounding box */
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
  };
  /** Color statistics */
  colors: {
    /** Distinct hues (rounded to 10°) */
    distinctHues: number[];
    /** Average brightness */
    meanBrightness: number;
  };
}

/**
 * Extract quantitative metrics from a SceneFrame for analysis.
 */
export function extractMetrics(scene: SceneFrame): SceneMetrics {
  const byKind: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const positions: { x: number; y: number }[] = [];
  const hues = new Set<number>();
  let brightnessSum = 0;
  let colorCount = 0;

  for (const entity of scene.entities) {
    // Count by kind
    byKind[entity.kind] = (byKind[entity.kind] || 0) + 1;

    // Count by type
    const type = (entity.data?.type as string) ?? "unknown";
    byType[type] = (byType[type] || 0) + 1;

    // Collect positions
    if (entity.position) {
      positions.push({ x: entity.position.x, y: entity.position.y });
    }

    // Collect color info
    if (entity.style.color) {
      hues.add(Math.round(entity.style.color.h / 10) * 10);
      brightnessSum += entity.style.color.v;
      colorCount++;
    }
  }

  // Calculate position stats
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);

  const meanX = xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.5;
  const meanY = ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : 0.5;

  const stdX = xs.length > 1
    ? Math.sqrt(xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0) / xs.length)
    : 0;
  const stdY = ys.length > 1
    ? Math.sqrt(ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0) / ys.length)
    : 0;

  return {
    entityCount: scene.entities.length,
    byKind,
    byType,
    positions: {
      meanX,
      meanY,
      stdX,
      stdY,
      bounds: {
        minX: xs.length > 0 ? Math.min(...xs) : 0,
        maxX: xs.length > 0 ? Math.max(...xs) : 1,
        minY: ys.length > 0 ? Math.min(...ys) : 0,
        maxY: ys.length > 0 ? Math.max(...ys) : 1,
      },
    },
    colors: {
      distinctHues: [...hues].sort((a, b) => a - b),
      meanBrightness: colorCount > 0 ? brightnessSum / colorCount : 0,
    },
  };
}

/**
 * Format metrics as a human-readable string for test output.
 */
export function formatMetrics(metrics: SceneMetrics): string {
  const lines: string[] = [
    `Entities: ${metrics.entityCount}`,
    `  By kind: ${Object.entries(metrics.byKind).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `  By type: ${Object.entries(metrics.byType).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `Positions:`,
    `  Mean: (${metrics.positions.meanX.toFixed(3)}, ${metrics.positions.meanY.toFixed(3)})`,
    `  Std:  (${metrics.positions.stdX.toFixed(3)}, ${metrics.positions.stdY.toFixed(3)})`,
    `  Bounds: x=[${metrics.positions.bounds.minX.toFixed(2)}, ${metrics.positions.bounds.maxX.toFixed(2)}] ` +
      `y=[${metrics.positions.bounds.minY.toFixed(2)}, ${metrics.positions.bounds.maxY.toFixed(2)}]`,
    `Colors:`,
    `  Hues: ${metrics.colors.distinctHues.join("°, ")}°`,
    `  Mean brightness: ${metrics.colors.meanBrightness.toFixed(2)}`,
  ];

  return lines.join("\n");
}
