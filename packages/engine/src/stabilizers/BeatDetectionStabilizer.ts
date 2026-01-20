/**
 * Beat Detection Stabilizer
 *
 * Detects tempo and beat phase from note onset timing patterns.
 * Designed for stability over responsiveness — tempo locks in and only
 * adjusts after sustained divergence.
 *
 * Key design principles:
 * 1. **Stable tempo**: Once established, tempo only changes after sustained drift
 * 2. **Drift tracking**: Reports how far the player is from the beat grid
 * 3. **Instantaneous tempo**: Shows current playing speed vs locked tempo
 * 4. **Performance**: Expensive clustering is throttled; drift calculation is cheap
 *
 * Algorithm:
 * 1. Collect note onset times in a rolling window
 * 2. Use Dixon's IOI clustering to detect candidate tempo (throttled)
 * 3. Lock tempo once confident; track drift from beat grid
 * 4. Only unlock/adjust tempo after sustained divergence (multiple bars)
 *
 * Reference: Dixon, S. (2001). Automatic extraction of tempo and beat
 * from expressive performances. Journal of New Music Research, 30(1), 39-58.
 */

import type {
  IMusicalStabilizer,
  RawInputFrame,
  MusicalFrame,
  BeatState,
  PartId,
  Ms,
  Confidence,
} from "@synesthetica/contracts";

/**
 * Configuration for the BeatDetectionStabilizer.
 */
export interface BeatDetectionConfig {
  partId: PartId;

  /** Lookback window for onset analysis in ms. @default 5000 */
  windowMs?: Ms;

  /** Minimum number of onsets required before tempo detection. @default 4 */
  minOnsets?: number;

  /** Valid tempo range in BPM [min, max]. @default [40, 200] */
  tempoRange?: [number, number];

  /** Number of beats per bar. @default 4 */
  beatsPerBar?: number;

  /** Minimum confidence threshold to lock tempo. @default 0.4 */
  minConfidence?: Confidence;

  /** How often to run IOI clustering (ms). @default 200 */
  clusteringIntervalMs?: Ms;

  /**
   * How many consecutive bars of sustained drift before tempo adjusts.
   * Higher = more stable, slower to adapt.
   * @default 2
   */
  driftBarsBeforeAdjust?: number;

  /**
   * Drift threshold (as fraction of beat) to consider "sustained divergence".
   * @default 0.15 (15% of a beat)
   */
  driftThreshold?: number;

  /**
   * Smoothing factor for tempo adjustments (0-1). Lower = slower adjustment.
   * @default 0.08
   */
  tempoSmoothingFactor?: number;

  /**
   * Smoothing factor for drift calculation. Lower = more stable drift reading.
   * @default 0.2
   */
  driftSmoothingFactor?: number;
}

const DEFAULT_CONFIG: Required<Omit<BeatDetectionConfig, "partId">> = {
  windowMs: 5000,
  minOnsets: 4,
  tempoRange: [40, 200],
  beatsPerBar: 4,
  minConfidence: 0.4,
  clusteringIntervalMs: 200,
  driftBarsBeforeAdjust: 2,
  driftThreshold: 0.15,
  tempoSmoothingFactor: 0.08,
  driftSmoothingFactor: 0.2,
};

/** Dixon's cluster width: 25ms tolerance */
const CLUSTER_WIDTH_MS = 25;

interface IOICluster {
  sum: number;
  count: number;
  score: number;
}

interface TempoState {
  /** Locked beat period in ms (60000 / BPM) */
  periodMs: number;

  /** Time of the last beat on the grid */
  lastBeatTime: Ms;

  /** Running beat count (for bar tracking) */
  beatCount: number;

  /** Confidence in locked tempo */
  confidence: Confidence;

  /** Smoothed drift from beat grid (-0.5 to 0.5) */
  drift: number;

  /** Instantaneous tempo from recent IOIs */
  instantaneousPeriodMs: number;

  /** Count of consecutive bars with sustained drift in same direction */
  sustainedDriftBars: number;

  /** Direction of sustained drift: -1 = rushing, +1 = dragging, 0 = neutral */
  sustainedDriftDirection: -1 | 0 | 1;
}

/**
 * BeatDetectionStabilizer: Stable tempo detection with drift tracking.
 */
export class BeatDetectionStabilizer implements IMusicalStabilizer {
  readonly id = "beat-detection";

  private config: Required<BeatDetectionConfig>;

  /** Rolling window of recent note onset times */
  private onsetTimes: Ms[] = [];

  /** Current tempo tracking state */
  private tempoState: TempoState | null = null;

  /** Last time we ran IOI clustering */
  private lastClusteringTime: Ms = 0;

  /** Recent onset drift values for smoothing */
  private recentDrifts: number[] = [];

  constructor(config: BeatDetectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(): void {
    this.onsetTimes = [];
    this.tempoState = null;
    this.lastClusteringTime = 0;
    this.recentDrifts = [];
  }

  dispose(): void {
    this.onsetTimes = [];
    this.tempoState = null;
    this.recentDrifts = [];
  }

  reset(): void {
    this.init();
  }

  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame {
    const t = raw.t;

    // Collect note onsets and track drift
    for (const input of raw.inputs) {
      if (input.type === "midi_note_on") {
        this.onsetTimes.push(input.t);
        this.trackOnsetDrift(input.t);
      }
    }

    // Prune old onsets
    this.pruneOldOnsets(t);

    // Throttled tempo detection/update
    if (t - this.lastClusteringTime >= this.config.clusteringIntervalMs) {
      this.updateTempo(t);
      this.lastClusteringTime = t;
    }

    // Always sync beat grid (cheap)
    this.syncBeatGrid(t);

    // Calculate current beat state
    const beat = this.calculateBeatState(t);

    if (upstream) {
      return { ...upstream, t, beat };
    }

    return {
      t,
      part: this.config.partId,
      notes: [],
      chords: [],
      beat,
      dynamics: { level: 0, trend: "stable" },
    };
  }

  /**
   * Track how far this onset is from the expected beat grid.
   */
  private trackOnsetDrift(onsetTime: Ms): void {
    if (!this.tempoState) return;

    const { periodMs, lastBeatTime } = this.tempoState;

    // Find the nearest expected beat time
    const timeSinceLastBeat = onsetTime - lastBeatTime;
    const beatsElapsed = timeSinceLastBeat / periodMs;
    const nearestBeatNumber = Math.round(beatsElapsed);
    const expectedBeatTime = lastBeatTime + nearestBeatNumber * periodMs;

    // Calculate drift as fraction of beat period (-0.5 to 0.5)
    const driftMs = onsetTime - expectedBeatTime;
    const driftFraction = driftMs / periodMs;

    // Clamp to [-0.5, 0.5]
    const clampedDrift = Math.max(-0.5, Math.min(0.5, driftFraction));

    // Add to recent drifts (keep last 8 for smoothing)
    this.recentDrifts.push(clampedDrift);
    if (this.recentDrifts.length > 8) {
      this.recentDrifts.shift();
    }

    // Update smoothed drift
    const avgDrift =
      this.recentDrifts.reduce((a, b) => a + b, 0) / this.recentDrifts.length;
    this.tempoState.drift =
      this.tempoState.drift * (1 - this.config.driftSmoothingFactor) +
      avgDrift * this.config.driftSmoothingFactor;
  }

  private pruneOldOnsets(currentTime: Ms): void {
    const cutoff = currentTime - this.config.windowMs;
    // More efficient: find first index to keep
    let firstValid = 0;
    while (
      firstValid < this.onsetTimes.length &&
      this.onsetTimes[firstValid] < cutoff
    ) {
      firstValid++;
    }
    if (firstValid > 0) {
      this.onsetTimes = this.onsetTimes.slice(firstValid);
    }
  }

  /**
   * Main tempo detection using Dixon's IOI clustering.
   */
  private updateTempo(currentTime: Ms): void {
    if (this.onsetTimes.length < this.config.minOnsets) {
      return;
    }

    // Calculate consecutive IOIs
    const iois = this.calculateConsecutiveIOIs();
    if (iois.length < 2) return;

    // Cluster IOIs
    const clusters = this.clusterIOIs(iois);
    if (clusters.length === 0) return;

    // Score with harmonic bonuses
    this.scoreClusterHarmonics(clusters);

    // Find best cluster in tempo range
    const [minBpm, maxBpm] = this.config.tempoRange;
    const minPeriod = 60000 / maxBpm;
    const maxPeriod = 60000 / minBpm;

    let bestCluster: IOICluster | null = null;
    let bestScore = -1;

    for (const cluster of clusters) {
      const meanIOI = cluster.sum / cluster.count;
      if (meanIOI >= minPeriod && meanIOI <= maxPeriod) {
        if (cluster.score > bestScore) {
          bestScore = cluster.score;
          bestCluster = cluster;
        }
      }
    }

    if (!bestCluster) return;

    const detectedPeriod = bestCluster.sum / bestCluster.count;

    // Calculate confidence from cluster dominance
    const totalScore = clusters.reduce((sum, c) => sum + c.score, 0);
    const confidence = Math.min(1, bestCluster.score / Math.max(1, totalScore));

    // Calculate instantaneous tempo from recent IOIs (last 4)
    const recentIOIs = iois.slice(-4);
    const instantaneousPeriod =
      recentIOIs.length > 0
        ? recentIOIs.reduce((a, b) => a + b, 0) / recentIOIs.length
        : detectedPeriod;

    if (this.tempoState === null) {
      // First tempo detection - lock it in if confident enough
      if (confidence >= this.config.minConfidence) {
        this.tempoState = {
          periodMs: detectedPeriod,
          lastBeatTime: this.findNearestBeatTime(currentTime, detectedPeriod),
          beatCount: 1,
          confidence,
          drift: 0,
          instantaneousPeriodMs: instantaneousPeriod,
          sustainedDriftBars: 0,
          sustainedDriftDirection: 0,
        };
        const bpm = 60000 / detectedPeriod;
        console.log(`[BeatDetection] Tempo locked: ${bpm.toFixed(1)} BPM`);
      }
    } else {
      // Update instantaneous tempo (always)
      this.tempoState.instantaneousPeriodMs =
        this.tempoState.instantaneousPeriodMs * 0.7 + instantaneousPeriod * 0.3;

      // Check if we should adjust the locked tempo
      this.maybeAdjustLockedTempo(detectedPeriod, confidence);
    }
  }

  /**
   * Decide whether to adjust the locked tempo based on sustained drift.
   */
  private maybeAdjustLockedTempo(
    detectedPeriod: number,
    confidence: number
  ): void {
    if (!this.tempoState) return;

    const drift = this.tempoState.drift;
    const threshold = this.config.driftThreshold;

    // Determine current drift direction
    let currentDirection: -1 | 0 | 1 = 0;
    if (drift < -threshold) {
      currentDirection = -1; // Rushing
    } else if (drift > threshold) {
      currentDirection = 1; // Dragging
    }

    // Track sustained drift
    if (currentDirection !== 0) {
      if (currentDirection === this.tempoState.sustainedDriftDirection) {
        // Same direction — will increment at bar boundary
      } else {
        // Direction changed — reset counter
        this.tempoState.sustainedDriftDirection = currentDirection;
        this.tempoState.sustainedDriftBars = 0;
      }
    } else {
      // No significant drift — reset
      this.tempoState.sustainedDriftDirection = 0;
      this.tempoState.sustainedDriftBars = 0;
    }

    // If sustained drift for enough bars, adjust tempo
    if (
      this.tempoState.sustainedDriftBars >= this.config.driftBarsBeforeAdjust
    ) {
      const oldBpm = 60000 / this.tempoState.periodMs;

      // Smooth adjustment toward detected period
      const smoothing = this.config.tempoSmoothingFactor;
      this.tempoState.periodMs =
        this.tempoState.periodMs * (1 - smoothing) + detectedPeriod * smoothing;

      // Update confidence
      this.tempoState.confidence =
        this.tempoState.confidence * 0.8 + confidence * 0.2;

      const newBpm = 60000 / this.tempoState.periodMs;
      if (Math.abs(newBpm - oldBpm) > 0.5) {
        console.log(
          `[BeatDetection] Tempo adjusting: ${oldBpm.toFixed(1)} → ${newBpm.toFixed(1)} BPM (drift: ${(drift * 100).toFixed(0)}%)`
        );
      }

      // Reset sustained drift counter after adjustment
      this.tempoState.sustainedDriftBars = 0;
      this.tempoState.drift *= 0.5; // Reduce perceived drift after adjustment
    }
  }

  private calculateConsecutiveIOIs(): Ms[] {
    const iois: Ms[] = [];
    // onsetTimes are already mostly sorted by insertion order
    // but sort to be safe (cheap for mostly-sorted arrays)
    const sorted = [...this.onsetTimes].sort((a, b) => a - b);

    for (let i = 1; i < sorted.length; i++) {
      const ioi = sorted[i] - sorted[i - 1];
      // Filter out very short IOIs (likely chords) and very long gaps
      if (ioi >= 100 && ioi <= 2000) {
        iois.push(ioi);
      }
    }

    return iois;
  }

  private clusterIOIs(iois: Ms[]): IOICluster[] {
    const clusters: IOICluster[] = [];

    for (const ioi of iois) {
      let foundCluster: IOICluster | null = null;
      let minDistance = Infinity;

      for (const cluster of clusters) {
        const clusterMean = cluster.sum / cluster.count;
        const distance = Math.abs(ioi - clusterMean);

        if (distance <= CLUSTER_WIDTH_MS && distance < minDistance) {
          minDistance = distance;
          foundCluster = cluster;
        }
      }

      if (foundCluster) {
        foundCluster.sum += ioi;
        foundCluster.count += 1;
        foundCluster.score = foundCluster.count;
      } else {
        clusters.push({ sum: ioi, count: 1, score: 1 });
      }
    }

    return clusters;
  }

  private scoreClusterHarmonics(clusters: IOICluster[]): void {
    const harmonicFactors = [2, 3, 4];

    for (let i = 0; i < clusters.length; i++) {
      const clusterA = clusters[i];
      const meanA = clusterA.sum / clusterA.count;

      for (let j = 0; j < clusters.length; j++) {
        if (i === j) continue;

        const clusterB = clusters[j];
        const meanB = clusterB.sum / clusterB.count;

        for (const factor of harmonicFactors) {
          const expectedB = meanA * factor;
          const tolerance = CLUSTER_WIDTH_MS * factor;

          if (Math.abs(meanB - expectedB) <= tolerance) {
            // Bonus to the longer one (prefers quarter notes over eighths)
            const bonus =
              (factor <= 2 ? 3 : factor <= 3 ? 2 : 1) * clusterA.count;
            clusterB.score += bonus;
          }
        }
      }
    }
  }

  private findNearestBeatTime(currentTime: Ms, _periodMs: number): Ms {
    if (this.onsetTimes.length === 0) return currentTime;

    // Use most recent onset as anchor
    const recentOnset = Math.max(...this.onsetTimes.slice(-4));
    return recentOnset;
  }

  /**
   * Advance the beat grid and track bar boundaries.
   */
  private syncBeatGrid(currentTime: Ms): void {
    if (!this.tempoState) return;

    const timeSinceLastBeat = currentTime - this.tempoState.lastBeatTime;
    const beatsSinceLastBeat = timeSinceLastBeat / this.tempoState.periodMs;

    if (beatsSinceLastBeat >= 1) {
      const wholeBeatsPassed = Math.floor(beatsSinceLastBeat);
      const oldBeatInBar =
        ((this.tempoState.beatCount - 1) % this.config.beatsPerBar) + 1;

      this.tempoState.lastBeatTime +=
        wholeBeatsPassed * this.tempoState.periodMs;
      this.tempoState.beatCount += wholeBeatsPassed;

      // Check for bar boundary
      const newBeatInBar =
        ((this.tempoState.beatCount - 1) % this.config.beatsPerBar) + 1;

      if (
        newBeatInBar < oldBeatInBar ||
        wholeBeatsPassed >= this.config.beatsPerBar
      ) {
        // New bar started — increment sustained drift counter if drifting
        if (this.tempoState.sustainedDriftDirection !== 0) {
          this.tempoState.sustainedDriftBars++;
        }
      }
    }
  }

  private calculateBeatState(currentTime: Ms): BeatState | null {
    if (!this.tempoState) return null;

    const {
      periodMs,
      lastBeatTime,
      beatCount,
      confidence,
      drift,
      instantaneousPeriodMs,
    } = this.tempoState;

    const timeSinceLastBeat = currentTime - lastBeatTime;
    const phase = Math.max(0, Math.min(1, timeSinceLastBeat / periodMs));
    const tempo = 60000 / periodMs;
    const instantaneousTempo = 60000 / instantaneousPeriodMs;
    const beatInBar = ((beatCount - 1) % this.config.beatsPerBar) + 1;
    const isDownbeat = beatInBar === 1;

    return {
      phase,
      tempo,
      confidence,
      beatInBar,
      beatsPerBar: this.config.beatsPerBar,
      isDownbeat,
      drift,
      instantaneousTempo,
    };
  }
}
