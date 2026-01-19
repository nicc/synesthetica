/**
 * Beat Detection Stabilizer
 *
 * Detects tempo and beat phase from note onset timing patterns.
 * Uses inter-onset interval (IOI) analysis to find the dominant beat period.
 *
 * Algorithm:
 * 1. Collect note onset times in a rolling window
 * 2. Compute inter-onset intervals (IOIs)
 * 3. Cluster IOIs to find dominant beat period (median-based)
 * 4. Maintain a beat grid once tempo is established
 * 5. Calculate phase as position within current beat (0-1)
 *
 * This is an independent stabilizer - it has no dependencies on other stabilizers.
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
}

const DEFAULT_CONFIG: Required<Omit<BeatDetectionConfig, "partId">> = {
  windowMs: 5000,
  minOnsets: 4,
  tempoRange: [40, 200],
  beatsPerBar: 4,
  minConfidence: 0.3,
};

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

/**
 * BeatDetectionStabilizer: Detects tempo and beat phase from note onsets.
 *
 * Maintains a rolling window of onset times and uses IOI analysis to
 * detect the dominant beat period. Once tempo is established, maintains
 * a beat grid and calculates phase within the current beat.
 */
export class BeatDetectionStabilizer implements IMusicalStabilizer {
  readonly id = "beat-detection";

  private config: Required<BeatDetectionConfig>;

  /** Rolling window of recent note onset times */
  private onsetTimes: Ms[] = [];

  /** Current tempo tracking state */
  private tempoState: TempoState | null = null;

  constructor(config: BeatDetectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(): void {
    this.onsetTimes = [];
    this.tempoState = null;
  }

  dispose(): void {
    this.onsetTimes = [];
    this.tempoState = null;
  }

  reset(): void {
    this.onsetTimes = [];
    this.tempoState = null;
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

    // Attempt to detect/update tempo
    this.updateTempo(t);

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
   * Attempt to detect or update tempo from recent onsets.
   */
  private updateTempo(currentTime: Ms): void {
    if (this.onsetTimes.length < this.config.minOnsets) {
      // Not enough data yet - but keep existing tempo if we have one
      return;
    }

    // Calculate inter-onset intervals
    const iois = this.calculateIOIs();

    if (iois.length === 0) {
      return;
    }

    // Filter IOIs to valid tempo range
    const [minBpm, maxBpm] = this.config.tempoRange;
    const minPeriod = 60000 / maxBpm; // Max BPM = min period
    const maxPeriod = 60000 / minBpm; // Min BPM = max period

    const validIOIs = iois.filter((ioi) => ioi >= minPeriod && ioi <= maxPeriod);

    if (validIOIs.length < 2) {
      // Not enough valid IOIs
      return;
    }

    // Find dominant beat period using median (robust to outliers)
    const sortedIOIs = [...validIOIs].sort((a, b) => a - b);
    const medianIOI = sortedIOIs[Math.floor(sortedIOIs.length / 2)];

    // Calculate confidence based on IOI consistency
    const confidence = this.calculateConfidence(validIOIs, medianIOI);

    if (confidence < this.config.minConfidence) {
      // Confidence too low - keep existing tempo if we have one
      return;
    }

    // Update or establish tempo
    if (this.tempoState === null) {
      // First tempo detection
      this.tempoState = {
        periodMs: medianIOI,
        lastBeatTime: this.findNearestBeatTime(currentTime, medianIOI),
        beatCount: 1,
        confidence,
      };
    } else {
      // Check for significant tempo change (>25% difference)
      const tempoRatio = medianIOI / this.tempoState.periodMs;
      const isSignificantChange = tempoRatio < 0.75 || tempoRatio > 1.33;

      if (isSignificantChange && confidence > 0.5) {
        // Reset to new tempo immediately
        this.tempoState = {
          periodMs: medianIOI,
          lastBeatTime: this.findNearestBeatTime(currentTime, medianIOI),
          beatCount: 1,
          confidence,
        };
      } else {
        // Update existing tempo with smoothing (0.5 = more responsive)
        const smoothingFactor = 0.5;
        const newPeriod =
          this.tempoState.periodMs * (1 - smoothingFactor) +
          medianIOI * smoothingFactor;

        this.tempoState.periodMs = newPeriod;
        this.tempoState.confidence =
          this.tempoState.confidence * 0.6 + confidence * 0.4;

        // Update beat grid if we've drifted too far
        this.syncBeatGrid(currentTime);
      }
    }
  }

  /**
   * Calculate inter-onset intervals from recent onsets.
   */
  private calculateIOIs(): Ms[] {
    const iois: Ms[] = [];
    const sorted = [...this.onsetTimes].sort((a, b) => a - b);

    for (let i = 1; i < sorted.length; i++) {
      iois.push(sorted[i] - sorted[i - 1]);
    }

    return iois;
  }

  /**
   * Calculate confidence based on IOI variance around the median.
   * Lower variance = higher confidence.
   */
  private calculateConfidence(iois: Ms[], median: Ms): Confidence {
    if (iois.length < 2) return 0;

    // Calculate variance
    const squaredDiffs = iois.map((ioi) => Math.pow(ioi - median, 2));
    const variance =
      squaredDiffs.reduce((sum, d) => sum + d, 0) / squaredDiffs.length;

    // Standard deviation as percentage of median
    const stdDev = Math.sqrt(variance);
    const relativeStdDev = stdDev / median;

    // Convert to confidence: low relative std dev = high confidence
    // 0% deviation = 1.0 confidence, 50% deviation = ~0 confidence
    const confidence = Math.max(0, Math.min(1, 1 - relativeStdDev * 2));

    return confidence;
  }

  /**
   * Find the nearest beat time to align the grid.
   */
  private findNearestBeatTime(currentTime: Ms, _periodMs: Ms): Ms {
    // Find the most recent onset as anchor
    // In future, could use periodMs to quantize to nearest beat grid position
    const sortedOnsets = [...this.onsetTimes].sort((a, b) => b - a);
    if (sortedOnsets.length === 0) {
      return currentTime;
    }

    const recentOnset = sortedOnsets[0];

    // Align to this onset
    return recentOnset;
  }

  /**
   * Synchronize beat grid if phase drift is too large.
   */
  private syncBeatGrid(currentTime: Ms): void {
    if (!this.tempoState) return;

    const timeSinceLastBeat = currentTime - this.tempoState.lastBeatTime;
    const beatsSinceLastBeat = timeSinceLastBeat / this.tempoState.periodMs;

    // If we've passed at least one beat, update the grid
    if (beatsSinceLastBeat >= 1) {
      const wholeBeatsPassed = Math.floor(beatsSinceLastBeat);
      this.tempoState.lastBeatTime +=
        wholeBeatsPassed * this.tempoState.periodMs;
      this.tempoState.beatCount += wholeBeatsPassed;
    }
  }

  /**
   * Calculate the current beat state.
   */
  private calculateBeatState(currentTime: Ms): BeatState | null {
    if (!this.tempoState) {
      return null;
    }

    // Sync beat grid first
    this.syncBeatGrid(currentTime);

    const { periodMs, lastBeatTime, beatCount, confidence } = this.tempoState;

    // Calculate phase within current beat (0-1)
    const timeSinceLastBeat = currentTime - lastBeatTime;
    const phase = Math.max(0, Math.min(1, timeSinceLastBeat / periodMs));

    // Calculate tempo in BPM
    const tempo = 60000 / periodMs;

    // Calculate beat position in bar (1-indexed)
    const beatInBar =
      ((beatCount - 1) % this.config.beatsPerBar) + 1;
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
