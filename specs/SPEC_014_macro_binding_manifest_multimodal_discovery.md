# SPEC 014 — Macro binding, manifest derivation, and multimodal discovery

**Status**: canonical
**Depends on**: SPEC 013 (LLM control plane MCP), RFC 011 (annotation format)
**Supersedes**: none

## Purpose

The annotation manifest is the single edit point for every control surface Synesthetica exposes — to LLMs via MCP, and to human users via the web-app panel. This spec pins three related concerns that had drifted out of alignment:

1. **Binding** — how a manifest macro becomes a live control at runtime.
2. **Derivation** — how the manifest reaches every consumer without duplication.
3. **Discovery** — what each audience (LLM, human) actually sees and when.

If a macro can't be traced end-to-end from manifest declaration through to observable behaviour, the manifest is lying. This spec is how we tell whether that's the case.

## Non-goals

- Defining new macros. See the annotation manifest for the current list.
- LLM-side prompt engineering.
- UI aesthetics of the panel.

## 1. Binding: manifest → live control

### 1.1 Declaration

Macros are declared in `packages/contracts/annotations/manifest.ts` as one of three shapes:

- `ContinuousMacroAnnotation` — numeric range + default + directionality prose.
- `DiscreteMacroAnnotation` — enum values with labels.
- `CompoundMacroAnnotation` — one dial that fans out to leaf targets, optionally with per-target `invert`.

Every macro must include `id`, `range` (or `enumValues`), `default`, and enough LLM-facing prose (`directionality`, `notes`) to be usable without further context.

### 1.2 Dispatch surface

`set_macro(name, value)` is the sole MCP tool that writes a macro. Composite tools (`switch_preset`) may write many macros as part of their handler.

### 1.3 Validation

The CLI validates against the annotation before dispatch:

- Continuous: value must be finite, in range.
- Discrete: value must match one of `enumValues[i].value` (string or number, exact).
- Compound: value must be finite, in the compound's range.

Errors return `MACRO_VALUE_OUT_OF_RANGE`, `MACRO_VALUE_WRONG_TYPE`, or `MACRO_UNKNOWN`. See SPEC on control-op validation errors (synesthetica-nrx) for the shape.

### 1.4 Compound fan-out

`dispatchCompound` (packages/cli/src/tools/macroTools.ts) iterates the compound's `targets`. Each target is either a bare id or `{id, invert?}`. For each:

- If `invert: true`, the compound's own axis is flipped (`compound.range[1] + compound.range[0] - value`) before mapping.
- The result is linearly mapped from the compound's range to the target's range.
- The target macro is written via `engine.setMacro(target.id, mapped)`.

After all fan-outs, the compound's own id is written last with the original value — so `state://<label>/current` reflects "user set `time-horizon` to 0.5" even though the leaves also moved.

Curves are linear defaults. Non-linear tuning is Phase 2 work (synesthetica-30r).

### 1.5 Bridge to browser

The CLI's `WSBackedEngineHandle` proxies `setMacro(name, value)` over the WebSocket bridge to the browser. The browser's `applyEngineOp` handler:

1. Mirrors the write into `engineState.macros[name]`.
2. Calls `pipeline.setMacro(name, value)`.

Both steps are unconditional — the manifest state resource is always truthful even when the pipeline consumer for a macro isn't implemented yet.

### 1.6 Pipeline dispatch

`VisualPipeline.setMacro(name, value)` (packages/engine/src/VisualPipeline.ts) fans the write to two consumer families:

**Grammars.** Parse `<scope>:<param>` from the macro id. Any grammar whose `id` equals `${scope}-grammar` (or `${scope}`) receives `setMacros({[paramCamel]: value})`, where `paramCamel` is `paramKebab` kebab→camelCase. Grammars implement `setMacros` with a `Partial<Config>` shape and ignore keys they don't own.

Example: `set_macro("rhythm:pulse-intensity", 0.8)` reaches `RhythmGrammar.setMacros({pulseIntensity: 0.8})`.

**Stabilizers.** Every stabilizer in every `partState` receives `setMacro(name, value)`. Stabilizers translate qualified macro ids to their internal config fields directly (no kebab→camel rule — the mapping is explicit because macro names are user-facing and stabilizer fields are implementation-honest).

Example: `set_macro("harmony:arpeggio-tolerance", 800)` reaches `ChordDetectionStabilizer.setMacro`, which calls `setConfig({pitchDecayMs: 800})`.

Vocabulary-owned macros (currently `system:colour-mapping:reference`) route through `set_hue_for_pitch` as their canonical helper; direct `set_macro` writes them into `engineState` but the vocab-side setter is not yet wired. See "Known gaps" below.

### 1.7 Bare (unscoped) and `system:*` macros

Bare macros like `time-horizon` and `system:colour-mapping:reference` don't route via grammar-id matching. They flow through both the grammar and stabilizer loops and no-op unless a consumer explicitly recognises them. Compound macros are always bare or otherwise-scoped; their leaves do the actual work, so the compound's own write is state-only.

## 2. Derivation: one manifest, many consumers

The manifest at `productionManifest` is the sole source. Every derived surface reads from it at build time or startup, never duplicates the content.

| Surface | Source | Update path |
|---|---|---|
| `annotations://manifest` MCP resource | Whole `productionManifest` object | JSON-stringified per read |
| `annotations://<category>/<id>` MCP resources | Per-item from each `productionManifest.<category>` | JSON-stringified per read |
| MCP `tools/list` descriptions | `productionManifest.tools[i].description` | Applied in `buildToolRegistry` (overrides code default) |
| Composed `guide://system-overview` prompt | Authored `system-overview.md` + generated sections per category | Composed at prompt-fetch time |
| UI panel widgets | `productionManifest.macros + sessionControls` | `generatePanel(manifest)` at web-app startup |
| UI panel widget hover-help | Per-widget `notes[]` (all paragraphs) | `generatePanel` copies into descriptor; renderer emits one `<p>` per note |
| UI About panel appendices | `productionManifest.grammars + concepts` | Rendered at panel-open |

A change to a macro's `directionality` or `notes` in the manifest flows to widget hover-help, the LLM primer, every per-URI resource read, and the annotations bundle in one build. No manual sync anywhere.

## 3. Discovery: who sees what, when

### 3.1 LLM (MCP client)

On MCP handshake, the client fetches (typically eagerly, without any read of the specific resources):

- `tools/list` — 10 tools with names + descriptions + JSON schemas.
- `resources/list` — every annotation URI + state URI + presets URI.
- `resources/templates/list` — templated URIs (`annotations://macros/{id}`, `presets://{name}`, etc.).
- `prompts/list` — 3 prompts (`guide://system-overview`, `posture://quiet`, `posture://conversational`).

When the user attaches `guide://system-overview` (or the client auto-attaches — see synesthetica-ure), the LLM receives:

- Authored pipeline narrative.
- Every macro with type, range, default, directionality, notes.
- Every session control with type, nullable, notes.
- Every system concept with definition + examples + related terms.
- Every grammar with notes + macro-responsiveness table.
- Every MCP tool with aliases + notes + examples.
- Every MCP resource (state, presets, annotations bundle) with description + subscribable flag.
- Session-time guidance (how to reason about `startedAt` + `now` + event `t`).
- Presets workflow explanation.

Per-item `annotations://` reads remain available for on-demand precision (e.g. when the model wants a specific macro's `cautions` field verbatim).

### 3.2 Human (web-app UI)

**Widgets (interactive control surface):**
- `generatePanel(manifest)` reads `manifest.macros + manifest.sessionControls`.
- Tools, concepts, grammars, resources, presets are DELIBERATELY excluded. The generator's input type (`ManifestForPanel`) accepts only macros + sessionControls, so misuse is a type error, not a runtime bug.
- Each widget renders label + control + `?` hover-help. The help popover concatenates every entry in `notes[]` as a separate paragraph (plus low/high endpoint prose for sliders).

**About panel (reference material):**
- Authored `system-overview.md` prose (the LLM's narrative, useful for humans too).
- ## Grammars section (from `manifest.grammars`).
- ## Glossary section (every `manifest.concepts` entry, alphabetically).
- Macros, tools, resources are NOT in the About panel — they belong in the interactive widget surface or the LLM primer respectively.

### 3.3 Coverage matrix

| Manifest entry | `tools/list` | `resources/list` | `guide://system-overview` prompt | UI widgets | UI About |
|---|---|---|---|---|---|
| Macros | — | ✓ per-item | ✓ ## Macros | ✓ | (via widget help) |
| Session controls | — | ✓ per-item | ✓ ## Session controls | ✓ | (via widget help) |
| Concepts | — | ✓ per-item + `concepts://` alias | ✓ ## System concepts | — | ✓ ## Glossary |
| Grammars | — | ✓ per-item | ✓ ## Grammars | — | ✓ ## Grammars |
| Presets (item + index) | — | ✓ | ✓ ## Presets | — | — |
| Tools | ✓ | — | ✓ ## Tools | — | — |
| Resources (state / presets / bundle) | — | ✓ | ✓ ## Resources | — | — |
| State snapshot | — | ✓ per instance | (referenced across sections) | — | — |
| Recent events | — | ✓ per instance | ✓ ## Session time | — | — |

## 4. Known gaps

Called out here rather than glossed over — the spec matches reality including reality's rough edges.

- **Vocabulary-owned macros** (`system:colour-mapping:reference`): `set_macro` writes state but `MusicalVisualVocabulary` doesn't yet accept macro updates. `set_hue_for_pitch` is the working path today (computes the reference hue server-side and calls `setHueForPitch` on the vocab).
- **`rhythm:emphasis` targets `rhythm:pulse-intensity` + `rhythm:reference-linger`**: both wired end-to-end since commit `b96cb90`. Compound curves are linear defaults.
- **Stabilizer macros beyond ChordDetectionStabilizer**: no other stabilizer implements `setMacro` today. Add ones as macros land.

## 5. Verification

A macro is correctly wired iff:

1. It appears in `productionManifest.<category>[]` with all required fields.
2. `annotations://<category>/<id>` reads back its JSON verbatim.
3. `set_macro(id, value)` returns `{ok: true, state: {...}}` with `state.macros[id] === value`.
4. If it has a grammar consumer: the grammar's `setMacros` accepts the camelCase key.
5. If it has a stabilizer consumer: the stabilizer's `setMacro` recognises the qualified id.
6. The composed `guide://system-overview` prompt includes it in the appropriate section (## Macros | ## Session controls).
7. If it's a session control or macro: the UI panel renders a widget for it (with hover-help concatenating every `notes[]` entry).

Build-time validation (synesthetica-5l9) will assert (1) and part of (6). Runtime verification for (3)–(5) is covered by tests in `packages/cli/test/macroTools.test.ts` and `packages/engine/test/VisualPipeline.test.ts`. Manual verification for the composed prompt and the UI panel happens via the live-smoke command (`npm run start`).

## 6. References

- SPEC 013 — LLM control plane (MCP transport, tools, resources, prompts, engine channel).
- RFC 011 — Annotation format.
- `packages/contracts/annotations/manifest.ts` — the manifest itself.
- `packages/contracts/annotations/annotations.ts` — type definitions.
- `packages/cli/src/tools/macroTools.ts` — dispatch + fan-out.
- `packages/cli/src/tools/registry.ts` — tool description override from manifest.
- `packages/cli/src/resources/promptResources.ts` — composed prompt renderer.
- `packages/engine/src/VisualPipeline.ts` — grammar + stabilizer dispatch.
- `packages/engine/src/stabilizers/ChordDetectionStabilizer.ts` — stabilizer-side macro handling reference.
- `packages/web-app/src/panel/aboutPanel.ts` — UI-subset rendering.
- `packages/contracts/annotations/generatePanel.ts` — panel widget generation.
