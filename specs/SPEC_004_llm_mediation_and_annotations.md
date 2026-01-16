# SPEC 004: LLM Mediation and Annotation Strategy

Status: Approved
Date: 2026-01-16
Source: RFC 004

## Summary

Defines how the system achieves a natural language interface through LLM mediation, and specifies the annotation requirements that enable the LLM to translate user intent into system operations.

## The Mediation Model

### Separation of Concerns

The system separates **interpretation** from **execution**:

| Role | Responsibility |
|------|----------------|
| **User** | Speaks in musical/perceptual language |
| **LLM** | Interprets intent, selects configurations |
| **Engine** | Executes operations deterministically |

The engine never interprets musical intent (I10). The LLM acts as a "skilled operator" — it understands the system's capabilities through annotations and translates natural language into concrete operations.

### Why This Architecture

Hard-coding semantic commands like "emphasise rhythm" would:
- Freeze interpretation prematurely
- Limit expressive range
- Push meaning into the engine (violates I10)

Instead:
- The LLM weighs annotations against context
- Multiple configurations might satisfy the same request
- The system remains adaptable without becoming opaque

### Interaction Postures (LLM Responsibility)

The LLM should adopt different postures based on context:

| Posture | Behaviour |
|---------|-----------|
| **Quiet** | Zero tolerance for ambiguity; short commands only; failures are silent no-ops; no suggestions |
| **Conversational** | Tolerates ambiguity; may ask clarifying questions; suggests alternatives; explains changes |

**This is purely an LLM behavioural mode** — the engine does not track or enforce postures. The LLM infers appropriate posture from conversation context (e.g., user says "I'm performing now" → adopt quiet posture).

Posture guidance is documented in system prompts and LLM training materials, not in engine state.

## Annotations Overview

Annotations are **advisory metadata** that help the LLM make decisions. They are NOT executable — the engine ignores them entirely (I11).

Three annotation types exist:

| Type | Purpose | Key Question Answered |
|------|---------|----------------------|
| `GrammarAnnotation` | Describe what a grammar illustrates | "Which grammar shows rhythm well?" |
| `PresetAnnotation` | Describe what a preset emphasises | "Which preset suits sparse material?" |
| `MacroAnnotation` | Describe what a macro affects | "How do I make it crisper?" |

## Grammar Annotations

### Purpose

Enable the LLM to:
1. Map user-facing names ("starfield style") to grammar IDs
2. Select grammars based on musical intent ("make rhythm more visible")
3. Understand grammar limitations and combinations

### Required Fields

```ts
interface GrammarAnnotation {
  id: string;                   // grammar id (e.g. "starfield")
  name?: string;                // human-readable name
  aliases?: string[];           // user-facing synonyms
  illustrates?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
  cautions?: string[];
}
```

### Field Semantics

**`aliases`**: User-facing synonyms for speech matching
- SHOULD include variations with "style", "look", "effect"
- Example: `["starfield style", "star style", "twinkling effect"]`

**`illustrates`**: Which musical concepts this grammar makes visible
- Values from `MusicalConcept`: rhythm, harmony, melody, timbre, density, articulation, phrasing, dynamics
- Example: A grammar that spawns particles on note onsets illustrates `rhythm` and `articulation`

**`traits`**: Visual characteristics
- Values from `VisualTrait`: discrete/continuous, transient/persistent, directional/layered, minimal/dense, high-contrast/low-contrast, stable/reactive
- Example: A particle-burst grammar is `discrete`, `transient`, `high-contrast`

**`notes`**: Free-form guidance for the LLM
- Example: "responds strongly to note onsets", "works well for sparse material"

**`cautions`**: Known limitations or interactions
- Example: "becomes noisy under high density", "conflicts with Rain grammar"

### Example

```yaml
id: starfield
name: Starfield
aliases:
  - starfield style
  - star style
  - twinkling effect
  - sparkle look
illustrates:
  - melody
  - articulation
traits:
  - discrete
  - transient
  - high-contrast
notes:
  - responds strongly to note onsets
  - works well for sparse material
cautions:
  - becomes noisy under high density
```

## Macro Annotations

### Purpose

Macros are the primary lever for adjusting system behaviour. The LLM needs to understand:
1. What musical/perceptual dimensions each macro affects
2. What happens when the macro is increased vs. decreased
3. How macros interact with each other

### Required Fields

```ts
interface MacroAnnotation {
  id: string;                   // e.g. "articulation", "persistence", "emphasis.rhythm"
  affects?: MusicalConcept[];
  traits?: VisualTrait[];
  directionality: MacroDirectionality;
  notes?: string[];
  cautions?: string[];
}

interface MacroDirectionality {
  low: { description: string; tendsTo?: string[] };
  high: { description: string; tendsTo?: string[] };
}
```

### Core Macros

The system defines these macros (see `packages/contracts/config/preset.ts`):

| Macro | Range | Low End | High End |
|-------|-------|---------|----------|
| `articulation` | 0–1 | loose, blended | tight, discrete |
| `persistence` | 0–1 | ephemeral, decaying | lingering, accumulative |
| `emphasis.melody` | 0–1 | de-emphasised | foregrounded |
| `emphasis.harmony` | 0–1 | de-emphasised | foregrounded |
| `emphasis.rhythm` | 0–1 | de-emphasised | foregrounded |
| `emphasis.timbre` | 0–1 | de-emphasised | foregrounded |

### Example: articulation

```yaml
id: articulation
affects:
  - rhythm
  - articulation
  - phrasing
directionality:
  low:
    description: looser, smoother, more blended
    tendsTo:
      - reduce onset salience
      - favour sustained texture
  high:
    description: tighter, crisper, more discrete
    tendsTo:
      - emphasise onsets
      - improve rhythmic legibility
notes:
  - interacts strongly with density
cautions:
  - excessive values can fragment sustained material
```

### Example: persistence

```yaml
id: persistence
affects:
  - harmony
  - texture
directionality:
  low:
    description: ephemeral, quickly decaying
    tendsTo:
      - emphasise rhythm and gesture
  high:
    description: lingering, accumulative
    tendsTo:
      - emphasise harmonic field
      - create visual memory
notes:
  - interacts with tempo and register
```

### Example: emphasis.rhythm

```yaml
id: emphasis.rhythm
affects:
  - rhythm
  - dynamics
directionality:
  low:
    description: rhythm less foregrounded
    tendsTo:
      - defer to harmony or texture
  high:
    description: rhythm foregrounded
    tendsTo:
      - prioritise motion cues
      - reduce competing signals
notes:
  - balanced against emphasis.harmony and emphasis.melody
```

## Preset Annotations

### Purpose

Presets bundle grammars and macros into named configurations. Annotations help the LLM:
1. Match user requests to presets ("something for practising scales")
2. Understand the overall character of a preset
3. Suggest alternatives

### Required Fields

```ts
interface PresetAnnotation {
  id: string;                   // preset id
  name?: string;
  emphasises?: MusicalConcept[];
  deEmphasises?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
}
```

### Example

```yaml
id: builtin:practice-mode
name: Practice Mode
emphasises:
  - rhythm
  - articulation
deEmphasises:
  - sustained harmony
traits:
  - high-contrast
  - reactive
notes:
  - designed for technical practice
  - clear onset feedback
```

## Grammar-Macro Relationships

### The Problem

When the user says "emphasise rhythm", the LLM adjusts macros. But different grammars respond differently to macros — the Starfield grammar might respond strongly to `articulation`, while Rain grammar might be more affected by `persistence`.

### Solution: Grammar Response Hints

Grammar annotations MAY include a `macroResponses` field describing how the grammar responds to macro changes:

```ts
interface GrammarAnnotation {
  // ... existing fields ...
  macroResponses?: {
    [macroId: string]: {
      responsiveness: "strong" | "moderate" | "weak" | "none";
      notes?: string;
    };
  };
}
```

### Example

```yaml
id: starfield
# ... other fields ...
macroResponses:
  articulation:
    responsiveness: strong
    notes: "high articulation sharpens star bursts"
  persistence:
    responsiveness: moderate
    notes: "affects trail decay"
  emphasis.rhythm:
    responsiveness: strong
    notes: "directly controls onset response intensity"
```

This tells the LLM: "If you want to emphasise rhythm using Starfield, increase `articulation` and `emphasis.rhythm` — those have strong effects."

## LLM Interaction Flow

### Inputs to the LLM

When the user speaks, the LLM receives:
1. User utterance(s)
2. Current system state (active parts, presets, macro values)
3. Annotation metadata for all grammars, presets, and macros
4. Conversation context (for inferring appropriate posture)

### LLM Reasoning Process

Example: User says "Let's emphasise rhythm"

1. **Interpret intent**: User wants rhythm more prominent
2. **Check current state**: Using harmony-forward preset
3. **Search annotations**:
   - Presets with `emphasises: [rhythm]`
   - Grammars with `illustrates: [rhythm]`
   - Macros that affect rhythm
4. **Consider options**:
   - Switch to rhythm-forward preset?
   - Adjust `emphasis.rhythm` macro?
   - Enable a rhythm-illustrating grammar?
5. **Select actions**: Balance impact vs. disruption
6. **Emit control ops**: e.g., `setMacro`, `enableGrammar`

### Output: Control Operations

The LLM produces `ControlOp` messages (see `packages/contracts/control/control_ops.ts`):

```ts
{ op: "setMacro", target: { kind: "all" }, patch: { emphasis: { rhythm: 0.8 } } }
{ op: "setMacro", target: { kind: "all" }, patch: { articulation: 0.7 } }
```

The engine executes these deterministically.

## Bounded Execution

Although interpretation is flexible, execution remains bounded (I12):

- Macro values are clamped to 0–1
- Grammar parameters are schema-validated
- Layout/compositing options are enumerated
- Invalid operations return errors, not exceptions

The LLM may balance competing concerns (I13), but cannot bypass constraints.

## Validation Requirements

### Build-Time Validation

- Grammar `id` must be unique
- Grammar `aliases` should not conflict across grammars
- `illustrates` values must be valid `MusicalConcept` types
- `traits` values must be valid `VisualTrait` types
- Macro annotations must exist for all macros defined in `Preset.macros`

### Runtime Behaviour

- Missing annotations: warn, but allow operation
- Invalid annotation values: fail at load time

## Contract Location

Types defined in `packages/contracts/annotations/annotations.ts`:
- `GrammarAnnotation`
- `PresetAnnotation`
- `MacroAnnotation`
- `MacroDirectionality`
- `MusicalConcept`
- `VisualTrait`

## What This Spec Does NOT Cover

- LLM prompt design (implementation-specific)
- Annotation storage format (YAML, JSON, embedded in code)
- User-created preset annotation requirements
- Explanation generation ("why did it change?")
