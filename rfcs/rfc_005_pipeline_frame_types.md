# RFC 005: Pipeline Frame Types and Musical Abstraction

Status: Implemented
Author(s): Synesthetica
Date: 2026-01-18
Related: RFC 002 (CMS + Grammar API), SPEC 006 (Ruleset/Stabilizer Statefulness), SPEC 008 (Pipeline Orchestration)

## Summary

Introduce distinct frame types for each pipeline boundary to properly separate concerns:
- **RawInputFrame**: Protocol-level input from adapters (MIDI messages, audio features)
- **MusicalFrame**: Musical abstractions produced by stabilizers (notes with duration, chords, beats)
- **IntentFrame**: Visual intents only, with no musical concepts (grammars' input)

This RFC also elevates musical events from protocol-level concepts (note_on/note_off) to proper musical abstractions (Note with duration and phase).

## Motivation

### Problem 1: Abstraction Level Mismatch

The current `MusicalEvent` type includes `note_on` and `note_off`, which are MIDI protocol concepts, not musical concepts. A musical note has pitch, duration, and dynamics - it doesn't "turn on" or "turn off."

This matters because:
- It forces musical reasoning about note duration into the wrong layer
- Audio adapters must artificially emit "note_on/note_off" events that don't match how audio works
- Grammars that want to visualize sustained notes must track state that belongs elsewhere

### Problem 2: CMSFrame Serves Too Many Masters

Currently `CMSFrame` is used as:
1. Adapter output (close to protocol)
2. Stabilizer input and output (enriched musical state)
3. Ruleset input (semantic musical content)

These have different requirements. Adapters need to express raw input. Stabilizers need to accumulate temporal state. Rulesets need clean musical abstractions to map to visual intents.

### Problem 3: Grammars See Musical Events

`IntentFrame` currently includes `events: MusicalEvent[]`, allowing grammars to read raw musical events. This violates invariant I3 ("meaning lives in rulesets, not grammars") and I4 ("grammars may not compute musical semantics").

The current `ParticleGrammar` implementation reads `input.events` directly to spawn particles on `note_on`, which is architecturally incorrect.

## Goals

- G1: Adapters emit protocol-appropriate representations without forcing musical semantics
- G2: Stabilizers produce proper musical abstractions (notes with duration, not note_on/note_off pairs)
- G3: Rulesets consume musical state, not protocol events
- G4: Grammars see only visual intents, never musical concepts
- G5: The same stabilizer/ruleset pipeline works for both MIDI and audio sources
- G6: Support future musical abstractions (phrases, progressions) without architectural changes

## Non-Goals

- NG1: Implementing all stabilizers (this RFC defines the contract, not implementations)
- NG2: Changing the renderer or compositor
- NG3: Defining the full taxonomy of musical abstractions

## Design

### Pipeline Data Flow (Revised)

Per SPEC 008, the pipeline runs per-part after routing. The revised flow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Pipeline                                        │
│                                                                              │
│  ┌──────────────┐                                                            │
│  │   Adapters   │  adapter.nextFrame() → RawInputFrame                       │
│  └──────┬───────┘                                                            │
│         │ RawInputFrame                                                      │
│         ▼                                                                    │
│  ┌──────────────┐                                                            │
│  │    Router    │  router.route(frame) → Map<PartId, RawInputFrame>          │
│  └──────┬───────┘                                                            │
│         │                                                                    │
│         ▼  For each part:                                                    │
│  ┌──────────────┐                                                            │
│  │  Stabilizers │  stabilizer.apply(raw) → MusicalFrame                      │
│  └──────┬───────┘                                                            │
│         │ MusicalFrame (per-part musical state)                              │
│         ▼                                                                    │
│  ┌──────────────┐                                                            │
│  │   Ruleset    │  ruleset.map(musical) → IntentFrame                        │
│  └──────┬───────┘                                                            │
│         │ IntentFrame (visual intents only)                                  │
│         ▼                                                                    │
│  ┌──────────────┐                                                            │
│  │   Grammars   │  grammar.update(intents, prev) → SceneFrame                │
│  └──────┬───────┘                                                            │
│         │                                                                    │
│         └─────────────────────────┐                                          │
│                                   ▼                                          │
│                          ┌──────────────┐                                    │
│                          │  Compositor  │  compose([scenes]) → SceneFrame    │
│                          └──────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Frame Types

#### RawInputFrame (Adapter Output)

Protocol-level input events. Adapters emit what they can observe without temporal accumulation.

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
  | AudioLoudness;

// Type alias for clarity (0-127 MIDI note number, distinct from musical Note)
export type MidiNoteNumber = number;

// MIDI protocol events
export interface MidiNoteOn {
  type: "midi_note_on";
  t: Ms;
  note: MidiNoteNumber;  // 0-127
  velocity: Velocity;    // 0-127
  channel: number;
}

export interface MidiNoteOff {
  type: "midi_note_off";
  t: Ms;
  note: MidiNoteNumber;
  channel: number;
}

export interface MidiCC {
  type: "midi_cc";
  t: Ms;
  controller: number;
  value: number;
  channel: number;
}

// Audio analysis events
export interface AudioOnset {
  type: "audio_onset";
  t: Ms;
  strength: number;      // 0-1
  confidence: Confidence;
}

export interface AudioPitch {
  type: "audio_pitch";
  t: Ms;
  hz: Hz;
  confidence: Confidence;
}

export interface AudioLoudness {
  type: "audio_loudness";
  t: Ms;
  db: number;
  confidence: Confidence;
}
```

#### MusicalFrame (Stabilizer Output, Ruleset Input)

Musical abstractions derived from accumulated raw input. This is what the ruleset reasons about.

Per-part musical state - there is no global musical state at this level. Cross-part concerns (like global tempo or harmonic context) are handled at the compositor level or by specialized cross-part analyzers that feed into the preset/macro system.

```ts
export interface MusicalFrame {
  t: Ms;
  part: PartId;
  notes: Note[];              // Currently sounding or recently released
  chords: Chord[];            // Active chord interpretations
  beat: BeatState | null;     // Current beat/meter context
  dynamics: DynamicsState;    // Loudness, envelope position
}

export interface BeatState {
  phase: number;              // 0-1 position within current beat
  tempo: number | null;       // BPM if detected
  confidence: Confidence;
}

export interface DynamicsState {
  level: number;              // 0-1 current loudness
  trend: "rising" | "falling" | "stable";
}
```

#### Note (Musical Abstraction)

A note is a musical event with pitch, duration, and dynamics - not a pair of on/off messages.

```ts
export interface Pitch {
  pc: PitchClass;           // 0-11 (C=0)
  octave: number;           // Scientific pitch notation octave
}

export type NotePhase = "attack" | "sustain" | "release";

export type NoteId = string; // Format: "{partId}:{onset}:{pc}{octave}" e.g. "piano:1500:C4"

export interface Note {
  id: NoteId;               // Deterministic: part + onset + pitch
  pitch: Pitch;
  velocity: Velocity;       // Initial attack velocity
  onset: Ms;                // When the note started
  duration: Ms;             // How long since onset (updated each frame)
  release: Ms | null;       // When release began (null if still held)
  phase: NotePhase;         // Current envelope phase
  confidence: Confidence;   // From audio: pitch detection confidence; 1.0 for MIDI
  provenance: Provenance;
}
```

**Note ID format**: `{partId}:{onset}:{pc}{octave}` ensures uniqueness - you cannot have two notes of the same pitch start at exactly the same time on the same part.

**Phase semantics:**
- `attack`: Note just started (first few ms, configurable)
- `sustain`: Note is being held
- `release`: Note was released, in decay tail (for visual fade-out)

Notes in `release` phase remain in the frame for a configurable duration (the **release window**) to allow visual fade-out. After the release window expires, they're removed from the frame.

#### Chord (Musical Abstraction)

Chords are detected by stabilizers from constituent notes.

```ts
export type ChordId = string; // Format: "{partId}:{onset}:{root}{quality}"

export interface Chord {
  id: ChordId;
  root: PitchClass;
  quality: ChordQuality;
  noteIds: NoteId[];        // References to constituent notes
  onset: Ms;
  duration: Ms;
  phase: "active" | "decaying";
  confidence: Confidence;
  provenance: Provenance;
}
```

#### IntentFrame (Ruleset Output, Grammar Input)

Visual intents only. No musical concepts.

```ts
export interface IntentFrame {
  t: Ms;
  intents: VisualIntent[];
  uncertainty: number;      // 0-1, overall frame uncertainty
}

// Note: 'events' field is REMOVED from IntentFrame
// Grammars MUST NOT see musical events
```

#### Visual Intent Relationships

Just as musical elements can reference each other (notes in a chord), visual intents can reference each other. This allows the ruleset to express "these visual elements are related" without leaking musical concepts.

```ts
export type IntentId = string;

export interface BaseVisualIntent {
  id: IntentId;
  t: Ms;
  confidence: Confidence;
  group?: IntentId;         // Reference to a parent/grouping intent
}

export interface PaletteIntent extends BaseVisualIntent {
  type: "palette";
  base: ColorHSVA;
  accents?: ColorHSVA[];
  stability: number;        // 0-1
}

export interface MotionIntent extends BaseVisualIntent {
  type: "motion";
  pulse: number;            // 0-1
  flow: number;             // -1..1
  jitter: number;           // 0-1
}

export interface TextureIntent extends BaseVisualIntent {
  type: "texture";
  grain: number;            // 0-1
  turbulence: number;       // 0-1
  anisotropy: number;       // 0-1
}

export interface ShapeIntent extends BaseVisualIntent {
  type: "shape";
  sharpness: number;        // 0-1
  complexity: number;       // 0-1
}

export type VisualIntent = PaletteIntent | MotionIntent | TextureIntent | ShapeIntent;
```

**Example**: When a ruleset maps a chord to visual intents:
1. Create a "chord group" intent (perhaps a ShapeIntent with `complexity` reflecting chord complexity)
2. Create individual PaletteIntents for each note, with `group` pointing to the chord intent's ID
3. Grammar sees "these palette intents are grouped under this shape intent" without knowing about chords

### Release Window and Preset Macros

The release window duration controls how long notes remain visible after release. This is a **global macro** stored at the preset level.

```ts
export interface PresetMacros {
  articulation: number;     // tight(0) .. loose(1)
  persistence: number;      // ephemeral(0) .. lingering(1)
  releaseWindow: Ms;        // Duration of release phase visibility
  emphasis: {
    melody: number;
    harmony: number;
    rhythm: number;
    timbre: number;
  };
}
```

The `persistence` macro conceptually controls how long visual elements linger. The `releaseWindow` is the concrete parameter that implements part of this - higher persistence = longer release window.

**Open question**: Should `releaseWindow` be derived from `persistence`, or remain independently configurable? For now, we make it explicit to allow precise control while keeping `persistence` as a higher-level concept that may affect multiple parameters.

### Interface Updates

#### ISourceAdapter (Updated)

```ts
export interface ISourceAdapter {
  readonly source: SourceId;
  readonly stream: StreamId;

  nextFrame(): RawInputFrame | null;
}
```

#### IStabilizer (Updated)

Stabilizers now transform RawInputFrame to MusicalFrame:

```ts
export interface IStabilizer {
  id: string;

  init(): void;
  dispose(): void;
  reset(): void;

  /**
   * Process raw input and produce/update musical state.
   * Stabilizers accumulate temporal context internally.
   */
  apply(raw: RawInputFrame, previous: MusicalFrame | null): MusicalFrame;
}
```

#### IRuleset (Updated)

Rulesets now consume MusicalFrame:

```ts
export interface IRuleset {
  id: string;

  /**
   * Pure function: maps musical state to visual intents.
   * No internal state. Same input always produces same output.
   */
  map(frame: MusicalFrame): IntentFrame;
}
```

## Examples

### Note Lifecycle

```
Time 0ms:    MIDI note_on (C4, velocity 80)
             → RawInputFrame: [MidiNoteOn{note:60, vel:80}]
             → Stabilizer creates Note{id:"piano:0:C4", pitch:{pc:0,octave:4}, phase:"attack"}
             → MusicalFrame: notes=[Note{phase:"attack", duration:0}]

Time 10ms:   No new input
             → RawInputFrame: {inputs:[]}
             → Stabilizer updates Note{phase:"sustain", duration:10}
             → MusicalFrame: notes=[Note{phase:"sustain", duration:10}]

Time 500ms:  MIDI note_off (C4)
             → RawInputFrame: [MidiNoteOff{note:60}]
             → Stabilizer updates Note{phase:"release", duration:500, release:500}
             → MusicalFrame: notes=[Note{phase:"release"}]

Time 700ms:  Release tail continues (releaseWindow = 500ms)
             → RawInputFrame: {inputs:[]}
             → Stabilizer keeps Note in release phase
             → MusicalFrame: notes=[Note{phase:"release", duration:700}]

Time 1000ms: Release window expired
             → Note removed from MusicalFrame
             → MusicalFrame: notes=[]
```

### Ruleset Mapping (No Musical Leakage)

```ts
class ExampleRuleset implements IRuleset {
  map(frame: MusicalFrame): IntentFrame {
    const intents: VisualIntent[] = [];
    let intentCounter = 0;

    // Map notes to palette intents
    for (const note of frame.notes) {
      const hue = pcToHue(note.pitch.pc, this.hueInvariant);
      const brightness = 0.3 + (note.velocity / 127) * 0.7;

      // Phase affects visual stability
      let stability: number;
      switch (note.phase) {
        case "attack": stability = 0.3; break;
        case "sustain": stability = 0.8; break;
        case "release": stability = 0.5; break;
      }

      intents.push({
        id: `palette-${intentCounter++}`,
        type: "palette",
        t: frame.t,
        base: { h: hue, s: 0.8, v: brightness, a: 1 },
        stability,
        confidence: note.confidence,
      });
    }

    // Map chords to grouped intents
    for (const chord of frame.chords) {
      const groupId = `chord-group-${intentCounter++}`;

      // Create a shape intent for the chord as a whole
      intents.push({
        id: groupId,
        type: "shape",
        t: frame.t,
        sharpness: chord.quality === "maj" ? 0.8 : 0.4,
        complexity: chord.noteIds.length / 4, // More notes = more complex
        confidence: chord.confidence,
      });

      // Note: Individual note intents could reference this group
      // via their `group` field if we wanted to associate them
    }

    return { t: frame.t, intents, uncertainty: 0 };
  }
}
```

### Grammar Response (Intent-Only)

```ts
class ExampleGrammar implements IGrammar {
  private entities: Map<IntentId, Entity> = new Map();

  update(input: IntentFrame, previous: SceneFrame | null): SceneFrame {
    const currentIds = new Set<IntentId>();

    // Process current intents
    for (const intent of input.intents) {
      currentIds.add(intent.id);

      if (intent.type === "palette") {
        const existing = this.entities.get(intent.id);
        if (existing) {
          // Update existing entity
          this.entities.set(intent.id, {
            ...existing,
            style: {
              ...existing.style,
              color: intent.base,
              opacity: intent.stability,
            },
          });
        } else {
          // New intent → new entity
          this.entities.set(intent.id, this.createParticle(intent));
        }
      }
    }

    // Begin fade for entities whose intents disappeared
    for (const [id, entity] of this.entities) {
      if (!currentIds.has(id)) {
        // Intent gone → mark for fade-out
        // (actual removal handled after fade completes)
      }
    }

    return {
      t: input.t,
      entities: Array.from(this.entities.values()),
      diagnostics: [],
    };
  }
}
```

## Migration Path

### Phase 1: Introduce New Types
1. Add `RawInputFrame`, `MusicalFrame`, and updated types to `@synesthetica/contracts`
2. Keep existing `CMSFrame` temporarily for compatibility
3. Add new type files without removing old ones

### Phase 2: Create/Update Specs
1. Create SPEC_009 documenting the new frame type contracts
2. Update SPEC_008 (Pipeline Orchestration) to reflect new data flow
3. Update SPEC_006 (Stabilizer Statefulness) with new interface

### Phase 3: Update Adapters
1. Change `MidiAdapter` to emit `RawInputFrame` with `MidiNoteOn`/`MidiNoteOff`
2. Update adapter tests
3. Ensure tests pass

### Phase 4: Implement Note-Tracking Stabilizer
1. Create `NoteTrackingStabilizer` that correlates note_on/note_off into `Note` objects
2. Implement note lifecycle (attack → sustain → release)
3. Produces `MusicalFrame` with proper note lifecycle
4. Add comprehensive tests
5. Ensure tests pass

### Phase 5: Update Ruleset
1. Change `MinimalRuleset` to consume `MusicalFrame`
2. Map `Note` objects (with phase) to visual intents
3. Remove `events` from `IntentFrame` contract
4. Update ruleset tests
5. Ensure tests pass

### Phase 6: Update Grammar
1. Change `ParticleGrammar` to respond to intents only
2. Remove all references to `input.events`
3. Use intent presence/absence for entity lifecycle
4. Update grammar tests
5. Ensure tests pass

### Phase 7: Update Pipeline
1. Update `Pipeline` class to use new frame types
2. Wire stabilizers to produce `MusicalFrame`
3. Update pipeline tests
4. Ensure tests pass

### Phase 8: Rebuild Web App
1. Update web app to use new pipeline
2. Verify end-to-end functionality with MIDI input
3. Manual testing of note visualization with proper release behavior

### Phase 9: Cleanup
1. Remove `CMSFrame` and legacy `NoteOn`/`NoteOff` types
2. Remove `events` field from any remaining references
3. Final test pass across all packages
4. Update README and documentation

## Impact on Invariants

This RFC **strengthens** existing invariants:

- **I1** (same ruleset for all sources): Reinforced. Both MIDI and audio produce `RawInputFrame`; same stabilizers produce `MusicalFrame`.
- **I3** (meaning in rulesets, not grammars): Enforced. Grammars no longer see musical events.
- **I4** (grammars may not compute musical semantics): Enforced. No musical data in `IntentFrame`.

## Resolved Questions

- **Q1 (Note.id)**: Deterministic format `{partId}:{onset}:{pc}{octave}` ensures uniqueness.
- **Q2 (Release window)**: Configurable per-preset via the `releaseWindow` macro.
- **Q3 (Intent correlation)**: Visual intents can reference each other via `group` field, keeping musical concepts out of intent layer.
- **Q4 (Chord/note relationship)**: Chords reference constituent notes by `NoteId` in `MusicalFrame`; visual intents use their own grouping mechanism.

## Open Questions

- **Q5**: Should `releaseWindow` be derived from the `persistence` macro, or remain independently configurable?
- **Q6**: How should cross-part musical analysis (e.g., detecting that two parts are playing the same chord) be handled? Compositor-level? Separate analyzer?

## Amendments to RFC 002

This RFC amends RFC 002 as follows:

1. **Section "Musical primitives"**: `NoteOn` and `NoteOff` are moved to `RawInput` types as `MidiNoteOn` and `MidiNoteOff`. The musical `Note` type replaces them as the primary note abstraction.

2. **Section "Visual intents"**: `IntentFrame.events` field is removed. Visual intents gain an `id` field and optional `group` field for correlation.

3. **Section "Stabilisers"**: Interface updated to transform `RawInputFrame` → `MusicalFrame`.

4. **Section "Ruleset"**: Interface updated to consume `MusicalFrame`.

5. **Section "Data model"**: New `RawInputFrame` and `MusicalFrame` types added. `CMSFrame` deprecated.
