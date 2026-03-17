/**
 * Dynamics Stabilizer
 *
 * Analyzes velocity patterns to produce DynamicsState.
 * Depends on NoteTrackingStabilizer for Note[] with lifecycle semantics.
 *
 * Outputs:
 * - Constituent events (per-onset velocity observations)
 * - Level contour (max intensity per onset, no smoothing)
 * - Per-onset velocity range (min for chords with spread voicing)
 * - Trend (rising/falling/stable via linear regression)
 * - Dynamic range (min, max, variance over window)
 *
 * See synesthetica-78e for design rationale.
 */

import type {
  IMusicalStabilizer,
  RawInputFrame,
  MusicalFrame,
  DynamicsState,
  DynamicsEvent,
  DynamicsContourPoint,
  DynamicsRange,
  PartId,
  Ms,
  Note,
} from "@synesthetica/contracts";

/**
 * Configuration for the DynamicsStabilizer.
 */
export interface DynamicsStabilizerConfig {
  partId: PartId;

  /** Window duration for event and contour history. @default 8000 */
  windowMs?: Ms;

  /** Window for trend linear regression. @default 1000 */
  trendWindowMs?: Ms;

  /** Slope threshold below which trend is "stable". @default 0.1 */
  trendDeadZone?: number;
}

const DEFAULT_CONFIG = {
  windowMs: 8000,
  trendWindowMs: 1000,
  trendDeadZone: 0.1,
} as const;

export class DynamicsStabilizer implements IMusicalStabilizer {
  readonly id = "dynamics";
  readonly dependencies = ["note-tracking"];

  private config: Required<DynamicsStabilizerConfig>;
  private events: DynamicsEvent[] = [];
  private contour: DynamicsContourPoint[] = [];
  private currentLevel = 0;
  /** Track which note onsets we've already processed (by NoteId) */
  private processedOnsets: Set<string> = new Set();

  constructor(config: DynamicsStabilizerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(): void {
    this.events = [];
    this.contour = [];
    this.currentLevel = 0;
    this.processedOnsets.clear();
  }

  dispose(): void {
    this.init();
  }

  reset(): void {
    this.init();
  }

  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame {
    const t = raw.t;

    if (!upstream) {
      return this.createEmptyFrame(t);
    }

    // Process new note onsets from upstream
    this.processNotes(upstream.notes);

    // Prune old data outside window
    this.prune(t);

    // Compute aggregates
    const trend = this.computeTrend();
    const range = this.computeRange();

    const dynamics: DynamicsState = {
      events: [...this.events],
      level: this.currentLevel,
      trend,
      contour: [...this.contour],
      range,
    };

    return {
      ...upstream,
      dynamics,
    };
  }

  private processNotes(notes: Note[]): void {
    // Collect new attack-phase notes we haven't seen
    const newOnsets: Note[] = [];
    for (const note of notes) {
      if (note.phase === "attack" && !this.processedOnsets.has(note.id)) {
        this.processedOnsets.add(note.id);
        newOnsets.push(note);
      }
    }

    if (newOnsets.length === 0) return;

    // Group by onset time (simultaneous notes in a chord share onset)
    const byOnset = new Map<Ms, Note[]>();
    for (const note of newOnsets) {
      const group = byOnset.get(note.onset);
      if (group) {
        group.push(note);
      } else {
        byOnset.set(note.onset, [note]);
      }
    }

    // Process each onset group
    for (const [onset, group] of byOnset) {
      // Record individual events
      for (const note of group) {
        const intensity = note.velocity / 127;
        this.events.push({ t: onset, intensity });
      }

      // Contour point: max intensity, with min if spread
      const intensities = group.map((n) => n.velocity / 127);
      const max = Math.max(...intensities);
      const min = Math.min(...intensities);

      const point: DynamicsContourPoint = { t: onset, level: max };
      if (min < max) {
        point.min = min;
      }
      this.contour.push(point);

      this.currentLevel = max;
    }
  }

  private prune(t: Ms): void {
    const cutoff = t - this.config.windowMs;

    // Prune events
    while (this.events.length > 0 && this.events[0].t < cutoff) {
      this.events.shift();
    }

    // Prune contour
    while (this.contour.length > 0 && this.contour[0].t < cutoff) {
      this.contour.shift();
    }

    // Prune processed onset IDs — bound the set size
    if (this.processedOnsets.size > 200) {
      this.processedOnsets.clear();
    }
  }

  private computeTrend(): DynamicsState["trend"] {
    const windowMs = this.config.trendWindowMs;
    const deadZone = this.config.trendDeadZone;

    // Need at least 2 contour points in the trend window
    const recentContour = this.contour.filter(
      (p) => this.contour.length > 0 &&
        p.t >= this.contour[this.contour.length - 1].t - windowMs
    );

    if (recentContour.length < 2) return "stable";

    // Linear regression: slope of level over time
    const n = recentContour.length;
    let sumT = 0, sumL = 0, sumTL = 0, sumT2 = 0;
    const t0 = recentContour[0].t;

    for (const p of recentContour) {
      const dt = (p.t - t0) / 1000; // seconds for interpretable slope
      sumT += dt;
      sumL += p.level;
      sumTL += dt * p.level;
      sumT2 += dt * dt;
    }

    const denom = n * sumT2 - sumT * sumT;
    if (Math.abs(denom) < 1e-10) return "stable";

    const slope = (n * sumTL - sumT * sumL) / denom;

    if (slope > deadZone) return "rising";
    if (slope < -deadZone) return "falling";
    return "stable";
  }

  private computeRange(): DynamicsRange {
    if (this.events.length === 0) {
      return { min: 0, max: 0, variance: 0 };
    }

    let min = 1;
    let max = 0;
    let sum = 0;
    let sumSq = 0;

    for (const event of this.events) {
      if (event.intensity < min) min = event.intensity;
      if (event.intensity > max) max = event.intensity;
      sum += event.intensity;
      sumSq += event.intensity * event.intensity;
    }

    const n = this.events.length;
    const mean = sum / n;
    // Variance relative to full 0–1 range
    const variance = n > 1 ? (sumSq / n - mean * mean) : 0;

    return { min, max, variance: Math.max(0, variance) };
  }

  private createEmptyFrame(t: Ms): MusicalFrame {
    return {
      t,
      part: this.config.partId,
      notes: [],
      chords: [],
      rhythmicAnalysis: {
        detectedDivision: null,
        onsetDrifts: [],
        stability: 0,
        confidence: 0,
      },
      dynamics: {
        events: [],
        level: 0,
        trend: "stable",
        contour: [],
        range: { min: 0, max: 0, variance: 0 },
      },
      prescribedTempo: null,
      prescribedMeter: null,
    };
  }
}
