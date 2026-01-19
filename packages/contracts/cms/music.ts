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
 */
export type ChordQuality =
  | "maj"
  | "min"
  | "dim"
  | "aug"
  | "sus2"
  | "sus4"
  | "maj7"
  | "min7"
  | "dom7"
  | "hdim7"
  | "dim7"
  | "unknown";
