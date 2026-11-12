# Synesthetica Contracts (v0)

This folder defines the **contract surface** for Synesthetica: the types and interfaces
used to build modules independently, plus the runtime pieces every package must agree on:

- **Annotation manifest** (`annotations/manifest.ts`, `productionManifest`) — the implemented
  list of every macro, session control and concept (SPEC_014), with the annotations that drive the LLM primer and the web panel
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

## Architecture rules

This package defines the types; the specs define the rules they serve. Read the relevant spec before changing a type:

- [SPEC_008](../../specs/SPEC_008_pipeline_orchestration.md) — pipeline stages, the stabilizer DAG, what each stage consumes
- [SPEC_009](../../specs/SPEC_009_pipeline_frame_types.md) — the frame types passed between stages
- [SPEC_006](../../specs/SPEC_006_vocabulary_and_stabilizer_statefulness.md) — where state may live (stabilizers, not vocabularies or lenses)
- [SPEC_003](../../specs/SPEC_003_instrument_identity_invariants.md) — the invariants, including what lenses may and must not do
- [SPEC_010](../../specs/SPEC_010_visual_vocabulary.md) — the visual vocabulary and its annotations
- [SPEC_004](../../specs/SPEC_004_llm_mediation_and_annotations.md), [SPEC_015](../../specs/SPEC_015_control_op_validation_errors.md) — control ops, queries and their validation
- [SPEC_014](../../specs/SPEC_014_macro_binding_manifest_multimodal_discovery.md) — the annotation manifest and macro binding
- [SPEC_013](../../specs/SPEC_013_llm_control_plane_mcp.md) — the engine-bridge protocol and MCP control plane
- [SPEC_007](../../specs/SPEC_007_error_and_diagnostic_model.md) — diagnostics

## Versioning

See `VERSION.ts`.
