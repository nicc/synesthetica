# Synesthetica — Terms at a Glance

A quick reference to the core concepts used across Synesthetica RFCs.

---

## Big Picture

**Music → RawInputFrame → MusicalFrame → AnnotatedMusicalFrame → SceneFrame → Renderer**

Meaning flows *downstream*.
Vocabularies define the *visual vocabulary*.
Lenses decide *what to render and how*.

---

## User-Facing Concepts

**Preset**
A saved configuration users select by name.
Stores macro values + session controls (key, tempo, meter, chord mode). Not the input device.
> "Load my practice preset."

**Lens** *(formerly: Grammar)*
One of the built-in visual interpretations, each in its own screen column:
DynamicsLens (left: level meter), RhythmLens (centre: scrolling note strips and beat grid), HarmonyLens (right: chord symbol and harmony clock).
All three always run; users tune them with macros rather than switching between them.

**Macro Controls**
High-level knobs users can safely adjust.
Examples: `harmony:linger`, `rhythm:horizon`, `rhythm:difficulty`.

**Interaction Posture**
How the LLM behaves in conversation (Quiet, Conversational).
An LLM stance inferred from context, not an engine setting (SPEC_004).

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
A time-stamped snapshot with context: notes, chords, progression, dynamics, harmonic context, and user-prescribed tempo/meter/key.
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

**Visual Vocabulary** *(also: Vocabulary; formerly: Ruleset)*
Maps MusicalFrame → AnnotatedMusicalFrame.
Defines the *visual vocabulary* — what colors and textures mean musically.
Does NOT decide what shapes to use or which elements to render.
Interface: `IVisualVocabulary`.

**Visual Annotation**
Properties attached to each musical element: palette, texture, motion.
Carries the visual meaning so lenses style elements consistently without re-deriving it.

---

## Annotated Musical Elements (RFC 006)

**AnnotatedMusicalFrame**
Musical elements (notes, chords, bars) with visual annotations attached, plus stabilizer analysis (harmonic context) passed through.
The visual vocabulary's output and the lenses' input.

**AnnotatedNote**
A Note plus its visual annotation (palette, texture, motion).

**AnnotatedChord**
A Chord plus its visual annotation and list of constituent note IDs.

---

## Visual Form & Rendering

**Lens**
Transforms AnnotatedMusicalFrame → SceneFrame. Interface: `IVisualLens`.
Decides *form*, not *meaning*.
Consumes analysis from stabilizers via the frame but never computes it.
Has creative agency: decides which elements to render, what shapes to use.
May keep bounded presentation caches (e.g. fades), never musical state (SPEC_006).

**Scene**
A collection of visual entities at a moment in time.

**Entity**
A renderable visual object (particle, trail, field).

**Compositor**
Merges outputs from multiple lenses.

**Renderer**
Turns a scene into pixels.

---

## Architecture & Workflow

**Layer 1 — System Core**
Types, pipeline, stabilizers, interfaces.

**Layer 2 — Produced Primitives**
Adapters, stabilizers, visual vocabularies, base lenses.

**Composite Layer**
Presets, lens composition, draw effects.

---

## Roles

**Player**
Uses presets and macros.

**Builder / Luthier**
Authors lenses and extensions.

---

## Design Principles

**Piano Principle**
Fixed operating scheme, expressive through use.

**Separation of Meaning and Form**
Visual vocabularies define meaning; lenses define form (rendering choices).

**Lens Agency (RFC 006)**
Lenses see annotated musical elements and decide how to render them.
They may read analysis that stabilizers put on the frame (chord quality, functional harmony) but never compute it.

**Vagueness Commitment**
Explicitly deferred decisions.

---
