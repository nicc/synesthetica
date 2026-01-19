# SPEC 009: Pipeline Frame Types

Status: Approved
Date: 2026-01-19
Source: RFC 005

## Summary

Defines the frame types at each pipeline boundary, establishing proper separation between protocol-level input, musical abstractions, and visual intents.

## Overview

The pipeline transforms data through three distinct frame types:

1. **RawInputFrame** — Protocol-level input from adapters (MIDI messages, audio features)
2. **MusicalFrame** — Musical abstractions from stabilizers (notes with duration, chords, beats)
3. **VisualIntentFrame** — Visual intents for grammars (no musical concepts)

This separation ensures:
- Adapters don't impose musical semantics
- Stabilizers produce proper musical abstractions
- Grammars never see musical concepts

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

### VisualIntentFrame

Visual intents produced by rulesets. Contains only visual concepts.

```ts
export interface VisualIntentFrame {
  t: Ms;
  intents: VisualIntent[];
  uncertainty: number;
}

export type VisualIntent =
  | PaletteIntent
  | MotionIntent
  | TextureIntent
  | ShapeIntent;

export interface PaletteIntent {
  type: "palette";
  id: VisualIntentId;
  t: Ms;
  base: ColorHSVA;
  stability: number;
  phase: IntentPhase;       // Intent's own lifecycle phase
  confidence: Confidence;
}

export type IntentPhase = "attack" | "sustain" | "release";
```

**Key properties:**
- No musical events — grammars never see them
- Intent IDs enable correlation across frames
- Intents have their own phase (attack/sustain/release envelope)
- Purely visual semantics (color, motion, texture)

## Data Flow

```
Adapters              Stabilizers           Rulesets              Grammars
   │                      │                     │                     │
   │  RawInputFrame       │   MusicalFrame      │  VisualIntentFrame  │
   │ ──────────────────>  │ ─────────────────>  │ ─────────────────>  │
   │                      │                     │                     │
   │  - MidiNoteOn        │  - Note             │  - PaletteIntent    │
   │  - MidiNoteOff       │  - MusicalChord     │  - MotionIntent     │
   │  - MidiCC            │  - BeatState        │  - TextureIntent    │
   │  - AudioFeatures     │  - DynamicsState    │  - ShapeIntent      │
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

## Intent Phase and Entity Lifecycle

### Intent Phase

Intents have their own lifecycle phase (attack/sustain/release), analogous to a musical envelope. This phase describes the intent's *current state*, not the entity's lifespan.

- **attack** — Intent just appeared (e.g., first ~50ms)
- **sustain** — Intent is active and stable
- **release** — Intent is fading (source note released, etc.)

The ruleset sets the intent phase based on the source musical event's phase.

### Entity Lifecycle is Grammar's Domain

**Critical distinction:** Intent lifecycle and entity lifecycle are decoupled.

The grammar observes intents and decides how to respond visually. It is **not obligated** to tie entity lifetime to intent lifetime. Examples:

| Intent behavior | Possible grammar response |
|-----------------|---------------------------|
| Intent appears | Spawn particle with 2s TTL |
| Intent in attack phase | Spawn bright burst entity |
| Intent in release phase | Spawn fade trail entity |
| Intent disappears | Do nothing (entity has its own TTL) |
| Intent continues | Reinforce existing entity (reset TTL, boost intensity) |

Grammars may:
- Spawn entities that outlive their source intent
- Spawn multiple entities from one intent
- Ignore intents entirely (based on grammar's visual language)
- Use intent phase to vary visual representation (e.g., brighter during attack)

### Why This Matters

Consider an ear training use case: the intent to *play a note* is distinct from the intent to *display that note for extended study*. The note's visual representation might persist long after the musical note releases, allowing the user to study harmonic relationships.

This is a grammar concern, not a ruleset concern. The grammar decides visual persistence based on its purpose.

### Intent IDs for Correlation

Intent IDs enable grammars to correlate intents across frames without seeing musical events:

- Same ID across frames → Same source (grammar may reinforce or ignore)
- New ID → New source (grammar may spawn new entity)
- ID absent → Source ended (grammar may spawn release effect or do nothing)

This replaces the previous pattern of grammars reading note_on/note_off events.

## Contract Locations

- `RawInputFrame`: `packages/contracts/raw/raw.ts`
- `MusicalFrame`: `packages/contracts/musical/musical.ts`
- `VisualIntentFrame`: `packages/contracts/intents/intents.ts`

## Interface Locations

- `IRawSourceAdapter`: `packages/contracts/pipeline/interfaces.ts`
- `IMusicalStabilizer`: `packages/contracts/pipeline/interfaces.ts`
- `IVisualRuleset`: `packages/contracts/pipeline/interfaces.ts`
- `IVisualGrammar`: `packages/contracts/pipeline/interfaces.ts`

## Invariants Preserved

- **I3**: Grammars never see musical events — only VisualIntentFrame
- **I4**: Grammars may not compute musical semantics — they only see intents
- **New**: Adapters don't impose musical semantics — only RawInputFrame

## What This Spec Does NOT Cover

- Specific stabilizer implementations (NoteTrackingStabilizer, etc.)
- Specific ruleset implementations (MusicalVisualRuleset, etc.)
- Audio adapter input types (AudioFeatures)
- Multi-part routing
