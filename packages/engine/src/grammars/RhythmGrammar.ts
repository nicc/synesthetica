/**
 * RhythmGrammar - Production rhythm visualization
 *
 * Guitar Hero-style vertical scrolling:
 * - Time flows bottom-to-top (future approaches from below, past scrolls up)
 * - NOW line is raised from bottom (configurable, default 15% from bottom)
 * - X-axis is pitch class (C at left, B at right)
 * - Beat grid lines are horizontal, spanning full width
 *
 * Drift visualization:
 * - Streak lines on notes indicate timing drift from nearest subdivision
 * - Streaks point toward where the beat was (gestural, cartoony style)
 * - Tight notes (within tolerance) show faint reference line through them
 *
 * Macro controls:
 * - Horizon: Controls field of vision (0 = minimal, 1 = full view)
 * - Subdivision depth: Which subdivision to reference for drift (quarter/8th/16th)
 *
 * See synesthetica-o1v for design rationale.
 */

import type {
  AnnotatedMusicalFrame,
  IVisualGrammar,
  GrammarContext,
  SceneFrame,
  Entity,
  EntityId,
  AnnotatedNote,
  AnnotatedRhythm,
  ColorHSVA,
  OnsetDrift,
  SubdivisionDrift,
  PitchClass,
} from "@synesthetica/contracts";

// ============================================================================
// Exploration Controls (adjustable during development)
// ============================================================================

/** NOW line vertical position (0 = top, 1 = bottom). 0.85 = 15% from bottom */
const NOW_LINE_Y = 0.85;

/** Margins on left/right for pitch class positioning */
const PITCH_MARGIN = 0.05;

/**
 * Time horizon scale (fixed mapping from time to screen position).
 * This is the total time range that maps to the visible past area.
 * Visible windows filter what's shown, but don't change this scale.
 * Future: this will become a macro (see synesthetica-135).
 */
const TIME_HORIZON_HISTORY_MS = 8000;
const TIME_HORIZON_FUTURE_MS = 2000;

/** Maximum visible window for grid elements at max horizon */
const MAX_GRID_HISTORY_MS = 8000;
const MAX_GRID_FUTURE_MS = 2000;

/** Maximum visible window for notes at max horizon */
const MAX_NOTE_HISTORY_MS = 8000;

/** Minimum visible window for notes at min horizon (in beats) */
const MIN_NOTE_HISTORY_BEATS = 1;

/** Drift streaks linger slightly longer than notes (multiplier) */
const STREAK_LINGER_MULTIPLIER = 1.2;

/** Drift tolerance in ms - within this, note is considered "tight" and shows reference line */
const TIGHT_TOLERANCE_MS = 30;

/** Number of streak lines per note */
const STREAK_COUNT = 3;

/** Note bar width as fraction of pitch spacing */
const NOTE_BAR_WIDTH = 0.015;

/** Minimum note bar height in normalized coordinates */
const MIN_NOTE_BAR_HEIGHT = 0.008;

// Grid colors
const GRID_COLORS = {
  beatLine: { h: 200, s: 0.2, v: 0.5, a: 0.4 } as ColorHSVA,
  barLine: { h: 200, s: 0.3, v: 0.6, a: 0.5 } as ColorHSVA,
  nowLine: { h: 0, s: 0, v: 0.8, a: 0.6 } as ColorHSVA,
  referenceLine: { h: 0, s: 0, v: 0.6, a: 0.3 } as ColorHSVA,
};

// ============================================================================
// Types
// ============================================================================

interface RhythmGrammarState {
  nextId: number;
  ctx: GrammarContext | null;
}

type Tier = 1 | 2 | 3;

/** Subdivision depth options (notched macro) */
type SubdivisionDepth = "quarter" | "8th" | "16th";

/** Macro parameters for the grammar */
interface RhythmGrammarMacros {
  /** Field of vision (0 = minimal, 1 = full) */
  horizon: number;
  /** Which subdivision to use for drift calculation */
  subdivisionDepth: SubdivisionDepth;
}

// ============================================================================
// Grammar Implementation
// ============================================================================

export class RhythmGrammar implements IVisualGrammar {
  readonly id = "rhythm-grammar";

  private state: RhythmGrammarState = {
    nextId: 0,
    ctx: null,
  };

  private macros: RhythmGrammarMacros = {
    horizon: 1.0, // Default to full view
    subdivisionDepth: "16th", // Default to finest subdivision
  };

  /** Seeded RNG for consistent streak randomness */
  private rng: () => number = Math.random;

  init(ctx: GrammarContext): void {
    this.state = {
      nextId: 0,
      ctx,
    };
    // Initialize seeded RNG
    this.rng = this.createSeededRng(ctx.rngSeed);
  }

  dispose(): void {
    this.state.ctx = null;
  }

  /** Set macro values (for exploration/testing) */
  setMacros(macros: Partial<RhythmGrammarMacros>): void {
    this.macros = { ...this.macros, ...macros };
  }

  /** Get current macro values */
  getMacros(): RhythmGrammarMacros {
    return { ...this.macros };
  }

  update(input: AnnotatedMusicalFrame, _previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];
    const t = input.t;
    const part = input.part;
    const rhythm = input.rhythm;

    // Determine tier
    const tier = this.determineTier(rhythm);

    // Calculate visibility windows based on horizon macro
    const windows = this.calculateWindows(rhythm);

    // Always render NOW line
    entities.push(this.createNowLine(t, part));

    // Render grid lines (visibility controlled by horizon)
    if (tier >= 2) {
      entities.push(...this.createBeatGrid(rhythm, t, part, windows));

      if (tier === 3) {
        entities.push(...this.createBarGrid(rhythm, t, part, windows));
      }
    }

    // Render notes with streak lines
    for (const annotatedNote of input.notes) {
      const noteEntities = this.createNoteWithStreaks(
        annotatedNote,
        rhythm,
        t,
        part,
        tier,
        windows
      );
      entities.push(...noteEntities);
    }

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  // ============================================================================
  // Window Calculation
  // ============================================================================

  private calculateWindows(rhythm: AnnotatedRhythm): {
    gridHistoryMs: number;
    gridFutureMs: number;
    noteHistoryMs: number;
    streakHistoryMs: number;
  } {
    const horizon = this.macros.horizon;
    const tempo = rhythm.prescribedTempo;

    // Visible windows control what elements are shown (filtered)
    // They do NOT affect the time-to-screen scale (that's TIME_HORIZON_*)

    // Grid windows: scale linearly with horizon
    const gridHistoryMs = MAX_GRID_HISTORY_MS * horizon;
    const gridFutureMs = MAX_GRID_FUTURE_MS * horizon;

    // Note history: at min horizon, show ~1 beat; at max, show full history
    let noteHistoryMs: number;
    if (tempo !== null) {
      const beatMs = 60000 / tempo;
      const minNoteHistoryMs = beatMs * MIN_NOTE_HISTORY_BEATS;
      noteHistoryMs = minNoteHistoryMs + (MAX_NOTE_HISTORY_MS - minNoteHistoryMs) * horizon;
    } else {
      // No tempo: use time-based windows
      noteHistoryMs = 500 + (MAX_NOTE_HISTORY_MS - 500) * horizon;
    }

    // Streaks linger slightly longer than notes
    const streakHistoryMs = noteHistoryMs * STREAK_LINGER_MULTIPLIER;

    return { gridHistoryMs, gridFutureMs, noteHistoryMs, streakHistoryMs };
  }

  // ============================================================================
  // Tier Determination
  // ============================================================================

  private determineTier(rhythm: AnnotatedRhythm): Tier {
    if (rhythm.prescribedTempo !== null && rhythm.prescribedMeter !== null) {
      return 3;
    }
    if (rhythm.prescribedTempo !== null) {
      return 2;
    }
    return 1;
  }

  // ============================================================================
  // NOW Line
  // ============================================================================

  private createNowLine(t: number, part: string): Entity {
    return {
      id: this.entityId("now-line"),
      part,
      kind: "field",
      createdAt: t,
      updatedAt: t,
      position: { x: 0.5, y: NOW_LINE_Y },
      style: {
        color: GRID_COLORS.nowLine,
        size: 100, // Full width line
        opacity: GRID_COLORS.nowLine.a ?? 0.6,
      },
      data: {
        type: "now-line",
      },
    };
  }

  // ============================================================================
  // Beat Grid (Horizontal Lines)
  // ============================================================================

  private createBeatGrid(
    rhythm: AnnotatedRhythm,
    t: number,
    part: string,
    windows: { gridHistoryMs: number; gridFutureMs: number }
  ): Entity[] {
    const entities: Entity[] = [];
    const tempo = rhythm.prescribedTempo;
    if (tempo === null) return entities;

    const beatMs = 60000 / tempo;
    const historyStart = t - windows.gridHistoryMs;
    const futureEnd = t + windows.gridFutureMs;

    // Find first beat in our window
    const firstBeat = Math.ceil(historyStart / beatMs) * beatMs;

    // Generate beat lines
    for (let beatTime = firstBeat; beatTime <= futureEnd; beatTime += beatMs) {
      const y = this.timeToY(beatTime, t);

      // Skip if outside visible range
      if (y < 0 || y > 1) continue;

      // Calculate opacity based on distance from NOW
      const distanceFromNow = Math.abs(beatTime - t);
      const maxDistance = beatTime > t ? windows.gridFutureMs : windows.gridHistoryMs;
      const opacity = this.distanceToOpacity(distanceFromNow, maxDistance) *
        (GRID_COLORS.beatLine.a ?? 0.4);

      entities.push({
        id: this.entityId(`beat-line-${beatTime}`),
        part,
        kind: "field",
        createdAt: beatTime,
        updatedAt: t,
        position: { x: 0.5, y },
        style: {
          color: { ...GRID_COLORS.beatLine, a: opacity },
          size: 100, // Full width
          opacity,
        },
        data: {
          type: "beat-line",
          beatTime,
        },
      });
    }

    return entities;
  }

  // ============================================================================
  // Bar Grid (Emphasized Lines)
  // ============================================================================

  private createBarGrid(
    rhythm: AnnotatedRhythm,
    t: number,
    part: string,
    windows: { gridHistoryMs: number; gridFutureMs: number }
  ): Entity[] {
    const entities: Entity[] = [];
    const tempo = rhythm.prescribedTempo;
    const meter = rhythm.prescribedMeter;
    if (tempo === null || meter === null) return entities;

    const beatMs = 60000 / tempo;
    const barMs = beatMs * meter.beatsPerBar;
    const historyStart = t - windows.gridHistoryMs;
    const futureEnd = t + windows.gridFutureMs;

    // Find first bar in our window
    const firstBar = Math.ceil(historyStart / barMs) * barMs;

    // Generate bar lines
    for (let barTime = firstBar; barTime <= futureEnd; barTime += barMs) {
      const y = this.timeToY(barTime, t);

      if (y < 0 || y > 1) continue;

      const distanceFromNow = Math.abs(barTime - t);
      const maxDistance = barTime > t ? windows.gridFutureMs : windows.gridHistoryMs;
      const opacity = this.distanceToOpacity(distanceFromNow, maxDistance) *
        (GRID_COLORS.barLine.a ?? 0.5);

      entities.push({
        id: this.entityId(`bar-line-${barTime}`),
        part,
        kind: "field",
        createdAt: barTime,
        updatedAt: t,
        position: { x: 0.5, y },
        style: {
          color: { ...GRID_COLORS.barLine, a: opacity },
          size: 100,
          opacity,
        },
        data: {
          type: "bar-line",
          barTime,
        },
      });
    }

    return entities;
  }

  // ============================================================================
  // Notes with Streak Lines
  // ============================================================================

  private createNoteWithStreaks(
    an: AnnotatedNote,
    rhythm: AnnotatedRhythm,
    t: number,
    part: string,
    tier: Tier,
    windows: { noteHistoryMs: number; streakHistoryMs: number }
  ): Entity[] {
    const entities: Entity[] = [];
    const note = an.note;
    const visual = an.visual;

    const age = t - note.onset;
    if (age < 0) return entities; // Future notes not shown

    // Reference window (streaks + reference lines) lingers longer than notes
    const inReferenceWindow = age <= windows.streakHistoryMs;
    const inNoteWindow = age <= windows.noteHistoryMs;

    // If outside both windows, nothing to render
    if (!inReferenceWindow) return entities;

    // Position: x is pitch class, y is onset time (bottom of bar)
    const x = this.pitchClassToX(note.pitch.pc);
    const onsetY = this.timeToY(note.onset, t);

    if (onsetY < 0 || onsetY > 1) return entities;

    // Get drift info (needed for reference lines and streaks)
    const driftInfo = this.getDriftInfo(note.onset, rhythm, tier);

    // Reference window elements: reference lines and streaks
    // These linger longer than note bars
    if (inReferenceWindow && driftInfo) {
      // Calculate opacity based on reference window
      const refOpacity = this.distanceToOpacity(age, windows.streakHistoryMs) * 0.6;

      // Add reference line showing where the beat was
      const refLineY = this.timeToY(
        note.onset - driftInfo.driftMs, // Where the beat actually was
        t
      );

      if (refLineY >= 0 && refLineY <= 1) {
        const barWidth = NOTE_BAR_WIDTH * (0.5 + (note.velocity / 127) * 0.5);
        entities.push({
          id: this.entityId(`ref-line-${note.id}`),
          part,
          kind: "trail",
          createdAt: note.onset,
          updatedAt: t,
          position: { x, y: refLineY },
          style: {
            color: GRID_COLORS.referenceLine,
            size: barWidth * 1000 * 3, // Wider than note bar
            opacity: refOpacity,
          },
          data: {
            type: "reference-line",
            noteId: note.id,
          },
        });
      }

      // Add streak lines if there's drift beyond tight tolerance
      if (Math.abs(driftInfo.driftMs) > TIGHT_TOLERANCE_MS) {
        const barWidth = NOTE_BAR_WIDTH * (0.5 + (note.velocity / 127) * 0.5);
        const streaks = this.createStreakLines(
          note.id,
          x,
          onsetY, // Use onset Y (bottom of bar) for streak anchor
          barWidth,
          driftInfo.driftMs,
          visual.palette.primary,
          refOpacity, // Use reference window opacity
          part,
          t
        );
        entities.push(...streaks);
      }
    }

    // Note bars only render within the note window
    if (!inNoteWindow) return entities;

    // Calculate bar height from duration
    // In our coordinate system: smaller y = higher on screen = further in past
    // onset is in the past (smaller y), note end is closer to now (larger y)
    // So bar extends from onsetY (top) down to endY (bottom, closer to NOW line)
    // BUT: the bar should never extend past the NOW line into the future
    const noteEndTime = note.onset + note.duration;
    const rawEndY = this.timeToY(noteEndTime, t);

    // Clamp endY to NOW line - we don't render notes into the future
    const endY = Math.min(rawEndY, NOW_LINE_Y);

    // Bar height: endY (bottom) - onsetY (top)
    const barHeight = Math.max(endY - onsetY, MIN_NOTE_BAR_HEIGHT);

    // Width based on velocity
    const barWidth = NOTE_BAR_WIDTH * (0.5 + (note.velocity / 127) * 0.5);

    // Opacity based on age and phase
    let baseOpacity: number;
    switch (note.phase) {
      case "attack":
        baseOpacity = 1.0;
        break;
      case "sustain":
        baseOpacity = 0.9;
        break;
      case "release":
        baseOpacity = 0.6;
        break;
    }
    const opacity = baseOpacity * this.distanceToOpacity(age, windows.noteHistoryMs);

    // Create main note bar entity
    // Position is center of the bar, with barHeight stored in data for renderer
    // Bar extends from onsetY (top) down toward NOW line
    // Since endY is clamped to NOW_LINE_Y, the bar bottom is at min(endY, NOW_LINE_Y)
    // Center = top + height/2 = onsetY + barHeight/2
    // But we need to ensure the bar doesn't visually extend past NOW line
    // So we position center such that bottom edge is at endY (which is clamped)
    const barCenterY = endY - barHeight / 2;
    entities.push({
      id: this.entityId(`note-${note.id}`),
      part,
      kind: "particle",
      createdAt: note.onset,
      updatedAt: t,
      position: { x, y: barCenterY },
      style: {
        color: visual.palette.primary,
        size: barWidth * 1000, // Scale for renderer (will be divided by 1000)
        opacity,
      },
      data: {
        type: "note-bar",
        noteId: note.id,
        phase: note.phase,
        pitchClass: note.pitch.pc,
        driftMs: driftInfo?.driftMs,
        subdivisionLabel: driftInfo?.label,
        barHeight, // Normalized height for renderer
        onsetY, // Bottom of bar (for streak positioning)
      },
    });

    return entities;
  }

  // ============================================================================
  // Streak Lines (Cartoony Drift Indication)
  // ============================================================================

  /**
   * Create streak lines that indicate timing drift from the beat.
   *
   * Visual style inspired by comic book motion lines:
   * - Short, gestural marks fanning from the note's onset point
   * - Asymmetric and slightly wobbly (not perfect parallel lines)
   * - Point toward where the beat was (late = down, early = up)
   * - Vary in length and angle to feel hand-drawn, not mechanical
   */
  private createStreakLines(
    noteId: string,
    noteX: number,
    onsetY: number,
    barWidth: number,
    driftMs: number,
    color: ColorHSVA,
    opacity: number,
    part: string,
    t: number
  ): Entity[] {
    const entities: Entity[] = [];

    // Direction: point toward where the beat was
    // Late (positive drift) = beat was before onset = streaks point down (larger y)
    // Early (negative drift) = beat was after onset = streaks point up (smaller y)
    const dirY = driftMs > 0 ? 1 : -1;

    // Streak length proportional to drift magnitude, but kept short and gestural
    const driftMagnitude = Math.abs(driftMs);
    const normalizedDrift = Math.min(driftMagnitude / 100, 1); // Cap at 100ms
    // Base length: 1.5-4% of screen height - short enough to stay near the note
    const baseStreakLength = 0.015 + normalizedDrift * 0.025;

    // Generate streaks with comic-book style variation
    for (let i = 0; i < STREAK_COUNT; i++) {
      // Asymmetric spread: not perfectly centered, feels more natural
      const asymmetry = (this.rng() - 0.5) * 0.15;
      const spreadFactor = (i - (STREAK_COUNT - 1) / 2) / ((STREAK_COUNT - 1) / 2 || 1) + asymmetry;

      // Start position: at the bar's edge, with slight vertical offset for variety
      const xSpread = barWidth * 0.8 * spreadFactor;
      const startX = noteX + xSpread;
      const startY = onsetY + (this.rng() - 0.5) * 0.005; // Slight vertical wobble

      // Each streak has its own length (comic style: outer ones often shorter)
      const lengthVariation = 0.6 + this.rng() * 0.8; // 60-140% of base
      const outerFalloff = 1 - Math.abs(spreadFactor) * 0.3; // Outer streaks shorter
      const thisLength = baseStreakLength * lengthVariation * outerFalloff;

      // Fan angle: outer streaks angle outward, with hand-drawn wobble
      const baseFanAngle = spreadFactor * 0.5; // Radians, ~28° at edges
      const angleWobble = (this.rng() - 0.5) * 0.15;
      const fanAngle = baseFanAngle + angleWobble;

      // End point
      const endX = startX + Math.sin(fanAngle) * thisLength * 0.3; // Mostly vertical
      const endY = startY + dirY * Math.cos(fanAngle) * thisLength;

      // Opacity: center streak brightest, outer ones fade
      const streakOpacity = opacity * (0.4 + 0.35 * (1 - Math.abs(spreadFactor)));

      // Width: tapers toward outer streaks
      const streakWidth = barWidth * 0.4 * (1 - Math.abs(spreadFactor) * 0.4);

      entities.push({
        id: this.entityId(`streak-${noteId}-${i}`),
        part,
        kind: "trail",
        createdAt: t,
        updatedAt: t,
        position: { x: startX, y: startY },
        velocity: {
          // Velocity encodes direction and length for the renderer
          // Keep multiplier low so streaks stay near the note
          x: (endX - startX),
          y: (endY - startY),
        },
        style: {
          color: { ...color, a: streakOpacity },
          size: streakWidth * 1000, // Will be divided by 1000 in renderer
          opacity: streakOpacity,
        },
        data: {
          type: "streak",
          noteId,
          driftMs,
          streakIndex: i,
        },
      });
    }

    return entities;
  }

  // ============================================================================
  // Drift Calculation
  // ============================================================================

  private getDriftInfo(
    onset: number,
    rhythm: AnnotatedRhythm,
    tier: Tier
  ): { driftMs: number; label: string } | null {
    if (tier < 2) return null;

    // Try to find onset drift data
    const onsetDrift = rhythm.analysis.onsetDrifts.find(
      (od: OnsetDrift) => od.t === onset
    );

    if (onsetDrift && onsetDrift.subdivisions.length > 0) {
      // Find the subdivision matching our depth setting
      const targetLabel = this.subdivisionDepthToLabel(this.macros.subdivisionDepth);
      let subdivision = onsetDrift.subdivisions.find(
        (s: SubdivisionDrift) => s.label === targetLabel
      );

      // Fall back to nearest if target not found
      if (!subdivision) {
        subdivision = onsetDrift.subdivisions.find((s: SubdivisionDrift) => s.nearest);
      }

      if (subdivision) {
        return {
          driftMs: subdivision.drift,
          label: subdivision.label,
        };
      }
    }

    // Fall back to calculating drift from beat grid
    const tempo = rhythm.prescribedTempo;
    if (tempo === null) return null;

    const beatMs = 60000 / tempo;
    const subdivisionMs = this.getSubdivisionMs(beatMs);

    // Find position within subdivision cycle
    const position = onset / subdivisionMs;
    const fractional = position - Math.floor(position);

    // Convert to drift in ms
    let driftMs: number;
    if (fractional > 0.5) {
      driftMs = (fractional - 1) * subdivisionMs; // Early for next
    } else {
      driftMs = fractional * subdivisionMs; // Late from previous
    }

    return {
      driftMs,
      label: this.macros.subdivisionDepth,
    };
  }

  private subdivisionDepthToLabel(depth: SubdivisionDepth): string {
    switch (depth) {
      case "quarter":
        return "quarter";
      case "8th":
        return "8th";
      case "16th":
        return "16th";
    }
  }

  private getSubdivisionMs(beatMs: number): number {
    switch (this.macros.subdivisionDepth) {
      case "quarter":
        return beatMs;
      case "8th":
        return beatMs / 2;
      case "16th":
        return beatMs / 4;
    }
  }

  // ============================================================================
  // Coordinate Mapping
  // ============================================================================

  /**
   * Map pitch class (0-11) to x position.
   * C (0) at left margin, B (11) at right margin.
   */
  private pitchClassToX(pc: PitchClass): number {
    const usableWidth = 1 - 2 * PITCH_MARGIN;
    return PITCH_MARGIN + (pc / 11) * usableWidth;
  }

  /**
   * Map time to y position using FIXED time horizon scale.
   * NOW is at NOW_LINE_Y.
   * Past (positive age) maps above NOW (smaller y).
   * Future (negative age) maps below NOW (larger y).
   *
   * IMPORTANT: This uses the fixed TIME_HORIZON_* constants, not the visible windows.
   * Visible windows control filtering (what's shown), not positioning (where it's shown).
   */
  private timeToY(eventTime: number, now: number): number {
    const age = now - eventTime; // Positive = past, negative = future

    if (age >= 0) {
      // Past: map to range [0, NOW_LINE_Y]
      const normalizedAge = Math.min(age / TIME_HORIZON_HISTORY_MS, 1);
      return NOW_LINE_Y - normalizedAge * NOW_LINE_Y;
    } else {
      // Future: map to range [NOW_LINE_Y, 1]
      const normalizedFuture = Math.min(-age / TIME_HORIZON_FUTURE_MS, 1);
      return NOW_LINE_Y + normalizedFuture * (1 - NOW_LINE_Y);
    }
  }

  /**
   * Calculate opacity based on distance from NOW.
   * Closer = more opaque.
   */
  private distanceToOpacity(distance: number, maxDistance: number): number {
    if (distance <= 0) return 1;
    if (maxDistance <= 0) return 0;
    if (distance >= maxDistance) return 0;

    // Quadratic fade for smoother visual
    const normalized = distance / maxDistance;
    return 1 - normalized * normalized;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private entityId(base: string): EntityId {
    return `${this.id}:${base}:${this.state.nextId++}`;
  }

  /**
   * Create a simple seeded RNG for consistent randomness across frames.
   */
  private createSeededRng(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }
}
