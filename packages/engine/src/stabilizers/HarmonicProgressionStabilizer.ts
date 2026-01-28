/**
 * Harmonic Progression Stabilizer
 *
 * Analyzes harmonic context from chord data, computing tension and
 * tracking progression patterns.
 *
 * ## Tension Tiers
 *
 * **Tier 1 (key-agnostic):** Interval-based dissonance
 * - Always available
 * - Computes tension from interval content of current chord
 * - Tritones, minor 2nds, major 7ths = high tension
 * - Extensions and alterations = moderate tension
 *
 * **Tier 2 (key-aware):** Functional tension (future)
 * - Requires KeyDetectionStabilizer upstream
 * - V→I resolution, dominant function, etc.
 * - Falls back to tier 1 when key unavailable
 *
 * ## Dissonance Algorithm
 *
 * The algorithm is designed to be swappable. Pass a custom `dissonanceAlgorithm`
 * in config to override the default interval-based calculation.
 *
 * @see IMusicalStabilizer for the stabilizer contract
 */

import type {
  IMusicalStabilizer,
  RawInputFrame,
  MusicalFrame,
  MusicalChord,
  Pitch,
  Ms,
  PartId,
  HarmonicContext,
} from "@synesthetica/contracts";

/**
 * Function signature for dissonance algorithms.
 * Takes a chord and returns a tension value from 0-1.
 */
export type DissonanceAlgorithm = (chord: MusicalChord) => number;

/**
 * Configuration for the HarmonicProgressionStabilizer.
 */
export interface HarmonicProgressionConfig {
  /**
   * Part ID this stabilizer is tracking.
   */
  partId: PartId;

  /**
   * Custom dissonance algorithm. If not provided, uses default interval-based.
   */
  dissonanceAlgorithm?: DissonanceAlgorithm;
}

// ============================================================================
// Default Dissonance Algorithm (Tier 1: Key-Agnostic)
// ============================================================================

/**
 * Interval dissonance scores.
 * Based on psychoacoustic roughness and music theory conventions.
 *
 * Values are additive - a chord with multiple dissonant intervals
 * will have higher total tension.
 */
const INTERVAL_DISSONANCE: Record<number, number> = {
  0: 0,      // Unison - consonant
  1: 0.3,    // Minor 2nd - highly dissonant
  2: 0.1,    // Major 2nd - mild tension (9th)
  3: 0.05,   // Minor 3rd - consonant
  4: 0.05,   // Major 3rd - consonant
  5: 0.1,    // Perfect 4th - context-dependent, slight tension
  6: 0.4,    // Tritone - maximum dissonance
  7: 0,      // Perfect 5th - most consonant
  8: 0.15,   // Minor 6th / Aug 5th - mild tension
  9: 0.1,    // Major 6th / 13th - mild tension
  10: 0.15,  // Minor 7th - moderate tension (dominant 7th)
  11: 0.3,   // Major 7th - high tension
};

/**
 * Quality-based tension modifiers.
 * Some chord qualities inherently carry more tension.
 */
const QUALITY_TENSION: Record<string, number> = {
  maj: 0,
  min: 0.05,
  dim: 0.2,    // Diminished is tense
  aug: 0.15,   // Augmented is unstable
  sus2: 0.1,   // Suspended seeks resolution
  sus4: 0.1,
  dom7: 0.15,  // Dominant wants to resolve
  maj7: 0.1,
  min7: 0.1,
  hdim7: 0.25, // Half-diminished is very tense
  dim7: 0.3,   // Fully diminished is maximum tension
  unknown: 0.1,
};

/**
 * Default interval-based dissonance algorithm.
 *
 * Computes tension by:
 * 1. Summing interval dissonance for all unique intervals in the chord
 * 2. Adding quality-based modifier
 * 3. Normalizing to 0-1 range
 */
export function defaultDissonanceAlgorithm(chord: MusicalChord): number {
  if (chord.voicing.length < 2) {
    return 0; // Single notes have no harmonic tension
  }

  // Collect all unique intervals (semitones) between chord tones
  const intervals = new Set<number>();
  const pitches = chord.voicing;

  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      const semitones = Math.abs(pitchToMidi(pitches[i]) - pitchToMidi(pitches[j])) % 12;
      intervals.add(semitones);
    }
  }

  // Sum interval dissonance
  let intervalTension = 0;
  for (const interval of intervals) {
    intervalTension += INTERVAL_DISSONANCE[interval] ?? 0;
  }

  // Add quality modifier
  const qualityTension = QUALITY_TENSION[chord.quality] ?? 0;

  // Combine and normalize
  // Max theoretical tension: ~1.5 (multiple tritones + dim7 quality)
  // We clamp to 1.0
  const rawTension = intervalTension + qualityTension;
  return Math.min(rawTension, 1.0);
}

function pitchToMidi(pitch: Pitch): number {
  return pitch.octave * 12 + pitch.pc;
}

// ============================================================================
// Stabilizer Implementation
// ============================================================================

/**
 * HarmonicProgressionStabilizer: Computes harmonic context from chord data.
 *
 * Depends on ChordDetectionStabilizer upstream.
 */
export class HarmonicProgressionStabilizer implements IMusicalStabilizer {
  readonly id = "harmonic-progression";
  readonly dependencies = ["chord-detection"];

  private config: Required<HarmonicProgressionConfig>;

  constructor(config: HarmonicProgressionConfig) {
    this.config = {
      partId: config.partId,
      dissonanceAlgorithm: config.dissonanceAlgorithm ?? defaultDissonanceAlgorithm,
    };
  }

  init(): void {
    // No state to initialize - this stabilizer is mostly stateless
    // (tension is computed per-frame from current chord)
  }

  dispose(): void {
    // Nothing to clean up
  }

  reset(): void {
    // Nothing to reset
  }

  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame {
    if (!upstream) {
      return this.createEmptyFrame(raw.t);
    }

    // Compute tension from current chord(s)
    const tension = this.computeTension(upstream.chords);

    // Build harmonic context
    const harmonicContext: HarmonicContext = {
      tension,
      keyAware: false, // Tier 1 only for now
      detectedKey: null,
    };

    // Pass through upstream frame with added harmonic context
    return {
      ...upstream,
      harmonicContext,
    };
  }

  /**
   * Compute tension from active chords.
   * Uses the primary (most recently onset) active chord.
   */
  private computeTension(chords: MusicalChord[]): number {
    if (chords.length === 0) {
      return 0; // No chord = no harmonic tension
    }

    // Use the active chord (prefer "active" phase over "decaying")
    const activeChord = chords.find((c) => c.phase === "active") ?? chords[0];

    return this.config.dissonanceAlgorithm(activeChord);
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
      dynamics: { level: 0, trend: "stable" },
      prescribedTempo: null,
      prescribedMeter: null,
      progression: [],
    };
  }
}
