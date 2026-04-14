/**
 * Shared layout constants for the three-column grammar layout.
 *
 * ┌──────┐ ┌─────────────────────┐ ┌──────────┐
 * │      │ │                     │ │  chord   │
 * │  dyn │ │       rhythm        │ │  shape   │
 * │  bar │ │    (note strips)    │ ├──────────┤
 * │      │ │                     │ │  progr.  │
 * │      │ │                     │ │ (future) │
 * └──────┘ └─────────────────────┘ └──────────┘
 *   col 1         col 2               col 3
 *
 * All values are in normalized coordinates (0–1).
 */

// ============================================================================
// Dynamics Column (left)
// ============================================================================

/** Width of the dynamics VU-meter bar itself */
export const DYNAMICS_BAR_WIDTH_FRACTION = 0.19;

/** Left margin that contains the dynamics bar */
export const DYNAMICS_COLUMN_WIDTH = 0.06;

/** Center of the dynamics column */
export const DYNAMICS_CENTER_X = DYNAMICS_COLUMN_WIDTH / 2;

/** Dynamics bar half-width */
const DYNAMICS_BAR_HALF = (DYNAMICS_COLUMN_WIDTH * DYNAMICS_BAR_WIDTH_FRACTION) / 2;

/** Dynamics bar edges */
export const DYNAMICS_BAR_LEFT = DYNAMICS_CENTER_X - DYNAMICS_BAR_HALF;
export const DYNAMICS_BAR_RIGHT = DYNAMICS_CENTER_X + DYNAMICS_BAR_HALF;
export const DYNAMICS_BAR_WIDTH = DYNAMICS_BAR_RIGHT - DYNAMICS_BAR_LEFT;

// ============================================================================
// Gaps
// ============================================================================

/** Consistent gap between columns */
export const COLUMN_GAP = 0.02;

// ============================================================================
// Harmony Column (right)
// ============================================================================

/** Width of the harmony column (holds two square cells) */
export const HARMONY_COLUMN_WIDTH = 0.15;

/** Left edge of the harmony column */
export const HARMONY_LEFT = 1 - HARMONY_COLUMN_WIDTH;

/** Two square cells, each HARMONY_COLUMN_WIDTH tall, stacked vertically */
export const HARMONY_CELL_SIZE = HARMONY_COLUMN_WIDTH;

/** Vertical center of the 2/3 vertical area (bar area from 1/6 to 5/6) */
const BAR_VERTICAL_CENTER = 0.5;

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

// ============================================================================
// Vertical Constants (shared across grammars)
// ============================================================================

/** Top of the bar area (1/6 from top) */
export const BAR_TOP = 1 / 6;

/** Bottom of the bar area (5/6 from top) */
export const BAR_BOTTOM = 5 / 6;

/** Bar height in normalized coordinates */
export const BAR_HEIGHT = BAR_BOTTOM - BAR_TOP;
