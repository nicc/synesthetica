/**
 * Beat Detection Stabilizer
 *
 * Detects tempo and beat phase from note onset timing patterns.
 * Based on Dixon's IOI clustering algorithm (2001) with simplifications
 * for real-time performance.
 *
 * Algorithm (simplified Dixon):
 * 1. Collect note onset times in a rolling window
 * 2. Compute consecutive inter-onset intervals (IOIs)
 * 3. Cluster IOIs using 25ms tolerance
 * 4. Score clusters with harmonic relationship bonuses
 * 5. Select highest-scoring cluster as tempo
 * 6. Maintain beat grid and calculate phase (0-1)
 *
 * Key optimization: Only recalculate tempo periodically (every 100ms),
 * not on every frame.
 *
 * Reference: Dixon, S. (2001). Automatic extraction of tempo and beat
 * from expressive performances. Journal of New Music Research, 30(1), 39-58.
 *
 * See RFC 005 for design rationale.
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
  /**
   * Part ID this stabilizer is tracking.
   */
  partId: PartId;

  /**
   * Lookback window for onset analysis in ms.
   * @default 5000
   */
  windowMs?: Ms;

  /**
   * Minimum number of onsets required before tempo detection.
   * @default 4
   */
  minOnsets?: number;

  /**
   * Valid tempo range in BPM [min, max].
   * @default [40, 200]
   */
  tempoRange?: [number, number];

  /**
   * Number of beats per bar (time signature numerator).
   * @default 4 (for 4/4 time)
   */
  beatsPerBar?: number;

  /**
   * Minimum confidence threshold to report a beat.
   * @default 0.3
   */
  minConfidence?: Confidence;

  /**
   * How often to recalculate tempo (ms). Throttles expensive clustering.
   * @default 100
   */
  tempoUpdateIntervalMs?: Ms;
}

const DEFAULT_CONFIG: Required<Omit<BeatDetectionConfig, "partId">> = {
  windowMs: 5000,
  minOnsets: 4,
  tempoRange: [40, 200],
  beatsPerBar: 4,
  minConfidence: 0.3,
  tempoUpdateIntervalMs: 100,
};

/**
 * IOI cluster for tempo induction.
 */
interface IOICluster {
  /** Sum of IOIs in cluster (for computing mean) */
  sum: number;
  /** Number of IOIs in cluster */
  count: number;
  /** Cluster score (count + harmonic bonuses) */
  score: number;
}

/**
 * Internal state for tempo tracking.
 */
interface TempoState {
  /** Detected beat period in ms (60000 / BPM) */
  periodMs: number;

  /** Last confirmed beat time */
  lastBeatTime: Ms;

  /** Running beat count (for bar tracking) */
  beatCount: number;

  /** Confidence in current tempo */
  confidence: Confidence;
}

/** Dixon's cluster width: 25ms tolerance */
const CLUSTER_WIDTH_MS = 25;

/**
 * BeatDetectionStabilizer: Detects tempo and beat phase from note onsets.
 *
 * Uses Dixon's IOI clustering algorithm with harmonic relationship scoring
 * to prefer slower tempos over subdivisions.
 */
export class BeatDetectionStabilizer implements IMusicalStabilizer {
  readonly id = "beat-detection";

  private config: Required<BeatDetectionConfig>;

  /** Rolling window of recent note onset times */
  private onsetTimes: Ms[] = [];

  /** Current tempo tracking state */
  private tempoState: TempoState | null = null;

  /** Last time we recalculated tempo */
  private lastTempoUpdate: Ms = 0;

  constructor(config: BeatDetectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(): void {
    this.onsetTimes = [];
    this.tempoState = null;
    this.lastTempoUpdate = 0;
  }

  dispose(): void {
    this.onsetTimes = [];
    this.tempoState = null;
  }

  reset(): void {
    this.onsetTimes = [];
    this.tempoState = null;
    this.lastTempoUpdate = 0;
  }

  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame {
    const t = raw.t;

    // Collect note onsets from raw input
    for (const input of raw.inputs) {
      if (input.type === "midi_note_on") {
        this.onsetTimes.push(input.t);
      }
    }

    // Prune old onsets outside the window
    this.pruneOldOnsets(t);

    // Throttled tempo update - only recalculate periodically
    if (t - this.lastTempoUpdate >= this.config.tempoUpdateIntervalMs) {
      this.updateTempo(t);
      this.lastTempoUpdate = t;
    }

    // Always sync beat grid (cheap operation)
    this.syncBeatGrid(t);

    // Calculate current beat state
    const beat = this.calculateBeatState(t);

    // Preserve upstream frame data if available, otherwise create minimal frame
    if (upstream) {
      return {
        ...upstream,
        t,
        beat,
      };
    }

    // No upstream - return minimal frame (shouldn't happen in practice)
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
   * Remove onsets older than the analysis window.
   */
  private pruneOldOnsets(currentTime: Ms): void {
    const cutoff = currentTime - this.config.windowMs;
    this.onsetTimes = this.onsetTimes.filter((t) => t >= cutoff);
  }

  /**
   * Update tempo using Dixon's IOI clustering algorithm.
   */
  private updateTempo(currentTime: Ms): void {
    if (this.onsetTimes.length < this.config.minOnsets) {
      return;
    }

    // Step 1: Calculate consecutive IOIs
    const iois = this.calculateConsecutiveIOIs();
    if (iois.length < 2) {
      return;
    }

    // Step 2: Cluster IOIs with 25ms tolerance
    const clusters = this.clusterIOIs(iois);
    if (clusters.length === 0) {
      return;
    }

    // Step 3: Score clusters with harmonic bonuses
    this.scoreClusterHarmonics(clusters);

    // Step 4: Select best cluster (highest score)
    let bestCluster: IOICluster | null = null;
    let bestScore = -1;

    const [minBpm, maxBpm] = this.config.tempoRange;
    const minPeriod = 60000 / maxBpm;
    const maxPeriod = 60000 / minBpm;

    for (const cluster of clusters) {
      const meanIOI = cluster.sum / cluster.count;

      // Only consider clusters in valid tempo range
      if (meanIOI >= minPeriod && meanIOI <= maxPeriod) {
        if (cluster.score > bestScore) {
          bestScore = cluster.score;
          bestCluster = cluster;
        }
      }
    }

    if (!bestCluster) {
      return;
    }

    const selectedPeriod = bestCluster.sum / bestCluster.count;

    // Calculate confidence from cluster dominance
    const totalScore = clusters.reduce((sum, c) => sum + c.score, 0);
    const confidence = Math.min(1, bestCluster.score / Math.max(1, totalScore));

    if (confidence < this.config.minConfidence) {
      return;
    }

    // Step 5: Update tempo state
    if (this.tempoState === null) {
      this.tempoState = {
        periodMs: selectedPeriod,
        lastBeatTime: this.findNearestBeatTime(currentTime, selectedPeriod),
        beatCount: 1,
        confidence,
      };
    } else {
      // Check for significant tempo change (>25% difference)
      const tempoRatio = selectedPeriod / this.tempoState.periodMs;
      const isSignificantChange = tempoRatio < 0.75 || tempoRatio > 1.33;

      if (isSignificantChange && confidence > 0.5) {
        // Reset to new tempo
        this.tempoState = {
          periodMs: selectedPeriod,
          lastBeatTime: this.findNearestBeatTime(currentTime, selectedPeriod),
          beatCount: 1,
          confidence,
        };
      } else {
        // Smooth update
        const smoothingFactor = 0.3;
        const newPeriod =
          this.tempoState.periodMs * (1 - smoothingFactor) +
          selectedPeriod * smoothingFactor;

        // Snap when close to avoid asymptotic drift
        const drift = Math.abs(newPeriod - selectedPeriod) / selectedPeriod;
        this.tempoState.periodMs = drift < 0.02 ? selectedPeriod : newPeriod;

        this.tempoState.confidence =
          this.tempoState.confidence * 0.7 + confidence * 0.3;
      }
    }
  }

  /**
   * Calculate consecutive inter-onset intervals.
   * Unlike Dixon's all-pairs approach, we only use consecutive onsets
   * for performance.
   */
  private calculateConsecutiveIOIs(): Ms[] {
    const iois: Ms[] = [];
    const sorted = [...this.onsetTimes].sort((a, b) => a - b);

    for (let i = 1; i < sorted.length; i++) {
      iois.push(sorted[i] - sorted[i - 1]);
    }

    return iois;
  }

  /**
   * Cluster IOIs using Dixon's 25ms tolerance.
   * Returns array of clusters, each tracking sum/count for mean calculation.
   */
  private clusterIOIs(iois: Ms[]): IOICluster[] {
    const clusters: IOICluster[] = [];

    for (const ioi of iois) {
      // Find existing cluster within tolerance
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
        // Add to existing cluster
        foundCluster.sum += ioi;
        foundCluster.count += 1;
        foundCluster.score = foundCluster.count; // Base score = count
      } else {
        // Create new cluster
        clusters.push({
          sum: ioi,
          count: 1,
          score: 1,
        });
      }
    }

    return clusters;
  }

  /**
   * Apply harmonic relationship bonuses to cluster scores.
   * Clusters related by factors of 2, 3, 4 get bonus points.
   * This prefers slower tempos (longer IOIs) over subdivisions.
   */
  private scoreClusterHarmonics(clusters: IOICluster[]): void {
    const harmonicFactors = [2, 3, 4];

    for (let i = 0; i < clusters.length; i++) {
      const clusterA = clusters[i];
      const meanA = clusterA.sum / clusterA.count;

      for (let j = 0; j < clusters.length; j++) {
        if (i === j) continue;

        const clusterB = clusters[j];
        const meanB = clusterB.sum / clusterB.count;

        // Check if B is a multiple of A
        for (const factor of harmonicFactors) {
          const expectedB = meanA * factor;
          const tolerance = CLUSTER_WIDTH_MS * factor;

          if (Math.abs(meanB - expectedB) <= tolerance) {
            // B is a multiple of A - give bonus to the LONGER one (B)
            // This prefers quarter notes over eighth notes
            const bonus = (factor <= 2 ? 3 : factor <= 3 ? 2 : 1) * clusterA.count;
            clusterB.score += bonus;
          }
        }
      }
    }
  }

  /**
   * Find the nearest beat time to align the grid.
   */
  private findNearestBeatTime(currentTime: Ms, _periodMs: Ms): Ms {
    const sortedOnsets = [...this.onsetTimes].sort((a, b) => b - a);
    if (sortedOnsets.length === 0) {
      return currentTime;
    }

    // Use most recent onset as anchor
    return sortedOnsets[0];
  }

  /**
   * Synchronize beat grid and track bar boundaries.
   */
  private syncBeatGrid(currentTime: Ms): void {
    if (!this.tempoState) return;

    const timeSinceLastBeat = currentTime - this.tempoState.lastBeatTime;
    const beatsSinceLastBeat = timeSinceLastBeat / this.tempoState.periodMs;

    if (beatsSinceLastBeat >= 1) {
      const wholeBeatsPassed = Math.floor(beatsSinceLastBeat);
      const oldBeatCount = this.tempoState.beatCount;

      this.tempoState.lastBeatTime +=
        wholeBeatsPassed * this.tempoState.periodMs;
      this.tempoState.beatCount += wholeBeatsPassed;

      // Log BPM at start of every bar
      const oldBeatInBar = ((oldBeatCount - 1) % this.config.beatsPerBar) + 1;
      const newBeatInBar =
        ((this.tempoState.beatCount - 1) % this.config.beatsPerBar) + 1;

      if (
        newBeatInBar < oldBeatInBar ||
        wholeBeatsPassed >= this.config.beatsPerBar
      ) {
        const bpm = 60000 / this.tempoState.periodMs;
        console.log(`[BeatDetection] New bar started | BPM: ${bpm.toFixed(1)}`);
      }
    }
  }

  /**
   * Calculate the current beat state.
   */
  private calculateBeatState(currentTime: Ms): BeatState | null {
    if (!this.tempoState) {
      return null;
    }

    const { periodMs, lastBeatTime, beatCount, confidence } = this.tempoState;

    const timeSinceLastBeat = currentTime - lastBeatTime;
    const phase = Math.max(0, Math.min(1, timeSinceLastBeat / periodMs));
    const tempo = 60000 / periodMs;
    const beatInBar = ((beatCount - 1) % this.config.beatsPerBar) + 1;
    const isDownbeat = beatInBar === 1;

    return {
      phase,
      tempo,
      confidence,
      beatInBar,
      beatsPerBar: this.config.beatsPerBar,
      isDownbeat,
    };
  }
}
