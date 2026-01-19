# Synesthetica

## Overview
Synesthetica listens to **MIDI note data** and **raw audio input** and generates **real-time visualisations**. The primary use case is as a *synesthetic aid for musical hearing and intuition* (e.g. mapping harmony played on a keyboard to colour/shape patterns that can be matched on guitar, illustrating harmonic tension over time, presenting chord qualities in a coherent visual format irrespective of key). A secondary use case is as a **custom visual component for live performance**.

## The Pipeline

Synesthetica processes musical input through a series of transformations. Each stage has a specific job and operates on well-defined data types.

### High-Level Flow

```
MIDI/Audio Input → RawInputFrame → MusicalFrame → AnnotatedMusicalFrame → SceneFrame → Canvas
```

**What this means:**
- Adapters emit protocol-level events (RawInputFrame)
- Stabilizers produce musical abstractions with duration and phase (MusicalFrame)
- Rulesets annotate musical elements with visual properties (AnnotatedMusicalFrame)
- Grammars decide what it *looks like* and which elements to render (SceneFrame)
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

Stabilizers form a DAG based on dependencies. Independent stabilizers (note tracking, beat detection) process raw input directly; derived stabilizers (chord detection, phrase detection) require upstream output. MusicalFrame is a "snapshot with context" - it contains current state plus recent context (progression, phrases) via references.

**Current status:** NoteTrackingStabilizer, ChordDetectionStabilizer, and BeatDetectionStabilizer implemented. Dynamics, phrase, and progression stabilizers are planned.

#### 3. Ruleset
**Technical:** A pure function mapping `MusicalFrame` to `AnnotatedMusicalFrame`. This is where musical *meaning* is encoded (e.g., "pitch class → hue", "velocity → brightness", "chord quality → warm/cool palette").

**What it does:** Annotates musical elements with visual properties (palette, texture, motion). Each Note gets a visual annotation; each Chord gets its own annotation. Rulesets define a consistent visual vocabulary that users learn across all grammars.

**Key responsibility:** Rulesets do NOT decide what shapes to use or which elements to render. They define "major chords are warm colors, minor chords are cool colors" - the consistent visual scheme. Grammars decide *how* to render each element.

**Current status:** MusicalVisualRuleset annotates notes and chords with palette, texture, and motion properties.

#### 4. Grammar Stack
**Technical:** Transforms `AnnotatedMusicalFrame` into `SceneFrame` (a collection of visual entities). Grammars see musical element *categories* (notes, chords, beats) with their visual annotations, and decide how to render them.

**What it does:** Determines the visual language. Grammars know *what kind* of musical element something is (note vs chord vs beat) but not musical analysis details (pitch class, chord quality). They use visual annotations to style their chosen representations. Grammars can filter elements (e.g., a rhythm grammar ignores chords).

**Key insight:** Rulesets define vocabulary; grammars write sentences. Different grammars can render the same annotated musical content in completely different ways - one as particles, another as trails, another as background color washes.

**Current status:** TestRhythmGrammar (renders beats and notes as timing markers) and TestChordProgressionGrammar (renders chords as glows with history trail) demonstrate the RFC 006 architecture.

#### 5. Compositor
**Technical:** Merges multiple `SceneFrame`s (one per part/instrument) into a single composited scene, applying layout, blending, and z-ordering.

**What it does:** Arranges multiple instruments on screen and handles how they overlap visually.

**Current status:** IdentityCompositor (single part, no layout).

#### 6. Renderer
**Technical:** Draws the composited `SceneFrame` to a canvas using a specific rendering backend (Canvas2D, WebGL, SVG).

**What it does:** Produces the visual output you see on screen.

**Current status:** Canvas2DRenderer with circle drawing for particle entities.

### Key Architectural Principles

1. **Meaning lives in rulesets, not grammars.** Rulesets define the visual vocabulary (what colors mean). Grammars decide how to render.
2. **Grammars see categories, not analysis.** Grammars know "this is a note" and "this is a chord" but not pitch class or chord quality. Visual annotations carry the semantic meaning.
3. **Notes are proper abstractions.** A Note has duration and phase - it's not a pair of on/off messages.
4. **Grammars have creative agency.** They decide which musical elements to render, what shapes to use, and how to animate them. Different grammars can render the same content completely differently.
5. **Every piece of data belongs to exactly one part (instrument).** Multi-instrument support is built-in from the start.
6. **Contracts define all boundaries.** Modules communicate through types in [packages/contracts](packages/contracts/), not internal imports.
7. **The renderer drives timing (pull-based).** The pipeline doesn't push frames; the renderer requests them at render time.

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
The project is in active development. The core pipeline is implemented with proper frame type separation (RawInputFrame → MusicalFrame → AnnotatedMusicalFrame → SceneFrame).

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

