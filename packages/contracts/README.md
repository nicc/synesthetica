# Synesthetica Contracts (v0)

This folder defines the **contract surface** for Synesthetica: the types and interfaces
used to build modules independently, plus the runtime pieces every package must agree on:

- **Annotation manifest** (`annotations/manifest.ts`, `productionManifest`) — every macro,
  session control and concept, with the annotations that drive the LLM primer and the web panel
- **Panel generator** (`annotations/generatePanel.ts`) — builds the Basics / Advanced panel
  descriptors from the manifest
- **Primer composer** (`prompts/composer.ts`, with `prompts/system-overview.md`) — composes
  the LLM system overview
- **Visual mapping functions** (`intents/colors.ts`) — `pcToHue` and related pitch, velocity
  and interval mappings
- **Engine-bridge protocol** (`control/engineBridge.ts`) — CLI ↔ browser message types and
  protocol version

The runtime code is small, pure, and has no dependencies on other packages.

## Rings of the contract surface

1. **Core primitives** (`core/*`) — time, provenance, uncertainty
2. **Parts** (`parts/*`) — part identity and routing
3. **Primitives** (`primitives/*`) — fundamental music theory types (MidiNote, PitchClass, Velocity, ChordQuality)
4. **Raw input** (`raw/*`) — protocol-level input from adapters (MIDI events, audio features)
5. **Musical abstractions** (`musical/*`) — stabilizer output (notes with duration, chords, beats, progression, phrases)
6. **Annotated musical frames** (`annotated/*`) — vocabulary output: musical elements with visual annotations (RFC 006)
7. **Scene** (`scene/*`) — entities for rendering
8. **Pipeline interfaces** (`pipeline/*`) — adapters, stabilizers (DAG-based), vocabularies, lenses, compositor, renderer
9. **Configuration** (`config/*`) — presets, layout, compositing
10. **Control surface** (`control/*`) — ControlOps + Queries (mechanical, non-semantic)
11. **Annotations** (`annotations/*`) — advisory metadata for LLM mediation, the manifest, and the panel generator
12. **Intents** (`intents/*`) — pitch-class → hue and other visual mapping functions
13. **Prompts** (`prompts/*`) — LLM primer source and composer
14. **Routing** (`routing/*`) — parts-based routing
15. **Diagnostics** (`diagnostics/*`) — runtime error and diagnostic types

## Design invariants (high level)

- Meaning is encoded in **vocabularies**, not lenses.
- Lenses decide **form**, not meaning. They see musical element categories (notes, chords, beats) but not musical analysis.
- Lenses receive **annotated musical elements** and decide how/whether to render them (RFC 006).
- Stabilizers form a **DAG** based on dependencies.
- Control operations are **mechanical**; interpretation happens outside the engine.
- All signals/events/entities are attributable to exactly one **PartId**.

## Versioning

See `VERSION.ts`.
