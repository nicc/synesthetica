/**
 * Test Rhythm Grammar - Three-Tier Visualization (RFC 006, Issue synesthetica-zv3)
 *
 * Visualizes rhythm with progressive enhancement based on available context:
 *
 * Tier 1 (Historic-only): No prescribed tempo
 * - Onset markers scroll left and fade over time
 * - Optional: subtle ticks when a division is detected
 *
 * Tier 2 (Tempo-relative): prescribedTempo set
 * - Beat grid lines at prescribed intervals
 * - Onset markers positioned vertically by drift from nearest beat
 * - Drift rings around markers (green=tight, yellow=loose, red=off)
 *
 * Tier 3 (Meter-relative): prescribedTempo + prescribedMeter set
 * - Bar lines emphasized over beat lines
 * - Downbeat glow on beat 1 of each bar
 *
 * Key principle: Each tier REPLACES previous decoration, not adds.
 * Drift rings indicate timing accuracy without overriding marker's core color.
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
} from "@synesthetica/contracts";

// ============================================================================
// Configuration
// ============================================================================

/** Timeline window in milliseconds (how much history we show) */
const WINDOW_MS = 4000;

/** Maximum vertical drift range (center ± this amount) */
const DRIFT_RANGE = 0.3;

/** Drift thresholds for color coding */
const DRIFT_THRESHOLDS = {
  good: 0.1, // Within 10% of beat = green
  warning: 0.25, // Within 25% = yellow
  // Beyond 25% = red
};

/** Drift ring colors (HSV with alpha) */
const DRIFT_COLORS: Record<"good" | "warning" | "bad", ColorHSVA> = {
  good: { h: 120, s: 0.7, v: 0.8, a: 0.6 }, // Green
  warning: { h: 45, s: 0.8, v: 0.9, a: 0.6 }, // Yellow/orange
  bad: { h: 0, s: 0.7, v: 0.8, a: 0.6 }, // Red
};

/** Grid line colors - all grids use similar visibility levels */
const GRID_COLORS = {
  beatLine: { h: 200, s: 0.3, v: 0.6, a: 0.5 } as ColorHSVA, // Muted blue
  barLine: { h: 200, s: 0.4, v: 0.7, a: 0.6 } as ColorHSVA, // Slightly brighter blue
  divisionTick: { h: 200, s: 0.4, v: 0.7, a: 0.6 } as ColorHSVA, // Same as beat lines
};

// ============================================================================
// Types
// ============================================================================

interface RhythmGrammarState {
  nextId: number;
  ctx: GrammarContext | null;
}

type Tier = 1 | 2 | 3;

// ============================================================================
// Grammar Implementation
// ============================================================================

export class TestRhythmGrammar implements IVisualGrammar {
  readonly id = "test-rhythm-grammar";

  private state: RhythmGrammarState = {
    nextId: 0,
    ctx: null,
  };

  init(ctx: GrammarContext): void {
    this.state = {
      nextId: 0,
      ctx,
    };
  }

  dispose(): void {
    this.state.ctx = null;
  }

  update(input: AnnotatedMusicalFrame, _previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];
    const t = input.t;
    const part = input.part;
    const rhythm = input.rhythm;

    // Determine which tier we're operating at
    const tier = this.determineTier(rhythm);

    // Render grid/background elements based on tier
    if (tier === 1 && rhythm.analysis.detectedDivision !== null) {
      // Tier 1: Division ticks only
      entities.push(...this.createDivisionTicks(rhythm, t, part));
    } else if (tier >= 2) {
      // Tier 2+: Beat grid
      entities.push(...this.createBeatGrid(rhythm, t, part));

      if (tier === 3) {
        // Tier 3: Bar grid overlays beat grid (emphasized bar lines)
        entities.push(...this.createBarGrid(rhythm, t, part));
        // Downbeat glow
        const downbeatGlow = this.createDownbeatGlow(rhythm, t, part);
        if (downbeatGlow) {
          entities.push(downbeatGlow);
        }
      }
    }

    // Render onset markers for all notes
    for (const annotatedNote of input.notes) {
      const marker = this.createOnsetMarker(annotatedNote, rhythm, t, part, tier);
      entities.push(marker);

      // Add drift ring in tier 2+
      if (tier >= 2) {
        const driftRing = this.createDriftRing(annotatedNote, rhythm, t, part);
        if (driftRing) {
          entities.push(driftRing);
        }
      }
    }

    // We ignore chords entirely - this grammar focuses on rhythm
    return {
      t,
      entities,
      diagnostics: [],
    };
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
  // Tier 1: Division Ticks
  // ============================================================================

  /**
   * Create subtle tick marks at detected division intervals.
   * Computes grid from detectedDivision, anchored on the median onset.
   */
  private createDivisionTicks(rhythm: AnnotatedRhythm, t: number, part: string): Entity[] {
    const entities: Entity[] = [];
    const division = rhythm.analysis.detectedDivision;
    if (division === null) return entities;

    const windowStart = t - WINDOW_MS;

    // Compute grid anchored on median onset (for Tier 1 stability)
    const onsetTimes = rhythm.analysis.onsetDrifts.map((od: OnsetDrift) => od.t);
    if (onsetTimes.length === 0) return entities;

    const sortedOnsets = [...onsetTimes].sort((a, b) => a - b);
    const medianOnset = sortedOnsets[Math.floor(sortedOnsets.length / 2)];

    // Find first tick at or after windowStart
    const ticksFromMedian = Math.ceil((windowStart - medianOnset) / division);
    let tickTime = medianOnset + ticksFromMedian * division;

    while (tickTime <= t) {
      if (tickTime >= windowStart) {
        const x = this.timeToX(tickTime, t);
        const opacity = this.ageToOpacity(t - tickTime) * 0.8;

        entities.push({
          id: this.entityId(`division-tick-${tickTime}`),
          part,
          kind: "field",
          createdAt: tickTime,
          updatedAt: t,
          position: { x, y: 0.5 },
          style: {
            color: { ...GRID_COLORS.divisionTick, a: opacity },
            size: 3,
            opacity,
          },
          data: {
            type: "division-tick",
            tickTime,
          },
        });
      }
      tickTime += division;
    }

    return entities;
  }

  // ============================================================================
  // Tier 2: Beat Grid and Drift Rings
  // ============================================================================

  /**
   * Create vertical lines at each beat position.
   * Anchors grid on session start (T=0) for stable positioning.
   */
  private createBeatGrid(rhythm: AnnotatedRhythm, t: number, part: string): Entity[] {
    const entities: Entity[] = [];
    const tempo = rhythm.prescribedTempo;
    if (tempo === null) return entities;

    const beatMs = 60000 / tempo;
    const windowStart = t - WINDOW_MS;

    // Anchor on T=0 (session start) - grid is absolute, not tied to onsets
    // Find the first beat at or after windowStart
    const beatsElapsed = Math.ceil(windowStart / beatMs);
    let beatTime = beatsElapsed * beatMs;

    // Generate beat lines across the window
    while (beatTime <= t) {
      if (beatTime >= windowStart) {
        const x = this.timeToX(beatTime, t);
        const opacity = this.ageToOpacity(t - beatTime) * 0.4;

        entities.push({
          id: this.entityId(`beat-line-${beatTime}`),
          part,
          kind: "field", // Rendered as vertical line by renderer
          createdAt: beatTime,
          updatedAt: t,
          position: { x, y: 0.5 },
          style: {
            color: { ...GRID_COLORS.beatLine, a: opacity },
            size: 2,
            opacity,
          },
          data: {
            type: "beat-line",
            beatTime,
          },
        });
      }
      beatTime += beatMs;
    }

    return entities;
  }

  /**
   * Create a drift ring around an onset marker showing timing accuracy.
   * Color indicates how close to the beat: green=tight, yellow=loose, red=off.
   * Does NOT override the marker's core color from the ruleset.
   *
   * Uses subdivision drift data from onsetDrifts when available (RFC 008).
   */
  private createDriftRing(
    an: AnnotatedNote,
    rhythm: AnnotatedRhythm,
    t: number,
    part: string
  ): Entity | null {
    const tempo = rhythm.prescribedTempo;
    if (tempo === null) return null;

    const note = an.note;
    const age = t - note.onset;
    if (age > WINDOW_MS) return null;

    // Find the onset drift data for this note's timestamp
    const onsetDrift = rhythm.analysis.onsetDrifts.find(
      (od: OnsetDrift) => od.t === note.onset
    );

    // Use the nearest subdivision's drift, or fall back to calculating it
    let drift: number;
    let subdivisionLabel: string | undefined;

    if (onsetDrift && onsetDrift.subdivisions.length > 0) {
      const nearest = onsetDrift.subdivisions.find((s: SubdivisionDrift) => s.nearest);
      if (nearest) {
        // Convert ms drift to normalized drift (relative to period)
        drift = nearest.drift / nearest.period;
        subdivisionLabel = nearest.label;
      } else {
        drift = this.calculateDrift(note.onset, rhythm);
      }
    } else {
      drift = this.calculateDrift(note.onset, rhythm);
    }

    const absDrift = Math.abs(drift);

    // Determine drift color
    let driftColor: ColorHSVA;
    if (absDrift <= DRIFT_THRESHOLDS.good) {
      driftColor = DRIFT_COLORS.good;
    } else if (absDrift <= DRIFT_THRESHOLDS.warning) {
      driftColor = DRIFT_COLORS.warning;
    } else {
      driftColor = DRIFT_COLORS.bad;
    }

    const x = this.timeToX(note.onset, t);
    const y = this.driftToY(drift);
    const opacity = this.ageToOpacity(age) * (driftColor.a ?? 1);

    // Ring is slightly larger than the marker
    const markerSize = 4 + (note.velocity / 127) * 8;
    const ringSize = markerSize + 6;

    return {
      id: this.entityId(`drift-ring-${note.id}`),
      part,
      kind: "field",
      createdAt: note.onset,
      updatedAt: t,
      position: { x, y },
      style: {
        color: { ...driftColor, a: opacity },
        size: ringSize,
        opacity,
      },
      data: {
        type: "drift-ring",
        noteId: note.id,
        drift,
        subdivisionLabel,
        driftCategory: absDrift <= DRIFT_THRESHOLDS.good ? "good" : absDrift <= DRIFT_THRESHOLDS.warning ? "warning" : "bad",
      },
    };
  }

  // ============================================================================
  // Tier 3: Bar Grid and Downbeat Glow
  // ============================================================================

  /**
   * Create emphasized bar lines (overriding beat lines at bar positions).
   * Anchors grid on session start (T=0) for stable positioning.
   */
  private createBarGrid(rhythm: AnnotatedRhythm, t: number, part: string): Entity[] {
    const entities: Entity[] = [];
    const tempo = rhythm.prescribedTempo;
    const meter = rhythm.prescribedMeter;
    if (tempo === null || meter === null) return entities;

    const beatMs = 60000 / tempo;
    const barMs = beatMs * meter.beatsPerBar;
    const windowStart = t - WINDOW_MS;

    // Anchor on T=0 (session start) - grid is absolute, not tied to onsets
    // Find the first bar at or after windowStart
    const barsElapsed = Math.ceil(windowStart / barMs);
    let barTime = barsElapsed * barMs;

    // Generate bar lines across the window
    while (barTime <= t) {
      if (barTime >= windowStart) {
        const x = this.timeToX(barTime, t);
        const opacity = this.ageToOpacity(t - barTime) * 0.6;

        entities.push({
          id: this.entityId(`bar-line-${barTime}`),
          part,
          kind: "field", // Rendered as vertical line by renderer
          createdAt: barTime,
          updatedAt: t,
          position: { x, y: 0.5 },
          style: {
            color: { ...GRID_COLORS.barLine, a: opacity },
            size: 3,
            opacity,
          },
          data: {
            type: "bar-line",
            barTime,
          },
        });
      }
      barTime += barMs;
    }

    return entities;
  }

  /**
   * Create a glow effect on the current downbeat position.
   * Anchors on session start (T=0) for stable positioning.
   */
  private createDownbeatGlow(rhythm: AnnotatedRhythm, t: number, part: string): Entity | null {
    const tempo = rhythm.prescribedTempo;
    const meter = rhythm.prescribedMeter;
    if (tempo === null || meter === null) return null;

    const beatMs = 60000 / tempo;
    const barMs = beatMs * meter.beatsPerBar;

    // Anchor on T=0 (session start) - find the most recent bar start
    const barsElapsed = Math.floor(t / barMs);
    const currentBarStart = barsElapsed * barMs;
    const timeInBar = t - currentBarStart;

    // Glow intensity fades after the downbeat
    const glowDuration = beatMs * 0.5; // Half a beat
    if (timeInBar > glowDuration) return null;

    const intensity = 1 - timeInBar / glowDuration;
    const x = this.timeToX(currentBarStart, t);

    return {
      id: this.entityId(`downbeat-glow-${currentBarStart}`),
      part,
      kind: "field",
      createdAt: currentBarStart,
      updatedAt: t,
      position: { x, y: 0.5 },
      style: {
        color: { h: 50, s: 0.3, v: 1, a: intensity * 0.4 },
        size: 100,
        opacity: intensity * 0.4,
      },
      data: {
        type: "downbeat-glow",
        barTime: currentBarStart,
        intensity,
      },
    };
  }

  // ============================================================================
  // Onset Markers (All Tiers)
  // ============================================================================

  /**
   * Create an onset marker for a note.
   * - Tier 1: x from time, y from pitch octave
   * - Tier 2+: x from time, y from drift (center = on beat)
   * - Color always comes from ruleset annotation (never overridden)
   */
  private createOnsetMarker(
    an: AnnotatedNote,
    rhythm: AnnotatedRhythm,
    t: number,
    part: string,
    tier: Tier
  ): Entity {
    const note = an.note;
    const visual = an.visual;
    const age = t - note.onset;

    const x = this.timeToX(note.onset, t);

    // Y position depends on tier
    let y: number;
    if (tier === 1) {
      // Tier 1: Y based on pitch octave (higher = higher on screen)
      const octaveRange = 8;
      y = 1 - (note.pitch.octave + 0.5) / octaveRange;
    } else {
      // Tier 2+: Y based on drift from beat
      const drift = this.calculateDrift(note.onset, rhythm);
      y = this.driftToY(drift);
    }

    // Size based on velocity
    const size = 4 + (note.velocity / 127) * 8;

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
    const opacity = baseOpacity * this.ageToOpacity(age);

    return {
      id: this.entityId(`onset-marker-${note.id}`),
      part,
      kind: "particle",
      createdAt: note.onset,
      updatedAt: t,
      position: { x, y },
      style: {
        // Color from ruleset - NEVER override
        color: visual.palette.primary,
        size,
        opacity,
      },
      data: {
        type: "onset-marker",
        noteId: note.id,
        phase: note.phase,
        tier,
        label: visual.label,
      },
    };
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * Convert a timestamp to x position (0 = left edge/oldest, 1 = right edge/now).
   */
  private timeToX(onset: number, now: number): number {
    const age = now - onset;
    return 1 - Math.min(age / WINDOW_MS, 1);
  }

  /**
   * Convert age to opacity (newer = more opaque).
   */
  private ageToOpacity(age: number): number {
    if (age <= 0) return 1;
    if (age >= WINDOW_MS) return 0;
    // Quadratic fade for smoother visual
    const normalized = age / WINDOW_MS;
    return 1 - normalized * normalized;
  }

  /**
   * Calculate drift from nearest beat.
   * Returns value in [-0.5, 0.5] where 0 = exactly on beat.
   * Anchors on session start (T=0) for consistent drift measurement.
   */
  private calculateDrift(onset: number, rhythm: AnnotatedRhythm): number {
    const tempo = rhythm.prescribedTempo;
    if (tempo === null) return 0;

    const beatMs = 60000 / tempo;

    // Anchor on T=0 (session start) - drift is relative to absolute beat grid
    // Find position within beat cycle
    const beatPosition = onset / beatMs;
    const fractionalBeat = beatPosition - Math.floor(beatPosition);

    // Normalize to [-0.5, 0.5] where 0 = on beat
    if (fractionalBeat > 0.5) {
      return fractionalBeat - 1; // Slightly early for next beat
    }
    return fractionalBeat; // Slightly late from previous beat
  }

  /**
   * Convert drift to y position.
   * Center (0.5) = on beat, above = early, below = late.
   */
  private driftToY(drift: number): number {
    // Clamp drift to prevent markers from going off screen
    const clampedDrift = Math.max(-0.5, Math.min(0.5, drift));
    // Map [-0.5, 0.5] to [0.5-DRIFT_RANGE, 0.5+DRIFT_RANGE]
    return 0.5 - clampedDrift * DRIFT_RANGE * 2;
  }

  private entityId(base: string): EntityId {
    return `${this.id}:${base}:${this.state.nextId++}`;
  }
}
