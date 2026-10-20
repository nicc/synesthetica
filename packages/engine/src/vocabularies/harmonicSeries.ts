/**
 * Harmonic series model for the overtone overlay (RFC 012).
 *
 * Models the harmonic series with a generic rolloff. It does not model
 * the piano or any instrument: MIDI carries no timbre, so these levels
 * are theoretical, not measured. A measured source would arrive from
 * an upstream stabilizer in the same { n, level } shape.
 *
 * Pure functions; no state.
 */

import type { PitchClass } from "@synesthetica/contracts";

/** Highest harmonic number modelled. 9 keeps P5, M3, m7 and M2; the 7th
 *  partial (dominant seventh) must survive the default. */
export const PARTIAL_CAP = 9;

/** Default rolloff exponent. 1.0 ≈ sawtooth (−6 dB/octave). At 2.0 the
 *  7th partial falls to ≈ 0.02 and the dominant-seventh reading is lost. */
export const PARTIAL_ROLLOFF_DEFAULT = 1.0;

/** One modelled partial before pitch and colour are attached. */
export interface PartialLevel {
  /** Lowest harmonic number in this octave-folded group */
  n: number;
  /** Summed level of the group, 0..1 */
  level: number;
}

/** Strip factors of two: partials sharing an odd part are octaves of
 *  each other and land on the same pitch class. */
function oddPart(n: number): number {
  let m = n;
  while (m % 2 === 0) m /= 2;
  return m;
}

/**
 * Partials 2, 4, 8 sit on the fundamental's own pitch class in the
 * octave-agnostic lenses and are not drawn (RFC 012 decision 9).
 * Remove this rule's single call site to draw them as overtones.
 */
function sharesFundamentalPitchClass(n: number): boolean {
  return oddPart(n) === 1;
}

/**
 * Levels for one note's overtones, independent of root.
 *
 * level(group) = gain · Σ m^(−rolloff) over m ≤ cap in the group,
 * clamped to 1. Returns [] when gain ≤ 0 (overlay off).
 */
export function modelPartialLevels(
  gain: number,
  rolloff: number,
  cap: number = PARTIAL_CAP,
): PartialLevel[] {
  if (gain <= 0) return [];
  const sums = new Map<number, PartialLevel>();
  for (let n = 2; n <= cap; n++) {
    if (sharesFundamentalPitchClass(n)) continue;
    const key = oddPart(n);
    const prev = sums.get(key);
    const level = gain * n ** -rolloff;
    sums.set(key, prev ? { n: prev.n, level: prev.level + level } : { n, level });
  }
  return [...sums.values()].map((p) => ({ n: p.n, level: Math.min(p.level, 1) }));
}

/**
 * Real pitch of partial n above a root, as nearest pitch class plus a
 * cents offset (−50..50). Not snapped: a partial just flat of C gets
 * pc 0 with negative cents rather than landing on B.
 */
export function partialPitch(
  rootPc: PitchClass,
  n: number,
): { pc: PitchClass; cents: number } {
  const semitones = rootPc + 12 * Math.log2(n);
  const nearest = Math.round(semitones);
  return {
    pc: (((nearest % 12) + 12) % 12) as PitchClass,
    cents: (semitones - nearest) * 100,
  };
}
