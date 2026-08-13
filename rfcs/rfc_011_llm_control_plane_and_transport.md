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

## Alternative considered: Claude Code skill

A skill would work — annotations get rendered into a `SKILL.md`, control ops become a tool schema, Claude Code handles the loop. Advantages: simpler to bootstrap (skill is basically prose + a schema), no MCP server to run. Disadvantages: Claude-Code-specific, less discoverable, doesn't showcase the standard integration pattern.

**Skill is a viable fallback if MCP proves too heavy for the value delivered.** Not chosen as primary because portability and standardisation matter for a project meant to illustrate serious craft.

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
7. **Concurrency.** One MCP client per engine? Multiple? What if two people run `synesthetica start` on the same machine — different ports, or single canonical instance?

## Preconditions (must be true before implementation begins)

- [ ] SPEC 004 §I10-I13 invariants confirmed still applicable
- [ ] Tunables reviewed; the "expose vs internal" split is decided (docs/tunables.md as starting point)
- [ ] HarmonyGrammar + DynamicsGrammar macro coverage decided (either "add macros" refactor scoped, or "start with rhythm only" accepted)
- [ ] Semantic smoke test (see below) run and passing — annotation model produces coherent LLM behaviour on ~10 test utterances
- [ ] MCP vs skill decision formalised in a spec

## Plan

Ordered work, with the semantic smoke test as the gate:

1. **Re-read context** (docs/tunables.md, this RFC, SPEC 004). Cheap context reload.
2. **Tunables review** (~1 hr). Walk the tunables doc; for each, decide: expose as macro, expose as advanced/preset-only, keep internal. Output: annotated tunables doc, and a list of "should be a macro but isn't" refactors.
3. **Semantic smoke test** (~2 hrs, expands synesthetica-dib):
   - Write annotations for ~4 representative grammars/macros (RhythmGrammar's `horizon` and `subdivisionDepth`, HarmonyGrammar's `PROGRESSION_FADE_VALUE` if promoted, DynamicsGrammar's `FADE_MS` if promoted)
   - Mock a control-op schema (JSON) — no runtime, just structure
   - Write 8–12 realistic utterances covering the annotated surface
   - Feed utterances + annotation manifest + control-op schema to the LLM in a fresh context, ask it to produce the ops
   - Evaluate: did it pick sensible ops? Where did it guess? What annotations are missing?
   - **Gate: if the LLM can produce coherent responses for ≥80% of utterances, proceed. If not, redesign the annotation model.**
4. **MCP vs skill decision.** Now with real evidence from the smoke test, formalise the transport choice.
5. **SPEC write-up** covering: MCP surface (tools/resources/prompts), annotation storage format, annotation → resource pipeline, CLI shape, state subscription model, error handling, concurrency stance. Also possibly amend SPEC 004 §What This Spec Does NOT Cover.
6. **Implementation** — first the CLI + MCP server skeleton, then annotation manifest generator, then the control-op receiver in the engine.

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
- Multi-user / multi-instance orchestration — single-user single-instance to start
