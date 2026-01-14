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
- selected styles
- style parameters
- macro control values (articulation, persistence, emphasis)
- layout and compositing settings

Presets are:
- created by selecting styles and adjusting macros
- saved with user-chosen names
- recallable via speech
- incapable of redefining synesthetic meaning

### Style
A built-in visual grammar that produces visual entities from intents.

Styles:
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
- adjust stabilizers, styles, and compositor policies
- never alter instrument invariants

---

### Player
A default user role.

Players:
- select and combine styles
- adjust macro controls
- save configurations as presets
- describe desired outcomes in natural language

Players do **not** author new styles or rulesets.

---

### Builder / Luthier  
An advanced contributor role.

Builders:
- author styles against a strict API
- test styles independently
- publish styles packaged inside presets

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
- reference styles

Layer 2 modules:
- are testable in isolation
- obey strict interfaces

---

### Composite Layer  
The orchestration and extension layer.

Includes:
- presets
- style composition
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
A source-specific module that converts raw input into CMS frames.

Adapters:
- emit musical events and control signals
- annotate confidence, timing, and provenance
- are source-specific but output a common format

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

### Canonical Musical State (CMS)  
A unified, source-agnostic representation of musical facts and signals.

CMS includes:
- discrete musical events (notes, beats, chords)
- continuous control signals (loudness, tension, density)
- probability distributions (e.g. pitch-class distributions)
- confidence and provenance

All downstream mapping consumes CMS.

---

### CMS Frame  
A time-indexed snapshot of the Canonical Musical State.

CMS frames are:
- deterministic
- ordered in time
- the sole input to rulesets

---

### Musical Event  
A discrete musical occurrence.

Examples:
- note_on
- note_off
- beat
- chord

Events may be definitive (MIDI) or inferred (audio).

---

### Control Signal  
A continuous, time-varying musical descriptor.

Examples:
- loudness
- spectral centroid
- harmonic tension

Control signals include:
- confidence
- timescale metadata (micro / beat / phrase / section)

---

### Distribution Signal  
A probabilistic representation of a musical property.

Examples:
- pitch-class probability distribution

Used primarily for audio-derived inference.

---

### Stabilizer  
A pure transformation that converts raw CMS evidence into usable control signals.

Stabilizers handle:
- smoothing
- hysteresis
- debouncing
- confidence gating
- latency compensation

Stabilizers do **not** render visuals.

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
A deterministic mapping from CMS → Visual Intents.

Rulesets:
- encode musical meaning
- apply invariants
- are source-agnostic
- do not render visuals

> Analogy: the acoustic physics of an instrument.

---

## Visual Semantics

### Visual Intent  
A rendering-agnostic description of *what should be expressed visually*.

Examples:
- palette (hue, saturation, brightness)
- motion (pulse, flow, jitter)
- texture (grain, turbulence)
- shape (sharpness, complexity)

Visual intents:
- carry confidence
- are composable
- are not pixels

---

### Intent Frame  
A time-indexed collection of visual intents and relevant events.

Intent frames:
- are the sole input to styles
- preserve musical meaning
- include uncertainty signals

---

## Visual Form & Rendering

### Style  
A visual grammar that consumes intent frames and produces scene entities.

Styles:
- decide *form*, not *meaning*
- may spawn, group, and evolve entities
- may react to uncertainty
- may not infer musical semantics

Examples:
- note stars
- chord comets
- rain decay fields

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
- style
- optional motion

---

### Compositor  
A module that merges multiple style-produced scenes into one.

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
- CMS fixtures
- intent fixtures
- scene/entity fixtures

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
Musical meaning is encoded in rulesets; visual form is encoded in styles.

Violating this boundary is considered an architectural error.

---

### Vagueness Commitment  
An explicit decision to defer certain choices.

Vagueness is:
- documented
- intentional
- preserved until evidence demands commitment

---