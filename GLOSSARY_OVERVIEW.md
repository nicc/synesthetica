# Synesthetica — Terms at a Glance

A quick reference to the core concepts used across Synesthetica RFCs.

---

## Big Picture

**Music → RawInputFrame → MusicalFrame → VisualIntentFrame → SceneFrame → Renderer**

Meaning flows *downstream*.
Meaning is **never redefined** once it leaves the Ruleset.

---

## User-Facing Concepts

**Preset**
A saved configuration users select by name.
Bundles grammars + macro values + layout.
> "Load my practice preset."

**Grammar**
A built-in visual grammar (stars, comets, rain).
Users select and combine grammars, then save as presets.

**Macro Controls**
High-level knobs users can safely adjust.
Examples: articulation, persistence, emphasis.

**Interaction Posture**
How reactive or stable the system feels.
Examples: Quiet, Conversational.

---

## Musical Understanding

**Source**
Where musical data comes from (MIDI, audio).

**Adapter**
Turns a source into RawInputFrame (protocol-level events).

**RawInputFrame**
Protocol-level input from adapters (MIDI note_on/off, audio features).

**Stabilizer**
Transforms RawInputFrame into MusicalFrame (proper musical abstractions).
Stabilizers form a DAG based on dependencies.

**MusicalFrame**
A time-stamped snapshot with context: notes, chords, progression, phrases, beats, dynamics.
Contains current state plus recent context via references.

**Note**
A musical abstraction with pitch, velocity, duration, and phase (attack/sustain/release).
Not a pair of on/off messages.

**Confidence / Uncertainty**
How sure we are about a musical claim.
Affects visual stability, not meaning.

---

## Meaning & Mapping

**Instrument Definition**
The fixed synesthetic operating scheme.

**Invariant**
A rule that always holds (e.g. pitch-class → hue).

**Ruleset**
Maps MusicalFrame → VisualIntentFrame.
Defines musical meaning.

---

## Visual Semantics

**VisualIntent**
Rendering-agnostic description of what to express.
Examples: PaletteIntent, MotionIntent, TextureIntent, ShapeIntent.

**VisualIntentFrame**
Time-stamped bundle of visual intents. No musical concepts.

---

## Visual Form & Rendering

**Grammar**
A visual grammar (stars, comets, rain).
Consumes intents, produces entities.
Decides form, not meaning.

**Scene**
A collection of visual entities at a moment in time.

**Entity**
A renderable visual object (particle, trail, field).

**Compositor**
Merges outputs from multiple grammars.

**Renderer**
Turns a scene into pixels.

---

## Architecture & Workflow

**Layer 1 — System Core**
Types, pipeline, stabilizers, interfaces.

**Layer 2 — Produced Primitives**
Adapters, stabilizers, rulesets, base grammars.

**Composite Layer**
Presets, grammar composition, draw effects.

---

## Roles

**Player**
Uses presets and macros.

**Builder / Luthier**
Authors grammars and extensions.

---

## Design Principles

**Piano Principle**
Fixed operating scheme, expressive through use.

**Separation of Meaning and Form**
Rulesets define meaning; grammars define form.

**Vagueness Commitment**
Explicitly deferred decisions.

---
