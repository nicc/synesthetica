# RFC 0011: LLM Control Plane and Transport Architecture

Status: Draft (in-progress; pickup planned next session)
Author(s): Synesthetica
Date: 2026-08-13

### Related

- SPEC 004 — LLM Mediation and Annotation Strategy (principles + contract, still valid)
- RFC 004 — Annotation-Driven Control and LLM Mediation (predecessor RFC, principles landed as SPEC 004)
- synesthetica-8f4 — Audio adapter gates LLM-mediation (now satisfied)
- synesthetica-gyj — LLM-mediation threshold criteria
- synesthetica-dib — Paper prototype: LLM annotation interpretation
- docs/tunables.md — Canonical list of controllable values in the pipeline

## Summary

Defines the architectural shape of the LLM control plane: how a language model produces control ops that the engine executes. SPEC 004 established the *what* (annotation-driven, LLM interprets, engine executes deterministically) but left the *how* — transport, process boundary, discovery — unspecified.

This RFC proposes an **external-process architecture**: the LLM runs outside the app entirely, communicating with a wrapper CLI that exposes the engine's control surface. **MCP (Model Context Protocol) is the leading candidate for the transport**, chosen preliminarily on portability (any MCP client works), technical fit (tools + resources + subscriptions map cleanly onto control ops + state), and showcase value (illustrates the emerging LLM-integration standard).

The alternative — a Claude-Code-native skill generated from annotations — is a viable fallback but is Claude-Code-specific and offers less structural leverage.

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
- `set_macro` — adjust a macro value
- `set_grammar_config` — adjust a grammar-scoped constant that we've promoted to a macro
- `switch_preset` — load a named preset
- `override_key` / `override_meter` / `override_tempo` — prescribed-context overrides
- `save_preset` — persist current state as a named preset

**Resources (nouns the LLM can read):**
- `annotations://` — full annotation manifest (grammars, presets, macros) as browsable resources
- `state://current` — current macro values, active preset, prescribed context — subscribable so the LLM sees updates
- `state://recent-events` — recent musical activity (notes, chords, tempo estimate) if useful for context-aware decisions

**Prompts (canned LLM behaviour):**
- `posture://quiet` — system prompt fragment for quiet-performance mode (per SPEC 004)
- `posture://conversational` — system prompt fragment for conversational mode

### Annotation → resource pipeline

Annotations are already defined as data (`GrammarAnnotation`, `PresetAnnotation`, `MacroAnnotation`). A generator converts them into MCP resources on server startup:

- Each annotation becomes a discoverable resource with a stable URI
- MCP client (LLM) can list, read, and cache them
- Regenerated when annotations change (dev-time; not runtime-hot)

For MCP tools, the annotation manifest also generates the tool schemas — `set_macro`'s `macro` param becomes an enum from the macro annotations, with descriptions pulled from each macro's `directionality`.

### What the CLI wrapper does

- Starts the engine app (spawns the Vite dev server or serves the built bundle)
- Starts the MCP server on stdio (or local port, TBD)
- Bridges control ops from MCP tools to the running engine (WebSocket to the web app, or shared-memory, or in-process depending on how the app is embedded)
- Exposes engine state upward as MCP resources
- Handles lifecycle (Ctrl-C, restart, log capture)

CLI shape (aspirational):

```bash
synesthetica start                         # start app + MCP server
synesthetica start --annotations ./custom  # override annotation set
```

## Macro namespace and semantics (from tunables review)

Output of the tunables review (see `docs/tunables.md` and synesthetica-2v7). Fills in what SPEC 004 left abstract — the concrete macros the LLM will actually operate on, plus the resolution rules that make multi-macro-touching-same-param behaviour predictable.

### Naming convention (three-tier + session/input)

- **`system:*`** — global; applies across all instances of the app (colour mapping, audio detection). Never per-instance.
- **`session:*`** — per-instance musical-frame settings (key, mode, tempo, meter, chord-interpretation, metronome). These aren't aesthetic macros — they set the frame the analyser reads within. Categorical/enum values, not 0-1 dials.
- **`input:*`** — per-instance input source management (MIDI device / audio).
- **`<no prefix>`** (bare, e.g. `time:horizon`) — cross-grammar aesthetic macros. Per-instance-tunable.
- **`<grammar>:*`** (e.g. `rhythm:difficulty`) — grammar-scoped aesthetic macros. Per-instance-tunable.

Delimiter is `:` throughout for uniformity. No `macro:` prefix — the fact that it's a macro is implied by the tool that sets it.

The `session:` and `input:` namespaces likely get **their own MCP tools** (e.g. `override_key(root, mode)`, `override_tempo(bpm)`, `select_input(source)`) rather than being fanned through a generic `set_macro`, because their types are precise (enums, positive numbers) rather than 0-1 dials. The namespace here is for annotations and discoverability. Aesthetic macros go through `set_macro`.

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
- `time:horizon` — fans to RhythmGrammar.horizon + Harmony.PROGRESSION_FADE_VALUE + Dynamics.FADE_MS

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

**Corollary**: a `set_macro` call is a **one-shot fanout**, not a subscription. After `set_macro("time:horizon", 0.5)`, the params it touched are not "owned" by `time:horizon` — subsequent macro sets or direct param sets overwrite freely. This is what keeps last-write-wins clean. The LLM's system prompt should reflect this so the LLM doesn't reason as if macros hold their values.

**Why not multiplicative or priority-based**: predictability. Every op is invertible (just set the target back). No hidden state accumulates. The LLM can reason "I set X → the effect is what I set" without tracking a history of composing macros.

### Compound-macro dispatch curves — deferred

Two macros are compound (touch multiple params via a single 0–1 dial):
- `rhythm:difficulty` → 2 params (horizon + TIGHT_TOLERANCE_MS)
- `rhythm:emphasis` → 4 params (referenceLinger + PULSE_DECAY_MS + PULSE_OPACITY_BOOST + PULSE_VALUE_BOOST)

Each needs a dispatch curve — how a single 0–1 dial maps to each underlying param. Options range from linear to piecewise to non-linear. **Curves deferred to implementation time**, when a concrete grammar and iteration loop are available. Not blocking for design.

### Stabilizer-cap validation rule

Linger-style macros (`harmony:linger`, `dynamics:linger`, `time:horizon`, `rhythm:emphasis`) touch grammar-level fade/window constants that sit under stabilizer-level tracking windows (e.g. NoteTrackingStabilizer.releaseWindowMs = 10000ms). If a macro range asks for a linger longer than its stabilizer window can supply, the visual silently clips.

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

## Alternative considered: Claude Code skill

A skill would work — annotations get rendered into a `SKILL.md`, control ops become a tool schema, Claude Code handles the loop. Advantages: simpler to bootstrap (skill is basically prose + a schema), no MCP server to run. Disadvantages: Claude-Code-specific, less discoverable, doesn't showcase the standard integration pattern.

**Skill is a viable fallback if MCP proves too heavy for the value delivered.**

## Alternative considered: bespoke WebSocket + hand-rolled protocol

Simplest to build (WebSocket + JSON messages), but reinvents what MCP standardises. Rejected on grounds of "why write our own version of a well-designed standard."

## Recommendation

**MCP, provisionally.** Formal decision deferred until after the semantic smoke test (see Plan below) and one more considered pass on complexity budget.

## Open questions

1. **State subscription granularity.** How often does state change? Do we push per-frame (too chatty) or per-control-op (too sparse)? Something in between?
2. **Transport for the CLI ↔ engine channel.** WebSocket to the browser app? IPC to a Node embedding? Shared memory? Depends on whether the app runs in-browser or gets embedded in Electron/Tauri.
3. **Annotation storage format.** SPEC 004 explicitly left this open. YAML? Embedded TS objects (current)? Separate `.annotation.ts` files? A single manifest?
4. **How does the LLM know when to speak vs stay quiet?** SPEC 004's quiet/conversational posture is LLM-side, driven by system prompt. Need to define the trigger — user annotation? Session mode? Rate-limit?
5. **Macro coverage.** HarmonyGrammar and DynamicsGrammar have no runtime macros. What's the minimum useful macro set to expose? Does this require a grammar refactor?
6. **Error surfacing.** Control op fails (invalid preset, malformed macro value). MCP returns an error. Does the LLM retry? Ask the user? Give up silently?
7. **Concurrency between LLM clients.** One MCP client per engine, or multiple simultaneous? If two clients issue conflicting ops (e.g. both call `set_macro` on the same macro concurrently) — last-write-wins, or reject? Probably last-write-wins is fine given the single-user framing.

8. **Single vs multi-instance for a single user** (see §Context bullet on guitar/piano use case). If we support multi-instance:
   - Each instance needs a distinct MCP server endpoint (or the server needs to address multiple engines). The former is simpler; the latter is more MCP-idiomatic.
   - The LLM needs to disambiguate targets in each tool call ("set the piano's horizon to 0.5" vs "set the guitar's horizon to 0.5"). Either add an `instance` parameter to every tool, or the LLM connects to N separate MCP servers and picks one per call.
   - Instance identity: user-supplied labels (`--instance piano`) or auto-assigned (port numbers)? Labels are more legible for the LLM.
   - State subscription: one state URI per instance, discoverable from a top-level index resource.

## Preconditions (must be true before implementation begins)

- [x] SPEC 004 §I10-I13 invariants confirmed still applicable
- [x] Tunables reviewed; the "expose vs internal" split is decided (docs/tunables.md — decisions in the Decision column of each table)
- [x] Macro namespace and resolution semantics defined (see §Macro namespace and semantics)
- [ ] HarmonyGrammar + DynamicsGrammar macro coverage implemented per the macro list (synesthetica-bfb — plumbing to add `setMacros` to those grammars and stabilizer configs)
- [ ] Cleanup items enacted (see §Cleanup items — plateauFraction dedupe, hue-invariant reconciliation)
- [ ] Semantic smoke test (see below) run and passing — annotation model produces coherent LLM behaviour on ~10 test utterances
- [ ] MCP vs skill decision formalised in a spec
- [ ] Single vs multi-instance decision formalised in a spec (see §Plan step 5)

## Plan

Ordered work, with the semantic smoke test as the gate:

1. ~~Re-read context~~ ✓ *(done)*
2. ~~Tunables review~~ ✓ *(done — see §Macro namespace and semantics for the output)*
3. **Macro plumbing** (synesthetica-bfb). Add `setMacros` surface to HarmonyGrammar + DynamicsGrammar + relevant stabilizers per the macro list. Also enact §Cleanup items. Enables the smoke test to actually test with the intended macros rather than mocked ones.
4. **Semantic smoke test** (~2 hrs, expands synesthetica-dib):
   - Write annotations for a representative slice of the macro list (start with `time:horizon`, `rhythm:difficulty`, `harmony:linger`, `harmony:arpeggio-tolerance`, `system:colour-mapping:reference`)
   - Mock a control-op schema (JSON) — no runtime, just structure
   - Write 8–12 realistic utterances covering the annotated surface
   - Feed utterances + annotation manifest + control-op schema to the LLM in a fresh context, ask it to produce the ops
   - Evaluate: did it pick sensible ops? Where did it guess? What annotations are missing?
   - **Gate: if the LLM can produce coherent responses for ≥80% of utterances, proceed. If not, redesign the annotation model.**
5. **MCP vs skill decision.** Now with real evidence from the smoke test, formalise the transport choice.
6. **Single vs multi-instance decision.** Guitar/piano side-by-side use case (see §Context) argues for multi-instance from day one. Decide: are we shipping single-instance and deferring multi (simpler now, refactor later), or building the multi-instance model up front (more work now, no refactor)? The decision affects:
   - CLI shape (`synesthetica start` vs `synesthetica start --instance piano --port ...`)
   - MCP server topology (one server per engine, or one server routing to multiple engines)
   - Tool schemas (need `instance` param, or one MCP endpoint per instance)
   - Annotation manifest (per-instance or shared)
   - State resource shape (one state URI or per-instance)
   Recommend the decision be small-scoped and time-boxed — not a full spec, just a design memo.
6. **SPEC write-up** covering: MCP surface (tools/resources/prompts), annotation storage format, annotation → resource pipeline, CLI shape, state subscription model, error handling, concurrency stance, instance model (per step 5). Also possibly amend SPEC 004 §What This Spec Does NOT Cover.
7. **Implementation** — first the CLI + MCP server skeleton, then annotation manifest generator, then the control-op receiver in the engine.

## Next-session pickup

**Everything above is a breadcrumb. If we're picking this up cold:**

- Read this RFC first (context)
- Read docs/tunables.md next (what we can control)
- Read SPEC 004 (why we're doing it this way)
- The gate is step 3 (semantic smoke test). Don't do design work past the gate until the gate passes.
- Nic's lean is toward MCP but is formally undecided. Don't skip the alternative comparison.

## Non-goals

- Deciding the specific MCP client (Claude Code vs Desktop vs other) — user's choice at runtime
- Speech-to-text integration — user's responsibility (Claude Code has this, other clients vary)
- User-created annotations (leave for a later spec)
- Explanation UI ("why did it change?") — SPEC 004 already lists as out of scope
- **Multi-user** orchestration (multiple humans driving the same session) — single-user assumption throughout. Multi-*instance* under a single user is a real design decision (see §Plan step 5) and is NOT a non-goal.
