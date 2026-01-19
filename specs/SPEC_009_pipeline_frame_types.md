# SPEC 009: Pipeline Frame Types

Status: Approved
Date: 2026-01-19
Source: RFC 005, RFC 006

## Summary

Defines the frame types at each pipeline boundary, establishing proper separation between protocol-level input, musical abstractions, and annotated musical frames.

## Overview

The pipeline transforms data through three distinct frame types:

1. **RawInputFrame** — Protocol-level input from adapters (MIDI messages, audio features)
2. **MusicalFrame** — Musical abstractions from stabilizers (notes with duration, chords, beats)
3. **AnnotatedMusicalFrame** — Musical elements with visual annotations for grammars

This separation ensures:
- Adapters don't impose musical semantics
- Stabilizers produce proper musical abstractions
- Grammars see musical element categories but not musical analysis
- Rulesets define a consistent visual vocabulary

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
  | AudioFeatures;

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
  beat: BeatState | null;
  dynamics: DynamicsState;
}

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
```

**Key properties:**
- Notes have duration, not on/off pairs
- Notes have phase (attack → sustain → release)
- Includes derived state (dynamics, beat)

### AnnotatedMusicalFrame (RFC 006)

Musical elements with visual annotations. Grammars receive this and decide how to render.

```ts
export interface AnnotatedMusicalFrame {
  t: Ms;
  part: PartId;
  notes: AnnotatedNote[];
  chords: AnnotatedChord[];
  beat: AnnotatedBeat | null;
  bars: AnnotatedBar[];
  phrases: AnnotatedPhrase[];
  dynamics: AnnotatedDynamics;
}

export interface AnnotatedNote {
  note: Note;                    // The underlying musical note
  visual: VisualAnnotation;      // Visual properties from ruleset
}

export interface AnnotatedChord {
  chord: MusicalChord;
  visual: VisualAnnotation;
  noteIds: NoteId[];             // Constituent notes
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
- Grammars decide how/whether to render each element
- Rulesets define visual vocabulary (e.g., major=warm, minor=cool)

## Data Flow

```
Adapters              Stabilizers           Rulesets              Grammars
   │                      │                     │                     │
   │  RawInputFrame       │   MusicalFrame      │ AnnotatedMusicalFr  │
   │ ──────────────────>  │ ─────────────────>  │ ─────────────────>  │
   │                      │                     │                     │
   │  - MidiNoteOn        │  - Note             │  - AnnotatedNote    │
   │  - MidiNoteOff       │  - MusicalChord     │  - AnnotatedChord   │
   │  - MidiCC            │  - BeatState        │  - AnnotatedBeat    │
   │  - AudioFeatures     │  - DynamicsState    │  - AnnotatedDynamics│
```

## Note Lifecycle

Stabilizers transform MIDI note_on/note_off pairs into Note objects with phases:

```
Time →
note_on                                              note_off
   │                                                    │
   │◄─ attack (50ms) ─►│◄───── sustain ─────────────►│◄─ release (500ms) ─►│
   │                   │                              │                     │
   └───────────────────┴──────────────────────────────┴─────────────────────┘
                                Note lifetime
```

- **attack**: First ~50ms after note_on
- **sustain**: While key is held
- **release**: After note_off, during decay tail

The release window (default 500ms) allows visual effects to fade gracefully.

## Grammar Responsibility (RFC 006)

Grammars know:
- Musical element categories (note, chord, beat, bar, phrase)
- Element lifecycle (phase, onset, duration)
- Visual annotations (palette, texture, motion)

Grammars decide:
- Which elements to render (can ignore chords, focus on rhythm, etc.)
- How to render elements (particles, shapes, trails, etc.)
- Spatial layout and animation
- Visual emphasis/de-emphasis

Grammars do NOT know:
- Pitch class, key, or harmonic analysis
- Chord quality or voicing details (unless they use `label`)
- Raw MIDI or audio data

**Key principle**: Grammars know *categories* of musical elements, not musical *analysis*.

## Division of Responsibility

| Concern | Responsible Component |
|---------|----------------------|
| Protocol translation (MIDI → events) | Adapters |
| Musical abstraction (events → notes, chords) | Stabilizers |
| Visual scheme (what colors/textures mean) | Rulesets |
| Rendering decisions (what shapes, what to show) | Grammars |
| Layer composition | Compositor |

## Contract Locations

- `RawInputFrame`: `packages/contracts/raw/raw.ts`
- `MusicalFrame`: `packages/contracts/musical/musical.ts`
- `AnnotatedMusicalFrame`: `packages/contracts/annotated/annotated.ts`

## Interface Locations

- `IRawSourceAdapter`: `packages/contracts/pipeline/interfaces.ts`
- `IMusicalStabilizer`: `packages/contracts/pipeline/interfaces.ts`
- `IVisualRuleset`: `packages/contracts/pipeline/interfaces.ts`
- `IVisualGrammar`: `packages/contracts/pipeline/interfaces.ts`

## Invariants Preserved

- **I3**: Meaning lives in ruleset; grammars see annotated elements (categories, not analysis)
- **I4**: Grammars may not compute musical semantics
- **New**: Adapters don't impose musical semantics — only RawInputFrame

## What This Spec Does NOT Cover

- Specific stabilizer implementations (NoteTrackingStabilizer, etc.)
- Specific ruleset implementations (MusicalVisualRuleset, etc.)
- Audio adapter input types (AudioFeatures)
- Multi-part routing
