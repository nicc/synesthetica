/**
 * Shared test frame factories.
 *
 * Centralizes MusicalFrame and AnnotatedMusicalFrame construction so that
 * adding fields to these interfaces only requires changes here.
 */

import type {
  RawInputFrame,
  MusicalFrame,
  AnnotatedMusicalFrame,
  AnnotatedNote,
  AnnotatedChord,
  DynamicsState,
  RhythmicAnalysis,
  HarmonicContext,
  PrescribedKey,
  TimeSignature,
  Note,
  MusicalChord,
  ChordId,
  VisualAnnotation,
  Ms,
} from "@synesthetica/contracts";
import {
  createEmptyMusicalFrame,
  EMPTY_DYNAMICS,
  EMPTY_RHYTHMIC_ANALYSIS,
  EMPTY_HARMONIC_CONTEXT,
} from "@synesthetica/contracts";

// ============================================================================
// RawInputFrame
// ============================================================================

export function createTestRawFrame(
  t: number,
  events: RawInputFrame["inputs"] = [],
): RawInputFrame {
  return {
    t,
    source: "test",
    stream: "test",
    inputs: events,
  };
}

// ============================================================================
// MusicalFrame
// ============================================================================

export interface MusicalFrameOverrides {
  notes?: Note[];
  chords?: MusicalChord[];
  rhythmicAnalysis?: RhythmicAnalysis;
  dynamics?: DynamicsState;
  prescribedTempo?: number | null;
  prescribedMeter?: TimeSignature | null;
  prescribedKey?: PrescribedKey | null;
  progression?: ChordId[];
  harmonicContext?: HarmonicContext;
}

export function createTestMusicalFrame(
  t: number,
  part = "main",
  overrides: MusicalFrameOverrides = {},
): MusicalFrame {
  return {
    ...createEmptyMusicalFrame(t as Ms, part),
    ...overrides,
  };
}

// ============================================================================
// AnnotatedMusicalFrame
// ============================================================================

const NEUTRAL_VISUAL: VisualAnnotation = {
  palette: { id: "neutral", primary: { h: 0, s: 0, v: 0.5, a: 1 } },
  texture: { id: "neutral", grain: 0, smoothness: 1, density: 0 },
  motion: { jitter: 0, pulse: 0, flow: 0 },
  uncertainty: 0,
};

export interface AnnotatedFrameOverrides {
  notes?: AnnotatedNote[];
  chords?: AnnotatedChord[];
  progression?: ChordId[];
  harmonicContext?: HarmonicContext;
  dynamics?: DynamicsState;
  rhythmicAnalysis?: RhythmicAnalysis;
  prescribedTempo?: number | null;
  prescribedMeter?: TimeSignature | null;
  prescribedKey?: PrescribedKey | null;
  rhythmVisual?: VisualAnnotation;
  dynamicsVisual?: VisualAnnotation;
}

export function createTestAnnotatedFrame(
  t: number,
  part = "main",
  overrides: AnnotatedFrameOverrides = {},
): AnnotatedMusicalFrame {
  return {
    t,
    part,
    notes: overrides.notes ?? [],
    chords: overrides.chords ?? [],
    progression: overrides.progression ?? [],
    prescribedTempo: overrides.prescribedTempo ?? null,
    prescribedMeter: overrides.prescribedMeter ?? null,
    prescribedKey: overrides.prescribedKey ?? null,
    harmonicContext: overrides.harmonicContext ?? { ...EMPTY_HARMONIC_CONTEXT },
    rhythm: {
      analysis: overrides.rhythmicAnalysis ?? { ...EMPTY_RHYTHMIC_ANALYSIS },
      visual: overrides.rhythmVisual ?? { ...NEUTRAL_VISUAL },
    },
    bars: [],
    phrases: [],
    dynamics: {
      dynamics: overrides.dynamics ?? { ...EMPTY_DYNAMICS, range: { ...EMPTY_DYNAMICS.range } },
      visual: overrides.dynamicsVisual ?? { ...NEUTRAL_VISUAL },
    },
  };
}

// Re-export constants for convenience
export { EMPTY_DYNAMICS, EMPTY_RHYTHMIC_ANALYSIS, EMPTY_HARMONIC_CONTEXT };
