# Glossary

---
id: GLOSSARY.core-v1
status: draft
owner: user
last_updated: 2026-01-19
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
A high-level mode describing how reactive, stable, or expressive the system should feel.

Examples:
- **Quiet** – stable, smoothed, restrained
- **Conversational** – reactive, expressive, visibly responsive

Interaction postures:
- influence macro controls
- affect smoothing, gating, and compositor constraints
- do **not** change musical meaning or synesthetic mappings

---

### Preset
The primary **user-facing unit of configuration**.

A preset bundles:
- selected grammars
- grammar parameters
- macro control values (articulation, persistence, emphasis)
- layout and compositing settings

Presets are:
- created by selecting grammars and adjusting macros
- saved with user-chosen names
- recallable via speech
- incapable of redefining synesthetic meaning

### Grammar
A built-in visual grammar that produces visual entities from annotated musical elements.

Grammars:
- are the building blocks users select and combine
- define *form*, not *meaning*
- know musical element categories (note, chord, beat) but not analysis details
- decide which elements to render (can filter)
- **own entity lifecycle** (TTL, decay, removal)
- may react to uncertainty with visual noise
- may not infer musical semantics

Examples:
- TestRhythmGrammar (timing markers for beats and notes)
- TestChordProgressionGrammar (chord glows with history trail)

---

### Macro Controls  
High-level, bounded parameters exposed to users.

Typical macros:
- **Articulation** (tight ↔ loose)
- **Persistence** (ephemeral ↔ lingering)
- **Emphasis** (melody / harmony / rhythm / timbre weighting)

Macros:
- adjust stabilizers, grammars, and compositor policies
- never alter instrument invariants

---

### Player
A default user role.

Players:
- select and combine grammars
- adjust macro controls
- save configurations as presets
- describe desired outcomes in natural language

Players do **not** author new grammars or rulesets.

---

### Builder / Luthier  
An advanced contributor role.

Builders:
- author grammars against a strict API
- test grammars independently
- publish grammars packaged inside presets

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
- rulesets (instrument definitions)
- reference grammars

Layer 2 modules:
- are testable in isolation
- obey strict interfaces

---

### Composite Layer  
The orchestration and extension layer.

Includes:
- presets
- grammar composition
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
- emit protocol-level events (MIDI note_on/off, audio features)
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
- **Current state**: Notes, chords, beat, dynamics (what's sounding now)
- **Recent context**: Progression, phrases via references (what led here)
- No raw events (those stay in RawInputFrame)

This design allows rulesets to remain pure functions while accessing temporal context like harmonic tension or phrase position.

Context uses **references, not copies** — a chord in `progression` references `chords[]` by ID.

MusicalFrame is the stabilizer's output and ruleset's input.

---

### Note
A musical abstraction representing a sounding pitch.

Notes have:
- pitch (pitch class + octave)
- velocity
- duration (time since onset)
- phase (attack → sustain → release)
- confidence

Notes are not pairs of on/off messages - they are proper musical entities with lifecycle.

---

### Stabilizer
A stateful musical analyzer that transforms transient events into stable, temporal abstractions.

The name "stabilizer" (rather than "analyzer") reflects the core function: these components don't just observe — they **stabilize** fleeting signals into persistent musical state. A note-on/note-off pair becomes a Note with duration. Scattered onsets become a coherent Beat with tempo. This temporal stabilization, with hysteresis and state tracking, is the defining characteristic.

Stabilizers form a **DAG (directed acyclic graph)** based on dependencies:
- **Independent stabilizers** (note tracking, beat detection) process raw input directly
- **Derived stabilizers** (chord detection, phrase detection) depend on upstream stabilizers

Stabilizers handle:
- Note duration tracking (correlating note_on/note_off)
- Note phase transitions (attack → sustain → release)
- Chord detection
- Beat tracking
- Dynamics analysis
- Context windowing (progression history, phrase boundaries)

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

### Ruleset
A pure function mapping MusicalFrame → AnnotatedMusicalFrame (RFC 006).

Rulesets:
- encode musical meaning as visual annotations
- apply invariants (pitch-class → hue, chord quality → warm/cool palette)
- define the *visual vocabulary* users learn
- are source-agnostic
- do NOT decide what shapes to use or which elements to render

> Analogy: defining what colors mean. Grammars decide how to paint with them.

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
- allow grammars to style their chosen representations
- do NOT dictate what shapes to use

---

### AnnotatedMusicalFrame
Musical elements with visual annotations attached (RFC 006).

AnnotatedMusicalFrame:
- is the ruleset's output and grammar's input
- contains annotated notes, chords, beats, dynamics
- preserves musical element identity (grammars know "this is a note")
- carries visual properties without exposing musical analysis

---

### AnnotatedNote
A Note with its visual annotation.

Contains:
- The underlying musical Note
- Visual properties (palette, texture, motion)
- Optional label for display

---

### AnnotatedChord
A Chord with its visual annotation.

Contains:
- The underlying MusicalChord
- Visual properties (palette, texture, motion)
- List of constituent note IDs
- Optional label (e.g., "Cmaj", "Am")

---

## Visual Form & Rendering

### Grammar
A visual grammar that consumes AnnotatedMusicalFrame and produces SceneFrame (RFC 006).

Grammars:
- decide *form*, not *meaning*
- know musical element *categories* (note, chord, beat) but not analysis details
- use visual annotations to style their representations
- decide which elements to render (can filter, e.g., rhythm grammar ignores chords)
- **own entity lifecycle** (TTL, decay, removal)
- may spawn, group, and evolve entities
- may not infer musical semantics

**Key insight (RFC 006):** Grammars have creative agency. They decide which musical elements to render, what shapes to use, and how to animate. Different grammars can render the same annotated content completely differently.

Examples:
- TestRhythmGrammar (beats and notes as timing markers)
- TestChordProgressionGrammar (chords as glows with history trail)

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
- grammar
- optional motion

---

### Compositor  
A module that merges multiple grammar-produced scenes into one.

Responsibilities:
- resolve collisions
- enforce constraints
- apply global effects
- maintain legibility

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
Musical meaning is encoded in rulesets (visual vocabulary); visual form is encoded in grammars (rendering choices).

Rulesets define what colors mean. Grammars decide how to paint with them.

Violating this boundary is considered an architectural error.

---

### Vagueness Commitment  
An explicit decision to defer certain choices.

Vagueness is:
- documented
- intentional
- preserved until evidence demands commitment

---