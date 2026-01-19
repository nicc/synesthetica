# Glossary

---
id: GLOSSARY.core-v1
status: draft
owner: user
last_updated: 2026-01-05
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
A built-in visual grammar that produces visual entities from intents.

Grammars:
- are the building blocks users select and combine
- define *form*, not *meaning*
- may react to uncertainty with visual noise
- may not infer musical semantics

Examples:
- Stars (particles per note)
- Comets (chord trails)
- Rain (global decay field)

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
- is especially relevant for audio-derived CMS
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
A time-indexed snapshot of musical state produced by stabilizers.

MusicalFrame includes:
- Notes with duration and phase (attack/sustain/release)
- Detected chords
- Beat/meter context
- Dynamics state

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
A stateful module that transforms RawInputFrame into MusicalFrame.

Stabilizers handle:
- Note duration tracking (correlating note_on/note_off)
- Note phase transitions (attack → sustain → release)
- Chord detection
- Beat tracking
- Dynamics analysis

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
A pure function mapping MusicalFrame → VisualIntentFrame.

Rulesets:
- encode musical meaning
- apply invariants (pitch-class → hue, etc.)
- are source-agnostic
- produce visual intents, not visual output

> Analogy: the acoustic physics of an instrument.

---

## Visual Semantics

### VisualIntent
A rendering-agnostic description of *what should be expressed visually*.

Types:
- PaletteIntent (hue, saturation, brightness, stability)
- MotionIntent (pulse, flow, jitter)
- TextureIntent (grain, turbulence, anisotropy)
- ShapeIntent (sharpness, complexity)

Visual intents:
- have unique IDs for entity lifecycle correlation
- carry confidence
- can reference each other via group IDs
- contain no musical concepts

---

### VisualIntentFrame
A time-indexed collection of visual intents.

VisualIntentFrame:
- is the sole input to grammars
- contains only visual concepts (no musical events)
- includes overall uncertainty signal

---

## Visual Form & Rendering

### Grammar
A visual grammar that consumes VisualIntentFrame and produces SceneFrame.

Grammars:
- decide *form*, not *meaning*
- respond to visual intents (not musical events)
- may spawn, group, and evolve entities
- may react to uncertainty
- may not infer musical semantics

Grammars use intent IDs to track entity lifecycle:
- Intent appears → create entity
- Intent continues → update entity
- Intent disappears → begin fading entity

Examples:
- VisualParticleGrammar (particles per palette intent)

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
- VisualIntentFrame fixtures
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
Musical meaning is encoded in rulesets; visual form is encoded in grammars.

Violating this boundary is considered an architectural error.

---

### Vagueness Commitment  
An explicit decision to defer certain choices.

Vagueness is:
- documented
- intentional
- preserved until evidence demands commitment

---