# Synesthetica — Terms at a Glance

A quick reference to the core concepts used across Synesthetica RFCs.

---

## Big Picture

**Music → CMS → Visual Intents → Motifs → Scene → Renderer**

Meaning flows *downstream*.  
Meaning is **never redefined** once it leaves the Ruleset.

---

## User-Facing Concepts

**Registration**  
A named visual style users select in speech.  
Bundles motifs + macro defaults.  
> “Use Rainy Comets.”

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
Turns a source into CMS frames.

**Canonical Musical State (CMS)**  
The unified description of music used everywhere downstream.

**CMS Frame**  
A time-stamped snapshot of musical events + signals.

**Musical Event**  
Discrete musical facts (note_on, chord, beat).

**Control Signal**  
Continuous musical descriptors (loudness, tension).

**Distribution Signal**  
Probabilistic musical descriptors (pitch-class distribution).

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
Maps CMS → Visual Intents.  
Defines musical meaning.

---

## Visual Semantics

**Visual Intent**  
Rendering-agnostic description of what to express.  
Examples: palette, motion, texture, shape.

**Intent Frame**  
Time-stamped bundle of visual intents.

---

## Visual Form & Rendering

**Motif**  
A visual grammar (stars, comets, rain).  
Consumes intents, produces entities.  
Decides form, not meaning.

**Scene**  
A collection of visual entities at a moment in time.

**Entity**  
A renderable visual object (particle, trail, field).

**Compositor**  
Merges outputs from multiple motifs.

**Renderer**  
Turns a scene into pixels.

---

## Architecture & Workflow

**Layer 1 — System Core**  
Types, pipeline, stabilizers, interfaces.

**Layer 2 — Produced Primitives**  
Adapters, stabilizers, rulesets, base motifs.

**Composite Layer**  
Registrations, motif composition, draw effects.

---

## Roles

**Player**  
Uses registrations and macros.

**Builder / Luthier**  
Authors motifs and extensions.

---

## Design Principles

**Piano Principle**  
Fixed operating scheme, expressive through use.

**Separation of Meaning and Form**  
Rulesets define meaning; motifs define form.

**Vagueness Commitment**  
Explicitly deferred decisions.

---