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
  PitchClass,
  HarmonicContext,
  FunctionalChord,
  FunctionalEdge,
  FunctionalRelationType,
  PrescribedKey,
  ModeId,
  ChordQuality,
  ChordInterpretationMode,
} from "@synesthetica/contracts";
import {
  createEmptyMusicalFrame,
  MODE_SCALE_INTERVALS,
} from "@synesthetica/contracts";
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

  const qualityTension = QUALITY_TENSION[chord.harmonic.quality] ?? 0;
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
  mode: ChordInterpretationMode,
): FunctionalChord {
  // Functional analysis follows the selected interpretation mode so
  // Roman numerals agree with the chord shape's root. In harmonic mode
  // an Eb/G inversion reads as "I" (Eb is the tonic of Eb major); in
  // bass-led mode the same voicing reads from G as root → different
  // degree and quality.
  const interp = mode === "bass-led" ? chord.bassLed : chord.harmonic;
  const rootPc = interp.root;
  const quality = interp.quality;

  // Find the closest scale degree
  let degree = -1;
  let borrowed = true;
  let chromaticOffset = 0;

  for (let i = 0; i < diatonicTable.length; i++) {
    if (diatonicTable[i].rootPc === rootPc) {
      degree = i + 1;
      // Root is diatonic, but the chord may still be borrowed if its
      // quality differs from the expected diatonic quality at this
      // degree. Gm at V in C major is borrowed (G is diatonic, but
      // the diatonic V is G major). The ring is determined by this
      // flag; the angular position is the slot's diatonic angle.
      borrowed = !qualityMatchesDiatonic(quality, diatonicTable[i].quality, degree);
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

  const roman = formatRoman(degree, quality, borrowed, chromaticOffset);

  // Inversion info is intentionally NOT encoded in the roman string
  // (would make the numeral glyph too visually noisy). It lives on
  // MusicalChord.bass / isInverted for the chord label to render.

  return {
    degree,
    roman,
    quality,
    rootPc,
    borrowed,
    chordId: chord.id,
    onset: chord.onset,
    releaseTime: null,
  };
}

/**
 * Determine whether the chord's quality matches the expected diatonic
 * quality at this scale degree. The chord is non-diatonic (borrowed)
 * if the quality differs — even when the root is in the scale.
 *
 * Triadic core matches (e.g. maj7 ↔ maj, min7 ↔ min, hdim7 ↔ dim).
 * Special cases:
 * - dom7 at degree 5 (V) is treated as diatonic in major-quality
 *   contexts — V7 is the canonical cadential dominant in tonal music.
 * - sus2/sus4 at any diatonic root are treated as diatonic; suspensions
 *   don't have a triadic quality to disagree with.
 */
function qualityMatchesDiatonic(
  chordQuality: ChordQuality,
  diatonicQuality: "maj" | "min" | "dim" | "aug",
  degree: number,
): boolean {
  // Suspensions accepted at any diatonic root.
  if (chordQuality === "sus2" || chordQuality === "sus4") return true;

  const triadCore = extractTriadCore(chordQuality);
  if (triadCore !== null && triadCore === diatonicQuality) return true;

  // V7 (dom7 at the V slot) accepted as diatonic in major-quality slots.
  if (chordQuality === "dom7" && degree === 5 && diatonicQuality === "maj") {
    return true;
  }

  return false;
}

function extractTriadCore(
  quality: ChordQuality,
): "maj" | "min" | "dim" | "aug" | null {
  switch (quality) {
    case "maj":
    case "maj7":
      return "maj";
    case "min":
    case "min7":
      return "min";
    case "dim":
    case "dim7":
    case "hdim7":
      return "dim";
    case "aug":
      return "aug";
    case "dom7":
      // dom7 is only diatonic at V (handled by the explicit special
      // case in qualityMatchesDiatonic). Returning null here ensures
      // dom7 at non-V degrees is correctly flagged borrowed — e.g.
      // C7 in C major is V/IV (borrowed), not diatonic at I.
      return null;
    default:
      return null;
  }
}

/**
 * Map a chromatic interval (0–11 semitones from tonic) to the nearest
 * scale degree + offset (flat/sharp).
 */
function chromaticToDegree(
  semitones: number,
  mode: ModeId,
): { deg: number; offset: number } {
  const scaleIntervals = MODE_SCALE_INTERVALS[mode];

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

// ============================================================================
// Functional Edge Emission (SPEC 011)
// ============================================================================

interface RelationshipEntry {
  targetDegree: number;
  weight: number;
  type: FunctionalRelationType;
}

/**
 * Modal interchange / subdominant borrowing table for major (Ionian).
 * Keyed by the chord's Roman numeral. Weights are music-theoretic
 * judgement; iterate with real progressions to refine.
 */
const MODAL_INTERCHANGE_MAJOR: Record<string, RelationshipEntry[]> = {
  "♭VII": [{ targetDegree: 4, weight: 0.85, type: "subdominant-borrowing" }],
  "♭III": [{ targetDegree: 6, weight: 0.65, type: "modal-interchange" }],
  "♭VI": [
    { targetDegree: 2, weight: 0.55, type: "subdominant-borrowing" },
    { targetDegree: 4, weight: 0.50, type: "subdominant-borrowing" },
  ],
  "iv": [{ targetDegree: 1, weight: 0.75, type: "modal-interchange" }],
  "♭II": [{ targetDegree: 5, weight: 0.80, type: "modal-interchange" }],
};

/** Conventional weights for V/X → X resolutions, keyed by target degree. */
const SECONDARY_DOMINANT_WEIGHTS: Record<number, number> = {
  2: 0.88, // V/ii → ii
  3: 0.80, // V/iii → iii
  4: 0.82, // V/IV → IV
  5: 0.92, // V/V → V (strongest secondary dominant)
  6: 0.88, // V/vi → vi
};

/**
 * Compute the functional edges originating from a chord. Only borrowed
 * chords emit edges — diatonic chords have implied resolutions (e.g.
 * V → I) that the design intentionally doesn't render.
 *
 * Detection has two paths:
 *   1. Modal interchange table — keyed by Roman numeral. Used for the
 *      well-known borrowed chords (♭VII, ♭III, ♭VI, iv, ♭II in major).
 *   2. Secondary dominant rule — fires for major-quality (or dom7)
 *      borrowed chords when their root is a perfect fifth above a
 *      diatonic root. Catches V/V, V/ii, V/vi, V/IV, V/iii, V/IV (C7),
 *      and the recursive case V/V/V (A maj → D, where D is the V/V
 *      root — diatonic root, but D maj is itself borrowed).
 *
 * Modal interchange takes precedence; the secondary dominant rule
 * only fires when no table entry matches. This avoids spurious
 * "circle of fifths" edges from chords that have a stronger
 * conventional reading (e.g. ♭VII reads as subdominant, not as
 * V of E♭).
 */
function emitFunctionalEdges(
  fc: FunctionalChord,
  key: PrescribedKey,
): FunctionalEdge[] {
  if (!fc.borrowed) return [];

  // 1. Modal interchange table (major key only for v1)
  if (key.mode === "ionian") {
    const entries = MODAL_INTERCHANGE_MAJOR[fc.roman];
    if (entries) {
      return entries.map((entry) =>
        makeEdgeFromEntry(fc.chordId, key, entry.targetDegree, entry.weight, entry.type),
      );
    }
  }

  // 2. Secondary dominant detection
  const isMajorOrDom7 =
    fc.quality === "maj" || fc.quality === "dom7" || fc.quality === "maj7";
  if (isMajorOrDom7) {
    const targetPc = ((fc.rootPc - 7 + 12) % 12) as PitchClass;
    const targetSemiFromTonic = (targetPc - key.root + 12) % 12;
    const targetDegreeIdx =
      MODE_SCALE_INTERVALS[key.mode].indexOf(targetSemiFromTonic);
    if (targetDegreeIdx >= 0) {
      const targetDegree = targetDegreeIdx + 1;
      const weight = SECONDARY_DOMINANT_WEIGHTS[targetDegree] ?? 0.85;
      return [
        {
          sourceChordId: fc.chordId,
          targetDegree,
          targetPc,
          targetDiatonic: true,
          weight,
          type: "secondary-dominant",
        },
      ];
    }
  }

  return [];
}

function makeEdgeFromEntry(
  sourceChordId: string,
  key: PrescribedKey,
  targetDegree: number,
  weight: number,
  type: FunctionalRelationType,
): FunctionalEdge {
  const targetSemiFromTonic =
    MODE_SCALE_INTERVALS[key.mode][targetDegree - 1];
  const targetPc = ((key.root + targetSemiFromTonic) % 12) as PitchClass;
  return {
    sourceChordId,
    targetDegree,
    targetPc,
    targetDiatonic: true,
    weight,
    type,
  };
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
      const activeChord = upstream.chords.find((c) => c.phase === "active");

      if (activeChord) {
        currentFunction = analyzeChord(
          activeChord,
          key,
          diatonicTable,
          upstream.chordInterpretation,
        );
      }

      const last = this.progression[this.progression.length - 1];
      if (currentFunction) {
        if (!last) {
          this.progression.push(currentFunction);
        } else if (last.chordId !== currentFunction.chordId) {
          // Different chord — mark previous as released, push new
          if (last.releaseTime === null) {
            this.progression[this.progression.length - 1] = {
              ...last,
              releaseTime: raw.t,
            };
          }
          this.progression.push(currentFunction);
        } else if (last.releaseTime !== null) {
          // Same chord reactivated after a brief inactive blip (e.g.
          // pitch-decay flicker during continuous play). Clear the
          // release marker so the glyph returns to its held state.
          this.progression[this.progression.length - 1] = {
            ...last,
            releaseTime: null,
          };
        }
        // else: same chord still active with no release — no change
      } else if (last && last.releaseTime === null) {
        // No active chord but the last progression entry hasn't been marked
        // as released yet — set its release time now.
        this.progression[this.progression.length - 1] = {
          ...last,
          releaseTime: raw.t,
        };
      }

      this.pruneProgression(raw.t);
    }

    // Functional edges (SPEC 011): one set per borrowed chord still in
    // the progression. Recomputed each frame from the progression list,
    // so edges automatically expire when a chord falls out of the
    // window via pruneProgression().
    const functionalEdges: FunctionalEdge[] = key
      ? this.progression.flatMap((fc) => emitFunctionalEdges(fc, key))
      : [];

    const harmonicContext: HarmonicContext = {
      tension,
      keyAware,
      currentFunction,
      functionalProgression: key ? [...this.progression] : [],
      functionalEdges,
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
      this.progression[0].releaseTime !== null &&
      this.progression[0].releaseTime < cutoff
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
