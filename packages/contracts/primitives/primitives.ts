/**
 * Core Musical Types
 *
 * Fundamental musical type definitions used across the system.
 */

/**
 * MIDI note number (0-127).
 */
export type MidiNote = number;

/**
 * MIDI velocity (0-127).
 */
export type Velocity = number;

/**
 * Pitch class (0-11, where C=0, C#=1, ..., B=11).
 */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/**
 * Chord quality names.
 *
 * Triads: maj, min, dim, aug, sus2, sus4, 5 (power chord).
 * Sixths: maj6, min6.
 * Sevenths: maj7, min7, dom7, hdim7, dim7, minmaj7.
 * Ninths: maj9, min9, dom9.
 *
 * Chords past the 9th (11ths, 13ths) collapse to the corresponding
 * 9th quality (dom13 → dom9, min11 → min9) — the base flavour is
 * what matters; the higher extensions are decoration and would
 * sprawl the enum without corresponding renderer differentiation.
 * Altered dominants (dom7b5, dom7#5) collapse to dom7 for the same
 * reason. `unknown` is the final fallback when no triad is
 * detectable at all.
 */
export type ChordQuality =
  | "maj"
  | "min"
  | "dim"
  | "aug"
  | "sus2"
  | "sus4"
  | "5" // power chord — root + perfect fifth, no third (quality-ambiguous)
  | "maj6"
  | "min6"
  | "maj7"
  | "min7"
  | "dom7"
  | "hdim7"
  | "dim7"
  | "minmaj7"
  | "maj9"
  | "min9"
  | "dom9"
  | "unknown";
