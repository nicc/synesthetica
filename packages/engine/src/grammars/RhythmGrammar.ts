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

/** Reference window (streaks + reference lines) lingers longer than notes (multiplier) */
const DEFAULT_REFERENCE_LINGER_MULTIPLIER = 1.3;

/** Drift tolerance in ms - within this, note is considered "tight" and shows reference line */
const TIGHT_TOLERANCE_MS = 30;

/** Number of streak lines per note */
const STREAK_COUNT = 3;

/** Note strip width as fraction of pitch spacing */
const NOTE_STRIP_WIDTH = 0.015;

/** Minimum note strip height in normalized coordinates */
const MIN_NOTE_STRIP_HEIGHT = 0.008;

// Grid colors
const GRID_COLORS = {
  beatLine: { h: 200, s: 0.2, v: 0.5, a: 0.4 } as ColorHSVA,
  barLine: { h: 200, s: 0.3, v: 0.6, a: 0.5 } as ColorHSVA,
  nowLine: { h: 0, s: 0, v: 0.8, a: 0.6 } as ColorHSVA,
  referenceLine: { h: 0, s: 0, v: 0.9, a: 0.7 } as ColorHSVA,
};

// ============================================================================
// Types
// ============================================================================

/** Cached drift info for a note, frozen at first computation. */
interface CachedDrift {
  driftMs: number;
  label: string;
}

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
  /** How long reference window lingers beyond note window (multiplier) */
  referenceLinger: number;
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
    referenceLinger: DEFAULT_REFERENCE_LINGER_MULTIPLIER,
  };

  /** Drift frozen at first computation per note. Ensures referential transparency:
   *  same note always produces the same visual elements regardless of how
   *  rhythmic analysis evolves on subsequent frames. */
  private driftCache: Map<string, CachedDrift> = new Map();

  init(ctx: GrammarContext): void {
    this.state = {
      nextId: 0,
      ctx,
    };
    this.driftCache.clear();
  }

  dispose(): void {
    this.state.ctx = null;
    this.driftCache.clear();
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
    const activeNoteIds = new Set<string>();
    for (const annotatedNote of input.notes) {
      activeNoteIds.add(annotatedNote.note.id);
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

    // Prune drift cache for notes no longer in the frame
    for (const cachedId of this.driftCache.keys()) {
      if (!activeNoteIds.has(cachedId)) {
        this.driftCache.delete(cachedId);
      }
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
    const tempo = this.getEffectiveTempo(rhythm);

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
    const streakHistoryMs = noteHistoryMs * this.macros.referenceLinger;

    return { gridHistoryMs, gridFutureMs, noteHistoryMs, streakHistoryMs };
  }

  // ============================================================================
  // Effective Tempo/Meter (prescribed or inferred)
  // ============================================================================

  /**
   * Get the effective tempo in BPM from prescribed tempo or detected division.
   * Returns null if neither is available.
   */
  private getEffectiveTempo(rhythm: AnnotatedRhythm): number | null {
    if (rhythm.prescribedTempo !== null) {
      return rhythm.prescribedTempo;
    }
    if (rhythm.analysis.detectedDivision !== null) {
      return 60000 / rhythm.analysis.detectedDivision;
    }
    return null;
  }

  /**
   * Get the effective meter. Uses prescribed meter if available,
   * defaults to 4/4 when we have an effective tempo but no prescribed meter.
   */
  private getEffectiveMeter(rhythm: AnnotatedRhythm): { beatsPerBar: number; beatUnit: number } | null {
    if (rhythm.prescribedMeter !== null) {
      return rhythm.prescribedMeter;
    }
    // Default to 4/4 when tempo is available (prescribed or detected)
    if (this.getEffectiveTempo(rhythm) !== null) {
      return { beatsPerBar: 4, beatUnit: 4 };
    }
    return null;
  }

  // ============================================================================
  // Tier Determination
  // ============================================================================

  private determineTier(rhythm: AnnotatedRhythm): Tier {
    const tempo = this.getEffectiveTempo(rhythm);
    const meter = this.getEffectiveMeter(rhythm);

    if (tempo !== null && meter !== null) {
      return 3;
    }
    if (tempo !== null) {
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
    const tempo = this.getEffectiveTempo(rhythm);
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
    const tempo = this.getEffectiveTempo(rhythm);
    const meter = this.getEffectiveMeter(rhythm);
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

    const noteEndTime = note.onset + note.duration;

    // Position: x is pitch class, y is onset time (top of bar)
    const x = this.pitchClassToX(note.pitch.pc);
    const onsetY = this.timeToY(note.onset, t);

    // Bar bottom: clamp to NOW line. During sustain, noteEndTime = currentTime
    // so rawEndY = NOW_LINE_Y naturally. After release, duration is frozen so
    // noteEndTime is a fixed past timestamp — rawEndY < NOW_LINE_Y, scrolling up.
    const rawEndY = this.timeToY(noteEndTime, t);
    const endY = Math.min(rawEndY, NOW_LINE_Y);

    // Screen-based culling only: remove when entire bar is off-screen.
    // Note strips are never killed by time windows — they scroll off naturally.
    if (endY < 0 || onsetY > 1) return entities;

    // Get drift info — frozen at first computation so visual elements don't
    // shift as rhythmic analysis evolves on subsequent frames.
    let driftInfo = this.driftCache.get(note.id) ?? null;
    if (driftInfo === null) {
      const computed = this.getDriftInfo(note.onset, rhythm, tier);
      if (computed) {
        driftInfo = computed;
        this.driftCache.set(note.id, computed);
      }
    }

    // Reference lines and streaks use time-based fade windows
    const fadeAge = Math.max(t - noteEndTime, 0);
    const inReferenceWindow = fadeAge <= windows.streakHistoryMs;

    if (inReferenceWindow && driftInfo && onsetY >= 0) {
      const refOpacity = this.distanceToOpacity(fadeAge, windows.streakHistoryMs);

      // Add reference line showing where the beat was
      const refLineY = this.timeToY(
        note.onset - driftInfo.driftMs, // Where the beat actually was
        t
      );

      if (refLineY >= 0 && refLineY <= 1) {
        const barWidth = NOTE_STRIP_WIDTH * (0.5 + (note.velocity / 127) * 0.5);
        // Reference line is a horizontal trail centered on the note.
        // velocity gives it visible width (trail renders from pos to pos+vel).
        const refHalfWidth = barWidth * 1.5;
        entities.push({
          id: this.entityId(`ref-line-${note.id}`),
          part,
          kind: "trail",
          createdAt: note.onset,
          updatedAt: t,
          position: { x: x - refHalfWidth, y: refLineY },
          velocity: { x: refHalfWidth * 2, y: 0 },
          style: {
            color: GRID_COLORS.referenceLine,
            size: barWidth * 1000 * 3, // Wider than note strip
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
        const barWidth = NOTE_STRIP_WIDTH * (0.5 + (note.velocity / 127) * 0.5);
        const streaks = this.createStreakLines(
          note.id,
          x,
          onsetY, // Use onset Y (top of bar) for streak anchor
          barWidth,
          driftInfo.driftMs,
          visual.palette.primary,
          refOpacity, // Use reference window opacity
          part,
          t,
          note.onset
        );
        entities.push(...streaks);
      }
    }

    // Note strip rendering — only gated by screen position, not time windows

    // Clamp onsetY to screen top so the bar rectangle starts at the visible edge
    const clampedOnsetY = Math.max(onsetY, 0);

    // Bar height: endY (bottom) - clampedOnsetY (top, clamped to screen)
    // When expanding to minimum height, grow upward (move top up) not downward
    const rawBarHeight = endY - clampedOnsetY;
    let barHeight: number;
    let barTop = clampedOnsetY;
    if (rawBarHeight >= MIN_NOTE_STRIP_HEIGHT) {
      barHeight = rawBarHeight;
    } else {
      barHeight = MIN_NOTE_STRIP_HEIGHT;
      barTop = Math.max(endY - MIN_NOTE_STRIP_HEIGHT, 0);
    }

    // Width based on velocity
    const barWidth = NOTE_STRIP_WIDTH * (0.5 + (note.velocity / 127) * 0.5);

    // Phase-based base opacity
    let baseOpacity: number;
    switch (note.phase) {
      case "attack":
        baseOpacity = 1.0;
        break;
      case "sustain":
        baseOpacity = 1.0;
        break;
      case "release":
        baseOpacity = 0.8;
        break;
    }

    // Gradient opacity based on screen position: fades to transparent near
    // the top of the screen (horizon), fully opaque at the NOW line.
    // This works for both sustain (top fades, bottom bright at NOW)
    // and release (whole bar fades as it scrolls toward the top).
    const topOpacity = baseOpacity * Math.min(barTop / NOW_LINE_Y, 1);
    const bottomOpacity = baseOpacity * Math.min(endY / NOW_LINE_Y, 1);

    // Create main note strip entity
    // Position at barTop (top of visible bar) so it scrolls in sync with
    // streaks and grid lines. When onset scrolls off-screen, the bar is clipped
    // to start at the top edge.
    entities.push({
      id: this.entityId(`note-${note.id}`),
      part,
      kind: "particle",
      createdAt: note.onset,
      updatedAt: t,
      position: { x, y: barTop },
      style: {
        color: visual.palette.primary,
        size: barWidth * 1000, // Scale for renderer (will be divided by 1000)
        opacity: bottomOpacity, // Overall opacity for non-shader renderers
      },
      data: {
        type: "note-strip",
        noteId: note.id,
        phase: note.phase,
        pitchClass: note.pitch.pc,
        driftMs: driftInfo?.driftMs,
        subdivisionLabel: driftInfo?.label,
        barHeight, // Normalized height for renderer
        endY, // Bottom of bar (clamped to NOW line)
        topOpacity, // Opacity at top edge (onset/horizon)
        bottomOpacity, // Opacity at bottom edge (near NOW)
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
    t: number,
    noteOnset: number
  ): Entity[] {
    const entities: Entity[] = [];

    // Per-note RNG seeded from onset time + frame time. The onset component
    // makes each note's streaks independent of other notes. The time component
    // makes them shift each frame (hand-drawn animation effect). Floor to 50ms
    // intervals for ~20fps animation rate.
    const rng = this.createSeededRng(noteOnset * 7919 + Math.floor(t / 50));

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
      const asymmetry = (rng() - 0.5) * 0.15;
      const spreadFactor = (i - (STREAK_COUNT - 1) / 2) / ((STREAK_COUNT - 1) / 2 || 1) + asymmetry;

      // Start position: at the bar's edge, with slight vertical offset for variety
      const xSpread = barWidth * 0.8 * spreadFactor;
      const startX = noteX + xSpread;
      const startY = onsetY + (rng() - 0.5) * 0.005; // Slight vertical wobble

      // Each streak has its own length (comic style: outer ones often shorter)
      const lengthVariation = 0.6 + rng() * 0.8; // 60-140% of base
      const outerFalloff = 1 - Math.abs(spreadFactor) * 0.3; // Outer streaks shorter
      const thisLength = baseStreakLength * lengthVariation * outerFalloff;

      // Fan angle: outer streaks angle outward, with hand-drawn wobble
      const baseFanAngle = spreadFactor * 0.5; // Radians, ~28° at edges
      const angleWobble = (rng() - 0.5) * 0.15;
      const fanAngle = baseFanAngle + angleWobble;

      // End point
      const endX = startX + Math.sin(fanAngle) * thisLength * 0.3; // Mostly vertical
      const endY = startY + dirY * Math.cos(fanAngle) * thisLength;

      // Opacity: center streak brightest, outer ones fade
      const streakOpacity = opacity * (0.5 + 0.45 * (1 - Math.abs(spreadFactor)));

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
    const tempo = this.getEffectiveTempo(rhythm);
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
      // Past: Y decreases linearly with age. Notes older than
      // TIME_HORIZON_HISTORY_MS go past the top of the screen (Y < 0)
      // and are culled by screen-based checks (endY < 0).
      const normalizedAge = age / TIME_HORIZON_HISTORY_MS;
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
