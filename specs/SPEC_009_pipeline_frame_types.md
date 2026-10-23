# SPEC 009: Pipeline Frame Types

Status: Approved
Date: 2026-01-21
Source: RFC 005, RFC 006, RFC 008

## Summary

Defines the frame types at each pipeline boundary, establishing proper separation between protocol-level input, musical abstractions, and annotated musical frames.

## Overview

The pipeline transforms data through three distinct frame types:

1. **RawInputFrame** — Protocol-level input from adapters (MIDI messages, audio features)
2. **MusicalFrame** — Musical abstractions from stabilizers (notes with duration, chords, beats)
3. **AnnotatedMusicalFrame** — Musical elements with visual annotations for lenses

This separation ensures:
- Adapters don't impose musical semantics
- Stabilizers produce proper musical abstractions
- Lenses consume musical elements and stabilizer-derived analysis but do not compute analysis themselves
- Vocabularies define a consistent visual vocabulary

## Frame Types

### RawInputFrame

Protocol-level input from adapters. Contains raw events without musical interpretation.

```ts
export interface RawInputFrame {
  t: Ms;
  source: SourceId;
  stream: StreamId;
  inputs: RawInput[];
}

export type RawInput =
  | MidiNoteOn
  | MidiNoteOff
  | MidiCC
  | AudioOnset
  | AudioPitch
  | AudioLoudness
  | AudioNoteOn
  | AudioNoteOff;

export interface MidiNoteOn {
  type: "midi_note_on";
  t: Ms;
  note: MidiNoteNumber;  // 0-127
  velocity: number;       // 0-127
  channel: number;
}

export interface MidiNoteOff {
  type: "midi_note_off";
  t: Ms;
  note: MidiNoteNumber;
  channel: number;
}
```

**Key properties:**
- No pitch class or octave — those are musical concepts
- No part assignment — routing happens later
- Preserves protocol fidelity (MIDI channel, etc.)

### MusicalFrame

Musical abstractions produced by stabilizers. Represents proper musical concepts.

```ts
export interface MusicalFrame {
  t: Ms;
  part: PartId;
  notes: Note[];
  chords: MusicalChord[];
  prescribedTempo: number | null;  // User-set BPM (not inferred)
  prescribedMeter: { beatsPerBar: number; beatUnit: number } | null;
  prescribedKey: PrescribedKey | null;  // User-set key+mode (not inferred)
  chordInterpretation: ChordInterpretationMode;  // "harmonic" | "bass-led" selection
  dynamics: DynamicsState;
  progression?: ChordId[];               // Recent chord ids (ChordDetectionStabilizer)
  phrases?: Phrase[];                    // No stabilizer writes this yet (synesthetica-nob)
  harmonicContext?: HarmonicContext;     // Tension + functional analysis
}

// RhythmicAnalysis / OnsetDrift / SubdivisionDrift removed 2026-08-20
// along with any BPM inference from the system. RhythmLens computes
// drift inline from the prescribed tempo grid; no shared "rhythmic
// analysis" type is needed. See SPEC 013 §Non-Goals. RFCs 007 and 008
// (which designed these types) are superseded.

export interface Note {
  id: NoteId;
  pitch: Pitch;
  velocity: Velocity;
  onset: Ms;
  duration: Ms;
  release: Ms | null;
  phase: NotePhase;
  confidence: Confidence;
  provenance: Provenance;
}

export type NotePhase = "attack" | "sustain" | "release";

export interface Pitch {
  pc: PitchClass;
  octave: number;
}

/** A single velocity observation at a point in time. */
export interface DynamicsEvent {
  t: Ms;
  intensity: number; // 0–1 normalized (MIDI velocity/127, audio amplitude, etc.)
}

/** A single point on the smoothed dynamics contour. */
export interface DynamicsContourPoint {
  t: Ms;
  level: number; // 0–1
}

/** Dynamic range summary over the contour window. */
export interface DynamicsRange {
  min: number;      // 0–1
  max: number;      // 0–1
  variance: number; // relative to full 0–1 range
}

export interface DynamicsState {
  events: DynamicsEvent[];           // Constituent velocity observations
  level: number;                     // Max intensity of the most recent onset
  contour: DynamicsContourPoint[];   // Level history, one point per onset time
  range: DynamicsRange;              // Dynamic range summary
}
```

**Key properties:**
- Notes have duration, not on/off pairs
- Notes have phase (attack → sustain → release)
- Includes derived state (dynamics with contour history and range)
- DynamicsState separates constituents (events) from aggregates (level, contour, range)
- Tempo/meter are user-prescribed, not stabilizer-inferred (BPM inference removed 2026-08-20)

### AnnotatedMusicalFrame (RFC 006)

Musical elements with visual annotations. Lenses receive this and decide how to render.

```ts
export interface AnnotatedMusicalFrame {
  t: Ms;
  part: PartId;
  notes: AnnotatedNote[];
  chords: AnnotatedChord[];
  progression: ChordId[];
  hueInvariant: PitchHueInvariant;       // Pitch-class → hue mapping for lenses
  pitchClassNames: string[];             // Display spelling per pitch class
  harmonicContext: HarmonicContext;      // Passed through from HarmonyStabilizer
  bars: AnnotatedBar[];
  phrases: AnnotatedPhrase[];
  dynamics: AnnotatedDynamics;
  // Prescribed context (tempo, meter, key, chord-interpretation) passes
  // straight through from MusicalFrame — see the actual contract in
  // packages/contracts/annotated/annotated.ts for the full field list.
}

// AnnotatedRhythm removed 2026-08-20 along with RhythmicAnalysis.
// Lenses read prescribedTempo/prescribedMeter directly from the frame.

export interface AnnotatedNote {
  note: Note;                    // The underlying musical note
  visual: VisualAnnotation;      // Visual properties from vocabulary
  velocity: VelocityAnnotation;  // I16
  phaseState: PhaseAnnotation;   // I17
  // ...plus harmonic-series partials; see the contract
}

export interface AnnotatedChord {
  chord: MusicalChord;
  visual: VisualAnnotation;
  noteIds: NoteId[];             // Constituent notes
  shape: ChordShapeGeometry;     // I18
  // ...plus partials; see the contract
}

export interface VisualAnnotation {
  palette: PaletteRef;           // Color palette
  texture: TextureRef;           // Texture parameters
  motion: MotionAnnotation;      // Motion characteristics
  uncertainty: Confidence;
  label?: string;                // Optional display label
}
```

**Key properties:**
- Musical elements retain their identity (notes, chords, beats)
- Visual annotations are attached, not separate intents
- Lenses decide how/whether to render each element
- Vocabularies define visual vocabulary (e.g., major=warm, minor=cool)

## Data Flow

```
Adapters              Stabilizers           Vocabularies              Lenses
   │                      │                     │                     │
   │  RawInputFrame       │   MusicalFrame      │ AnnotatedMusicalFr  │
   │ ──────────────────>  │ ─────────────────>  │ ─────────────────>  │
   │                      │                     │                     │
   │  - MidiNoteOn        │  - Note             │  - AnnotatedNote    │
   │  - MidiNoteOff       │  - MusicalChord     │  - AnnotatedChord   │
   │  - MidiCC            │  - DynamicsState    │  - AnnotatedDynamics│
   │  - Audio* inputs     │  - HarmonicContext  │  - HarmonicContext  │
```

## Note Lifecycle

Stabilizers transform MIDI note_on/note_off pairs into Note objects with phases:

```
Time →
note_on                                              note_off
   │                                                    │
   │◄─ attack (50ms) ─►│◄───── sustain ─────────────►│◄─ release (10s) ─►│
   │                   │                              │                     │
   └───────────────────┴──────────────────────────────┴─────────────────────┘
                                Note lifetime
```

- **attack**: First ~50ms after note_on
- **sustain**: While key is held
- **release**: After note_off, during decay tail

The release window (`releaseWindowMs`, default 10000ms) keeps released notes in the frame so lenses can show their history and fade them.

## Lens Responsibility (RFC 006)

Lenses know:
- Musical element categories (note, chord, beat, bar, phrase)
- Element lifecycle (phase, onset, duration)
- Visual annotations (palette, texture, motion)
- Stabilizer-derived analysis carried on the frame (e.g. chord quality, `harmonicContext` functional edges and progression)

Lenses decide:
- Which elements to render (can ignore chords, focus on rhythm, etc.)
- How to render elements (particles, shapes, trails, etc.)
- Spatial layout and animation
- Visual emphasis/de-emphasis

Lenses do NOT:
- Compute musical analysis (chord detection, functional harmony, tension) — they read the results stabilizers put on the frame
- Read raw MIDI or audio data

**Key principle**: Lenses may *consume* analysis from the annotated frame; they never *produce* it.

## Division of Responsibility

| Concern | Responsible Component |
|---------|----------------------|
| Protocol translation (MIDI → events) | Adapters |
| Musical abstraction (events → notes, chords) | Stabilizers |
| Visual scheme (what colors/textures mean) | Vocabularies |
| Rendering decisions (what shapes, what to show) | Lenses |
| Layer composition | Compositor |

## Contract Locations

- `RawInputFrame`: `packages/contracts/raw/raw.ts`
- `MusicalFrame`: `packages/contracts/musical/musical.ts`
- `AnnotatedMusicalFrame`: `packages/contracts/annotated/annotated.ts`

## Interface Locations

- `IRawSourceAdapter`: `packages/contracts/pipeline/interfaces.ts`
- `IMusicalStabilizer`: `packages/contracts/pipeline/interfaces.ts`
- `IVisualVocabulary`: `packages/contracts/pipeline/interfaces.ts`
- `IVisualLens`: `packages/contracts/pipeline/interfaces.ts`

## Invariants Preserved

- **I3**: Meaning lives in vocabulary; lenses consume stabilizer-derived analysis via the annotated frame but do not compute it (that is I4)
- **I4**: Lenses may not compute musical semantics
- **New**: Adapters don't impose musical semantics — only RawInputFrame

## What This Spec Does NOT Cover

- Specific stabilizer implementations (NoteTrackingStabilizer, etc.)
- Specific vocabulary implementations (MusicalVisualVocabulary, etc.)
- Audio adapter input types (`AudioOnset`, `AudioPitch`, etc.; see SPEC_012)
- Multi-part routing
