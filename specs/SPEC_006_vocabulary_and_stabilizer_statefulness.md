# SPEC 006: Vocabulary and Stabilizer Statefulness

Status: Approved
Date: 2026-01-19
Source: RFC 002, RFC 005

## Summary

Defines where temporal state lives in the pipeline. Vocabularies remain pure (stateless); stabilizers are explicitly stateful and responsible for transforming raw protocol input into musical abstractions. Lenses may hold bounded presentation caches but no musical state (see §Lens State).

## The Problem

Some musical mappings require history:
- **Note duration** requires correlating note_on with note_off
- **Note phase** (attack/sustain/release) requires tracking time since onset
- **Beat phase** requires memory of recent beats
- **Harmonic tension** depends on chord progression over time

The question: where should this temporal reasoning live?

## Decision: Stabilizers Handle History, Vocabularies Stay Pure

**Stabilizers** are stateful. They:
- Transform raw protocol input (RawInputFrame) to musical abstractions (MusicalFrame)
- Correlate note_on/note_off pairs into Note objects with duration
- Track note phase (attack → sustain → release)
- Compute derived signals (dynamics contour, harmonic tension, functional progression)

**Vocabularies** remain pure functions. They:
- Annotate a single MusicalFrame, producing an AnnotatedMusicalFrame
- Do not maintain temporal state (runtime configuration set via `setMacro`, such as the colour mapping, and memoised lookups such as key spellings are not temporal state)
- Are testable with single-frame fixtures

## Rationale

### Why Stabilizers Own Temporal State

1. **Proper abstraction boundary** — Stabilizers convert protocol-level events (note_on, note_off) into musical abstractions (Note with duration). This is inherently stateful.

2. **Musical knowledge is acceptable** — Stabilizers already handle "chord detection" which requires harmonic understanding. Extending to "harmonic tension over N beats" is natural.

3. **Clean separation** — Stabilizers accumulate and derive; vocabularies interpret a snapshot.

4. **Testability** — Vocabularies can be tested with single-frame fixtures. Stabilizers can be tested with sequences.

### Why Vocabularies Stay Pure

1. **Deterministic mapping** — Given the same MusicalFrame and configuration, a vocabulary always produces the same AnnotatedMusicalFrame. No hidden state.

2. **Easier to reason about** — The vocabulary is the "instrument definition" — it shouldn't behave differently based on how long the session has been running.

3. **Simpler testing** — Golden tests can use single frames, not sequences.

## Interfaces

### IMusicalStabilizer

```ts
export interface IMusicalStabilizer {
  id: string;

  /** IDs of stabilizers this one depends on (see SPEC_008 §Stabilizer DAG) */
  dependencies?: string[];

  /** Called once when the stabilizer is initialized */
  init(): void;

  /** Called once when the session ends or stabilizer is removed */
  dispose(): void;

  /**
   * Process raw input and produce musical state.
   * Stabilizers maintain internal state to track note durations, etc.
   * `upstream` is the merged output of this stabilizer's dependencies,
   * or its own previous output if it has none.
   */
  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame;

  /**
   * Reset internal state (e.g., on session restart or part reassignment).
   */
  reset(): void;

  /** Optional macro hooks (SPEC_014) */
  setMacro?(name: string, value: MacroValue): void;
  readMacros?(): Record<string, MacroValue>;
}
```

### IVisualVocabulary

```ts
export interface IVisualVocabulary {
  id: string;

  /**
   * Pure function: annotates musical state with visual properties.
   * No internal state. Same input always produces same output.
   */
  annotate(frame: MusicalFrame): AnnotatedMusicalFrame;

  /** Optional macro hooks (SPEC_014) */
  setMacro?(name: string, value: MacroValue): void;
  readMacros?(): Record<string, MacroValue>;
}
```

## Stabilizer Responsibilities

Stabilizers produce MusicalFrame containing:

| Field | Description | Source |
|-------|-------------|--------|
| `notes: Note[]` | Active notes with duration and phase | note_on/note_off correlation |
| `chords: MusicalChord[]` | Detected chords | Note analysis |
| `progression: ChordId[]` | Recent chord history (references) | ChordDetectionStabilizer |
| `phrases: Phrase[]` | Phrase boundaries | Not implemented (synesthetica-nob); no stabilizer writes it |
| `prescribedTempo: number \| null` | User-set tempo in BPM (never inferred) | Control op |
| `prescribedMeter: { beatsPerBar, beatUnit } \| null` | User-set meter (not inferred) | Control op |
| `prescribedKey: PrescribedKey \| null` | User-set key and mode (not inferred) | Control op |
| `chordInterpretation: ChordInterpretationMode` | Harmonic or bass-led chord reading | Control op |
| `dynamics: DynamicsState` | Velocity observations, level contour, and dynamic range | DynamicsStabilizer (max intensity per onset) |
| `harmonicContext: HarmonicContext` | Tension + functional analysis (Roman numerals, progression) | HarmonyStabilizer (key-agnostic tension always; functional analysis when key prescribed) |

## MusicalFrame as Snapshot with Context

MusicalFrame is a **snapshot with context**, not a history log. It contains:

- **Current state** — What's sounding now (active notes, current chord)
- **Recent context** — What led here, via references (progression, phrases)
- **No raw events** — Those stay in RawInputFrame

This allows vocabularies to remain pure functions while still accessing temporal context like harmonic tension.

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

Stabilizers maintain sliding windows of context, each bounded by a time window in that stabilizer's own config:

| Stabilizer | Config field | Default | Bounds |
|------------|-------------|---------|--------|
| NoteTrackingStabilizer | `releaseWindowMs` | 10000ms | How long a released note stays in the frame |
| ChordDetectionStabilizer | `progressionWindowMs` | 60000ms | Completed chords kept for `progression` |
| HarmonyStabilizer | `progressionWindowMs` | 60000ms | Functional progression history |
| DynamicsStabilizer | `windowMs` | 8000ms | Velocity events and contour |

There is no shared `StabilizerConfig`, and windows are not derived from musical cues (e.g. phrase boundaries) because phrase detection does not exist yet. These defaults are starting points; we expect to tune them through experimentation.

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
  → stabilizer.apply(rawFrame, upstreamOrPrevious) → MusicalFrame

Part Reassignment / Mode Change
  → stabilizer.reset()

Session End
  → stabilizer.dispose()
```

## Pipeline Integration

The pipeline uses a stabilizer factory because each part needs its own instance:

```ts
pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
```

## Lens State

Lenses (`IVisualLens`) receive one AnnotatedMusicalFrame per call plus their own previous SceneFrame. They may also hold state between frames, under two rules:

1. **Presentation caches only.** A lens may keep a cache derived from its own input for presentation purposes: fade-outs, per-element values frozen at creation, smoothing. Musical state — anything another consumer (another lens, the recent-events buffer, the LLM control plane) would need to agree on — belongs in a stabilizer and travels on the MusicalFrame. If two lenses would each need to compute the same fact, it is musical state.

2. **Bounded and pruned.** Every cache must have a bound and be pruned as the frame moves on (PRINCIPLES.md §5 Real-Time Respect). A cache that grows with session length is a defect. `dispose()` clears it.

Examples in the current code:

| Lens | State | Bound |
|------|-------|-------|
| HarmonyLens | `fadingChord` / `fadingChordEndTime` — the last populated chord, kept so its glyph fades after the stabilizer clears it | One chord; cleared after `CHORD_FADE_OUT_MS` |
| RhythmLens | `driftCache` — each note's drift from the prescribed grid, computed once at onset (freeze-at-creation) so the streak doesn't move as the frame changes | Keys pruned every frame to notes still in the frame, so bounded by NoteTrackingStabilizer's release window |
| DynamicsLens | None beyond macro values; it reads `dynamics.events` fresh each frame | — |

Macro values set via `setMacros` are configuration, not cached state, and are not subject to these rules.

## Testing Implications

### Stabilizer Tests
- Test with sequences of RawInputFrames
- Verify Note phase transitions
- Verify note expiration after release window
- Test reset behavior

### Vocabulary Tests
- Test with single MusicalFrames
- Golden tests can use snapshot fixtures
- No sequence dependencies

## Implementation

The canonical implementation is `NoteTrackingStabilizer` in `packages/engine/src/stabilizers/NoteTrackingStabilizer.ts`.

## What This Spec Does NOT Cover

- Specific derived signal computations (see DynamicsStabilizer, HarmonyStabilizer, SPEC_011)
- Stabilizer ordering/composition (see SPEC_008)
- Audio-based stabilizers

## Contract Location

- `IMusicalStabilizer`: `packages/contracts/pipeline/interfaces.ts`
- `IVisualVocabulary`: `packages/contracts/pipeline/interfaces.ts`
- `IVisualLens`: `packages/contracts/pipeline/interfaces.ts`
- `AnnotatedMusicalFrame`: `packages/contracts/annotated/annotated.ts`
- `MusicalFrame`: `packages/contracts/musical/musical.ts`
- `Note`: `packages/contracts/musical/musical.ts`
