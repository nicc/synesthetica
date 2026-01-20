# SPEC 006: Ruleset and Stabilizer Statefulness

Status: Approved
Date: 2026-01-19
Source: RFC 002, RFC 005

## Summary

Defines where temporal state lives in the pipeline. Rulesets remain pure (stateless); stabilizers are explicitly stateful and responsible for transforming raw protocol input into musical abstractions.

## The Problem

Some musical mappings require history:
- **Note duration** requires correlating note_on with note_off
- **Note phase** (attack/sustain/release) requires tracking time since onset
- **Beat phase** requires memory of recent beats
- **Harmonic tension** depends on chord progression over time

The question: where should this temporal reasoning live?

## Decision: Stabilizers Handle History, Rulesets Stay Pure

**Stabilizers** are stateful. They:
- Transform raw protocol input (RawInputFrame) to musical abstractions (MusicalFrame)
- Correlate note_on/note_off pairs into Note objects with duration
- Track note phase (attack → sustain → release)
- Compute derived signals (tension trajectory, beat phase, phrase position)

**Rulesets** remain pure functions. They:
- Map a single MusicalFrame to VisualIntentFrame
- Do not maintain internal state
- Are testable with single-frame fixtures

## Rationale

### Why Stabilizers Own Temporal State

1. **Proper abstraction boundary** — Stabilizers convert protocol-level events (note_on, note_off) into musical abstractions (Note with duration). This is inherently stateful.

2. **Musical knowledge is acceptable** — Stabilizers already handle "chord detection" which requires harmonic understanding. Extending to "harmonic tension over N beats" is natural.

3. **Clean separation** — Stabilizers accumulate and derive; rulesets interpret a snapshot.

4. **Testability** — Rulesets can be tested with single-frame fixtures. Stabilizers can be tested with sequences.

### Why Rulesets Stay Pure

1. **Deterministic mapping** — Given the same MusicalFrame, a ruleset always produces the same VisualIntentFrame. No hidden state.

2. **Easier to reason about** — The ruleset is the "instrument definition" — it shouldn't behave differently based on how long the session has been running.

3. **Simpler testing** — Golden tests can use single frames, not sequences.

## Interfaces

### IMusicalStabilizer

```ts
export interface IMusicalStabilizer {
  id: string;

  /** Called once when the stabilizer is initialized */
  init(): void;

  /** Called once when the session ends or stabilizer is removed */
  dispose(): void;

  /**
   * Process raw input and produce musical state.
   * Stabilizers maintain internal state to track note durations, etc.
   */
  apply(raw: RawInputFrame, previous: MusicalFrame | null): MusicalFrame;

  /**
   * Reset internal state (e.g., on session restart or part reassignment).
   */
  reset(): void;
}
```

### IVisualRuleset

```ts
export interface IVisualRuleset {
  id: string;

  /**
   * Pure function: maps musical state to visual intents.
   * No internal state. Same input always produces same output.
   */
  map(frame: MusicalFrame): VisualIntentFrame;
}
```

## Stabilizer Responsibilities

Stabilizers produce MusicalFrame containing:

| Field | Description | Source |
|-------|-------------|--------|
| `notes: Note[]` | Active notes with duration and phase | note_on/note_off correlation |
| `chords: MusicalChord[]` | Detected chords | Note analysis |
| `progression: ChordId[]` | Recent chord history (references) | Chord tracking over time |
| `phrases: Phrase[]` | Phrase boundaries | Beat + density analysis |
| `rhythmicAnalysis: RhythmicAnalysis` | Descriptive analysis of note timing patterns | IOI clustering |
| `prescribedTempo: number \| null` | User-set tempo in BPM (not inferred) | Control op |
| `prescribedMeter: { beatsPerBar, beatUnit } \| null` | User-set meter (not inferred) | Control op |
| `dynamics: DynamicsState` | Current loudness level and trend | Velocity analysis |

## MusicalFrame as Snapshot with Context

MusicalFrame is a **snapshot with context**, not a history log. It contains:

- **Current state** — What's sounding now (active notes, current chord)
- **Recent context** — What led here, via references (progression, phrases)
- **No raw events** — Those stay in RawInputFrame

This allows rulesets to remain pure functions while still accessing temporal context like harmonic tension or phrase position.

### Reference vs Copy

To avoid duplication, MusicalFrame uses references:

```ts
interface MusicalFrame {
  notes: Note[];           // Active notes (attack/sustain/release)
  chords: MusicalChord[];  // Active chords (reference noteIds)
  progression: ChordId[];  // Recent chord IDs (references, not copies)
  phrases: Phrase[];       // Phrase boundaries (reference chordIds, noteIds)
}
```

A chord in `progression` is not duplicated — it references `chords[]` by ID.

### Context Windowing

Stabilizers maintain sliding windows of context. Window sizes are:

- **Derived from musical cues** when possible (e.g., phrase boundaries)
- **Clamped by configurable maximums** to bound memory usage

```ts
interface StabilizerConfig {
  maxProgressionChords?: number;   // Default: 16 chords
  maxPhraseHistory?: number;       // Default: 4 phrases
  maxContextWindowMs?: Ms;         // Default: 30000ms (30 seconds)
}
```

These defaults are starting points; we expect to tune them through experimentation.

### Note Tracking

The `NoteTrackingStabilizer` transforms MIDI events to Note objects:

1. **note_on** → Create Note in "attack" phase
2. **Time passes** → Transition to "sustain" phase (after attackDurationMs)
3. **note_off** → Transition to "release" phase
4. **Release window expires** → Remove Note from frame

```ts
export interface Note {
  id: NoteId;
  pitch: Pitch;
  velocity: Velocity;
  onset: Ms;
  duration: Ms;
  release: Ms | null;
  phase: NotePhase;  // "attack" | "sustain" | "release"
  confidence: Confidence;
  provenance: Provenance;
}
```

## Stabilizer Lifecycle

```
Session Start
  → stabilizer.init()

Each Frame
  → stabilizer.apply(rawFrame, previousMusicalFrame) → MusicalFrame

Part Reassignment / Mode Change
  → stabilizer.reset()

Session End
  → stabilizer.dispose()
```

## Pipeline Integration

The pipeline uses a stabilizer factory because each part needs its own instance:

```ts
pipeline.setStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
```

## Testing Implications

### Stabilizer Tests
- Test with sequences of RawInputFrames
- Verify Note phase transitions
- Verify note expiration after release window
- Test reset behavior

### Ruleset Tests
- Test with single MusicalFrames
- Golden tests can use snapshot fixtures
- No sequence dependencies

## Implementation

The canonical implementation is `NoteTrackingStabilizer` in `packages/engine/src/stabilizers/NoteTrackingStabilizer.ts`.

## What This Spec Does NOT Cover

- Specific derived signal computations (TensionStabilizer, BeatPhaseStabilizer)
- Stabilizer ordering/composition
- Audio-based stabilizers

## Contract Location

- `IMusicalStabilizer`: `packages/contracts/pipeline/interfaces.ts`
- `IVisualRuleset`: `packages/contracts/pipeline/interfaces.ts`
- `MusicalFrame`: `packages/contracts/musical/musical.ts`
- `Note`: `packages/contracts/musical/musical.ts`
