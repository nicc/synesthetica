# Synesthetica Contracts (v0)

This folder defines the **contract surface** for Synesthetica: types and interfaces used
to build modules independently.

## Rings of the contract surface

1. **Core primitives** (`core/*`)
2. **Parts** (`parts/*`)
3. **CMS** (`cms/*`) — Canonical Musical State
4. **Visual Intents** (`intents/*`)
5. **Scene** (`scene/*`)
6. **Pipeline interfaces** (`pipeline/*`) — adapters, stabilizers, rulesets, motifs, compositor, renderer
7. **Configuration** (`config/*`) — registrations, layout, compositing
8. **Control surface** (`control/*`) — ControlOps + Queries (mechanical, non-semantic)
9. **Annotations** (`annotations/*`) — advisory metadata for LLM mediation (non-executable)
10. **Routing** (`routing/*`) — parts-based routing

## Design invariants (high level)

- Meaning is encoded in **rulesets**, not motifs.
- Motifs decide **form**, not meaning.
- Control operations are **mechanical**; interpretation happens outside the engine.
- All signals/events/entities are attributable to exactly one **PartId**.

## Versioning

See `VERSION.ts`.
