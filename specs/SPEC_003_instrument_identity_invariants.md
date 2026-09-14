# SPEC 003: Instrument Identity Invariants

Status: Approved
Date: 2026-01-26
Source: RFC 002, RFC 003, RFC 004, RFC 009

## Summary

Defines the complete set of invariants that establish Synesthetica's fixed "instrument identity" — the non-negotiable rules that preserve meaning and architectural safety across all configurations.

## Why Invariants Matter

Synesthetica is not a modular synth rack where anything can connect to anything. It has a fixed operating scheme — like a piano that always maps keys to pitches the same way. Users can change *how* music looks (lenses, presets, macros) but not *what* things mean.

Invariants ensure:
- **Learnability** — users develop stable intuitions
- **Testability** — modules can be verified independently
- **Safety** — lenses cannot corrupt musical semantics
- **Reproducibility** — same input produces same meaning

## The Invariants

### Core Pipeline (RFC 002)

| ID | Invariant | Meaning |
|----|-----------|---------|
| I1 | **Same vocabulary consumes MusicalFrame regardless of source** | Whether input comes from MIDI or audio, the same vocabulary processes the same MusicalFrame structure. Only confidence differs, not structure. |
| I2 | **Pitch-class → hue mapping is deterministic** | Given a named `PitchHueInvariant`, the same pitch always produces the same hue. See [SPEC_002](SPEC_002_pitch_class_hue_mapping.md). |
| I3 | **Meaning lives in vocabularies, not lenses** | Vocabularies interpret musical events into intents. Lenses only determine visual form. |
| I4 | **Lenses may not compute musical semantics** | Lenses cannot infer pitch, chords, beats, or any musical meaning. They consume pre-computed intents. |
| I5 | **Confidence/entropy affects stability, not meaning** | Low confidence produces visual noise/jitter, but the underlying musical interpretation is unchanged. |

### Parts and Routing (RFC 003)

| ID | Invariant | Meaning |
|----|-----------|---------|
| I6 | **Every MusicalFrame has exactly one PartId** | All musical frames are tagged with their source part. No orphaned data. |
| I7 | **Lenses do not read or reason about other parts** | Each lens instance sees only its own part's data. No cross-part logic. |
| I8 | **Spatial layout and blending are compositor concerns** | Lenses emit entities; the compositor handles positioning, layering, and blending. |
| I9 | **Musical meaning remains invariant across parts** | Parts affect routing and visual treatment, not interpretation. A C4 is a C4 regardless of which part plays it. |

### Speech Interface Layer (RFC 004)

These invariants govern how the LLM-mediated speech interface interacts with the engine.

| ID | Invariant | Meaning |
|----|-----------|---------|
| I10 | **The engine never interprets musical intent** | The engine executes deterministic operations. User intent interpretation happens in the speech interface layer (LLM), not the core pipeline. |
| I11 | **Annotations are advisory, not executable** | Lens and preset annotations inform the speech interface but do not trigger automatic behaviour in the engine. |
| I12 | **All execution remains bounded and deterministic** | Macro ranges are clamped, parameters are schema-validated, options are enumerated. No unbounded effects. |
| I13 | **The LLM may balance, but not violate, system constraints** | The speech interface can choose configurations and adjust parameters, but cannot bypass invariants or exceed bounds. |

### Visual Vocabulary (RFC 009)

These invariants define the mandatory visual mappings that encode musical meaning. See [SPEC_010](SPEC_010_visual_vocabulary.md) for full specification.

| ID | Invariant | Meaning |
|----|-----------|---------|
| I14 | **Pitch-class to hue is inviolable** | Same pitch class always produces same hue. Lenses receive hue via `PaletteRef` and must not recompute from pitch data. Extends I2. |
| I15 | **Octave to brightness is mandatory** | Lower octaves are darker, higher octaves are brighter. Lenses receive brightness via `PaletteRef`. |
| I16 | **Velocity affects visual prominence** | Louder notes must be more visually salient than quieter notes. Velocity maps to size and attack sharpness. |
| I17 | **Note phase affects intensity** | Attack phase has full intensity, sustain maintains it, release fades. Released notes must fade. |
| I18 | **Chord quality determines shape geometry** | The radial wedge algorithm is fixed. Lenses receive `ChordShapeGeometry` and must not recompute shapes from chord interval data. |

## Invariant Categories

### Architectural Invariants (I1, I3, I10)
Define where responsibilities live in the system.

### Semantic Invariants (I2, I4, I5, I9, I14, I15)
Ensure musical meaning is preserved and consistent.

### Isolation Invariants (I6, I7, I8)
Maintain clean boundaries between parts and modules.

### Safety Invariants (I11, I12, I13)
Guarantee bounded, predictable execution.

### Visual Vocabulary Invariants (I14, I15, I16, I17, I18)
Define mandatory visual mappings that encode musical meaning for ear training.

## What Lenses MAY Do

- Emit and evolve entities (respond to palette intents, fade trails, apply decay)
- Interpret intents and event timing (beat/chord spans)
- React to uncertainty (more jitter/blur/fuzz)
- Adjust saturation, brightness, opacity based on intents
- Use per-lens parameters within their schema

## What Lenses MUST NOT Do

- Infer pitch/chords/beat from audio or MIDI
- Redefine pitch→hue or other invariant mappings
- Change musical meaning (only form)
- Read data from other parts
- Control spatial layout or blending
- Execute unbounded or non-deterministic operations

## Enforcement

Invariants are enforced through:
1. **Type system** — interfaces constrain what data flows where
2. **API design** — lenses receive VisualIntentFrame, not MusicalFrame
3. **Code review** — new lenses are validated against this spec
4. **Testing** — golden tests verify invariant preservation

## Contract Locations

- Raw input types: `packages/contracts/raw/raw.ts`
- Musical abstractions: `packages/contracts/musical/musical.ts`
- Visual intent types: `packages/contracts/intents/intents.ts`
- Pipeline interfaces: `packages/contracts/pipeline/interfaces.ts`
- Part types: `packages/contracts/parts/parts.ts`

## Adding New Invariants

New invariants may be added via RFC amendment. They must:
1. Be numbered sequentially (I14, I15, etc.)
2. Be documented in this spec
3. Have clear enforcement strategy
4. Not contradict existing invariants
