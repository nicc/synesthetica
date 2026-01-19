# Synesthetica

## Overview
Synesthetica listens to **MIDI note data** and **raw audio input** and generates **real-time visualisations**. The primary use case is as a *synesthetic aid for musical hearing and intuition* (e.g. mapping harmony played on a keyboard to colour/shape patterns that can be matched on guitar, illustrating harmonic tension over time, presenting chord qualities in a coherent visual format irrespective of key). A secondary use case is as a **custom visual component for live performance**.

## The Pipeline

Synesthetica processes musical input through a series of transformations. Each stage has a specific job and operates on well-defined data types.

### High-Level Flow

```
MIDI/Audio Input → RawInputFrame → MusicalFrame → VisualIntentFrame → SceneFrame → Canvas
```

**What this means:**
- Adapters emit protocol-level events (RawInputFrame)
- Stabilizers produce musical abstractions with duration and phase (MusicalFrame)
- Rulesets translate musical meaning to visual intents (VisualIntentFrame)
- Grammars decide what it *looks like* (SceneFrame)
- A renderer draws it (Canvas)

### The Stages (Per-Part Processing)

Each stage processes one instrument's data independently. Multiple instruments flow through the pipeline in parallel and get composited at the end.

#### 1. Adapters
**Technical:** Convert external input (MIDI events, audio analysis) into `RawInputFrame` (protocol-level events).

**What it does:** Translates MIDI note-on/note-off or audio features into a unified format. Adapters do NOT interpret musical meaning - they just emit what they observe.

**Current status:** RawMidiAdapter works. Audio adapter not yet implemented.

#### 2. Stabilizers
**Technical:** Transform `RawInputFrame` into `MusicalFrame` by accumulating temporal context. Correlate note_on/note_off into Notes with duration and phase. Detect chords, track beats, analyze dynamics.

**What it does:** Produces proper musical abstractions. A Note is not a pair of on/off messages - it's an entity with pitch, velocity, duration, and lifecycle phase (attack → sustain → release). Notes persist in the frame during their release window, allowing visual fade-out.

**Current status:** NoteTrackingStabilizer tracks note lifecycle with configurable attack duration and release window.

#### 3. Ruleset
**Technical:** A pure function mapping `MusicalFrame` to `VisualIntentFrame`. This is where musical *meaning* is encoded (e.g., "pitch class → hue", "velocity → brightness", "note phase → stability").

**What it does:** Interprets musical qualities and assigns them visual intents. Each Note becomes a PaletteIntent; dynamics become MotionIntents. Rulesets see proper musical abstractions, not protocol events.

**Current status:** MusicalVisualRuleset maps notes to palette intents with phase-aware stability.

#### 4. Grammar Stack
**Technical:** Transforms `VisualIntentFrame` into `SceneFrame` (a collection of visual entities). Grammars respond to intent IDs for entity lifecycle - when an intent appears, create an entity; when it disappears, begin fading.

**What it does:** Determines the visual language. Grammars see only visual concepts (palette, motion, texture) - never musical events. They track entities by correlating intent IDs across frames.

**Current status:** VisualParticleGrammar spawns particles per palette intent with intent-based lifecycle.

#### 5. Compositor
**Technical:** Merges multiple `SceneFrame`s (one per part/instrument) into a single composited scene, applying layout, blending, and z-ordering.

**What it does:** Arranges multiple instruments on screen and handles how they overlap visually.

**Current status:** IdentityCompositor (single part, no layout).

#### 6. Renderer
**Technical:** Draws the composited `SceneFrame` to a canvas using a specific rendering backend (Canvas2D, WebGL, SVG).

**What it does:** Produces the visual output you see on screen.

**Current status:** Canvas2DRenderer with circle drawing for particle entities.

### Key Architectural Principles

1. **Meaning lives in rulesets, not grammars.** Grammars respond to visual intents, never musical events. All musical interpretation happens in the ruleset.
2. **Grammars never see musical events.** They see only VisualIntentFrame - palette, motion, texture, shape. No notes, no chords, no beats.
3. **Notes are proper abstractions.** A Note has duration and phase - it's not a pair of on/off messages.
4. **Every piece of data belongs to exactly one part (instrument).** Multi-instrument support is built-in from the start.
5. **Contracts define all boundaries.** Modules communicate through types in [packages/contracts](packages/contracts/), not internal imports.
6. **The renderer drives timing (pull-based).** The pipeline doesn't push frames; the renderer requests them at render time.

## How We Work
Our workflow embraces early ambiguity while enforcing discipline as ideas mature.

Results are reproducible from specifications and documented decisions, and do not rely on ephemeral chat context.

Issues are tracked using Beads.

## Document Taxonomy
The repository is organised around a small, explicit set of document types:

- **VISION** – What we are building and why
- **PRD** – Product requirements and success criteria
- **SPECS** – Technical specifications by subsystem
- **RFC** – Proposals and ideas under discussion
- **PRINCIPLES** – Fundamental values and constraints guiding all decisions
- **GLOSSARY** – Shared terminology

Each document has a stable ID, clear status, and explicit dependencies where relevant.

## Principles
High-level principles live in `PRINCIPLES.md` and act as *constraints*, not aspirations. If a design violates a principle, that violation must be explicit and justified.

## Index
This README acts as the root index. A more detailed `INDEX.md` may be added once the document set grows.

## Status
The project is in active development. The core pipeline is implemented with proper frame type separation (RawInputFrame → MusicalFrame → VisualIntentFrame → SceneFrame).

You can run the pipeline:
```bash
cd packages/web-app
npm install
npm run dev:chrome  # Opens in Chrome (required for Web MIDI)
```

See [packages/web-app/README.md](packages/web-app/README.md) for details.

## Control and Interaction Model

Synesthetica is designed for **LLM-mediated control via natural language**. Users speak or type commands; an LLM translates them into mechanical operations on the pipeline.

### How Control Works

**User intent:** "Make the guitar more saturated"

**LLM mediates:**
1. Resolves "the guitar" to a specific `PartId` (deictic resolution)
2. Translates "more saturated" to a parameter adjustment
3. Emits a `ControlOp` (mechanical operation)
4. System executes the operation

**Key separation:**
- The LLM handles semantic understanding ("the guitar", "brighter", "that chord")
- The engine handles mechanical execution (parameter updates, preset loading)
- The engine does *not* interpret natural language or musical semantics

### Annotations (Advisory Metadata)

Pipeline components emit **annotations**: advisory metadata that helps the LLM make decisions.

Annotations describe:
- What a **grammar** illustrates (rhythm, harmony, melody)
- What a **preset** emphasizes or de-emphasizes
- What a **macro** affects and how (articulation: low = loose, high = tight)

Example grammar annotation:
```yaml
id: starfield
illustrates: [melody, articulation]
traits: [discrete, transient, high-contrast]
notes: ["responds strongly to note onsets"]
```

Annotations are *not executable*. The engine ignores them. They exist purely to inform LLM decision-making.

### Control Operations (Mechanical)

The LLM constructs control operations; the engine executes them:

```typescript
{ op: "setMacro", target: { kind: "all" }, patch: { articulation: 0.7 } }
{ op: "loadPreset", presetId: "builtin:practice-mode" }
```

Operations are deterministic and schema-validated. The engine provides no semantic interpretation.

### What This Enables

- **Conversational preset design:** "Make it more watercolor-like" → LLM adjusts blend modes and opacity
- **Live performance control:** "Drop the drums" → LLM mutes the drum part
- **Context-aware suggestions:** "Which preset works for sparse material?" → LLM searches annotations
- **Macro creation:** "Save this as 'sunset mode'" → LLM captures current parameter state

### Current Status

The LLM control layer is *not implemented* yet. Current state:
- Control ops and annotations are specified (see [SPEC_004](specs/SPEC_004_llm_mediation_and_annotations.md))
- Annotations are designed but not emitted
- No speech interface or LLM integration

The current focus is on the core pipeline. LLM control comes later.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and code organization.

## Module boundaries
All module boundaries are defined in [packages/contracts](packages/contracts/). Do not redefine types elsewhere.

