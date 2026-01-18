# Synesthetica

## Overview
Synesthetica listens to **MIDI note data** and **raw audio input** and generates **real-time visualisations**. The primary use case is as a *synesthetic aid for musical hearing and intuition* (e.g. mapping harmony played on a keyboard to colour/shape patterns that can be matched on guitar, illustrating harmonic tension over time, presenting chord qualities in a coherent visual format irrespective of key). A secondary use case is as a **custom visual component for live performance**.

## The Pipeline

Synesthetica processes musical input through a series of transformations. Each stage has a specific job and operates on well-defined data types.

### High-Level Flow

```
MIDI/Audio Input → CMS → Intents → Scene → Canvas
```

**What this means:**
- Musical input gets converted to a common format (CMS)
- A stack of rules decide what the music *means* (Intents)
- A stack of grammars decide what it *looks like* (Scene)
- A renderer draws it (Canvas)

### The Stages (Per-Part Processing)

Each stage processes one instrument's data independently. Multiple instruments flow through the pipeline in parallel and get composited at the end.

#### 1. Adapters
**Technical:** Convert external input (MIDI events, audio analysis) into `CMSFrame` (Canonical Musical State).

**What it does:** Translates MIDI note-on/note-off or audio frequency data into a unified format the rest of the system can work with.

**Phase 0 status:** MIDI adapter works. Audio adapter not yet implemented.

#### 2. Stabilizers (Stack)
**Technical:** A stack of stabilizers enrich `CMSFrame` with derived musical information (e.g., chord detection, beat tracking, phrase boundaries). Each stabilizer adds information for later stages.

**What it does:** Adds musical understanding. Detects patterns like "this is a C major chord" or "this is beat 1 of a measure" so later stages can respond to musical structure, not just individual notes.

**Phase 0 status:** Passthrough only (no enrichment). Real stabilizers come in Phase 1.

#### 3. Ruleset (Stack of Rules)
**Technical:** A ruleset is a stack of rules that map `CMSFrame` to `IntentFrame`. This is where musical *meaning* is encoded (e.g., "pitch class 0 → red hue", "harmonic tension → saturation"). Rules run in order; later rules can override or blend with earlier ones.

**What it does:** Interprets musical qualities and assigns them semantic values (color, brightness, urgency, etc.). This layer expresses the musical idea being visualized. Stacking rules lets you layer multiple interpretations (e.g., one rule for pitch → hue, another for tension → saturation).

**Phase 0 status:** Minimal ruleset with a single rule mapping pitch to hue and velocity to brightness.

#### 4. Grammar Stack
**Technical:** A stack of grammars transforms `IntentFrame` into `SceneFrame` (a collection of visual entities). Each grammar produces entities based on its own logic; the stack combines them. Grammars decide *form*: particles vs trails vs fields vs glyphs.

**What it does:** Determines the visual language. Given "red, bright, urgent," a particle grammar spawns a red dot, a trail grammar draws a red streak, a glyph grammar places a red symbol. Grammars can be stacked to layer visual elements (e.g., particles + trails + background field).

**Phase 0 status:** Single particle grammar (spawns fading circles on note events).

#### 5. Compositor
**Technical:** Merges multiple `SceneFrame`s (one per part/instrument) into a single composited scene, applying layout, blending, and z-ordering.

**What it does:** Arranges multiple instruments on screen and handles how they overlap visually.

**Phase 0 status:** Identity compositor (single part, no layout).

#### 6. Renderer
**Technical:** Draws the composited `SceneFrame` to a canvas using a specific rendering backend (Canvas2D, WebGL, SVG).

**What it does:** Produces the visual output you see on screen.

**Phase 0 status:** Canvas2D renderer with basic circle drawing.

### Key Architectural Principles

1. **Meaning lives in rulesets, not grammars.** Grammars are dumb templates. All musical interpretation happens in the ruleset.
2. **Rules and grammars are stacks.** You compose behavior by layering multiple rules or grammars, each contributing to the final output.
3. **Every piece of data belongs to exactly one part (instrument).** Multi-instrument support is built-in from the start.
4. **Contracts define all boundaries.** Modules communicate through types in [packages/contracts](packages/contracts/), not internal imports.
5. **The renderer drives timing (pull-based).** The pipeline doesn't push frames; the renderer requests them at render time.

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
The project is in its **formative phase**. Initial documents are skeletal and expected to evolve rapidly.

**Phase 0** (Playable Sketch) is complete. You can run the minimal vertical slice:
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

### Phase 0 Status

The LLM control layer is *not implemented* in Phase 0. Current state:
- Control ops and annotations are specified (see [SPEC_004](specs/SPEC_004_llm_mediation_and_annotations.md))
- Annotations are designed but not emitted
- No speech interface or LLM integration

Phase 0 focuses on the core pipeline. LLM control comes in Phase 1+.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and code organization.

## Module boundaries
All module boundaries are defined in [packages/contracts](packages/contracts/). Do not redefine types elsewhere.

