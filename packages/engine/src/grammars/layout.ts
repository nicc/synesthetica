/**
 * Shared layout constants for the three-column grammar layout.
 *
 * ┌────┐  ┌──────────────┐ ┌────────────────┐
 * │    │  │              │ │   chord shape  │
 * │ dyn│  │    rhythm    │ │                │
 * │ bar│  │ (note strips)│ │                │
 * │    │  │              │ │  progression   │
 * │    │  │              │ │    clock       │
 * └────┘  └──────────────┘ └────────────────┘
 *  col 1        col 2           col 3
 *
 * All values are in normalized coordinates (0–1).
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

/** Gap between dynamics and rhythm columns (wider — visual breathing room) */
export const GAP_LEFT = 0.03;

/** Gap between rhythm and harmony columns. Houses the chord strip
 * plus breathing room on both sides. */
export const GAP_RIGHT = 0.07;

// ============================================================================
// Chord Strip (sits in GAP_RIGHT between rhythm and harmony)
// ============================================================================

/** Base width of rhythm note strips (max-velocity value). Exported
 * here so the chord strip can derive a visually related ratio. */
export const NOTE_STRIP_BASE_WIDTH = 0.015;

/** Duration-bar width in the chord strip.
 * 1/φ² (≈ 0.382) of NOTE_STRIP_BASE_WIDTH — clearly thinner than
 * even the softest-velocity note strip (0.5× base). Keeps the strip
 * reading as related-but-distinct from note strips across all
 * playing dynamics. */
export const CHORD_STRIP_BAR_WIDTH = NOTE_STRIP_BASE_WIDTH * 0.382;

/** Width of the chord-strip column (used to place the glyph centre).
 * Wider than the bar so the glyph has room. */
export const CHORD_STRIP_WIDTH = 0.02;

/** Offset from rhythm column's right edge to the strip's left edge.
 * Generous spacing so the strip reads as a midground, not crammed
 * against the note strips. */
export const CHORD_STRIP_LEFT_OFFSET_FROM_GAP = 0.0375;

// ============================================================================
// Harmony Column (right)
// ============================================================================

/**
 * Width targets H/2 in screen pixels. At 16:9, that's ~0.28 in
 * normalized x-coords. We use 0.30 for a bit of breathing room.
 * The column is split into two rows: chord shape (top) and
 * progression clock (bottom).
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

/** Vertical gap between chord shape and progression clock cells */
const CELL_GAP = 0.06;

/** Vertical midpoint of the usable bar area */
const BAR_VERTICAL_CENTER = (BAR_TOP + BAR_BOTTOM) / 2;

/** Top cell: chord shape */
export const HARMONY_CHORD_CENTER_X = HARMONY_LEFT + HARMONY_COLUMN_WIDTH / 2;
export const HARMONY_CHORD_CENTER_Y = BAR_VERTICAL_CENTER - CELL_GAP / 2 - HARMONY_CELL_SIZE / 2;

/** Bottom cell: progression clock */
export const HARMONY_PROGRESSION_CENTER_X = HARMONY_CHORD_CENTER_X;
export const HARMONY_PROGRESSION_CENTER_Y = BAR_VERTICAL_CENTER + CELL_GAP / 2 + HARMONY_CELL_SIZE / 2;

// ============================================================================
// Rhythm Column (center — takes remaining space)
// ============================================================================

/** Left edge of the rhythm column (after dynamics + gap) */
export const RHYTHM_LEFT = DYNAMICS_COLUMN_WIDTH + GAP_LEFT;

/** Right edge of the rhythm column (before gap + harmony) */
export const RHYTHM_RIGHT = HARMONY_LEFT - GAP_RIGHT;

/** Width of the rhythm column */
export const RHYTHM_WIDTH = RHYTHM_RIGHT - RHYTHM_LEFT;

/**
 * Center X of the scrolling chord-glyph strip. Sits inside GAP_RIGHT,
 * just to the right of the rhythm column, so the glyphs belong to the
 * rhythmic timeline visually without competing with note strips for
 * horizontal space.
 */
export const CHORD_STRIP_LEFT =
  RHYTHM_RIGHT + CHORD_STRIP_LEFT_OFFSET_FROM_GAP;
export const CHORD_STRIP_CENTER_X = CHORD_STRIP_LEFT + CHORD_STRIP_WIDTH / 2;
