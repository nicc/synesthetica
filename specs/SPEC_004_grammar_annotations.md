# SPEC 004: Grammar Annotations

Status: Approved
Date: 2026-01-14
Source: RFC 004

## Summary

Defines the annotation requirements for grammars (visual grammars). Annotations enable the LLM to interpret user-facing language ("use the starfield style") and map it to technical grammar identifiers.

## Why Annotations Matter

The technical term is **Grammar** — precise and descriptive of what these modules do (produce visual output from a grammar of rules).

However, users will speak naturally:
- "Add the starfield style"
- "Give it a rainy look"
- "Use that sparkle effect"

The LLM needs metadata to bridge this gap.

## Required Annotation Fields

Every grammar MUST include:

```ts
interface GrammarAnnotation {
  id: string;                 // grammar id (e.g. "starfield")
  name?: string;              // human-readable name
  aliases?: string[];         // user-facing synonyms
  illustrates?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
  cautions?: string[];
}
```

## The `aliases` Field

This is the key field for speech interface mapping.

### Purpose

Seeds the LLM with user-facing synonyms so that natural speech maps correctly to technical grammar IDs.

### Required Aliases

Each grammar SHOULD include at minimum:
- The word "style" (e.g., "starfield style")
- A descriptive noun (e.g., "look", "effect", "visual")

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

## How the LLM Uses Annotations

When a user says "use the starfield style", the LLM:

1. Searches annotations for matches on `aliases`, `name`, or `id`
2. Finds the grammar with `aliases: ["starfield style", ...]`
3. Issues a `{ op: "enableGrammar", grammarId: "starfield", ... }` control op

The LLM can also use `illustrates` and `traits` to suggest grammars:
- "Make rhythm more visible" → find grammars where `illustrates` includes "rhythm"
- "Something more stable" → find grammars where `traits` includes "stable"

## Contract Location

Types defined in `packages/contracts/annotations/annotations.ts`:
- `GrammarAnnotation`
- `MusicalConcept`
- `VisualTrait`

## Validation

Annotations are validated at build time:
- `id` must be unique
- `aliases` should not conflict across grammars
- `illustrates` values must be valid `MusicalConcept` types
- `traits` values must be valid `VisualTrait` types

## Adding a New Grammar

When implementing a new grammar:

1. Create the grammar implementation (`IGrammar`)
2. Add annotation metadata with required fields
3. Include meaningful aliases for speech interface
4. Document what musical concepts it illustrates
5. Note any cautions or limitations

The annotation is part of the grammar's contract with the system.
