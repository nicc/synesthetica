# RFC: Interaction Model and Feel

---
id: RFC.interaction.model-v1
status: draft
owner: user
last_updated: 2026-01-05
---

## 1. Purpose
This RFC describes the **interaction model** of Synesthetica: how a human engages with the system while playing an instrument.

It focuses on *feel, language, and constraints*, not on implementation details. The goal is to establish a stable, shared mental model that can guide future decisions about visualisation, mapping, and architecture.

---

## 2. Core Interaction Invariant

**Synesthetica has a single capability space and a single vocabulary.**

There are no hidden modes or separate feature sets. Everything the system can do in a low-bandwidth context must be nameable, discoverable, and rehearsable in a high-bandwidth context.

Variation in interaction context does not change what the system can do. It changes only:
- bandwidth
- tolerance for ambiguity
- verbosity of communication

---

## 3. Interaction Layers

The interaction model is structured into three conceptual layers. These layers are not modes; they describe how capabilities are introduced, named, and invoked.

### 3.1 Primitive Layer (System-Native)

The primitive layer consists of capabilities that exist before user interaction.

Examples include:
- visual drawing primitives (e.g. marks, shapes, fields, particles)
- parameters (size, opacity, colour, position, velocity, etc.)
- mutation functions (decay, drift, noise, envelopes, attraction)
- modulation concepts (time-based change, audio-driven change)

These primitives are not necessarily exposed directly. They exist so the system can reason and compose behaviour.

---

### 3.2 Composite Layer (User-Authored)

The composite layer is where learning, exploration, and authorship occur.

In this layer, the user:
- combines primitives into higher-level visual behaviours
- creates new draw effects and mutation patterns
- assigns names to successful combinations (e.g. "sparkles")

Composites may themselves behave like primitives:
- they can be parameterised
- they can be mutated
- they can be combined with other composites

The defining feature of this layer is **explicit commitment**. Nothing is remembered or reused unless the user explicitly asks for it.

---

### 3.3 Invocation Layer (Compressed Execution)

The invocation layer is used during playing and performance.

Characteristics:
- short, imperative utterances
- low bandwidth
- zero tolerance for ambiguity
- deterministic behaviour

Everything invoked in this layer must already exist in the composite layer. Invocation is the execution of previously established intent, not a place for discovery.

---

## 4. Language and Configuration

Users configure the visualisation through natural speech. The LLM interprets user intent and translates it into bounded engine operations.

### 4.1 Configuration Surface

Users speak in terms of three concepts:

- **Presets** — named configurations they can recall by name ("use practice mode", "switch to starfield")
- **Grammars** — visual grammars that determine form ("make it more like rain", "add some sparkles")
- **Macros** — continuous parameters that adjust feel ("tighten up the rhythm", "make it linger more")

Users do not manipulate low-level parameters directly. The LLM selects appropriate adjustments based on annotated affordances (see RFC 004).

### 4.2 Saving and Recall

Users can save the current configuration as a named preset:
- "Save this as 'jazz practice'"
- "Remember this"

And recall it later:
- "Use jazz practice"
- "Go back to what we had before"

The engine provides CRUD operations for presets (`IPresetCatalog`). The conversational semantics of saving, recalling, and undoing are handled by the LLM based on conversation context.

### 4.3 Vagueness

When a request is ambiguous, the LLM should prefer producing a concrete result over asking clarifying questions. The user can then refine based on what they see.

---

## 5. Interaction Posture (Verbosity Axis)

Interaction is characterised by **posture**, not mode. Posture reflects where the interaction sits on a verbosity axis.

Two named postures are currently recognised:

### 5.1 Conversational Posture (High Verbosity)

- Descriptive, negotiative language
- High tolerance for ambiguity
- System may suggest alternatives or similarities
- Failures handled via brief clarification

Typical use: exploration, learning, refinement, discussion

### 5.2 Quiet Posture (Low Verbosity)

- Short, imperative language
- Near-zero tolerance for ambiguity
- No system initiative
- Failures handled silently and safely

Typical use: playing, rehearsal, performance

Posture is inferred from interaction style, not from context. It is possible to perform conversationally (e.g. in a talk) or explore quietly.

---

## 6. Failure Semantics

Failure behaviour is posture-dependent:

- **Quiet posture**:
  - misunderstanding results in no-op
  - existing behaviour continues unchanged
  - a subtle visual indicator may signal uncertainty

- **Conversational posture**:
  - misunderstanding may trigger a brief clarification
  - clarification should be succinct and preferably include a concrete proposal

At no point should failure block or halt real-time visual response.

---

## 7. Illustrative Example

A user explores a visualisation involving two instruments:

- Piano notes (midi) are drawn as small, fuzzy explosions
- Chords collapse into larger explosions combining constituent colours
- Sustained notes decay slowly; released notes fade quickly

- Guitar input (audio) is visualised as a sweeping, semi-transparent static field
- colours interleave based on active notes or chords
- opacity is driven by input amplitude

After observing the result, the user says:
> "That’s really beautiful, but it’s hard to differentiate the instruments. Let’s split them to the left and right sides of the screen."

The system applies the change. The user then says:
> "Remember that. Let's call it 'matching fireworks'"

This commits the composite for later recall and quiet invocation.

---

## 8. Explicit Non-Decisions

This RFC intentionally does **not** define:
- timing or quantisation mechanics
- scheduling of changes (immediate vs deferred)
- architectural or data-model implications

These decisions are deferred until interaction requirements place concrete constraints on them.

