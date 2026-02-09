/**
 * Visual Vocabulary Utilities
 *
 * Helper functions for building visual vocabulary data structures.
 * These are extracted from MusicalVisualVocabulary for reuse and testing.
 */

import type {
  MusicalChord,
  ChordShapeGeometry,
  ChordShapeElement,
  MarginStyle,
  RadiusTier,
  ChordQuality,
  PitchClass,
  PitchHueInvariant,
  ColorHSVA,
} from "@synesthetica/contracts";

import {
  pcToHue,
  octaveToBrightness,
  RADIUS_BY_TIER,
  INTERVAL_ANGLES,
  INTERVAL_LABELS,
} from "@synesthetica/contracts";

/**
 * Builds chord shape geometry from a MusicalChord.
 * Invariant I18: This algorithm is fixed; grammars cannot compute shapes.
 *
 * @param chord - The musical chord to build a shape for
 * @param invariant - Pitch-hue invariant configuration
 * @returns Complete chord shape geometry with per-element colors
 */
export function buildChordShape(
  chord: MusicalChord,
  invariant: PitchHueInvariant
): ChordShapeGeometry {
  const elements: ChordShapeElement[] = [];

  // Get intervals from voicing relative to root
  const intervals = getIntervalsFromVoicing(chord);

  // Compute average octave for brightness (or use default if no voicing)
  const avgOctave =
    chord.voicing.length > 0
      ? chord.voicing.reduce((sum, p) => sum + p.octave, 0) /
        chord.voicing.length
      : 4;
  const brightness = octaveToBrightness(avgOctave);

  const expectedSemitones = getExpectedSemitones(chord.quality);

  for (const semitones of intervals) {
    const normalizedSemitones = semitones % 12;
    const angle = INTERVAL_ANGLES[normalizedSemitones];
    const tier = getTierForInterval(normalizedSemitones, chord.quality);
    const radius = RADIUS_BY_TIER[tier];
    const label = INTERVAL_LABELS[normalizedSemitones];

    // Compute color from pitch class of this chord tone
    const elementPc = ((chord.root + normalizedSemitones) % 12) as PitchClass;
    const hue = pcToHue(elementPc, invariant);
    const color: ColorHSVA = {
      h: hue,
      s: 0.8,
      v: brightness,
      a: 1,
    };

    // Chord tones get wedge arms; extra notes get chromatic lines
    const isChordTone =
      expectedSemitones === null ||
      expectedSemitones.includes(normalizedSemitones);

    elements.push({
      angle,
      radius,
      tier,
      style: isChordTone ? "wedge" : "line",
      interval: label,
      color,
    });
  }

  const margin = getMarginStyle(chord.quality);

  return {
    elements,
    margin,
    rootAngle: 0,
  };
}

/**
 * Extracts interval semitones from chord voicing.
 */
function getIntervalsFromVoicing(chord: MusicalChord): number[] {
  const intervals = new Set<number>();

  for (const pitch of chord.voicing) {
    const semitones = (pitch.pc - chord.root + 12) % 12;
    intervals.add(semitones);
  }

  return Array.from(intervals).sort((a, b) => a - b);
}

/**
 * Determines radius tier based on interval position in chord structure.
 * Context-aware: ♭5 is triadic in diminished chords but extension in dom7♭5.
 */
function getTierForInterval(
  semitones: number,
  quality: ChordQuality
): RadiusTier {
  // Core triadic tones: root (0), 3rds (3,4), 5ths (7,8)
  if ([0, 3, 4, 7, 8].includes(semitones)) {
    return "triadic";
  }

  // ♭5 is triadic when it's THE fifth (diminished chords), not when it's ♯11
  if (
    semitones === 6 &&
    (quality === "dim" || quality === "dim7" || quality === "hdim7")
  ) {
    return "triadic";
  }

  // 7ths: ♭7 (10), 7 (11)
  if (semitones === 10 || semitones === 11) {
    return "seventh";
  }

  // Everything else is extension: 9ths (1,2), 11ths (5,6), 13ths (9)
  return "extension";
}

/**
 * Returns the expected interval semitones for a chord quality.
 * Notes in the voicing that don't match these are chromatic additions.
 * Returns null for unknown qualities (treat all as chord tones).
 */
function getExpectedSemitones(quality: ChordQuality): number[] | null {
  const map: Partial<Record<ChordQuality, number[]>> = {
    maj: [0, 4, 7],
    min: [0, 3, 7],
    dim: [0, 3, 6],
    aug: [0, 4, 8],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10],
    dom7: [0, 4, 7, 10],
    hdim7: [0, 3, 6, 10],
    dim7: [0, 3, 6, 9],
  };
  return map[quality] ?? null;
}

/**
 * Maps chord quality to margin style.
 */
function getMarginStyle(quality: ChordQuality): MarginStyle {
  switch (quality) {
    case "maj":
    case "maj7":
    case "dom7":
      return "straight";
    case "min":
    case "min7":
      return "wavy";
    case "dim":
    case "dim7":
    case "hdim7":
      return "concave";
    case "aug":
      return "convex";
    case "sus2":
      return "dash-short";
    case "sus4":
      return "dash-long";
    default:
      return "straight"; // Default for unknown
  }
}
