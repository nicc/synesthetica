# Glossary

Project-wide terms. Use them consistently in code, specs and conversation. Per-lens visual terms (harmony clock, guide band, note strip, …) are in [packages/engine/src/lenses/GLOSSARY.md](packages/engine/src/lenses/GLOSSARY.md). Retired terms: **grammar** (now lens), **ruleset** (now visual vocabulary).

**Pipeline:** Source → Adapter → `RawInputFrame` → Stabilizers → `MusicalFrame` → Visual Vocabulary → `AnnotatedMusicalFrame` → Lenses → `SceneFrame` → Compositor → Renderer.

Meaning flows downstream. Vocabularies define what visuals mean; lenses decide form.

---

## User-facing

### Preset
The user-facing unit of configuration (SPEC_001). Stores macro values and session controls (prescribed key, tempo, meter, chord mode). Does not store the input source, so loading a preset never switches devices. Saved under user-chosen names (overwriting on collision), recallable by speech, and cannot redefine synesthetic meaning.

### Macro
A high-level, bounded parameter exposed to users, e.g. `harmony:linger`, `rhythm:horizon`, `rhythm:difficulty` (compound). The full list is the annotation manifest, `packages/contracts/annotations/manifest.ts`. Each macro declares the stabilizers, vocabulary or lenses that consume it (SPEC_014). Macros never alter invariants.

### Session control
A user-prescribed musical fact the system does not infer: key, tempo, meter, chord mode. Declared in the manifest alongside macros.

### Interaction Posture
A stance the LLM adopts in conversation, inferred from context (SPEC_004). **Quiet**: short commands, no clarifying questions, failures are silent no-ops. **Conversational**: tolerates ambiguity, may ask questions, explains changes. LLM behaviour only: the engine has no posture setting, and postures never change musical meaning.

---

## Musical data

### Source
An origin of musical data (MIDI stream, audio stream). Sources provide evidence; they do not determine meaning.

### Adapter
Converts a source into `RawInputFrame`. Emits protocol-level events (MIDI note_on/off/CC; audio onset, pitch, loudness, note events) with timing and provenance.

### Provenance
Where a piece of evidence came from: source type, stream id, model name and version if any. For debugging, auditing and reproducibility.

### Confidence
A scalar (0–1) of certainty in a musical claim. Affects rendering stability, never musical meaning.

### Uncertainty
Ambiguity in the musical state, mainly from audio input. Shows as visual instability (noise, jitter, diffusion), not as a change of meaning.

### RawInputFrame
Protocol-level input: MIDI events, audio features, timing and source identity. Adapter output, stabilizer input.

### MusicalFrame
A time-indexed snapshot of musical state with context, produced by stabilizers:
- **Current state**: notes, chords, dynamics
- **Recent context**: progression (by reference to `chords[]` ids, not copies) and harmonic context (tension, functional analysis)
- **Prescribed context**: user-set tempo, meter, key and chord interpretation, never inferred

No raw events. Carrying context lets visual vocabularies stay pure functions. Stabilizer output, vocabulary input.

### Note
A sounding pitch as a musical entity, not a pair of on/off messages: pitch (class + octave), velocity, duration (time since onset, frozen at release), phase (attack → sustain → release), confidence.

### Stabilizer
A stateful analyser that turns transient events into stable musical abstractions: on/off pairs become Notes with duration; held and decaying pitches become a Chord held steady by hysteresis. Stabilizers form a DAG (SPEC_008): `NoteTrackingStabilizer` reads raw input; `DynamicsStabilizer`, `ChordDetectionStabilizer` and `HarmonyStabilizer` depend on it.

Stabilizers do not infer tempo, meter or key. Musical state (anything more than one consumer must agree on) lives in stabilizers, not lenses (SPEC_006).

---

## Meaning

### Instrument Definition
The fixed synesthetic operating scheme: which musical features matter and how they map to visual channels. Changes rarely and deliberately.

### Invariant
A rule that always holds for the instrument definition, e.g. pitch-class → hue, octave equivalence, confidence affects stability not meaning. Numbered I1… in SPEC_003 and the specs that extend it.

### Visual Vocabulary
*(Also: vocabulary.)* A pure function `MusicalFrame` → `AnnotatedMusicalFrame` (RFC 006). Encodes musical meaning as visual annotations and applies the invariants. Source-agnostic. Does not choose shapes or which elements to render. Interface: `IVisualVocabulary`.

### Separation of Meaning and Form
Vocabularies define what colours mean; lenses decide how to paint with them. Crossing this boundary is an architectural error.

---

## Visual annotations

### VisualAnnotation
Properties attached to a musical element that carry its visual meaning: palette (HSV colours), texture, motion. Lenses use them to style whatever representation they choose; they do not dictate shape.

### AnnotatedMusicalFrame
The vocabulary's output and the lenses' input: annotated notes, chords, bars and dynamics, plus the progression, harmonic context, pitch-hue invariant and pitch-class names. Preserves element identity ("this is a note") and carries stabilizer analysis through, so lenses never compute it.

### AnnotatedNote
A Note plus its visual annotation, velocity and phase annotations (I16, I17), and modelled partials.

### AnnotatedChord
A chord plus its visual annotation, constituent note ids and chord-shape geometry (I18).

### Harmonic Series Overlay
An optional display of the harmonic series each sounding note implies. Modelled, not measured: MIDI carries no timbre, so partial levels come from a generic rolloff. Toggled per lens (`rhythm:overtones`, default off; `harmony:overtones`, default on). Rendered as overtone strips in the rhythm lens and an overtone halo around the chord glyph. SPEC_010 §6, RFC 012.

### Partial
One component of a note's harmonic series, numbered n (n = 1 is the fundamental; partial n is overtone n − 1), with a real pitch 12·log₂ n semitones above the fundamental and a modelled level. Never a `Note`: chord detection, dynamics and harmony analysis ignore partials (I31).

---

## Form and rendering

### Lens
Turns `AnnotatedMusicalFrame` into `SceneFrame`. Interface: `IVisualLens`. A lens:
- decides form, not meaning
- reads stabilizer analysis from the frame (chord quality, `harmonicContext`) but never computes musical analysis (I3, I4)
- chooses which elements to render and how (RhythmLens ignores chords)
- owns entity lifecycle (TTL, decay, removal)
- may hold bounded, pruned presentation caches (HarmonyLens chord fade-out, RhythmLens per-note drift), never musical state (SPEC_006)

Three lenses share a three-column layout (`packages/engine/src/lenses/layout.ts`): **DynamicsLens** (left, level meter with fading velocity indicators), **RhythmLens** (centre, note strips scrolling to a NOW line; beat grid and drift when a tempo is prescribed), **HarmonyLens** (right, chord glyph above, harmony clock below). All three always run; users shape them with macros, not by switching.

### Scene
The visual entities at a moment in time. Time-indexed, deterministic, renderer-agnostic.

### Entity
A renderable visual object (strip, glyph, ring, …) with a lifecycle and an owning lens. Entity ids are stable across frames and prefixed with the lens id.

### Compositor
Merges lens scenes into one `SceneFrame`. The only implementation, `IdentityCompositor`, concatenates entities (SPEC_008).

### Renderer
Turns a scene into pixels. Holds no semantic logic. `ThreeJSRenderer` is the production renderer.
