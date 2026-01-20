/**
 * Beat Detection Stabilizer (RFC 007 Redesign)
 *
 * Produces purely DESCRIPTIVE rhythmic analysis from note onset patterns.
 * Does NOT infer tempo or track beat grids - that's a category error.
 *
 * Key insight: We cannot distinguish subdivisions from tempo changes,
 * drift from rubato, off-beat from syncopation based on historic data alone.
 * Therefore:
 * - This stabilizer outputs descriptive analysis (detectedDivision, stability)
 * - Tempo/meter are set explicitly by user via control ops (not by this stabilizer)
 *
 * Algorithm:
 * 1. Collect note onset times in a rolling window
 * 2. Use Dixon's IOI clustering to detect the most prominent division
 * 3. Calculate stability (how consistent the division is)
 * 4. Output RhythmicAnalysis - grammars decide what to visualize
 *
 * Reference: Dixon, S. (2001). Automatic extraction of tempo and beat
 * from expressive performances. Journal of New Music Research, 30(1), 39-58.
 */

import type {
  IMusicalStabilizer,
  RawInputFrame,
  MusicalFrame,
  RhythmicAnalysis,
  PartId,
  Ms,
} from "@synesthetica/contracts";

/**
 * Configuration for the BeatDetectionStabilizer.
 */
export interface BeatDetectionConfig {
  partId: PartId;

  /** Lookback window for onset analysis in ms. @default 3000 */
  windowMs?: Ms;

  /** Maximum onsets to retain. @default 16 */
  maxOnsets?: number;

  /** Minimum number of onsets required before analysis. @default 4 */
  minOnsets?: number;

  /** How often to run IOI clustering (ms). @default 100 */
  clusteringIntervalMs?: Ms;
}

const DEFAULT_CONFIG: Required<Omit<BeatDetectionConfig, "partId">> = {
  windowMs: 3000,
  maxOnsets: 16,
  minOnsets: 4,
  clusteringIntervalMs: 100,
};

/** Dixon's cluster width: 25ms tolerance */
const CLUSTER_WIDTH_MS = 25;

interface IOICluster {
  sum: number;
  count: number;
  score: number;
  /** Sum of squared deviations from mean, for stability calculation */
  sumSquaredDev: number;
}

/**
 * BeatDetectionStabilizer: Purely descriptive rhythmic analysis.
 *
 * Outputs RhythmicAnalysis with:
 * - detectedDivision: Most prominent IOI cluster (not a "tempo")
 * - detectedDivisionTimes: Timestamps where divisions fall (for direct rendering)
 * - recentOnsets: Raw onset timestamps for historic visualization
 * - stability: How consistent the division is (0-1)
 * - confidence: How sure we are about the detection (0-1)
 */
export class BeatDetectionStabilizer implements IMusicalStabilizer {
  readonly id = "beat-detection";

  private config: Required<BeatDetectionConfig>;

  /** Rolling window of recent note onset times */
  private onsetTimes: Ms[] = [];

  /** Last time we ran IOI clustering */
  private lastClusteringTime: Ms = 0;

  /** Cached analysis result (updated on clustering interval) */
  private cachedAnalysis: RhythmicAnalysis = {
    detectedDivision: null,
    detectedDivisionTimes: [],
    recentOnsets: [],
    stability: 0,
    confidence: 0,
  };

  constructor(config: BeatDetectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(): void {
    this.onsetTimes = [];
    this.lastClusteringTime = 0;
    this.cachedAnalysis = {
      detectedDivision: null,
      detectedDivisionTimes: [],
      recentOnsets: [],
      stability: 0,
      confidence: 0,
    };
  }

  dispose(): void {
    this.onsetTimes = [];
  }

  reset(): void {
    this.init();
  }

  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame {
    const t = raw.t;

    // Collect note onsets
    for (const input of raw.inputs) {
      if (input.type === "midi_note_on") {
        this.onsetTimes.push(input.t);
      }
    }

    // Prune old onsets (by time and count)
    this.pruneOnsets(t);

    // Throttled analysis update
    if (t - this.lastClusteringTime >= this.config.clusteringIntervalMs) {
      this.updateAnalysis();
      this.lastClusteringTime = t;
    }

    // Update recent onsets in cached analysis (always current)
    this.cachedAnalysis.recentOnsets = [...this.onsetTimes];

    if (upstream) {
      return {
        ...upstream,
        t,
        rhythmicAnalysis: { ...this.cachedAnalysis },
      };
    }

    return {
      t,
      part: this.config.partId,
      notes: [],
      chords: [],
      rhythmicAnalysis: { ...this.cachedAnalysis },
      dynamics: { level: 0, trend: "stable" },
      prescribedTempo: null,
      prescribedMeter: null,
    };
  }

  private pruneOnsets(currentTime: Ms): void {
    const cutoff = currentTime - this.config.windowMs;

    // Remove onsets older than window
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

    // Also limit by count
    if (this.onsetTimes.length > this.config.maxOnsets) {
      this.onsetTimes = this.onsetTimes.slice(-this.config.maxOnsets);
    }
  }

  /**
   * Update rhythmic analysis using Dixon's IOI clustering.
   */
  private updateAnalysis(): void {
    if (this.onsetTimes.length < this.config.minOnsets) {
      this.cachedAnalysis = {
        detectedDivision: null,
        detectedDivisionTimes: [],
        recentOnsets: [...this.onsetTimes],
        stability: 0,
        confidence: 0,
      };
      return;
    }

    // Calculate consecutive IOIs
    const iois = this.calculateConsecutiveIOIs();
    if (iois.length < 2) {
      this.cachedAnalysis = {
        detectedDivision: null,
        detectedDivisionTimes: [],
        recentOnsets: [...this.onsetTimes],
        stability: 0,
        confidence: 0,
      };
      return;
    }

    // Cluster IOIs
    const clusters = this.clusterIOIs(iois);
    if (clusters.length === 0) {
      this.cachedAnalysis = {
        detectedDivision: null,
        detectedDivisionTimes: [],
        recentOnsets: [...this.onsetTimes],
        stability: 0,
        confidence: 0,
      };
      return;
    }

    // Score with harmonic bonuses
    this.scoreClusterHarmonics(clusters);

    // Find best cluster (highest score)
    let bestCluster: IOICluster | null = null;
    let bestScore = -1;

    for (const cluster of clusters) {
      if (cluster.score > bestScore) {
        bestScore = cluster.score;
        bestCluster = cluster;
      }
    }

    if (!bestCluster || bestCluster.count < 2) {
      this.cachedAnalysis = {
        detectedDivision: null,
        detectedDivisionTimes: [],
        recentOnsets: [...this.onsetTimes],
        stability: 0,
        confidence: 0,
      };
      return;
    }

    const detectedDivision = bestCluster.sum / bestCluster.count;

    // Calculate confidence from cluster dominance
    const totalScore = clusters.reduce((sum, c) => sum + c.score, 0);
    const confidence = Math.min(
      1,
      bestCluster.score / Math.max(1, totalScore)
    );

    // Calculate stability from variance within the best cluster
    // stability = 1 - normalized standard deviation
    const variance = bestCluster.sumSquaredDev / bestCluster.count;
    const stdDev = Math.sqrt(variance);
    // Normalize: stdDev of 50ms = stability 0, stdDev of 0 = stability 1
    const stability = Math.max(0, Math.min(1, 1 - stdDev / 50));

    // Compute division timestamps within the window
    const detectedDivisionTimes = this.computeDivisionTimes(detectedDivision);

    this.cachedAnalysis = {
      detectedDivision,
      detectedDivisionTimes,
      recentOnsets: [...this.onsetTimes],
      stability,
      confidence,
    };
  }

  /**
   * Compute timestamps where detected divisions fall within the onset window.
   * Uses the median onset as anchor to minimize drift from any single onset.
   */
  private computeDivisionTimes(division: Ms): Ms[] {
    if (this.onsetTimes.length === 0 || division <= 0) {
      return [];
    }

    const sorted = [...this.onsetTimes].sort((a, b) => a - b);
    const windowStart = sorted[0];
    const windowEnd = sorted[sorted.length - 1];

    // Use median onset as anchor for stability
    const medianIndex = Math.floor(sorted.length / 2);
    const anchor = sorted[medianIndex];

    const times: Ms[] = [];

    // Extend backward from anchor
    let t = anchor;
    while (t >= windowStart) {
      times.push(t);
      t -= division;
    }

    // Extend forward from anchor (skip anchor itself)
    t = anchor + division;
    while (t <= windowEnd) {
      times.push(t);
      t += division;
    }

    // Sort chronologically
    return times.sort((a, b) => a - b);
  }

  private calculateConsecutiveIOIs(): Ms[] {
    const iois: Ms[] = [];
    const sorted = [...this.onsetTimes].sort((a, b) => a - b);

    for (let i = 1; i < sorted.length; i++) {
      const ioi = sorted[i] - sorted[i - 1];
      // Filter out very short IOIs (likely chords, <50ms) and very long gaps
      if (ioi >= 50 && ioi <= 2000) {
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
        // Update cluster mean first, then calculate deviation
        const oldMean = foundCluster.sum / foundCluster.count;
        foundCluster.sum += ioi;
        foundCluster.count += 1;
        foundCluster.score = foundCluster.count;

        // Update sum of squared deviations (online algorithm)
        const newMean = foundCluster.sum / foundCluster.count;
        foundCluster.sumSquaredDev += (ioi - oldMean) * (ioi - newMean);
      } else {
        clusters.push({ sum: ioi, count: 1, score: 1, sumSquaredDev: 0 });
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
}
