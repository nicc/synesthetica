# SPEC 003: Instrument Identity Invariants

Status: Approved
Date: 2026-01-14
Source: RFC 002, RFC 003, RFC 004

## Summary

Defines the complete set of invariants that establish Synesthetica's fixed "instrument identity" — the non-negotiable rules that preserve meaning and architectural safety across all configurations.

## Why Invariants Matter

Synesthetica is not a modular synth rack where anything can connect to anything. It has a fixed operating scheme — like a piano that always maps keys to pitches the same way. Users can change *how* music looks (styles, presets, macros) but not *what* things mean.

Invariants ensure:
- **Learnability** — users develop stable intuitions
- **Testability** — modules can be verified independently
- **Safety** — styles cannot corrupt musical semantics
- **Reproducibility** — same input produces same meaning

## The Invariants

### Core Pipeline (RFC 002)

| ID | Invariant | Meaning |
|----|-----------|---------|
| I1 | **Same ruleset consumes CMS regardless of source** | Whether input comes from MIDI or audio, the same ruleset processes it. Only confidence/entropy differs, not structure. |
| I2 | **Pitch-class → hue mapping is deterministic** | Given a named `PitchHueInvariant`, the same pitch always produces the same hue. See [SPEC_002](SPEC_002_pitch_class_hue_mapping.md). |
| I3 | **Meaning lives in rulesets, not styles** | Rulesets interpret musical events into intents. Styles only determine visual form. |
| I4 | **Styles may not compute musical semantics** | Styles cannot infer pitch, chords, beats, or any musical meaning. They consume pre-computed intents. |
| I5 | **Confidence/entropy affects stability, not meaning** | Low confidence produces visual noise/jitter, but the underlying musical interpretation is unchanged. |

### Parts and Routing (RFC 003)

| ID | Invariant | Meaning |
|----|-----------|---------|
| I6 | **Every CMS item has exactly one PartId** | All musical events and signals are tagged with their source part. No orphaned data. |
| I7 | **Styles do not read or reason about other parts** | Each style instance sees only its own part's data. No cross-part logic. |
| I8 | **Spatial layout and blending are compositor concerns** | Styles emit entities; the compositor handles positioning, layering, and blending. |
| I9 | **Musical meaning remains invariant across parts** | Parts affect routing and visual treatment, not interpretation. A C4 is a C4 regardless of which part plays it. |

### Speech Interface Layer (RFC 004)

These invariants govern how the LLM-mediated speech interface interacts with the engine.

| ID | Invariant | Meaning |
|----|-----------|---------|
| I10 | **The engine never interprets musical intent** | The engine executes deterministic operations. User intent interpretation happens in the speech interface layer (LLM), not the core pipeline. |
| I11 | **Annotations are advisory, not executable** | Style and preset annotations inform the speech interface but do not trigger automatic behaviour in the engine. |
| I12 | **All execution remains bounded and deterministic** | Macro ranges are clamped, parameters are schema-validated, options are enumerated. No unbounded effects. |
| I13 | **The LLM may balance, but not violate, system constraints** | The speech interface can choose configurations and adjust parameters, but cannot bypass invariants or exceed bounds. |

## Invariant Categories

### Architectural Invariants (I1, I3, I10)
Define where responsibilities live in the system.

### Semantic Invariants (I2, I4, I5, I9)
Ensure musical meaning is preserved and consistent.

### Isolation Invariants (I6, I7, I8)
Maintain clean boundaries between parts and modules.

### Safety Invariants (I11, I12, I13)
Guarantee bounded, predictable execution.

## What Styles MAY Do

- Emit and evolve entities (spawn on note_on, fade trails, apply decay)
- Interpret intents and event timing (beat/chord spans)
- React to uncertainty (more jitter/blur/fuzz)
- Adjust saturation, brightness, opacity based on intents
- Use per-style parameters within their schema

## What Styles MUST NOT Do

- Infer pitch/chords/beat from audio or MIDI
- Redefine pitch→hue or other invariant mappings
- Change musical meaning (only form)
- Read data from other parts
- Control spatial layout or blending
- Execute unbounded or non-deterministic operations

## Enforcement

Invariants are enforced through:
1. **Type system** — interfaces constrain what data flows where
2. **API design** — styles receive intents, not raw CMS
3. **Code review** — new styles are validated against this spec
4. **Testing** — golden tests verify invariant preservation

## Contract Locations

- CMS types: `packages/contracts/cms/`
- Intent types: `packages/contracts/intents/`
- Style interface: `packages/contracts/pipeline/interfaces.ts`
- Part types: `packages/contracts/parts/parts.ts`

## Adding New Invariants

New invariants may be added via RFC amendment. They must:
1. Be numbered sequentially (I14, I15, etc.)
2. Be documented in this spec
3. Have clear enforcement strategy
4. Not contradict existing invariants
