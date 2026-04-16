/**
 * Visual Vocabulary Utilities
 *
 * Helper functions for building visual vocabulary data structures.
 * These are extracted from MusicalVisualVocabulary for reuse and testing.
 */

import type {
  ChordInterpretation,
  Pitch,
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
 * Semitones-from-root for the natural extensions: 9 (2 semis),
 * 11 (5 semis), 13 (9 semis). Per SPEC_010, these count as diatonic
 * chord tones (→ wedges) regardless of whether the chord's explicit
 * interval set lists them. Tonal's dominant-13 dictionary entry omits
 * the 11 by jazz convention, but when a player voices it we still
 * want it rendered as an extension wedge, not a chromatic line.
 */
const NATURAL_EXTENSION_SEMITONES = new Set<number>([2, 5, 9]);

/**
 * Context-aware classification of chromatic alterations. SPEC_010 lists
 * ♭9, ♯9, ♯11, ♭13 as chromatic alterations (lines). But some of these
 * semitones can also be legitimate chord tones in the right context —
 * e.g. semitone 6 is ♭5 in a diminished chord (chord tone) OR ♯11 in a
 * dominant chord (alteration). The distinction: an alteration is a
 * chromatic decoration of an already-present natural tone.
 *
 * - ♭9 (1): always an alteration (never a stand-alone chord tone)
 * - ♯9 (3): alteration when chord has M3 (4); else it IS the m3
 * - ♯11 (6): alteration when chord has P5 (7); else it IS the ♭5
 * - ♭13 (8): alteration when chord has P5 (7); else it IS the ♯5
 */
function isAlteration(
  normalizedSemitones: number,
  chordToneSet: number[] | null,
): boolean {
  if (normalizedSemitones === 1) return true;
  if (!chordToneSet) return false;
  if (normalizedSemitones === 3 && chordToneSet.includes(4)) return true;
  if (normalizedSemitones === 6 && chordToneSet.includes(7)) return true;
  if (normalizedSemitones === 8 && chordToneSet.includes(7)) return true;
  return false;
}

/**
 * Builds chord shape geometry from a chord interpretation and its voicing.
 * Invariant I18: This algorithm is fixed; grammars cannot compute shapes.
 *
 * @param interpretation - The chord reading (harmonic or bass-led) to render
 * @param voicing - The actual pitches played (for brightness and interval extraction)
 * @param invariant - Pitch-hue invariant configuration
 * @param bassPc - Optional bass pitch class. When provided AND differs from
 *                 interpretation.root, the matching chord-element gets
 *                 isBass=true so renderers can decorate it (inversion marker).
 * @returns Complete chord shape geometry with per-element colors
 */
export function buildChordShape(
  interpretation: ChordInterpretation,
  voicing: Pitch[],
  invariant: PitchHueInvariant,
  bassPc?: PitchClass | null,
): ChordShapeGeometry {
  const elements: ChordShapeElement[] = [];

  // Get intervals from voicing relative to the interpretation's root
  const intervals = getIntervalsFromVoicing(interpretation.root, voicing);

  // Compute average octave for brightness (or use default if no voicing)
  const avgOctave =
    voicing.length > 0
      ? voicing.reduce((sum, p) => sum + p.octave, 0) / voicing.length
      : 4;
  const brightness = octaveToBrightness(avgOctave);

  // Prefer the chord's actual interval set (from Tonal, covers extensions
  // like 9/11/13). Fall back to the simplified-quality template if the
  // interpretation's chordTones is missing (shouldn't happen in practice).
  const chordToneSet: number[] | null =
    interpretation.chordTones.length > 0
      ? interpretation.chordTones
      : getExpectedSemitones(interpretation.quality);

  for (const semitones of intervals) {
    const normalizedSemitones = semitones % 12;
    const angle = INTERVAL_ANGLES[normalizedSemitones];
    const tier = getTierForInterval(normalizedSemitones, interpretation.quality);
    const radius = RADIUS_BY_TIER[tier];
    const label = INTERVAL_LABELS[normalizedSemitones];

    // Compute color from pitch class of this chord tone
    const elementPc = ((interpretation.root + normalizedSemitones) % 12) as PitchClass;
    const hue = pcToHue(elementPc, invariant);
    const color: ColorHSVA = {
      h: hue,
      s: 0.8,
      v: brightness,
      a: 1,
    };

    // Chord tones get wedge arms; chromatic additions get lines.
    // SPEC_010 distinguishes "diatonic chord tones" (wedges) from
    // "chromatic alterations" (lines). The rule here:
    //   1. Alterations always render as lines (even if Tonal's chord
    //      dictionary lists them as part of the chord, e.g. ♯11 in
    //      Ab13♯11 or ♭9 in Ab7♭9 — SPEC is clear these are lines).
    //   2. Otherwise, a tone is a chord tone (wedge) if it's either in
    //      the chord's explicit interval set OR is a natural extension
    //      (9/11/13) — per SPEC, these are diatonic chord tones even
    //      when the chord's interval list omits them (e.g. Tonal's
    //      Ab13 drops the 11 by jazz convention).
    const altered = isAlteration(normalizedSemitones, chordToneSet);
    const isNaturalExtension = NATURAL_EXTENSION_SEMITONES.has(
      normalizedSemitones,
    );
    const isChordTone =
      !altered &&
      (chordToneSet === null ||
        chordToneSet.includes(normalizedSemitones) ||
        isNaturalExtension);

    // Mark the bass element for inversion-indicator rendering.
    // Only meaningful when the bass differs from the chord root.
    const isBass =
      bassPc !== undefined &&
      bassPc !== null &&
      bassPc !== interpretation.root &&
      elementPc === bassPc;

    elements.push({
      angle,
      radius,
      tier,
      style: isChordTone ? "wedge" : "line",
      interval: label,
      color,
      ...(isBass ? { isBass: true } : {}),
    });
  }

  const margin = getMarginStyle(interpretation.quality);

  return {
    elements,
    margin,
    rootAngle: 0,
  };
}

/** Extract unique semitone intervals in a voicing relative to a root pc. */
function getIntervalsFromVoicing(root: PitchClass, voicing: Pitch[]): number[] {
  const intervals = new Set<number>();
  for (const pitch of voicing) {
    const semitones = (pitch.pc - root + 12) % 12;
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
