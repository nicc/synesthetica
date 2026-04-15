/**
 * Pitch-class → note-name spelling helpers.
 *
 * The default spelling (a fixed flat-preferring table) breaks chord
 * detection in sharp keys: e.g. playing D–F♯–A in D major spells
 * the middle pitch as "Gb", which Tonal.Chord.detect() doesn't
 * recognise as part of a D triad.
 *
 * When a key is prescribed, we spell pitches using that key's
 * diatonic scale so Tonal sees names aligned with the user's
 * musical context. Non-diatonic pitches default to the key's
 * accidental character (flats in flat keys, sharps in sharp keys).
 */

import { Scale } from "tonal";
import type { PitchClass, PrescribedKey, ModeId } from "@synesthetica/contracts";

/** Conventional note name for each pitch class as a scale tonic. */
const TONIC_NAMES: Record<PitchClass, string> = {
  0: "C",
  1: "Db",
  2: "D",
  3: "Eb",
  4: "E",
  5: "F",
  6: "F#", // F# major / minor is common; Gb major also valid (prefer F# as root)
  7: "G",
  8: "Ab",
  9: "A",
  10: "Bb",
  11: "B",
};

/** Default flat-preferring spelling for each pitch class (no key context). */
const DEFAULT_NAMES: Record<PitchClass, string> = {
  0: "C",
  1: "Db",
  2: "D",
  3: "Eb",
  4: "E",
  5: "F",
  6: "Gb",
  7: "G",
  8: "Ab",
  9: "A",
  10: "Bb",
  11: "B",
};

/** Map ModeId → Tonal scale name. */
const MODE_TO_SCALE: Record<ModeId, string> = {
  "ionian": "major",
  "dorian": "dorian",
  "phrygian": "phrygian",
  "lydian": "lydian",
  "mixolydian": "mixolydian",
  "aeolian": "minor",
  "locrian": "locrian",
  "harmonic-minor": "harmonic minor",
  "melodic-minor": "melodic minor",
};

/**
 * Build a pitch-class → note-name map for the given key. Diatonic pitches
 * get their scale spelling; non-diatonic pitches default to the key's
 * overall accidental character.
 */
export function buildSpellingTable(key: PrescribedKey): Record<PitchClass, string> {
  const tonicName = TONIC_NAMES[key.root];
  const scaleName = MODE_TO_SCALE[key.mode];
  const scale = Scale.get(`${tonicName} ${scaleName}`);

  const table: Record<number, string> = { ...DEFAULT_NAMES };

  // Fill diatonic pitches from the scale
  let sharpCount = 0;
  let flatCount = 0;
  for (const noteName of scale.notes) {
    const pc = noteNameToPitchClass(noteName);
    if (pc !== null) {
      table[pc] = noteName;
      if (noteName.includes("#")) sharpCount++;
      else if (noteName.includes("b")) flatCount++;
    }
  }

  // For non-diatonic pitches, default to the key's accidental preference.
  // Sharp keys get sharp spellings for non-diatonic too; flat keys get flats.
  if (sharpCount > flatCount) {
    const sharpFallbacks: Record<number, string> = {
      1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#",
    };
    for (const [pc, name] of Object.entries(sharpFallbacks)) {
      const pcNum = Number(pc) as PitchClass;
      // Only overwrite if the scale didn't already provide a spelling
      if (!scale.notes.some((n) => noteNameToPitchClass(n) === pcNum)) {
        table[pcNum] = name;
      }
    }
  }
  // Flat keys already use DEFAULT_NAMES fallbacks (flats), so no action needed.

  return table as Record<PitchClass, string>;
}

/**
 * Build the set of diatonic pitch classes for a given key. Used by
 * downstream logic (e.g. key-aware chord scoring) to ask "is this pc
 * in the scale?" in O(1).
 */
export function buildDiatonicPitchClasses(key: PrescribedKey): Set<PitchClass> {
  const tonicName = TONIC_NAMES[key.root];
  const scaleName = MODE_TO_SCALE[key.mode];
  const scale = Scale.get(`${tonicName} ${scaleName}`);

  const set = new Set<PitchClass>();
  for (const noteName of scale.notes) {
    const pc = noteNameToPitchClass(noteName);
    if (pc !== null) set.add(pc);
  }
  return set;
}

/**
 * Spell a pitch class using the given spelling table, or the default
 * flat-preferring table when no table is provided.
 */
export function pitchClassToNoteName(
  pc: PitchClass,
  spellingTable?: Record<PitchClass, string>,
): string {
  return (spellingTable ?? DEFAULT_NAMES)[pc];
}

/** Parse a note name (e.g. "F#", "Bb", "C") to its pitch class. */
function noteNameToPitchClass(noteName: string): PitchClass | null {
  const letter = noteName[0].toUpperCase();
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  if (!(letter in base)) return null;
  let pc = base[letter];
  for (const accidental of noteName.slice(1)) {
    if (accidental === "#") pc += 1;
    else if (accidental === "b") pc -= 1;
  }
  return (((pc % 12) + 12) % 12) as PitchClass;
}
