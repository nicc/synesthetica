/**
 * Chord fixtures for HarmonyLens tests and snapshots.
 */

import { buildChordShape } from "../../src/vocabularies/utils";
import { createTestAnnotatedFrame } from "./frames";
import type {
  AnnotatedChord,
  PitchClass,
  MusicalChord,
  ChordQuality,
  PitchHueInvariant,
} from "@synesthetica/contracts";

const defaultInvariant: PitchHueInvariant = {
  referencePc: 9, // A
  referenceHue: 0, // Red
  direction: "cw",
};

/**
 * Create a test chord with proper shape geometry.
 */
export function createTestChord(
  root: PitchClass,
  quality: ChordQuality,
  intervals: number[],
): AnnotatedChord {
  const voicing = intervals.map((semitones) => ({
    pc: ((root + semitones) % 12) as PitchClass,
    octave: 4,
  }));

  const interp = {
    root,
    quality,
    chordTones: intervals,
    name: "",
    confidence: 1.0 as const,
  };

  const chord: MusicalChord = {
    id: `test:0:${root}${quality}`,
    bass: voicing[0].pc,
    inversion: 0,
    isInverted: voicing[0].pc !== root,
    voicing,
    noteIds: [],
    harmonic: interp,
    bassLed: interp,
    onset: 0,
    duration: 1000,
    phase: "active",
    provenance: { source: "test", stream: "test", version: "1.0" },
  };

  const shape = buildChordShape(chord.harmonic, chord.voicing, defaultInvariant);

  return {
    chord,
    visual: {
      palette: {
        id: `chord-${chord.id}`,
        primary: { h: 0, s: 0.7, v: 0.85, a: 1 },
      },
      texture: { id: "chord", grain: 0.2, smoothness: 0.8, density: 0.5 },
      motion: { jitter: 0.05, pulse: 0.6 },
      uncertainty: 0,
    },
    noteIds: chord.noteIds,
    shape,
  };
}

/**
 * Create a test frame with specified chord and tension.
 */
export function createChordFrame(
  t: number,
  chord: AnnotatedChord | null,
  tension: number
) {
  return createTestAnnotatedFrame(t, "main", {
    chords: chord ? [chord] : [],
    harmonicContext: {
      tension,
      keyAware: false,
      currentFunction: null,
      functionalProgression: [],
    },
  });
}
