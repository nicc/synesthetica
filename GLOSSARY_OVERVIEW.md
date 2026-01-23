# Synesthetica — Terms at a Glance

A quick reference to the core concepts used across Synesthetica RFCs.

---

## Big Picture

**Music → RawInputFrame → MusicalFrame → AnnotatedMusicalFrame → SceneFrame → Renderer**

Meaning flows *downstream*.
Rulesets define the *visual vocabulary*.
Grammars decide *what to render and how*.

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

## Meaning & Mapping (RFC 006)

**Instrument Definition**
The fixed synesthetic operating scheme.

**Invariant**
A rule that always holds (e.g. pitch-class → hue).

**Visual Vocabulary** *(also: Vocabulary, Ruleset)*
Maps MusicalFrame → AnnotatedMusicalFrame.
Defines the *visual vocabulary* — what colors and textures mean musically.
Does NOT decide what shapes to use or which elements to render.
Interface: `IVisualVocabulary`.

**Visual Annotation**
Properties attached to each musical element: palette, texture, motion.
Carries the semantic meaning so grammars don't need to know musical analysis.

---

## Annotated Musical Elements (RFC 006)

**AnnotatedMusicalFrame**
Musical elements (notes, chords, beats) with visual annotations attached.
The visual vocabulary's output and grammar's input.

**AnnotatedNote**
A Note plus its visual annotation (palette, texture, motion).

**AnnotatedChord**
A Chord plus its visual annotation and list of constituent note IDs.

---

## Visual Form & Rendering

**Grammar**
Transforms AnnotatedMusicalFrame → SceneFrame.
Decides *form*, not *meaning*.
Knows musical element *categories* (note, chord, beat) but not analysis details.
Has creative agency: decides which elements to render, what shapes to use.

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
Adapters, stabilizers, visual vocabularies, base grammars.

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
Visual vocabularies define meaning; grammars define form (rendering choices).

**Grammar Agency (RFC 006)**
Grammars see annotated musical elements and decide how to render them.
They know categories (note vs chord) but not analysis (pitch class, chord quality).

**Vagueness Commitment**
Explicitly deferred decisions.

---
