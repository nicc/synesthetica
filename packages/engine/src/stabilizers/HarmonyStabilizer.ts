/**
 * Harmony Stabilizer
 *
 * Analyzes harmonic context from chord data:
 * - Tension (always available, key-agnostic interval dissonance)
 * - Functional analysis (when prescribedKey is set, Roman numeral labelling)
 *
 * Replaces the former HarmonicProgressionStabilizer with broader scope:
 * tension + functional harmony in one stabilizer.
 *
 * ## Functional Analysis
 *
 * When a key is prescribed (tonic + mode), each detected chord is mapped to
 * a scale degree and Roman numeral. The stabilizer uses tonal.js for diatonic
 * chord tables across all seven church modes plus harmonic/melodic minor.
 *
 * Non-diatonic chords are flagged as borrowed. Secondary dominant detection
 * is deferred (see CLAUDE.md: "assume breaking changes are fine").
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
  FunctionalChord,
  PrescribedKey,
  ModeId,
  ChordQuality,
} from "@synesthetica/contracts";
import { createEmptyMusicalFrame } from "@synesthetica/contracts";
import { Mode, Key } from "tonal";

/**
 * Function signature for dissonance algorithms.
 * Takes a chord and returns a tension value from 0–1.
 */
export type DissonanceAlgorithm = (chord: MusicalChord) => number;

/**
 * Configuration for the HarmonyStabilizer.
 */
export interface HarmonyStabilizerConfig {
  partId: PartId;

  /** Custom dissonance algorithm. Falls back to interval-based if omitted. */
  dissonanceAlgorithm?: DissonanceAlgorithm;

  /** How long to keep functional chords in progression history (ms). Default: 60000. */
  progressionWindowMs?: Ms;
}

// ============================================================================
// Default Dissonance Algorithm (Tier 1: Key-Agnostic)
// ============================================================================

/**
 * Interval dissonance scores.
 * Based on psychoacoustic roughness and music theory conventions.
 */
const INTERVAL_DISSONANCE: Record<number, number> = {
  0: 0,      // Unison
  1: 0.3,    // Minor 2nd
  2: 0.1,    // Major 2nd
  3: 0.05,   // Minor 3rd
  4: 0.05,   // Major 3rd
  5: 0.1,    // Perfect 4th
  6: 0.4,    // Tritone
  7: 0,      // Perfect 5th
  8: 0.15,   // Minor 6th
  9: 0.1,    // Major 6th
  10: 0.15,  // Minor 7th
  11: 0.3,   // Major 7th
};

/**
 * Quality-based tension modifiers.
 */
const QUALITY_TENSION: Record<string, number> = {
  maj: 0,
  min: 0.05,
  dim: 0.2,
  aug: 0.15,
  sus2: 0.1,
  sus4: 0.1,
  dom7: 0.15,
  maj7: 0.1,
  min7: 0.1,
  hdim7: 0.25,
  dim7: 0.3,
  unknown: 0.1,
};

/**
 * Default interval-based dissonance algorithm.
 */
export function defaultDissonanceAlgorithm(chord: MusicalChord): number {
  if (chord.voicing.length < 2) return 0;

  const intervals = new Set<number>();
  const pitches = chord.voicing;
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      const semitones =
        Math.abs(pitchToMidi(pitches[i]) - pitchToMidi(pitches[j])) % 12;
      intervals.add(semitones);
    }
  }

  let intervalTension = 0;
  for (const interval of intervals) {
    intervalTension += INTERVAL_DISSONANCE[interval] ?? 0;
  }

  const qualityTension = QUALITY_TENSION[chord.quality] ?? 0;
  return Math.min(intervalTension + qualityTension, 1.0);
}

function pitchToMidi(pitch: Pitch): number {
  return pitch.octave * 12 + pitch.pc;
}

// ============================================================================
// Functional Harmony Helpers
// ============================================================================

/** Pitch class names (sharps) for tonal.js interop */
const PC_NAMES = [
  "C", "Db", "D", "Eb", "E", "F",
  "Gb", "G", "Ab", "A", "Bb", "B",
];

/** Roman numeral labels by scale degree (0-indexed) */
const DEGREE_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * Diatonic triad table for a given tonic + mode.
 * Returns an array of 7 entries: { root (PitchClass), quality, roman }.
 */
interface DiatonicEntry {
  rootPc: number;
  triadName: string;
  quality: "maj" | "min" | "dim" | "aug";
}

function buildDiatonicTable(
  key: PrescribedKey,
): DiatonicEntry[] {
  const tonicName = PC_NAMES[key.root];

  if (key.mode === "harmonic-minor" || key.mode === "melodic-minor") {
    return buildMinorVariantTable(tonicName, key.mode);
  }

  // Church modes: use tonal's Mode module
  const triads = Mode.triads(key.mode, tonicName);
  return triads.map((triadName) => {
    const rootName = triadName.replace(/(m|dim|aug|M)?$/, "").replace(/maj$/, "");
    const rootPc = pcFromName(rootName);
    const quality = qualityFromTriadSuffix(triadName, rootName);
    return { rootPc, triadName, quality };
  });
}

function buildMinorVariantTable(
  tonicName: string,
  variant: "harmonic-minor" | "melodic-minor",
): DiatonicEntry[] {
  const minKey = Key.minorKey(tonicName);
  const sub = variant === "harmonic-minor" ? minKey.harmonic : minKey.melodic;
  const triads = sub.triads;

  return triads.map((triadName) => {
    const rootName = triadName.replace(/(m|dim|aug|M)?$/, "").replace(/maj$/, "");
    const rootPc = pcFromName(rootName);
    const quality = qualityFromTriadSuffix(triadName, rootName);
    return { rootPc, triadName, quality };
  });
}

/** Extract pitch class number from a tonal note name */
function pcFromName(name: string): number {
  const base: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  };
  const letter = name.charAt(0).toUpperCase();
  let pc = base[letter] ?? 0;
  for (let i = 1; i < name.length; i++) {
    if (name[i] === "#" || name[i] === "♯") pc++;
    else if (name[i] === "b" || name[i] === "♭") pc--;
  }
  return ((pc % 12) + 12) % 12;
}

/** Determine triad quality from tonal's triad name suffix */
function qualityFromTriadSuffix(
  triadName: string,
  rootName: string,
): "maj" | "min" | "dim" | "aug" {
  const suffix = triadName.slice(rootName.length);
  if (suffix === "dim") return "dim";
  if (suffix === "aug") return "aug";
  if (suffix === "m") return "min";
  return "maj"; // no suffix = major
}

/**
 * Format a Roman numeral string from degree, chord quality, and diatonic status.
 *
 * Convention:
 * - Uppercase for major/augmented/dominant
 * - Lowercase for minor/diminished
 * - ° suffix for diminished
 * - + suffix for augmented
 * - 7 suffix for seventh chords
 * - ♭/♯ prefix for non-diatonic roots
 */
function formatRoman(
  degree: number,
  chordQuality: ChordQuality,
  borrowed: boolean,
  chromaticOffset: number,
): string {
  const numeral = DEGREE_NUMERALS[degree - 1];
  let prefix = "";

  if (borrowed) {
    if (chromaticOffset < 0) prefix = "♭";
    else if (chromaticOffset > 0) prefix = "♯";
  }

  // Case: lowercase for minor/dim, uppercase for major/aug/dom/sus
  const isMinorish =
    chordQuality === "min" ||
    chordQuality === "min7" ||
    chordQuality === "dim" ||
    chordQuality === "dim7" ||
    chordQuality === "hdim7";

  let base = isMinorish ? numeral.toLowerCase() : numeral;

  // Quality suffix
  let suffix = "";
  if (chordQuality === "dim") suffix = "°";
  else if (chordQuality === "dim7") suffix = "°7";
  else if (chordQuality === "hdim7") suffix = "ø7";
  else if (chordQuality === "aug") suffix = "+";
  else if (chordQuality === "dom7") suffix = "7";
  else if (chordQuality === "maj7") suffix = "Δ7";
  else if (chordQuality === "min7") suffix = "7";
  else if (chordQuality === "sus2") {
    base = numeral; // uppercase
    suffix = "sus2";
  } else if (chordQuality === "sus4") {
    base = numeral;
    suffix = "sus4";
  }

  return prefix + base + suffix;
}

/**
 * Analyze a detected chord in functional terms relative to a key.
 */
function analyzeChord(
  chord: MusicalChord,
  key: PrescribedKey,
  diatonicTable: DiatonicEntry[],
): FunctionalChord {
  const rootPc = chord.root;

  // Find the closest scale degree
  let degree = -1;
  let borrowed = true;
  let chromaticOffset = 0;

  for (let i = 0; i < diatonicTable.length; i++) {
    if (diatonicTable[i].rootPc === rootPc) {
      degree = i + 1;
      borrowed = false;
      break;
    }
  }

  if (degree === -1) {
    // Non-diatonic root — find nearest degree by semitone distance from tonic
    const interval = ((rootPc - key.root) % 12 + 12) % 12;
    // Map chromatic intervals to nearest scale degree
    const { deg, offset } = chromaticToDegree(interval, key.mode);
    degree = deg;
    chromaticOffset = offset;
    borrowed = true;
  }

  const roman = formatRoman(degree, chord.quality, borrowed, chromaticOffset);

  return {
    degree,
    roman,
    quality: chord.quality,
    borrowed,
    chordId: chord.id,
    onset: chord.onset,
  };
}

/**
 * Map a chromatic interval (0–11 semitones from tonic) to the nearest
 * scale degree + offset (flat/sharp).
 */
function chromaticToDegree(
  semitones: number,
  mode: ModeId,
): { deg: number; offset: number } {
  const scaleIntervals = getScaleIntervals(mode);

  // Check exact match first
  for (let i = 0; i < scaleIntervals.length; i++) {
    if (scaleIntervals[i] === semitones) {
      return { deg: i + 1, offset: 0 };
    }
  }

  // Find nearest — prefer flat interpretation (♭III over ♯II)
  for (let i = 0; i < scaleIntervals.length; i++) {
    if (scaleIntervals[i] === semitones + 1) {
      return { deg: i + 1, offset: -1 };
    }
  }
  for (let i = 0; i < scaleIntervals.length; i++) {
    if (scaleIntervals[i] === semitones - 1) {
      return { deg: i + 1, offset: 1 };
    }
  }

  // Fallback (shouldn't happen with 7 scale degrees covering 12 semitones)
  return { deg: 1, offset: 0 };
}

/** Semitone intervals from tonic for each mode */
function getScaleIntervals(mode: ModeId): number[] {
  const intervals: Record<ModeId, number[]> = {
    "ionian":         [0, 2, 4, 5, 7, 9, 11],
    "dorian":         [0, 2, 3, 5, 7, 9, 10],
    "phrygian":       [0, 1, 3, 5, 7, 8, 10],
    "lydian":         [0, 2, 4, 6, 7, 9, 11],
    "mixolydian":     [0, 2, 4, 5, 7, 9, 10],
    "aeolian":        [0, 2, 3, 5, 7, 8, 10],
    "locrian":        [0, 1, 3, 5, 6, 8, 10],
    "harmonic-minor": [0, 2, 3, 5, 7, 8, 11],
    "melodic-minor":  [0, 2, 3, 5, 7, 9, 11],
  };
  return intervals[mode];
}

// ============================================================================
// Stabilizer Implementation
// ============================================================================

const DEFAULT_PROGRESSION_WINDOW_MS = 60_000;

/**
 * HarmonyStabilizer: harmonic tension + functional analysis.
 *
 * Depends on ChordDetectionStabilizer upstream.
 */
export class HarmonyStabilizer implements IMusicalStabilizer {
  readonly id = "harmony";
  readonly dependencies = ["chord-detection"];

  private config: Required<HarmonyStabilizerConfig>;
  private progression: FunctionalChord[] = [];

  constructor(config: HarmonyStabilizerConfig) {
    this.config = {
      partId: config.partId,
      dissonanceAlgorithm:
        config.dissonanceAlgorithm ?? defaultDissonanceAlgorithm,
      progressionWindowMs:
        config.progressionWindowMs ?? DEFAULT_PROGRESSION_WINDOW_MS,
    };
  }

  init(): void {
    // No initialization needed
  }

  dispose(): void {
    this.progression = [];
  }

  reset(): void {
    this.progression = [];
  }

  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame {
    if (!upstream) {
      return this.createEmptyFrame(raw.t);
    }

    const tension = this.computeTension(upstream.chords);
    const key = upstream.prescribedKey;

    let currentFunction: FunctionalChord | null = null;
    let keyAware = false;

    if (key) {
      keyAware = true;
      const diatonicTable = buildDiatonicTable(key);
      const activeChord =
        upstream.chords.find((c) => c.phase === "active") ?? upstream.chords[0];

      if (activeChord) {
        currentFunction = analyzeChord(activeChord, key, diatonicTable);

        // Add to progression if new (different chordId from last entry)
        const lastInProgression =
          this.progression[this.progression.length - 1];
        if (
          !lastInProgression ||
          lastInProgression.chordId !== currentFunction.chordId
        ) {
          this.progression.push(currentFunction);
        }

        // Prune old entries
        this.pruneProgression(raw.t);
      }
    }

    const harmonicContext: HarmonicContext = {
      tension,
      keyAware,
      currentFunction,
      functionalProgression: key ? [...this.progression] : [],
    };

    return {
      ...upstream,
      harmonicContext,
    };
  }

  private computeTension(chords: MusicalChord[]): number {
    if (chords.length === 0) return 0;
    const activeChord =
      chords.find((c) => c.phase === "active") ?? chords[0];
    return this.config.dissonanceAlgorithm(activeChord);
  }

  private pruneProgression(t: Ms): void {
    const cutoff = t - this.config.progressionWindowMs;
    while (
      this.progression.length > 0 &&
      this.progression[0].onset < cutoff
    ) {
      this.progression.shift();
    }
  }

  private createEmptyFrame(t: Ms): MusicalFrame {
    return {
      ...createEmptyMusicalFrame(t, this.config.partId),
      progression: [],
    };
  }
}
