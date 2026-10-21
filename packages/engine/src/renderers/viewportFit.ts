/**
 * How much of the world the viewport shows (synesthetica-50dc).
 *
 * The renderer's world is WORLD_WIDTH × WORLD_HEIGHT (100 × 75, 4:3).
 * The camera "contains" it: on wide viewports the full height is shown
 * and extra width appears as side margin; on narrow viewports (aspect
 * below 4:3) the full width is shown and extra height appears as bands
 * above and below. Nothing in the world is ever cropped.
 *
 * Shared by ThreeJSRenderer (camera distance) and the web app's
 * on-screen keyboard (which positions itself against world features).
 */

export const WORLD_WIDTH = 100;
export const WORLD_HEIGHT = 75;

/** Visible world extent (world units) for a viewport aspect (width / height). */
export function visibleWorldExtent(aspect: number): { width: number; height: number } {
  const height = Math.max(WORLD_HEIGHT, WORLD_WIDTH / aspect);
  return { width: height * aspect, height };
}

/**
 * Viewport position (fractions from the left and from the bottom) of a
 * world point, given the viewport aspect. The world is centred.
 */
export function worldToViewportFraction(
  worldX: number,
  worldY: number,
  aspect: number,
): { fromLeft: number; fromBottom: number } {
  const { width, height } = visibleWorldExtent(aspect);
  return {
    fromLeft: 0.5 + (worldX - WORLD_WIDTH / 2) / width,
    fromBottom: 0.5 + (worldY - WORLD_HEIGHT / 2) / height,
  };
}
