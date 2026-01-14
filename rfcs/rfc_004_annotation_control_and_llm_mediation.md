# RFC 0004: Annotation-Driven Control and LLM Mediation

Status: Draft
Author(s): Synesthetica
Date: 2026-01-10

### Related:
- RFC 0001 — Interaction Model
- RFC 0002 — Canonical Musical State + Grammar API v0
- RFC 0003 — Parts, Routing, and Per-Instrument Layout

## Summary

This RFC formalises the role of a language model–mediated control layer (for all speech interaction) and introduces annotation as the primary mechanism for expressing how grammars and presets relate to musical concepts.

Rather than codifying semantic commands such as "emphasise rhythm" into fixed control operations, the system:
- annotates grammars and presets with illustrative affordances
- exposes a bounded, deterministic execution surface
- relies on an LLM to interpret user intent and select or adjust configurations accordingly

This preserves expressive flexibility while maintaining architectural safety.

## Motivation

We want users to be able to say things like:
- “Let’s emphasise rhythm”
- “Make harmony more legible”
- “This feels too busy — calm it down”
- “Bring the guitar forward, but keep it subtle”

Without requiring:
- explicit parameter knowledge
- predefined semantic macros
- brittle if/else logic in the engine

At the same time, we want:
- reproducibility
- testability
- bounded effects
- a stable instrument identity

This RFC establishes annotation + LLM interpretation as the bridge between natural language and system control.

## Core Principle

Meaning is not hard-coded into control operations. Meaning is inferred by an LLM using annotated affordances.

The engine provides:
- structure
- constraints
- metadata

The LLM provides:
- interpretation
- balancing
- contextual judgement

## Roles and Responsibilities

The Engine
- exposes typed, bounded configuration surfaces
- guarantees deterministic execution of applied changes
- does not attempt to interpret musical intent

The LLM (“Skilled Operator”)
- receives documentation and metadata
- interprets user speech in context
- selects and adjusts configurations
- balances competing affordances (e.g. rhythm vs harmony)

The User
- speaks in musical or perceptual language
- never manipulates low-level parameters directly

## Annotation Strategy

Annotations are descriptive, not prescriptive. They inform what a thing is good at, not how it must be used.

Annotations appear in:
- grammar documentation
- preset documentation
- optional machine-readable metadata

Annotations are mandatory for grammars, presets and macros.

## Grammar Annotation

Grammars describe what they visually illustrate well.

Conceptual Fields (Non-Normative)
- Musical concepts:
  - rhythm
  - harmony
  - melody
  - timbre
  - density
  - articulation
- Visual behaviours:
  - discrete vs continuous
  - transient vs persistent
  - spatial vs layered
- Readability traits:
  - high contrast
  - low flicker
  - aggregate-friendly
  - detail-preserving

Example (Documentation-Level)

```yaml
illustrates:
  musical:
    - rhythm
    - articulation
  visual:
    - discrete
    - transient
    - directional
notes:
  - responds strongly to onsets
  - becomes noisy under high density
```

This does not imply any automatic behaviour — it is advisory context for the LLM.

## Preset Annotation

Presets describe what kind of musical reading they favour overall.

Conceptual Fields
- Emphasis tendencies:
  - rhythm-forward
  - harmony-forward
  - balanced
- Visual character:
  - minimal
  - expressive
  - dense
  - sparse
- Typical use:
  - percussive music
  - sustained harmonic material
  - solo lines
- Readability profile:
  - stable
  - reactive
  - cinematic
  - analytical

Example

```yaml
tendencies:
  emphasises:
    - rhythm
    - articulation
  de_emphasises:
    - sustained harmony
style:
  - energetic
  - high-contrast
readability:
  - reactive
```

Again, this is guidance, not executable logic.

## Macro Annotation

### Purpose
Macros are the primary lever through which the LLM adjusts system behaviour in response to high-level user intent.

To support reliable interpretation, each macro must be annotated with:
- the perceptual or musical dimensions it affects
- the nature of the tradeoff it represents
- qualitative expectations of increasing vs decreasing it

Macros remain bounded, continuous, and implementation-defined — annotation does not prescribe exact parameter mappings.

### Macro Annotation Structure (Conceptual)
Each macro is annotated along three axes:
1) Conceptual dimensions
2) Directional interpretation
3) Interaction notes

### Example: articulation

```yaml
macro: articulation
affects:
  musical:
    - rhythm
    - articulation
    - phrasing
  perceptual:
    - separation
    - clarity
directionality:
  low:
    description: looser, smoother, more blended
    tends_to:
      - reduce onset salience
      - favour sustained texture
  high:
    description: tighter, crisper, more discrete
    tends_to:
      - emphasise onsets
      - improve rhythmic legibility
notes:
  - interacts strongly with density
  - excessive values can fragment sustained material
```

### Example: persistence 

```yaml
macro: persistence
affects:
  musical:
    - harmony
    - texture
  perceptual:
    - continuity
    - memory
directionality:
  low:
    description: ephemeral, quickly decaying
    tends_to:
      - emphasise rhythm and gesture
  high:
    description: lingering, accumulative
    tends_to:
      - emphasise harmonic field
      - create visual memory
notes:
  - interacts with tempo and register
```

### Example: emphasis.rhythm

```yaml
macro: emphasis.rhythm
affects:
  musical:
    - rhythm
    - timing
    - groove
  perceptual:
    - motion
    - pulse
directionality:
  low:
    description: rhythm less foregrounded
    tends_to:
      - defer to harmony or texture
  high:
    description: rhythm foregrounded
    tends_to:
      - prioritise motion cues
      - reduce competing signals
notes:
  - balanced against emphasis.harmony and emphasis.melody
```

## LLM Mediation Model

### Inputs to the LLM

- User utterance(s)
- Current parts and presets
- Annotation metadata for:
  - available grammars
  - available presets
- System state (posture, recent changes)

### Outputs from the LLM

The LLM produces intentful configuration changes, such as:
- selecting a different preset
- adjusting macro values
- swapping or enabling grammars
- modifying layout or compositing

The engine executes these changes deterministically.

### Bounded Execution Surface

Although interpretation is flexible, execution remains bounded.

Constraints include:
- macro ranges are clamped
- grammar parameters are schema-validated
- layout/compositing options are enumerated
- changes are incremental unless explicitly reset

This ensures:
- safety
- undoability
- predictability

### Why “Emphasise Rhythm” Is Not a Control Op

"Emphasise rhythm" is:
- context-dependent
- grammar-dependent
- subjective
- multi-dimensional

Hard-coding it would:
- freeze interpretation too early
- limit expressive range
- push meaning into the engine

Instead:
- the LLM weighs annotations
- considers current material
- chooses the best available configuration

This keeps the system adaptable without becoming opaque.

### Speech Interaction Pattern (Illustrative)

User:

> “Let’s emphasise rhythm.”

LLM (internal reasoning):
- current preset is harmony-forward
- available preset X is rhythm-forward
- grammar Y illustrates onsets clearly
- articulation macro can be tightened slightly

LLM (executed actions):
- switch preset to X
- adjust articulation +0.2

Engine:
- applies changes deterministically
- produces new visuals

### Documentation Requirements

To support this model, the following must be documented:
- grammar annotations
- preset annotations
- macro semantics (qualitative descriptions)
- system invariants and constraints

This documentation is part of the LLM skill.

## Non-Goals
- Encoding semantic commands into the engine
- Guaranteeing a single “correct” interpretation
- Removing subjective judgement from control
- Exposing low-level parameters to users

## Invariants (Additive)
- I10: The engine never interprets musical intent.
- I11: Annotations are advisory, not executable.
- I12: All execution remains bounded and deterministic.
- I13: The LLM may balance, but not violate, system constraints.

## Open Questions (Tracked)
- How much annotation should be machine-readable vs prose?
- Should user-created presets require annotation?
- How do we surface “why did it change?” explanations?
