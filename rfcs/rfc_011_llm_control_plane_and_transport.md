# RFC 0011: LLM Control Plane and Transport Architecture

Status: Approved (transport decision landed 2026-08-19; awaiting SPEC write-up)
Author(s): Synesthetica
Date: 2026-08-13 (last amended 2026-08-19)

### Related

- SPEC 004 — LLM Mediation and Annotation Strategy (principles + contract, still valid)
- RFC 004 — Annotation-Driven Control and LLM Mediation (predecessor RFC, principles landed as SPEC 004)
- synesthetica-8f4 — Audio adapter gates LLM-mediation (now satisfied)
- synesthetica-gyj — LLM-mediation threshold criteria
- synesthetica-dib — Paper prototype: LLM annotation interpretation
- docs/tunables.md — Canonical list of controllable values in the pipeline

## Summary

Defines the architectural shape of the LLM control plane: how a language model produces control ops that the engine executes. SPEC 004 established the *what* (annotation-driven, LLM interprets, engine executes deterministically) but left the *how* — transport, process boundary, discovery — unspecified.

This RFC establishes an **external-process architecture**: the LLM runs outside the app entirely, communicating with a wrapper CLI that exposes the engine's control surface. **MCP (Model Context Protocol) is the transport** (decided 2026-08-19), chosen on portability (any MCP client works) and technical fit (tools + resources + subscriptions map cleanly onto control ops + state).

The alternative — a Claude-Code-native skill generated from annotations — was considered and rejected as the primary path, retained as a fallback if MCP setup proves too heavy in practice. See §Alternative considered: Claude Code skill.

## Context: what changed since RFC 004

RFC 004 was written in January 2026 when the pipeline was largely aspirational. Seven months on:

- **Audio input landed** (SPEC 012, piece 5 integrated). The gating condition in synesthetica-8f4 is now satisfied.
- **The grammar shape settled differently than expected.** RFC 004 assumed a higher degree of composability — multiple grammars per part, freely combinable, each with a rich macro surface. What actually shipped: three fixed grammars (Rhythm, Harmony, Dynamics) with mostly file-level constants and only RhythmGrammar exposing runtime macros. See docs/tunables.md for the full catalogue.
- **Control ops exist as a contract** (`packages/contracts/control/control_ops.ts` per SPEC 004) but no runtime receiver is wired.
- **Annotations exist as types** (`packages/contracts/annotations/annotations.ts`) but grammar/preset/macro annotations aren't populated.
- **The interpretive stance in SPEC 004 remains sound** — annotations as advisory, LLM as skilled operator, engine as deterministic executor. Nothing in this RFC unwinds that.
- **A concrete inciting use case has sharpened**: single user, two instances side by side — one visualising piano input, one visualising a guitar the user is learning by ear, both driven by the same live LLM control plane. This is one of the founding motivations for the project (learn guitar by ear using the visual system as a bridge from piano) and is the simplest architectural route to it — rather than extending the app to handle multiple inputs, spawn two instances in separate browser tabs. This use case turns "how many instances does the transport support" from a deferred question into a design decision.

## The gap

SPEC 004 §"What This Spec Does NOT Cover" explicitly excludes:
- LLM prompt design
- Annotation storage format
- Explanation generation

It also implicitly excludes:
- **Where the LLM runs.** In-browser? Adjacent process? Remote service?
- **How it discovers what it can do.** Baked prompt? Live introspection?
- **How it receives current state.** Push? Pull? Both?
- **How it emits control ops.** HTTP? WebSocket? stdio? Function calls?

Those are the questions this RFC opens.

## Proposal: External-process architecture

### The shape

```
┌──────────────────┐         ┌─────────────────┐         ┌────────────────┐
│ User (speech or  │  ────►  │ LLM client      │  ────►  │ synesthetica   │
│ text)            │         │ (Claude Code /  │         │ CLI wrapper    │
└──────────────────┘         │  Desktop /      │         │                │
                             │  other MCP      │  MCP    │ + engine app   │
                             │  client)        │◄──►     │                │
                             └─────────────────┘         └────────────────┘
                                                                │
                                                                ▼
                                                         ┌──────────────┐
                                                         │ Web app      │
                                                         │ (renders)    │
                                                         └──────────────┘
```

The user speaks (or types) to any LLM client that supports MCP. The LLM interprets, calls tools exposed by the synesthetica MCP server, which routes control ops to the running engine. The engine executes deterministically. The web app renders.

### Why external

1. **Enforces SPEC 004 §I10 architecturally.** "Engine never interprets musical intent" becomes a physical property, not just a convention.
2. **Vendor-neutral.** Any MCP client works. The user brings their own LLM (Claude, GPT via MCP shim, whatever the ecosystem produces).
3. **No API key management inside the app.** Cost, quota, auth — all the LLM client's problem.
4. **Speech is out of scope for the engine.** Handled by the LLM client (Claude Code's dictation, OS-level STT, whatever).
5. **Iteration on prompts / models is decoupled** from engine deploys.

### What the MCP server exposes

Tentative surface (to be finalised in a subsequent SPEC):

**Tools (verbs the LLM can call):**
- `set_macro(name, value, instance?)` — adjust any macro (system / cross-grammar / grammar-scoped). Uniform tool for all aesthetic macros; `value` type varies per macro annotation (number, discrete choice).
- `set_key(root, mode, instance?)` — set the prescribed key. Both null to clear (disables key-aware analysis).
- `set_tempo(bpm, instance?)` — nullable to clear.
- `set_meter(beats_per_bar, beat_value, instance?)` — pair; both null to clear.
- `set_chord_mode(mode, instance?)` — "harmonic" | "bass-led".
- `set_metronome(enabled, instance?)` — boolean.
- `set_input(source, instance?)` — MIDI device name | "audio".
- `set_hue_for_pitch(pc, hue, instance?)` — helper: rotate the wheel so a given pitch class maps to a given hue. Server-side math so the LLM doesn't compute the rotation itself for "make C red"-type requests.
- `switch_preset(name, instance?)` — load a named preset into the target instance.
- `save_preset(name, instance?)` — persist current state as a named preset.

Nullable args on `set_*` cover clearing (no separate `clear_*` tools). The `instance` param is optional when only one instance is running (defaults to `default`); required when multiple are.

**Resources (nouns the LLM can read):**
- `annotations://` — full annotation manifest (grammars, presets, macros, session controls, concepts) as browsable resources.
- `state://<instance>/current` — current macro values, active preset, prescribed context — subscribable so the LLM sees updates.
- `state://<instance>/recent-events` — recent musical activity (notes, chords, tempo estimate) for context-aware decisions.
- `presets://` — available presets (list and preset spec fetch). Presets are shared across instances; load targets one.
- `instances://` — running instance registry (labels + status). Enables the LLM to enumerate what it can control.
- `concepts://` — terminology dictionary (see §Annotation types), structured for lookup ("what's a borrowed chord?").

**Prompts (canned LLM behaviour):**
- `posture://quiet` — system prompt fragment for quiet-performance mode (per SPEC 004).
- `posture://conversational` — system prompt fragment for conversational mode.
- `guide://system-overview` — prose narrative describing how the pipeline flows, what the visual grammars illustrate, how prescribed context and confidence work. Loaded once as context; not for lookup.

### Annotation → resource pipeline

Annotations are defined as data. A generator converts them into MCP resources on server startup:

- Each annotation becomes a discoverable resource with a stable URI
- MCP client (LLM) can list, read, and cache them
- Regenerated when annotations change (dev-time; not runtime-hot)

For MCP tools, the annotation manifest also generates the tool schemas — `set_macro`'s `name` param becomes an enum drawn from the macro annotations, with descriptions and value schemas pulled from each entry.

### Annotation types (extensions to SPEC 004)

SPEC 004's annotation model (`GrammarAnnotation`, `PresetAnnotation`, `MacroAnnotation`) assumed all macros are numeric 0–1 dials. The tunables review exposed cases the model doesn't cover: discrete macros (e.g. `rhythm:quantise-resolution` = quarter/8th/16th), compound macros (`rhythm:difficulty` fans to multiple params), session controls (categorically distinct from aesthetic macros), and the terminology dictionary the LLM needs for semantic reasoning.

Extensions this RFC proposes (to land properly in the SPEC write-up at Plan step 7):

**Generalise `MacroAnnotation` with a `type` field:**
- `type: "continuous"` — the existing shape (range + directionality)
- `type: "discrete"` — enumerated values with labels (e.g. quarter/8th/16th, with human-readable labels for the LLM)
- `type: "compound"` — declares the list of underlying targets the macro fans to; per-target dispatch curves are implementation detail (per §Compound-macro dispatch curves — deferred)

**New `SessionControlAnnotation`** for `session:*` and `input:*` controls:
- id, name, aliases, notes
- `type`: `"number"` | `"enum"` | `"boolean"` | `"pair"`
- `range` (for number), `enumValues` (for enum), `pair` (references two other control ids, e.g. `session:tonic` + `session:mode`)
- `nullable: boolean` — clearing semantics for `set_*(null)`

**New `SystemConceptAnnotation`** — the terminology dictionary:
- `term`: canonical name (e.g. "borrowed-chord", "modal-interchange", "now-line", "note-strip")
- `definition`: short prose
- `related`: cross-links to other concepts
- `examples`: optional concrete examples
- Rendered as `concepts://<term>` for LLM lookup

**System guide** (not an annotation type but a documentation artifact) — a prose narrative of the pipeline flow, grammar semantics, prescribed-context meaning, and confidence handling. Loaded as `guide://system-overview` MCP prompt. Structured docs (`SystemConceptAnnotation`) for lookup, prose for narrative — different jobs, different shapes.

Annotation-type extension work tracked as a beads issue (blocks the semantic smoke test — the smoke test needs real annotations to test against, and real annotations need the extended types).

### What the CLI wrapper does

- Starts the engine app (spawns the Vite dev server or serves the built bundle)
- Starts the MCP server on stdio (or local port, TBD)
- Bridges control ops from MCP tools to the running engine (WebSocket to the web app, or shared-memory, or in-process depending on how the app is embedded)
- Exposes engine state upward as MCP resources
- Handles lifecycle (Ctrl-C, restart, log capture)
- Saves, stores and loads presets

CLI shape (aspirational):

```bash
synesthetica start                         # start app + MCP server
synesthetica start --annotations ./custom  # override annotation set
```

## Macro namespace and semantics (from tunables review)

Output of the tunables review (see `docs/tunables.md` and synesthetica-2v7). Fills in what SPEC 004 left abstract — the concrete macros the LLM will actually operate on, plus the resolution rules that make multi-macro-touching-same-param behaviour predictable.

### Naming convention

- **`system:*`** — global; applies across all instances of the app (colour mapping, audio detection). Never per-instance.
- **`session:*`** — per-instance musical-frame settings (key, mode, tempo, meter, chord-interpretation, metronome). Categorical/enum values, not 0–1 dials.
- **`input:*`** — per-instance input source management (MIDI device / audio).
- **Bare** (no prefix, e.g. `time-horizon`) — cross-cutting aesthetic macros. Per-instance-tunable.
- **`<scope>:*`** (e.g. `rhythm:difficulty`, `harmony:linger`) — scope-specific aesthetic macros. Per-instance-tunable.

**Delimiter conventions:**
- **Colons** separate namespace levels: `system:audio:note-on-threshold`, `session:beats-per-bar`, `rhythm:quantise-resolution`.
- **Hyphens** within a single name segment: `time-horizon`, `note-on-threshold`, `arpeggio-tolerance`.
- **Bare names** (no prefix) for cross-cutting macros.

No `macro:` prefix — the fact that it's a macro is implied by the tool that sets it.

**Scope namespaces (`<scope>:*`) are not coupled to code grammars.** They're semantic groupings. `rhythm:*` today aligns with RhythmGrammar, but nothing requires that — `renderer:ascii`, `overlay:*`, or an as-yet-unnamed concept can occupy their own scope namespace without being a `Grammar` class. The namespace is a bucket for related knobs, not a class name.

The `session:*` and `input:*` namespaces get **their own MCP tools** (`set_key`, `set_tempo`, `set_meter`, `set_chord_mode`, `set_metronome`, `set_input`) rather than being fanned through `set_macro` — their types are precise (enums, paired values, booleans, nullable) rather than 0–1 dials. The namespace here is for annotations and discoverability. Aesthetic macros go through `set_macro`.

### Macro list (initial set)

**System (global):**
- `system:colour-mapping:reference` — anchor colour (Vocab.referenceHue + HarmonyGrammar.referenceHue; the two need reconciling — see §Cleanup)
- `system:colour-mapping:direction` — wheel rotation direction (cw/ccw)
- `system:audio:note-on-threshold` — Basic Pitch onset confidence gate
- `system:audio:note-off-threshold` — Basic Pitch frame-presence confidence gate
- `system:audio:min-note-length` — reject-notes-shorter-than
- `system:audio:note-off-timeout` — silence gap before emitting note-off
- `system:audio:note-repeat-stability` — minimum onset gap for re-strike vs continuation

**Cross-grammar (bare):**
- `time-horizon` — fans to RhythmGrammar.horizon + Harmony.PROGRESSION_FADE_VALUE + Dynamics.FADE_MS

**Rhythm-scoped:**
- `rhythm:difficulty` — compound; fans to RhythmGrammar.horizon + TIGHT_TOLERANCE_MS
- `rhythm:quantise-resolution` — subdivisionDepth (quarter/8th/16th)
- `rhythm:emphasis` — compound; fans to referenceLinger + PULSE_DECAY_MS + PULSE_OPACITY_BOOST + PULSE_VALUE_BOOST

**Harmony-scoped:**
- `harmony:linger` — Harmony.PROGRESSION_FADE_VALUE
- `harmony:arpeggio-tolerance` — ChordDetectionStabilizer.pitchDecayMs
- `harmony:note-threshold` — ChordDetectionStabilizer.minPitchClasses
- `harmony:detection-stability` — ChordDetectionStabilizer.hysteresisMs

**Dynamics-scoped:**
- `dynamics:linger` — Dynamics.FADE_MS

**Session (per-instance musical frame — enums/precise types, likely separate MCP tools):**
- `session:tonic` — pitch class 0–11 (nullable — clearing disables key-aware analysis)
- `session:mode` — ionian/dorian/phrygian/lydian/mixolydian/aeolian/locrian (paired with `session:tonic`)
- `session:tempo` — BPM (nullable)
- `session:beats-per-bar` — 1–16 (paired with `session:beat-value`)
- `session:beat-value` — 1–16, typically 4
- `session:chord-mode` — "harmonic" | "bass-led"
- `session:metronome` — boolean

**Input (per-instance input source):**
- `input:source` — MIDI device name | "audio"

~22 controls total across all namespaces. Three aesthetic parameters (horizon, PROGRESSION_FADE_VALUE, FADE_MS) are touched by more than one macro; see resolution rules below. Session controls don't overlap this way — each maps 1:1 to a `Prescribed*` field.

### Resolution: last-write-wins, macro-set is a one-shot fanout

When multiple macros target the same underlying parameter (or a macro and a direct param-set both do), **whichever operation ran most recently wins**. No accumulation, no multiplicative composition, no priority weights.

**Corollary**: a `set_macro` call is a **one-shot fanout**, not a subscription. After `set_macro("time-horizon", 0.5)`, the params it touched are not "owned" by `time-horizon` — subsequent macro sets or direct param sets overwrite freely. This is what keeps last-write-wins clean. The LLM's system prompt should reflect this so the LLM doesn't reason as if macros hold their values.

**Why not multiplicative or priority-based**: predictability. Every op is invertible (just set the target back). No hidden state accumulates. The LLM can reason "I set X → the effect is what I set" without tracking a history of composing macros.

### Compound-macro dispatch curves — deferred

Two macros are compound (touch multiple params via a single 0–1 dial):
- `rhythm:difficulty` → 2 params (horizon + TIGHT_TOLERANCE_MS)
- `rhythm:emphasis` → 4 params (referenceLinger + PULSE_DECAY_MS + PULSE_OPACITY_BOOST + PULSE_VALUE_BOOST)

Each needs a dispatch curve — how a single 0–1 dial maps to each underlying param. Options range from linear to piecewise to non-linear. **Curves deferred to implementation time**, when a concrete grammar and iteration loop are available. Not blocking for design.

### Stabilizer-cap validation rule

Linger-style macros (`harmony:linger`, `dynamics:linger`, `time-horizon`, `rhythm:emphasis`) touch grammar-level fade/window constants that sit under stabilizer-level tracking windows (e.g. NoteTrackingStabilizer.releaseWindowMs = 10000ms). If a macro range asks for a linger longer than its stabilizer window can supply, the visual silently clips.

**Rule**: at annotation-writing time, each linger macro's declared range MUST NOT exceed the underlying stabilizer window. Either clamp with a warning, or the macro's annotation says "max ~8s" so the LLM won't request more. Enforced by validation during MCP resource generation.

### referencePc intentionally internal

Pitch-hue mapping has three legs: `referencePc` (which pitch anchors), `referenceHue` (which colour it anchors on), `direction` (wheel rotation). Two are exposed as macros; `referencePc` is kept internal (fixed at A=9). This isn't a limitation of expressive range — any colour-mapping intent ("make C red") is still achievable by rotating `referenceHue` and `direction` appropriately. The LLM (or a server-side helper tool `set_hue_for_pitch(pc, hue)`) does the math.

Trade-off accepted: keeping only two of the three legs tunable makes the wheel easier to dial in — one less axis to think about. If the LLM-side math proves tedious at implementation time, we can add the helper tool without changing the macro surface.

### Coverage explicitly left internal

The tunables review examined and *deliberately kept internal*:
- NoteTrackingStabilizer.releaseWindowMs, DynamicsStabilizer.windowMs — structural stabilizer windows; performance parameters, not artistic knobs (they only affect the visual if reduced below the grammar's rendering window, which is a bug not a feature)
- HarmonyStabilizer theory tables (INTERVAL_DISSONANCE, QUALITY_TENSION, MODAL_INTERCHANGE_MAJOR, SECONDARY_DOMINANT_WEIGHTS, CHAIN_RESOLUTION_WEIGHT) — canon; the theory the system reads by
- All cosmetic/layout constants (~50 items) — setup-time, not intent-time

### Cleanup items surfaced by the review (tracked as beads)

- `plateauFraction` has two defaults (0.1 in grammar entity, 0.2 in renderer fallback) — reconcile
- `DEFAULT_HUE_INVARIANT` duplicated between HarmonyGrammar and MusicalVisualVocabulary — HarmonyGrammar should read from vocabulary
- Hidden-param audit — for any renderer fallback default, either grammar always supplies OR the fallback IS the intentional default. Never diverging values on both sides.

## Multi-instance model

Decision: **one LLM controls many synesthetica instances via a single CLI-managed MCP server.** Multiple LLMs concurrently controlling the same instance is explicitly not a supported case.

### Topology

The CLI wrapper hosts one MCP server that aggregates multiple engine instances. The LLM connects to one endpoint and addresses instances by label. This is the MCP-idiomatic option (aggregating server, per-URI scoping) and avoids the LLM having to connect to N separate servers.

### Instance labels

- **First `synesthetica start`** — label defaults to `default`. LLM can omit the `instance` param on any tool call.
- **Second+ `synesthetica start`** — label REQUIRED (e.g. `synesthetica start --instance piano`). Refuse if omitted with a helpful error message.
- **User-supplied labels take precedence.** If the first launch specifies `--instance piano`, that becomes the label — no `default` in play.
- **LLM-side aliasing**: if the user says "call the default one 'piano'" after launch, the LLM tracks it locally. Not the CLI's job.

### Tool signatures

All tools take an optional `instance` parameter. When only one instance is running, it's optional (defaults to the sole instance). When multiple are running, it's required — omitting it returns an error listing the available labels.

### Resources scoped by instance

State is per-instance: `state://default/current`, `state://piano/current`, `state://guitar/recent-events`. Discoverable via the top-level `instances://` resource which lists labels + status. Annotations (`annotations://`) and concepts (`concepts://`) are shared across instances since they describe the system as a whole.

### Presets

Presets are shared across instances (one store, per-user). Loading a preset targets one instance — `switch_preset("jazz-piano", instance="piano")`. Saving captures the current state of the target instance and stores it under a name that any instance can later load.

### Concurrency scope

**Not supported: multiple LLM clients concurrently driving the same instance.** The single-user framing rules out this case. If two clients ever both connect, last-write-wins is the trivial behaviour; no coordination or locking is designed for.

## Smoke test findings

Semantic smoke test ran 2026-08-19 (synesthetica-dib closed). 11 realistic utterances covering key/tempo/meter prescription, macro adjustments (relative and absolute), colour-mapping, discrete enums, informational queries, and one intentionally-underserved request.

**Gate outcome: PASSED cleanly.** 11/11 utterances handled coherently (counting "correctly declined with reasoning" as coherent — that's the intended posture, not a miss). Zero hallucinated tools, zero force-fit ops. The LLM correctly identified where the annotation set had gaps and named them rather than papering over.

### What the smoke test validated

- **Annotation model works.** Discriminated MacroAnnotation shape (continuous / discrete / compound) is legible to the LLM without additional prompting.
- **SystemConceptAnnotation is load-bearing.** Informational queries ("what is the clock thing?") produced good prose without a dedicated explain tool — the LLM assembled from concept entries.
- **`set_hue_for_pitch` helper was used unprompted on first attempt.** Justifies its inclusion.
- **Aliases matched natural phrasing** — "chord fade" → `harmony:linger`, "strictness" → `rhythm:difficulty`, "look-back" → `time-horizon`.
- **`session:beat-value` rename didn't confuse.** LLM emitted `beat_value: 4` correctly for "3/4".
- **Conversational posture worked.** LLM declined "emphasise rhythm" (utterance 9) with a clean explanation of what was missing, rather than force-fitting an unrelated op.

### Gaps surfaced

1. **No annotated defaults + no readback in the smoke test.** Every relative request ("more slowly", "less history", "stricter") became a guess. Fix tracked as **synesthetica-lmn**: add `default` field to `ContinuousMacroAnnotation`. The state readback path (`state://current`) is already in the RFC surface; adding it to the smoke test manifest was considered and skipped — the signal is banked.
2. **`rhythm:horizon` only reachable via compound `time-horizon`.** Causes spillover into harmony:linger and dynamics:linger when the user only wanted less rhythm history. Fix tracked as **synesthetica-ec8**: expose `rhythm:horizon` as a first-class macro alongside the compound.
3. **`emphasis:*` per-grammar salience missing.** SPEC 004 named these as core macros; the current release doesn't have them. Explicitly deferred — accepted omission; annotation set will document this rather than attempt a partial implementation.

### Implication for MCP-vs-skill decision

The smoke test used a static JSON manifest attached to a fresh LLM session — deliberately transport-agnostic. What it proved: the annotation model + tool schema together produce coherent behaviour from any capable LLM. Either MCP or a skill could deliver the same manifest to the same LLM and get the same result. **The transport choice is not gated on model correctness** — it's gated on portability, discoverability, and operational shape.

## Alternative considered: Claude Code skill

A skill would work — annotations get rendered into a `SKILL.md`, control ops become a tool schema, Claude Code handles the loop. Advantages: simpler to bootstrap (skill is basically prose + a schema), no MCP server to run. Disadvantages: Claude-Code-specific, less discoverable, tied to one client rather than portable across the MCP ecosystem.

**Skill is a viable fallback if MCP proves too heavy for the value delivered.**

## Alternative considered: bespoke WebSocket + hand-rolled protocol

Simplest to build (WebSocket + JSON messages), but reinvents what MCP standardises. Rejected on grounds of "why write our own version of a well-designed standard."

## Decision

**MCP.** Confirmed 2026-08-19 after smoke test passed. Reasoning:

- **Portability across LLM clients.** Any MCP-capable client works (Claude Desktop, Claude Code, other MCP clients as they emerge). Skill would tie us to Claude Code.
- **Multi-instance model relies on resource URIs.** The guitar/piano side-by-side use case (§Multi-instance model) leans naturally on `instances://` + per-instance `state://<label>/*` — MCP-native. Skill would need bespoke labelling.
- **Annotation → resource pipeline is already close to what SPEC 004 commits to.** Building it as MCP resources vs. a `SKILL.md` is comparable work; MCP output is more reusable.
- **State subscription** (subscribable `state://<instance>/current`) is idiomatic in MCP, not in a skill.

Trade-off accepted: **more setup work up front** (server, tool registration, resource generator, subscription plumbing) in exchange for the above. Skill remains a documented fallback if MCP setup proves disproportionate to the value.

## Open questions

1. **State subscription granularity.** How often does state change? Do we push per-frame (too chatty) or per-control-op (too sparse)? Something in between?
2. **Transport for the CLI ↔ engine channel.** WebSocket to the browser app? IPC to a Node embedding? Shared memory? Depends on whether the app runs in-browser or gets embedded in Electron/Tauri.
3. **Annotation storage format.** SPEC 004 explicitly left this open. YAML? Embedded TS objects (current)? Separate `.annotation.ts` files? A single manifest?
4. **How does the LLM know when to speak vs stay quiet?** SPEC 004's quiet/conversational posture is LLM-side, driven by system prompt. Need to define the trigger — user annotation? Session mode? Rate-limit?
5. **Macro coverage.** HarmonyGrammar and DynamicsGrammar have no runtime macros. What's the minimum useful macro set to expose? Does this require a grammar refactor?
6. **Error surfacing.** Control op fails (invalid preset, malformed macro value). MCP returns an error. Does the LLM retry? Ask the user? Give up silently?
7. ~~Concurrency between LLM clients~~ — RESOLVED: not supported (see §Multi-instance model, §Concurrency scope).

8. ~~Single vs multi-instance~~ — RESOLVED: one LLM controls many instances via a single CLI-managed MCP server; per-instance addressing via labels (see §Multi-instance model).

## Preconditions (must be true before implementation begins)

- [x] SPEC 004 §I10-I13 invariants confirmed still applicable
- [x] Tunables reviewed; the "expose vs internal" split is decided (docs/tunables.md — decisions in the Decision column of each table)
- [x] Macro namespace and resolution semantics defined (see §Macro namespace and semantics)
- [x] Multi-instance model decided (see §Multi-instance model)
- [x] HarmonyGrammar + DynamicsGrammar macro coverage implemented per the macro list (synesthetica-bfb — Tier 1 done; cross-grammar dispatcher deferred until curves are informed by smoke-test findings)
- [x] Cleanup items enacted (plateauFraction dedupe: synesthetica-2bn; hue-invariant reconciliation: synesthetica-65y)
- [x] Annotation type extensions defined and adopted (synesthetica-2ol — generalised MacroAnnotation, new SessionControlAnnotation, new SystemConceptAnnotation)
- [x] Semantic smoke test run and passing — synesthetica-dib closed 2026-08-19; 11/11 utterances coherent, model works; see §Smoke test findings
- [x] MCP vs skill decision made (2026-08-19 — MCP; see §Decision). SPEC write-up pending as its own step.

## Plan

Ordered work, with the semantic smoke test as the gate:

1. ~~Re-read context~~ ✓ *(done)*
2. ~~Tunables review~~ ✓ *(done — see §Macro namespace and semantics)*
3. ~~Multi-instance decision~~ ✓ *(done — see §Multi-instance model)*
4. **Annotation type extensions** (new beads issue). Generalise `MacroAnnotation` (add `type` field with continuous / discrete / compound variants), add `SessionControlAnnotation`, add `SystemConceptAnnotation`. Small contract-shape work; blocks step 6 because the smoke test needs the new types to author real annotations.
5. **Macro plumbing** (synesthetica-bfb). Add `setMacros` surface to HarmonyGrammar + DynamicsGrammar + relevant stabilizers per the macro list. Also enact §Cleanup items. Together with step 4, enables the smoke test to run against real macros with real annotations.
6. ~~Semantic smoke test~~ ✓ *(done 2026-08-19 — gate PASSED; see §Smoke test findings)*
7. ~~MCP vs skill decision~~ ✓ *(done 2026-08-19 — MCP; see §Decision)*
8. **SPEC write-up** (next). New SPEC covering: MCP surface (tools/resources/prompts) in full detail, annotation storage format, annotation → resource pipeline (generator, URI structure, refresh model), CLI shape and lifecycle, state subscription protocol, error surfacing, multi-instance routing, concurrency stance. Amends SPEC 004 to cover the extended annotation types (SessionControlAnnotation, SystemConceptAnnotation, generalised MacroAnnotation).
9. **Implementation** — first the CLI + MCP server skeleton, then annotation manifest generator, then the control-op receiver in the engine, then per-tool wiring against the existing grammar/stabilizer setters (already landed in Tier 1 of synesthetica-bfb).

## Next-session pickup

**Everything above is a breadcrumb. If we're picking this up cold:**

- Read this RFC first (context — decision framing)
- Read SPEC 004 (annotation contract this builds on)
- Read docs/tunables.md (what we can control)
- **The design decisions are done.** Transport = MCP. Multi-instance model = decided. Macro namespace + semantics = defined. Smoke test passed.
- **Next work is the SPEC write-up** (Plan step 8). It should be new (probably SPEC 013 or similar; check the numbering), amending SPEC 004 for the annotation type changes rather than duplicating.
- After SPEC lands, implementation is a series of concrete pieces (CLI + MCP server skeleton → annotation manifest generator → control-op receiver → per-tool wiring).

## Non-goals

- Deciding the specific MCP client (Claude Code vs Desktop vs other) — user's choice at runtime
- Speech-to-text integration — user's responsibility (Claude Code has this, other clients vary)
- User-created annotations (leave for a later spec)
- Explanation UI ("why did it change?") — SPEC 004 already lists as out of scope
- **Multi-user** orchestration (multiple humans driving the same session) — single-user assumption throughout. Multi-*instance* under a single user is a real design decision (see §Plan step 5) and is NOT a non-goal.
