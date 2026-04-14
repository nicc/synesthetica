/**
 * Shared layout constants for the three-column grammar layout.
 *
 * ┌────┐ ┌──────────────┐ ┌────────────────┐
 * │    │ │              │ │   chord shape  │
 * │ dyn│ │    rhythm    │ ├────────────────┤
 * │ bar│ │ (note strips)│ │  progression   │
 * │    │ │              │ │   (future)     │
 * └────┘ └──────────────┘ └────────────────┘
 *  col 1       col 2           col 3
 *
 * All values are in normalized coordinates (0–1).
 *
 * The harmony column targets H/2 × H in screen pixels. Since we work
 * in normalized coords (0–1 in each axis independently), the column
 * width in x-coords depends on aspect ratio. We assume ~16:9 and use
 * 0.30 as a good default: (0.5 * 9/16) ≈ 0.28, rounded up slightly.
 */

// ============================================================================
// Vertical Constants (shared across grammars)
// ============================================================================

/** Top of the bar area (1/6 from top) */
export const BAR_TOP = 1 / 6;

/** Bottom of the bar area (5/6 from top) */
export const BAR_BOTTOM = 5 / 6;

/** Bar height in normalized coordinates */
export const BAR_HEIGHT = BAR_BOTTOM - BAR_TOP;

// ============================================================================
// Dynamics Column (left)
// ============================================================================

/**
 * The dynamics column is sized to hold the VU-meter bar with padding.
 * The bar itself is 60% of the column width.
 */
export const DYNAMICS_COLUMN_WIDTH = 0.04;
export const DYNAMICS_BAR_WIDTH_FRACTION = 0.6;

export const DYNAMICS_CENTER_X = DYNAMICS_COLUMN_WIDTH / 2;
const DYNAMICS_BAR_HALF = (DYNAMICS_COLUMN_WIDTH * DYNAMICS_BAR_WIDTH_FRACTION) / 2;

export const DYNAMICS_BAR_LEFT = DYNAMICS_CENTER_X - DYNAMICS_BAR_HALF;
export const DYNAMICS_BAR_RIGHT = DYNAMICS_CENTER_X + DYNAMICS_BAR_HALF;
export const DYNAMICS_BAR_WIDTH = DYNAMICS_BAR_RIGHT - DYNAMICS_BAR_LEFT;

// ============================================================================
// Gaps
// ============================================================================

/** Consistent gap between columns */
export const COLUMN_GAP = 0.015;

// ============================================================================
// Harmony Column (right)
// ============================================================================

/**
 * Width targets H/2 in screen pixels. At 16:9, that's ~0.28 in
 * normalized x-coords. We use 0.30 for a bit of breathing room.
 * The column is split into two rows: chord shape (top) and
 * progression placeholder (bottom), each square in screen pixels.
 */
export const HARMONY_COLUMN_WIDTH = 0.30;

/** Left edge of the harmony column */
export const HARMONY_LEFT = 1 - HARMONY_COLUMN_WIDTH;

/**
 * Each cell is square in screen pixels. In normalized coords the
 * cell height = HARMONY_COLUMN_WIDTH (same fraction of both axes,
 * which makes it square when the viewport is square; on wide
 * displays the cells are wider than tall — acceptable).
 */
export const HARMONY_CELL_SIZE = HARMONY_COLUMN_WIDTH;

/** Vertical midpoint of the usable bar area */
const BAR_VERTICAL_CENTER = (BAR_TOP + BAR_BOTTOM) / 2;

/** Top cell: chord shape */
export const HARMONY_CHORD_CENTER_X = HARMONY_LEFT + HARMONY_COLUMN_WIDTH / 2;
export const HARMONY_CHORD_CENTER_Y = BAR_VERTICAL_CENTER - HARMONY_CELL_SIZE / 2;

/** Bottom cell: progression (placeholder) */
export const HARMONY_PROGRESSION_CENTER_X = HARMONY_CHORD_CENTER_X;
export const HARMONY_PROGRESSION_CENTER_Y = BAR_VERTICAL_CENTER + HARMONY_CELL_SIZE / 2;

// ============================================================================
// Rhythm Column (center — takes remaining space)
// ============================================================================

/** Left edge of the rhythm column (after dynamics + gap) */
export const RHYTHM_LEFT = DYNAMICS_COLUMN_WIDTH + COLUMN_GAP;

/** Right edge of the rhythm column (before gap + harmony) */
export const RHYTHM_RIGHT = HARMONY_LEFT - COLUMN_GAP;

/** Width of the rhythm column */
export const RHYTHM_WIDTH = RHYTHM_RIGHT - RHYTHM_LEFT;
