# Synesthetica Contracts (v0)

This folder defines the **contract surface** for Synesthetica: types and interfaces used
to build modules independently.

## Rings of the contract surface

1. **Core primitives** (`core/*`) — time, provenance, uncertainty
2. **Parts** (`parts/*`) — part identity and routing
3. **Raw input** (`raw/*`) — protocol-level input from adapters (MIDI events, audio features)
4. **Musical abstractions** (`musical/*`) — stabilizer output (notes with duration, chords, beats)
5. **Core music types** (`cms/*`) — fundamental types (MidiNote, PitchClass, ChordQuality)
6. **Visual Intents** (`intents/*`) — ruleset output, grammar input
7. **Scene** (`scene/*`) — entities for rendering
8. **Pipeline interfaces** (`pipeline/*`) — adapters, stabilizers, rulesets, grammars, compositor, renderer
9. **Configuration** (`config/*`) — presets, layout, compositing
10. **Control surface** (`control/*`) — ControlOps + Queries (mechanical, non-semantic)
11. **Annotations** (`annotations/*`) — advisory metadata for LLM mediation (non-executable)
12. **Routing** (`routing/*`) — parts-based routing
13. **Diagnostics** (`diagnostics/*`) — runtime error and diagnostic types

## Design invariants (high level)

- Meaning is encoded in **rulesets**, not grammars.
- Grammars decide **form**, not meaning.
- Control operations are **mechanical**; interpretation happens outside the engine.
- All signals/events/entities are attributable to exactly one **PartId**.

## Versioning

See `VERSION.ts`.
