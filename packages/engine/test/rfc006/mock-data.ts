/**
 * Mock AnnotatedMusicalFrame data for RFC 006 validation.
 *
 * Represents a simple musical passage:
 * - Frame 1 (t=0): C major chord onset (C4, E4, G4)
 * - Frame 2 (t=500): C major chord sustaining
 * - Frame 3 (t=1000): Transition - C major releasing, A minor onset (A3, C4, E4)
 * - Frame 4 (t=1500): A minor chord sustaining
 * - Frame 5 (t=2000): A minor chord releasing, silence
 */

import type {
  AnnotatedMusicalFrame,
  AnnotatedNote,
  AnnotatedChord,
  AnnotatedDynamics,
  VisualAnnotation,
  PaletteRef,
  TextureRef,
  MotionAnnotation,
} from "@synesthetica/contracts";
import type {
  Note,
  MusicalChord,
  DynamicsState,
  Pitch,
  NoteId,
  ChordId,
  Provenance,
} from "@synesthetica/contracts";

// ============================================================================
// Palettes (placeholder warm/cool as per RFC 006)
// ============================================================================

const warmPalette: PaletteRef = {
  id: "warm-1",
  primary: { h: 30, s: 0.8, v: 0.9, a: 1 },   // Orange
  secondary: { h: 45, s: 0.7, v: 0.85, a: 1 }, // Gold
  accent: { h: 0, s: 0.9, v: 1, a: 1 },        // Red
};

const coolPalette: PaletteRef = {
  id: "cool-1",
  primary: { h: 220, s: 0.7, v: 0.85, a: 1 },  // Blue
  secondary: { h: 180, s: 0.6, v: 0.8, a: 1 }, // Cyan
  accent: { h: 280, s: 0.8, v: 0.9, a: 1 },    // Purple
};

const neutralPalette: PaletteRef = {
  id: "neutral-1",
  primary: { h: 0, s: 0, v: 0.7, a: 1 },       // Gray
  secondary: { h: 0, s: 0, v: 0.5, a: 1 },
};

// ============================================================================
// Textures
// ============================================================================

const smoothTexture: TextureRef = {
  id: "smooth",
  grain: 0.1,
  smoothness: 0.9,
  density: 0.5,
};

const grainTexture: TextureRef = {
  id: "grain",
  grain: 0.6,
  smoothness: 0.4,
  density: 0.7,
};

// ============================================================================
// Motion presets
// ============================================================================

const stableMotion: MotionAnnotation = {
  jitter: 0.05,
  pulse: 0.3,
  flow: 0.1,
};

const activeMotion: MotionAnnotation = {
  jitter: 0.1,
  pulse: 0.6,
  flow: 0.3,
};

const decayingMotion: MotionAnnotation = {
  jitter: 0.15,
  pulse: 0.2,
  flow: -0.2,
};

// ============================================================================
// Provenance
// ============================================================================

const provenance: Provenance = {
  source: "mock",
  stream: "test",
  version: "1.0",
};

// ============================================================================
// Helper functions
// ============================================================================

function createNote(
  id: NoteId,
  pc: number,
  octave: number,
  onset: number,
  duration: number,
  phase: "attack" | "sustain" | "release",
  velocity: number = 80
): Note {
  return {
    id,
    pitch: { pc: pc as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11, octave },
    velocity,
    onset,
    duration,
    release: phase === "release" ? onset + duration - 100 : null,
    phase,
    confidence: 1.0,
    provenance,
  };
}

function createAnnotatedNote(
  note: Note,
  palette: PaletteRef,
  motion: MotionAnnotation,
  label?: string
): AnnotatedNote {
  return {
    note,
    visual: {
      palette,
      texture: smoothTexture,
      motion,
      uncertainty: 0.05, // Low uncertainty for notes
      label,
    },
  };
}

function createChord(
  id: ChordId,
  root: number,
  quality: "maj" | "min",
  noteIds: NoteId[],
  voicing: Pitch[],
  onset: number,
  duration: number,
  phase: "active" | "decaying"
): MusicalChord {
  return {
    id,
    root: root as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11,
    quality,
    bass: voicing[0].pc,
    inversion: 0,
    voicing,
    noteIds,
    onset,
    duration,
    phase,
    confidence: 0.85,
    provenance,
  };
}

function createAnnotatedChord(
  chord: MusicalChord,
  palette: PaletteRef,
  motion: MotionAnnotation,
  label?: string
): AnnotatedChord {
  return {
    chord,
    visual: {
      palette,
      texture: grainTexture,
      motion,
      uncertainty: 0.15, // Higher uncertainty for chords
      label,
    },
    noteIds: chord.noteIds,
  };
}

function createDynamics(
  level: number,
  trend: "rising" | "falling" | "stable"
): AnnotatedDynamics {
  return {
    dynamics: { level, trend },
    visual: {
      palette: neutralPalette,
      texture: smoothTexture,
      motion: stableMotion,
      uncertainty: 0.1,
    },
  };
}

// ============================================================================
// Mock Frames
// ============================================================================

// Note IDs
const noteC4_0 = "main:0:C4";
const noteE4_0 = "main:0:E4";
const noteG4_0 = "main:0:G4";
const noteA3_1000 = "main:1000:A3";
const noteC4_1000 = "main:1000:C4";
const noteE4_1000 = "main:1000:E4";

// Chord IDs
const chordCmaj_0 = "main:0:Cmaj";
const chordAmin_1000 = "main:1000:Amin";

// Pitches
const pitchC4: Pitch = { pc: 0, octave: 4 };
const pitchE4: Pitch = { pc: 4, octave: 4 };
const pitchG4: Pitch = { pc: 7, octave: 4 };
const pitchA3: Pitch = { pc: 9, octave: 3 };

/**
 * Frame 1: C major chord onset
 */
export const frame1: AnnotatedMusicalFrame = {
  t: 0,
  part: "main",
  notes: [
    createAnnotatedNote(
      createNote(noteC4_0, 0, 4, 0, 50, "attack", 85),
      warmPalette,
      activeMotion,
      "C4"
    ),
    createAnnotatedNote(
      createNote(noteE4_0, 4, 4, 0, 50, "attack", 80),
      warmPalette,
      activeMotion,
      "E4"
    ),
    createAnnotatedNote(
      createNote(noteG4_0, 7, 4, 0, 50, "attack", 75),
      warmPalette,
      activeMotion,
      "G4"
    ),
  ],
  chords: [
    createAnnotatedChord(
      createChord(
        chordCmaj_0,
        0,
        "maj",
        [noteC4_0, noteE4_0, noteG4_0],
        [pitchC4, pitchE4, pitchG4],
        0,
        50,
        "active"
      ),
      warmPalette,
      activeMotion,
      "Cmaj"
    ),
  ],
  beat: {
    beat: { phase: 0, tempo: 120, confidence: 0.9, beatInBar: 1, beatsPerBar: 4, isDownbeat: true },
    visual: {
      palette: neutralPalette,
      texture: smoothTexture,
      motion: { jitter: 0, pulse: 1.0, flow: 0 },
      uncertainty: 0.1,
    },
  },
  bars: [],
  phrases: [],
  dynamics: createDynamics(0.7, "rising"),
};

/**
 * Frame 2: C major chord sustaining
 */
export const frame2: AnnotatedMusicalFrame = {
  t: 500,
  part: "main",
  notes: [
    createAnnotatedNote(
      createNote(noteC4_0, 0, 4, 0, 500, "sustain", 85),
      warmPalette,
      stableMotion,
      "C4"
    ),
    createAnnotatedNote(
      createNote(noteE4_0, 4, 4, 0, 500, "sustain", 80),
      warmPalette,
      stableMotion,
      "E4"
    ),
    createAnnotatedNote(
      createNote(noteG4_0, 7, 4, 0, 500, "sustain", 75),
      warmPalette,
      stableMotion,
      "G4"
    ),
  ],
  chords: [
    createAnnotatedChord(
      createChord(
        chordCmaj_0,
        0,
        "maj",
        [noteC4_0, noteE4_0, noteG4_0],
        [pitchC4, pitchE4, pitchG4],
        0,
        500,
        "active"
      ),
      warmPalette,
      stableMotion,
      "Cmaj"
    ),
  ],
  beat: {
    beat: { phase: 0.5, tempo: 120, confidence: 0.9, beatInBar: 2, beatsPerBar: 4, isDownbeat: false },
    visual: {
      palette: neutralPalette,
      texture: smoothTexture,
      motion: { jitter: 0, pulse: 0.5, flow: 0 },
      uncertainty: 0.1,
    },
  },
  bars: [],
  phrases: [],
  dynamics: createDynamics(0.65, "stable"),
};

/**
 * Frame 3: Transition - C major releasing, A minor onset
 */
export const frame3: AnnotatedMusicalFrame = {
  t: 1000,
  part: "main",
  notes: [
    // C major notes releasing
    createAnnotatedNote(
      createNote(noteC4_0, 0, 4, 0, 1000, "release", 85),
      warmPalette,
      decayingMotion,
      "C4"
    ),
    createAnnotatedNote(
      createNote(noteE4_0, 4, 4, 0, 1000, "release", 80),
      warmPalette,
      decayingMotion,
      "E4"
    ),
    createAnnotatedNote(
      createNote(noteG4_0, 7, 4, 0, 1000, "release", 75),
      warmPalette,
      decayingMotion,
      "G4"
    ),
    // A minor notes attacking
    createAnnotatedNote(
      createNote(noteA3_1000, 9, 3, 1000, 50, "attack", 82),
      coolPalette,
      activeMotion,
      "A3"
    ),
    createAnnotatedNote(
      createNote(noteC4_1000, 0, 4, 1000, 50, "attack", 78),
      coolPalette,
      activeMotion,
      "C4"
    ),
    createAnnotatedNote(
      createNote(noteE4_1000, 4, 4, 1000, 50, "attack", 75),
      coolPalette,
      activeMotion,
      "E4"
    ),
  ],
  chords: [
    // C major decaying
    createAnnotatedChord(
      createChord(
        chordCmaj_0,
        0,
        "maj",
        [noteC4_0, noteE4_0, noteG4_0],
        [pitchC4, pitchE4, pitchG4],
        0,
        1000,
        "decaying"
      ),
      warmPalette,
      decayingMotion,
      "Cmaj"
    ),
    // A minor active
    createAnnotatedChord(
      createChord(
        chordAmin_1000,
        9,
        "min",
        [noteA3_1000, noteC4_1000, noteE4_1000],
        [pitchA3, pitchC4, pitchE4],
        1000,
        50,
        "active"
      ),
      coolPalette,
      activeMotion,
      "Am"
    ),
  ],
  beat: {
    beat: { phase: 0, tempo: 120, confidence: 0.9, beatInBar: 1, beatsPerBar: 4, isDownbeat: true },
    visual: {
      palette: neutralPalette,
      texture: smoothTexture,
      motion: { jitter: 0, pulse: 1.0, flow: 0 },
      uncertainty: 0.1,
    },
  },
  bars: [
    {
      onset: 1000,
      barNumber: 2,
      visual: {
        palette: neutralPalette,
        texture: smoothTexture,
        motion: { jitter: 0, pulse: 0.8, flow: 0 },
        uncertainty: 0.1,
      },
    },
  ],
  phrases: [],
  dynamics: createDynamics(0.6, "falling"),
};

/**
 * Frame 4: A minor chord sustaining
 */
export const frame4: AnnotatedMusicalFrame = {
  t: 1500,
  part: "main",
  notes: [
    createAnnotatedNote(
      createNote(noteA3_1000, 9, 3, 1000, 500, "sustain", 82),
      coolPalette,
      stableMotion,
      "A3"
    ),
    createAnnotatedNote(
      createNote(noteC4_1000, 0, 4, 1000, 500, "sustain", 78),
      coolPalette,
      stableMotion,
      "C4"
    ),
    createAnnotatedNote(
      createNote(noteE4_1000, 4, 4, 1000, 500, "sustain", 75),
      coolPalette,
      stableMotion,
      "E4"
    ),
  ],
  chords: [
    createAnnotatedChord(
      createChord(
        chordAmin_1000,
        9,
        "min",
        [noteA3_1000, noteC4_1000, noteE4_1000],
        [pitchA3, pitchC4, pitchE4],
        1000,
        500,
        "active"
      ),
      coolPalette,
      stableMotion,
      "Am"
    ),
  ],
  beat: {
    beat: { phase: 0.5, tempo: 120, confidence: 0.9, beatInBar: 2, beatsPerBar: 4, isDownbeat: false },
    visual: {
      palette: neutralPalette,
      texture: smoothTexture,
      motion: { jitter: 0, pulse: 0.5, flow: 0 },
      uncertainty: 0.1,
    },
  },
  bars: [],
  phrases: [],
  dynamics: createDynamics(0.55, "stable"),
};

/**
 * Frame 5: A minor chord releasing, approaching silence
 */
export const frame5: AnnotatedMusicalFrame = {
  t: 2000,
  part: "main",
  notes: [
    createAnnotatedNote(
      createNote(noteA3_1000, 9, 3, 1000, 1000, "release", 82),
      coolPalette,
      decayingMotion,
      "A3"
    ),
    createAnnotatedNote(
      createNote(noteC4_1000, 0, 4, 1000, 1000, "release", 78),
      coolPalette,
      decayingMotion,
      "C4"
    ),
    createAnnotatedNote(
      createNote(noteE4_1000, 4, 4, 1000, 1000, "release", 75),
      coolPalette,
      decayingMotion,
      "E4"
    ),
  ],
  chords: [
    createAnnotatedChord(
      createChord(
        chordAmin_1000,
        9,
        "min",
        [noteA3_1000, noteC4_1000, noteE4_1000],
        [pitchA3, pitchC4, pitchE4],
        1000,
        1000,
        "decaying"
      ),
      coolPalette,
      decayingMotion,
      "Am"
    ),
  ],
  beat: {
    beat: { phase: 0, tempo: 120, confidence: 0.9, beatInBar: 1, beatsPerBar: 4, isDownbeat: true },
    visual: {
      palette: neutralPalette,
      texture: smoothTexture,
      motion: { jitter: 0, pulse: 1.0, flow: 0 },
      uncertainty: 0.1,
    },
  },
  bars: [],
  phrases: [],
  dynamics: createDynamics(0.3, "falling"),
};

/**
 * All frames in sequence
 */
export const mockFrameSequence: AnnotatedMusicalFrame[] = [
  frame1,
  frame2,
  frame3,
  frame4,
  frame5,
];
