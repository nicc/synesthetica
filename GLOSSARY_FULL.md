# Glossary

---
id: GLOSSARY.core-v1
status: draft
owner: user
last_updated: 2026-10-22
---

## Purpose
A shared vocabulary for terms used throughout the project.

Entries should aim for **clarity over completeness**.

# Synesthetica Glossary  
*(Consolidated for RFC 0001 + RFC 0002)*

This glossary defines architectural, interaction, and domain terms used across Synesthetica RFCs.  
Terms are defined once and should be used consistently across documents and code.

Where relevant, definitions explicitly state **scope boundaries** (what a thing may or may not do).

---

## Interaction & UX Terms

### Interaction Model  
The overarching philosophy governing how users communicate intent to the system.

Key properties:
- Speech-first
- Layered responsibility
- Minimal exposure of internal mechanics
- Learnable over time

Defined in **RFC 0001**.

---

### Interaction Posture  
A behavioural stance the LLM adopts in conversation, inferred from context (SPEC_004).

Examples:
- **Quiet** – short commands only; no clarifying questions; failures are silent no-ops
- **Conversational** – tolerates ambiguity; may ask clarifying questions; explains changes

Interaction postures:
- are LLM behaviour only — the engine has no posture setting, enum, or prompt for them
- do **not** change musical meaning or synesthetic mappings

---

### Preset
The primary **user-facing unit of configuration**.

A preset stores (SPEC_001):
- macro values (the user-facing intents, e.g. `harmony:linger`)
- session controls (prescribed key, tempo, meter, chord mode)

It does not store the input source, so loading a preset never switches devices.

Presets are:
- created by adjusting macros and session controls, then saving
- saved with user-chosen names (overwriting on collision)
- recallable via speech
- incapable of redefining synesthetic meaning

### Lens
*(Formerly: Grammar. The rename is complete in code; "grammar" should not be used.)*

A built-in visual interpretation that turns the annotated musical frame into scene entities. See [Lens](#lens-1) under Visual Form & Rendering for the architectural definition.

Three lenses exist, sharing a three-column layout (`packages/engine/src/lenses/layout.ts`):
- **DynamicsLens** (left) — vertical VU-meter bar with fading velocity indicators
- **RhythmLens** (centre) — pitch-class note strips scrolling up through a NOW line; beat/bar grid and drift streaks when a tempo is prescribed
- **HarmonyLens** (right) — chord symbol above, harmony clock (chord numerals and connection strips) below

All three always run. Users shape them through macros (e.g. `rhythm:horizon`, `harmony:linger`); there is no lens selection or switching today.

---

### Macro Controls  
High-level, bounded parameters exposed to users.

Examples (the full list is in `packages/contracts/annotations/manifest.ts`):
- **`harmony:linger`** — how long chord numerals linger on the harmony clock
- **`rhythm:horizon`** — how much history and lookahead the rhythm lens shows
- **`rhythm:difficulty`** — compound; tightens horizon and timing tolerance together
- **`harmony:arpeggio-tolerance`** — how long chord detection holds released pitches

Macros:
- adjust stabilizers, the vocabulary, and lenses (each macro declares its consumers; SPEC_014)
- never alter instrument invariants

---

### Player
A default user role.

Players:
- adjust macro controls and session controls
- save configurations as presets
- describe desired outcomes in natural language

Players do **not** author new lenses or visual vocabularies.

---

### Builder / Luthier  
An advanced contributor role.

Builders:
- author lenses against a strict API (`IVisualLens`)
- test lenses independently

Builders do **not** redefine synesthetic invariants.

---

## Architectural Layers (RFC 0001)

### Layer 1: System-Native Core  
The minimal, stable foundation of the system.

Includes:
- type definitions
- pipeline orchestration
- deterministic stepping
- stabilizer primitives
- compositor and renderer interfaces

Layer 1:
- changes rarely
- prioritises correctness and testability

---

### Layer 2: Produced Primitives  
Modules that *produce meaning* or *canonical form*.

Includes:
- source adapters
- stabilizers
- visual vocabularies (instrument definitions)
- reference lenses

Layer 2 modules:
- are testable in isolation
- obey strict interfaces

---

### Composite Layer  
The orchestration and extension layer.

Includes:
- presets
- lens composition
- draw effects and mutators
- constraint policies
- higher-level scene strategies

The composite layer is where expressive variation lives.

---

## Musical Data Model

### Source  
An origin of musical data.

Examples:
- MIDI stream
- Audio stream

Sources do not determine meaning; they provide evidence.

---

### Adapter
A source-specific module that converts raw input into RawInputFrame.

Adapters:
- emit protocol-level events (MIDI note_on/off/CC, audio onset/pitch/loudness/note events)
- annotate timing and provenance
- are source-specific but output a common format (RawInputFrame)

---

### Provenance  
Metadata describing where a piece of musical evidence came from.

Includes:
- source type
- stream identifier
- model name/version (if applicable)

Used for debugging, auditing, and reproducibility.

---

### Confidence  
A scalar (0–1) representing certainty in a musical claim.

Confidence:
- affects rendering stability and noise
- does **not** change musical meaning

---

### Uncertainty  
A derived notion representing ambiguity or entropy in the musical state.

Uncertainty:
- increases visual noise, jitter, diffusion
- is especially relevant for audio-derived input
- is first-class in the system

---

### RawInputFrame
Protocol-level input from adapters.

RawInputFrame includes:
- MIDI events (note_on, note_off, CC)
- Audio features (onset, pitch, loudness)
- Timing and source identification

RawInputFrame is the adapter's output and stabilizer's input.

---

### MusicalFrame
A time-indexed **snapshot with context** of musical state produced by stabilizers.

MusicalFrame includes:
- **Current state**: Notes, chords, dynamics (what's sounding now)
- **Recent context**: Progression via references (what led here); harmonic context (tension, functional analysis)
- **Prescribed context**: User-set tempo, meter, key, and chord interpretation (never inferred)
- No raw events (those stay in RawInputFrame)

This design allows visual vocabularies to remain pure functions while accessing temporal context like harmonic tension.

Context uses **references, not copies** — a chord in `progression` references `chords[]` by ID.

MusicalFrame is the stabilizer's output and visual vocabulary's input.

---

### Note
A musical abstraction representing a sounding pitch.

Notes have:
- pitch (pitch class + octave)
- velocity
- duration (time since onset; frozen at release)
- phase (attack → sustain → release)
- confidence

Notes are not pairs of on/off messages - they are proper musical entities with lifecycle.

---

### Stabilizer
A stateful musical analyzer that transforms transient events into stable, temporal abstractions.

The name "stabilizer" (rather than "analyzer") reflects the core function: these components don't just observe — they **stabilize** fleeting signals into persistent musical state. A note-on/note-off pair becomes a Note with duration. A cloud of held and decaying pitches becomes a Chord, held steady by hysteresis. This temporal stabilization, with hysteresis and state tracking, is the defining characteristic.

Stabilizers form a **DAG (directed acyclic graph)** based on dependencies (SPEC_008):
- **Independent stabilizers** (`NoteTrackingStabilizer`) process raw input directly
- **Derived stabilizers** (`DynamicsStabilizer`, `ChordDetectionStabilizer`, `HarmonyStabilizer`) depend on upstream stabilizers

Stabilizers handle:
- Note duration tracking (correlating note_on/note_off)
- Note phase transitions (attack → sustain → release)
- Chord detection and progression history
- Dynamics analysis
- Harmonic tension and functional analysis (when a key is prescribed)

Stabilizers do not infer tempo, meter, or key; those are prescribed by the user. Phrase detection is not implemented (synesthetica-nob).

Musical state — anything more than one consumer must agree on — lives in stabilizers, not lenses (SPEC_006).

Stabilizers accumulate temporal context to produce proper musical abstractions.

---

## Mapping & Meaning

### Instrument Definition  
The fixed synesthetic operating scheme of the system.

Defines:
- what musical features matter
- how they map to visual intent channels

Instrument definitions change rarely and deliberately.

---

### Invariant  
A rule that must always hold for a given instrument definition.

Examples:
- pitch-class → hue mapping
- octave equivalence
- confidence affects stability, not meaning

Invariants ensure internal coherence.

---

### Visual Vocabulary
*(Also known as: Vocabulary. Formerly: Ruleset.)*

A pure function mapping MusicalFrame → AnnotatedMusicalFrame (RFC 006).

Visual Vocabularies:
- encode musical meaning as visual annotations
- apply invariants (pitch-class → hue, chord quality → warm/cool palette)
- define the *visual vocabulary* users learn
- are source-agnostic
- do NOT decide what shapes to use or which elements to render

> Analogy: defining what colors mean. Lenses decide how to paint with them.

The interface is `IVisualVocabulary` in contracts.

---

## Visual Annotations (RFC 006)

### VisualAnnotation
Properties attached to a musical element describing how it should look visually.

Includes:
- **PaletteRef**: Primary, secondary, accent colors (HSV)
- **TextureRef**: Grain, turbulence, anisotropy
- **MotionAnnotation**: Pulse, flow, jitter

Visual annotations:
- carry semantic meaning (e.g., warm colors = major, cool colors = minor)
- are attached to musical elements, not separate intents
- allow lenses to style their chosen representations
- do NOT dictate what shapes to use

---

### AnnotatedMusicalFrame
Musical elements with visual annotations attached (RFC 006).

AnnotatedMusicalFrame:
- is the vocabulary's output and the lenses' input
- contains annotated notes, chords, bars, dynamics, plus the progression, harmonic context, pitch-hue invariant and pitch-class names
- preserves musical element identity (lenses know "this is a note")
- carries stabilizer analysis through to lenses, so lenses never need to compute it

---

### AnnotatedNote
A Note with its visual annotation.

Contains:
- The underlying musical Note
- Visual properties (palette, texture, motion; optional debug label)
- Velocity and phase annotations (I16, I17)
- Modelled partials for the harmonic series overlay

---

### AnnotatedChord
A Chord with its visual annotation.

Contains:
- The underlying MusicalChord
- Visual properties (palette, texture, motion; optional debug label)
- List of constituent note IDs
- Chord shape geometry (I18)

---

### Harmonic Series Overlay
An optional display of the harmonic series each sounding note implies. Modelled, not measured: MIDI carries no timbre, so partial levels come from a generic rolloff. Framed as a theoretical overlay, in the same class as implied-resolution arcs. Toggled per lens (`rhythm:overtones`, default off; `harmony:overtones`, default on). Rendered in the rhythm lens as overtone strips and around the chord glyph as an overtone halo. See SPEC 010 §6 and RFC 012.

---

### Partial
One component of a note's harmonic series, identified by harmonic number n (n = 1 is the fundamental), with a real pitch (12·log₂ n semitones above the fundamental, continuous, not snapped to pitch class) and a level. Levels are modelled from a generic rolloff today; the contract carries partial levels so a measured source can replace the model later. Never a `Note`: chord detection, dynamics and harmony analysis do not treat partials as notes (Invariant I31). Numbering: partial n is overtone n − 1; this project counts partials.

---

## Visual Form & Rendering

### Lens
A module that consumes AnnotatedMusicalFrame and produces SceneFrame (RFC 006). Interface: `IVisualLens` in `packages/contracts/pipeline/interfaces.ts`. *(Formerly: Grammar.)*

Lenses:
- decide *form*, not *meaning*
- consume stabilizer-derived analysis on the frame (chord quality, `harmonicContext`) but never compute musical analysis themselves (I3, I4)
- use visual annotations to style their representations
- decide which elements to render (can filter, e.g., RhythmLens ignores chords)
- **own entity lifecycle** (TTL, decay, removal)
- may spawn, group, and evolve entities
- may hold bounded, pruned presentation caches (e.g. HarmonyLens's chord fade-out, RhythmLens's per-note drift); musical state belongs in stabilizers (SPEC_006)

**Key insight (RFC 006):** Lenses have creative agency. They decide which musical elements to render, what shapes to use, and how to animate. Different lenses can render the same annotated content completely differently.

Current lenses: `RhythmLens`, `HarmonyLens`, `DynamicsLens` (see [Lens](#lens) above and `packages/engine/src/lenses/README.md`). Per-lens visual terms are in `packages/engine/src/lenses/GLOSSARY.md`.

---

### Scene  
A collection of visual entities representing the current visual state.

Scenes are:
- time-indexed
- deterministic
- renderer-agnostic

---

### Entity  
A renderable visual object in the scene.

Examples:
- particles
- trails
- glyphs
- fields

Entities have:
- lifecycle
- an owning lens (entity ids are prefixed with the lens id)
- optional motion

---

### Compositor  
A module that merges multiple lens-produced scenes into one.

Intended responsibilities:
- resolve collisions
- enforce constraints
- apply global effects
- maintain legibility

The only implementation, `IdentityCompositor`, concatenates entities; none of the above is implemented (SPEC_008).

---

### Renderer  
The final stage that turns a scene into pixels.

Renderers:
- are interchangeable
- are outside semantic logic
- may be debug-only or production-grade

---

## Testing & Workflow Terms

### Golden Corpus
A deterministic set of fixtures used for contract-first testing.

Includes:
- RawInputFrame fixtures
- MusicalFrame fixtures
- AnnotatedMusicalFrame fixtures
- SceneFrame fixtures

Golden corpus enables:
- independent module development
- regression testing
- confidence in refactors

---

### Vertical Slice  
A minimal end-to-end implementation crossing all layers.

Used to:
- validate architecture
- test ergonomics
- surface missing abstractions

---

## Design Principles (Cross-cutting)

### Piano Principle  
The system should feel like an acoustic instrument:
- fixed operating scheme
- expressive through use, not configuration
- learnable and consistent

---

### Separation of Meaning and Form
Musical meaning is encoded in visual vocabularies; visual form is encoded in lenses (rendering choices).

Visual vocabularies define what colors mean. Lenses decide how to paint with them.

Violating this boundary is considered an architectural error.

---

### Vagueness Commitment  
An explicit decision to defer certain choices.

Vagueness is:
- documented
- intentional
- preserved until evidence demands commitment

---