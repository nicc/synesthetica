# SPEC 013: LLM Control Plane over MCP

Status: Draft (2026-08-19)
Source: RFC 011 (approved 2026-08-19). Extends SPEC 004 (LLM Mediation and Annotations) with concrete transport, resource, and lifecycle contracts.

## Summary

Specifies the runtime architecture that lets an LLM control a running Synesthetica engine via natural-language user requests. An external LLM client (Claude Desktop, Claude Code, or any MCP-capable client) connects to an MCP server hosted by the Synesthetica CLI wrapper. The server exposes engine controls as MCP tools, engine state and annotation manifests as MCP resources, and LLM behavioural presets (quiet vs conversational) as MCP prompts.

SPEC 004 established the principle (annotation-driven, LLM interprets, engine executes deterministically). RFC 011 selected the transport (MCP) and the multi-instance model (one CLI, N engines). This SPEC defines the concrete contracts: the tool surface, resource URIs, storage format, lifecycle, subscription protocol, error handling, and multi-instance routing.

## Goals

1. **A single LLM client can drive one or more Synesthetica engines** via a stable MCP surface, without needing to know engine internals.
2. **The LLM discovers what it can do at connection time** by listing MCP tools + resources; no hidden API surface.
3. **State stays observable**: current macro values, prescribed context, active preset, and recent musical activity are visible to the LLM via subscribable resources.
4. **Multi-instance is first-class**: the same LLM can control a piano-tracking instance and a guitar-tracking instance side-by-side, addressing each by label.
5. **Errors are legible**: failed ops return structured errors the LLM can either recover from or explain to the user.
6. **The transport is vendor-neutral**: any MCP client works; nothing in the SPEC depends on Claude-Code-specific behaviour.

## Non-Goals

- **Speech-to-text integration** — handled by the LLM client (Claude Desktop dictation, OS-level STT, or plain text). Out of scope for the engine.
- **User authentication** — single-user assumption throughout; no accounts, no ACLs.
- **Multi-user concurrent control** — see §Concurrency stance. Single-user, may be multi-instance.
- **Concurrent LLM clients driving the same instance** — see §Concurrency stance. Explicitly not supported.
- **The LLM prompt design** — system prompts are the LLM client's concern; this SPEC only defines the resources the LLM reads (annotations + concepts + guide).
- **Explanation UI ("why did it change?")** — the LLM narrates via the tool-call/response loop; no separate explanation channel.
- **BPM / tempo inference** — the system does not infer tempo from onset patterns under any circumstances. Tempo is user-prescribed only (via `set_tempo`, UI, or a future explicit source like MIDI clock). Removed 2026-08-20 (RhythmicAnalysis contract deleted; no stabilizer ever populated it).

## Principles Honoured

- **SPEC 004 §I10–I13** — engine never interprets musical intent; annotations are advisory; execution is bounded and deterministic; the LLM balances but cannot violate constraints.
- **P2 Simplicity over cleverness** — MCP is a standard, not a bespoke protocol. One tool per verb, one resource per readable thing.
- **P5 Real-time respect** — control ops must not block the render loop. State updates propagate asynchronously.
- **P6 Composability** — the MCP server sits behind a narrow interface to the engine (§Engine channel), letting either side be swapped independently.
- **P7 Exploratory by design** — annotations + concepts + guide are all readable resources so the LLM can inspect what it's operating on.

## Architecture

```
┌──────────────────┐         ┌─────────────────────┐         ┌────────────────┐
│ User             │ speech  │  LLM client         │  MCP    │ synesthetica    │
│                  │────────►│  (Claude Desktop,   │◄───────►│ CLI wrapper     │
│                  │         │   Claude Code, …)   │ stdio   │                 │
└──────────────────┘         └─────────────────────┘         │ ┌─────────────┐ │
                                                             │ │ MCP server  │ │
                                                             │ └──────┬──────┘ │
                                                             │        │        │
                                                             │        ▼        │
                                                             │ ┌─────────────┐ │
                                                             │ │  Engine     │ │
                                                             │ │  registry   │ │
                                                             │ │  (instances)│ │
                                                             │ └──┬────┬────┬─┘ │
                                                             │    │    │    │   │
                                                             └────┼────┼────┼───┘
                                                                  ▼    ▼    ▼
                                                             ┌──────┐┌──────┐┌──────┐
                                                             │Engine││Engine││Engine│
                                                             │piano ││guitar││…     │
                                                             └──────┘└──────┘└──────┘
                                                                  │    │    │
                                                                  ▼    ▼    ▼
                                                             ┌──────────────────┐
                                                             │  Web app(s)      │
                                                             │  (render)        │
                                                             └──────────────────┘
```

**Roles:**

- **LLM client** — chosen by the user. Connects to the MCP server, discovers tools + resources, interprets user speech, emits tool calls.
- **CLI wrapper** — the `synesthetica` binary. Starts and manages engine instances; hosts the MCP server; brokers between MCP and engines.
- **MCP server** — the protocol boundary. Handles the MCP handshake, tool registration, resource serving, subscription lifecycle.
- **Engine registry** — the CLI's map of running instances (label → engine handle).
- **Engine instance** — one running Synesthetica pipeline (adapter → stabilizer → grammar → renderer), one browser tab or embedded surface for the rendered output.

**Transport choices** (see §CLI shape for details):
- MCP server ↔ LLM client: **stdio** (default) or local TCP (opt-in). Stdio is MCP's default for locally-spawned servers.
- CLI ↔ engine instance: WebSocket to the browser app (for the current web-app deployment) or in-process (if the engine gets embedded in Node/Electron/Tauri later). This SPEC assumes WebSocket for the first implementation; the CLI/engine boundary is stable regardless.

## MCP Surface

### Tools

10 tools, per RFC 011 §What the MCP server exposes. All tools accept an optional `instance` parameter; when only one instance is running, it defaults to that instance's label. When multiple are running, `instance` is required; omitting it returns an error listing the available labels.

Every tool responds with either:
- **Success**: `{ "ok": true, "state": <updated-state-snapshot> }` — the state snapshot lets the LLM reason without a separate read.
- **Error**: `{ "ok": false, "error": { "code": <string>, "message": <string>, "details"?: <object> } }` — see §Error surfacing.

#### `set_macro(name, value, instance?)`

Set an aesthetic macro (any `<scope>:*` or bare cross-cutting name). `value` type varies per the macro's annotation — number for continuous / compound, string or number for discrete.

Params (JSON Schema):
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Macro id (drawn from macro annotations)."
    },
    "value": {
      "description": "Value; shape per the macro's type. Continuous/compound: number in [min,max]; discrete: enum value from the macro's enumValues."
    },
    "instance": { "type": "string" }
  },
  "required": ["name", "value"]
}
```

Errors: `MACRO_UNKNOWN`, `MACRO_VALUE_OUT_OF_RANGE`, `MACRO_VALUE_WRONG_TYPE`, `INSTANCE_NOT_FOUND`, `INSTANCE_AMBIGUOUS`.

#### `set_key(root, mode, instance?)`

Set the prescribed key. Pass both `null` to clear (disables key-aware analysis).

Params: `root: 0..11 | null`, `mode: <ionian|dorian|…|locrian> | null`. Root and mode must be both non-null or both null.

Errors: `KEY_INVALID_PAIR` (only one of root/mode is null), `INSTANCE_*`.

#### `set_tempo(bpm, instance?)`

Nullable. `bpm` in [30, 240] or null.

Errors: `TEMPO_OUT_OF_RANGE`, `INSTANCE_*`.

#### `set_meter(beats_per_bar, beat_value, instance?)`

Pair. Both non-null or both null. `beats_per_bar` in [1, 16]. `beat_value` in {1, 2, 4, 8, 16}.

Errors: `METER_INVALID_PAIR`, `METER_VALUE_UNSUPPORTED`, `INSTANCE_*`.

#### `set_chord_mode(mode, instance?)`

`mode: "harmonic" | "bass-led"`.

Errors: `CHORD_MODE_UNKNOWN`, `INSTANCE_*`.

#### `set_metronome(enabled, instance?)`

`enabled: boolean`.

#### `set_input(source, instance?)`

`source: string` — the id of a specific input device. Enumerated inputs are exposed via `inputs://available` (see §Resources). Format:

- `midi:<device-name>` — a specific MIDI device (e.g. `midi:Yamaha P-125`)
- `audio:<device-id>` — a specific audio input device (e.g. `audio:built-in-mic`, `audio:usb-audio-0`)

Specific audio-device selection matters for setups where the user wants to route speech input (for LLM-mediated control) separately from music input. Falls back to the OS default within each category if an unqualified `"midi"` or `"audio"` is passed.

Errors: `INPUT_SOURCE_UNAVAILABLE`.

#### `set_hue_for_pitch(pc, hue, instance?)`

Helper — rotates the colour wheel so a pitch class maps to a given hue. Adjusts `system:colour-mapping:reference` (and `direction` if needed) on the server side.

Params: `pc: 0..11`, `hue: 0..360`.

#### `switch_preset(name, instance?)`

Load a named preset into the target instance.

Errors: `PRESET_NOT_FOUND`.

#### `save_preset(name, instance?)`

Capture the current state of the target instance as a preset. Overwrites if `name` exists.

### Resources

MCP resources are content-addressable via stable URIs. Three URI schemes.

#### `annotations://` — the annotation manifest

- `annotations://manifest` — the full manifest as a single JSON document, mirroring the shape of `smokeTestManifest` (macros, sessionControls, concepts, grammars). Convenience resource for LLMs that prefer a single fetch.
- `annotations://macros/<id>` — one macro annotation
- `annotations://session-controls/<id>` — one session-control annotation
- `annotations://concepts/<term>` — one concept annotation
- `annotations://grammars/<id>` — one grammar annotation
- `annotations://presets/<id>` — one preset annotation

Shared across all instances (the annotations describe the system, not an instance). Generated at server startup (see §Annotation storage).

#### `state://<instance>/*` — engine state per instance

- `state://<label>/current` — a snapshot of current macro values, active preset, prescribed context (key/tempo/meter/chord-mode/metronome), and input source. **Subscribable** — see §State subscription protocol.
- `state://<label>/recent-events?limit=<N>` — recent musical activity (see §Recent events). **Pull-only, not subscribable.** LLM reads when it wants context; `limit` defaults to 100, capped at 1000 for in-memory reads. `?since=<eventId>` returns events after a specific ID (for cursor-style consumption).
- `state://<label>/recent-events/history?limit=<N>&before=<eventId>` — disk-backed deeper history (see §Recent events — disk log). Same shape as `recent-events` but reads from rotated log files.

Instance labels are per §Multi-instance routing.

#### `instances://` — instance registry

- `instances://` — list of running instances (label, status, start-time, input-source).
- `instances://<label>` — details for one instance (label, status, current preset, current input, MCP resource URIs it exposes).

Not subscribable; the LLM re-fetches when it needs a fresh view.

#### `inputs://` — available input devices

- `inputs://available` — enumerated MIDI + audio input devices. Refreshed on device connect/disconnect. Same list underpins the UI dropdown (see §UI Controls).
- Each entry: `{ id: string, label: string, kind: "midi" | "audio", isDefault: boolean }`. `id` is what `set_input` accepts.

**Subscribable** — device connect/disconnect fires an update so the LLM (and UI) can adapt (e.g. "the piano I was using just disconnected — do you want to switch?").

#### `concepts://` — terminology dictionary

Alias for `annotations://concepts/*`. Exposed as its own URI scheme because concept lookup is a common LLM operation and the shorter URI is legible in system prompts.

- `concepts://<term>` — one concept annotation
- `concepts://` — list of all concept terms

### Prompts

- `posture://quiet` — system prompt fragment for quiet-performance mode. Silent no-ops on ambiguity; short commands only; no clarifying questions.
- `posture://conversational` — system prompt fragment for conversational mode. Tolerates ambiguity; may ask clarifying questions; explains changes.
- `guide://system-overview` — a prose narrative describing how the pipeline flows, what each grammar illustrates, how prescribed context and confidence work. Read once by the LLM as context; not for lookup (that's `concepts://`).

Prompt content is generated from source documentation (see §Annotation storage — generator step) rather than embedded in the MCP server code, so prompt refinement is a doc edit.

## Annotation Storage and Generation

### Source of truth

Annotations live in a **single canonical TypeScript source** under the CLI wrapper package (path TBD during implementation; anchor: `apps/cli/annotations.ts` or similar). The TS source is the authoring surface — Nic edits with type safety.

The smoke-test source (`docs/smoke-test/annotations.ts`) is not the production source; it's a testing artefact. Production annotations will be a separate file with the same shape.

### Generator

On server startup (and on hot-reload during dev), a generator:
1. Imports the TS annotations module.
2. Validates each annotation against the contract (type discrimination checks, range validity, cross-references resolve).
3. Emits an in-memory manifest keyed for O(1) URI resolution.
4. Also emits a JSON manifest file (`manifest.json`) alongside for debugging and for manual attachment to LLM sessions.

Validation errors halt server startup with a clear message identifying the offending annotation.

### Refresh model

- **Development**: file-watch on the annotations source; regenerate on change. MCP resource list is re-published via the standard notification mechanism (`notifications/resources/list_changed`); UI controls (see §UI Controls) also re-render on the same signal.
- **Production**: annotations are baked at CLI install time; no live reload. `synesthetica reload-annotations` (a CLI subcommand) forces a regenerate + republish for the running server.

### Storage format decision (was Open Q #3 in RFC 011)

**Embedded TS objects** in a single file. Rationale:
- Type safety at author time (the discriminated union catches shape errors on save).
- Same author-time experience as our other contracts.
- JSON output is a build product, not source.

Alternatives considered and rejected:
- YAML — no type checking; comment fidelity worse than TS.
- Separate `.annotation.ts` per macro — spreads related concepts across many small files; loses cross-reference locality.

## UI Controls (generated from the same manifest)

The web app renders a control panel derived from the same annotation manifest that MCP serves. Same source of truth, two consumers — MCP tools for LLM-mediated control, UI controls for direct-manual control. Either can operate without the other; both can operate simultaneously.

### Sections

Controls are grouped by annotation namespace into three collapsible sections. Each section is collapsed by default to keep the panel small.

- **Input** — controls in the `input:*` namespace. Currently just `input:source`; renders as a dropdown of available MIDI devices + audio devices (see §Audio input selection).
- **Basics** — controls in the `session:*` namespace: key (paired `session:tonic` + `session:mode`), tempo, meter (paired `session:beats-per-bar` + `session:beat-value`), chord mode, metronome. Compact widgets — pair-typed controls render as a single grouped widget (e.g. key selector combines root + mode).
- **Advanced** — everything else: all aesthetic macros (`system:*`, bare cross-cutting, and grammar-scoped). Grouped by scope prefix so the LLM's namespace conventions are visible in the UI.

### Widget generation

Each control gets a widget appropriate to its annotation type:

| Annotation type | Widget |
|---|---|
| `ContinuousMacroAnnotation` | Slider (range from annotation, current value from state) |
| `DiscreteMacroAnnotation` | Segmented control or dropdown (enum values) |
| `CompoundMacroAnnotation` | Slider (dispatches to the underlying targets per the compound's fan-out) |
| `NumberSessionControlAnnotation` (nullable) | Number input + clear button |
| `EnumSessionControlAnnotation` | Dropdown |
| `BooleanSessionControlAnnotation` | Toggle |
| `PairSessionControlAnnotation` | Composite widget grouping the two referenced controls (e.g. root+mode → key selector) |

Widget labels come from `name` (fallback to `id`), tooltips from `notes[0]` when present. Aliases don't render in the UI but are searchable via a filter input at the top of the panel (implementation-time nice-to-have).

### Coexistence with LLM-mediated control

- The UI dispatches control changes through the **same engine setter path** as MCP tools (via the `EngineHandle` interface, §Engine Channel). No parallel control path.
- State updates fire on `state://<label>/current` regardless of which side initiated the change. LLM sees UI-driven changes, UI sees LLM-driven changes — both stay in sync through the same subscription.
- No ownership or locking between UI and LLM. Last-write-wins on races, consistent with §Concurrency Stance.

### Standalone-launch

The CLI can be started without the MCP server if no LLM control is wanted:

```
synesthetica start --no-mcp
```

The engine + web app + UI controls all work; only MCP registration is skipped. This is the "I just want to launch and play" path.

## CLI Shape and Lifecycle

### Commands

```
synesthetica start [--instance <label>] [--port <port>] [--transport stdio|tcp] [--no-mcp] [--recent-events-buffer <N>] [--log-retention-days <N>]
synesthetica stop [--instance <label>]
synesthetica status
synesthetica reload-annotations
synesthetica list-presets
synesthetica help
```

`--no-mcp` skips MCP server registration entirely — engine + web app + UI controls launch and work standalone; no LLM integration. See §UI Controls — standalone-launch.

`start`:
- First invocation: starts the MCP server, spawns one engine instance labelled `default` (or user-supplied), opens the browser tab.
- Subsequent invocations: registers a new engine instance with the running MCP server, opens a new browser tab. `--instance <label>` required for the 2nd+ invocation; refuses without.

`stop`:
- With `--instance`: tears down that engine instance, keeps others running.
- Without: shuts down the whole CLI wrapper (all instances + MCP server).

`status`: prints running instances and MCP server state to stdout. Useful for `synesthetica status | grep piano`-style scripting.

### Transport

**Default: stdio.** MCP's canonical local transport; the LLM client spawns `synesthetica start` as a subprocess and communicates over stdin/stdout.

**Opt-in: TCP.** `--transport tcp --port <port>` starts the MCP server on a local socket. For LLM clients that don't spawn subprocesses (or for connecting a remote client).

### Startup order

1. CLI parses args.
2. MCP server initialises (validates annotations, builds resource index).
3. Engine registry initialises (empty).
4. First engine spawns (browser tab or embedded surface).
5. Server signals `ready` to the LLM client.
6. LLM client can list tools + resources and begin operating.

If step 2 fails (annotation validation error), the CLI exits with a diagnostic. If step 4 fails (engine spawn error), the CLI reports the error and stops.

### Shutdown

- SIGINT (Ctrl-C) on the CLI: gracefully close all engine tabs, drain in-flight tool calls, close the MCP transport, exit 0.
- LLM client disconnects: server keeps engines running (they may be reconnected to). After a configurable idle timeout (default: never — engines persist), the CLI can be configured to shut down engines.

### Logging

All engine + server events log to stderr in a structured format (JSON lines by default; human-readable with `--log-format=text`). `--log-file <path>` redirects to a file. Log levels: `error`, `warn`, `info`, `debug`.

## Engine Channel

The MCP server calls into engine instances through a stable in-process interface (`EngineHandle`). The transport between the CLI and the actual engine — WebSocket to a browser app, or in-process for embedded engines — is a plumbing choice hidden behind the interface.

**Interface (approximate; finalised at implementation time):**

```ts
interface EngineHandle {
  readonly label: string;
  readonly status: "running" | "starting" | "stopping" | "error";

  // Control
  setMacro(name: string, value: number | string): Promise<StateSnapshot>;
  setKey(root: number | null, mode: string | null): Promise<StateSnapshot>;
  setTempo(bpm: number | null): Promise<StateSnapshot>;
  // ... (one method per MCP tool)

  // State
  getStateSnapshot(): Promise<StateSnapshot>;
  getRecentEvents(sinceMs?: number): Promise<RecentEvents>;

  // Subscription
  subscribe(event: "state-changed" | "recent-events-changed", callback: (snapshot: unknown) => void): Unsubscribe;
}
```

The MCP server calls tool handlers → routes to the right `EngineHandle` → serialises the response back over MCP.

**Initial implementation (browser-hosted engine):** the CLI runs a local Vite dev server for the web app; each `synesthetica start` opens a browser tab. The engine tab connects back over WebSocket to the CLI. `EngineHandle` methods post messages down the WebSocket; responses come back over the same channel.

## State Subscription Protocol

Two kinds of state, two access patterns. The distinction matters because subscription implies notification traffic to the LLM client, which for high-frequency data can pump inference in some client configurations.

### `state://<label>/current` — subscribable

Fires an update when:
- Any `set_*` tool call succeeds (fires immediately, with the new snapshot).
- A preset load completes.
- Input source changes (device connected/disconnected).
- UI controls modify state (same path as MCP tools).

Cadence: event-driven, no debouncing. Update-per-op is the norm. If the LLM issues five `set_macro` calls in rapid sequence, five updates fire. Rate is bounded by decision events (user + LLM combined), not per-frame musical activity — safe to subscribe.

### `state://<label>/recent-events` — pull-only (not subscribable)

Musical events (notes, chords, dynamics) arrive at 10s of Hz. Subscribing would inject notifications into the LLM client at a cadence that could trigger inference in clients that map notifications to conversation turns. **Pull-only** avoids this — the LLM reads recent-events on demand, when its own reasoning needs the context.

Typical usage: LLM reads `recent-events?limit=20` before making a decision, or when a user says something ambiguous ("did I play what I think I just played?"). If the LLM wants continuous awareness, it polls at its own cadence.

If we later find pull is insufficient (e.g. a genuine "quiet posture where the LLM watches the music" mode), we add subscription then with an explicit rate-contract and coalescing rule. Not designed for v1.

### `inputs://available` — subscribable

Device connect/disconnect fires an update. Very low frequency (physical device events); safe to subscribe.

### Subscription lifecycle

Standard MCP: LLM client calls `resources/subscribe` with a URI, receives notifications until it calls `resources/unsubscribe` or disconnects. The server tracks per-URI subscriber counts and stops generating updates when no one is listening. Attempts to subscribe to non-subscribable resources (e.g. `state://<label>/recent-events`) return an error.

## Recent Events

### In-memory buffer (ring)

A per-instance ring buffer holds the most recent N events (default: 1000; configurable via `--recent-events-buffer <N>` at CLI start). Events are pushed as they're produced by the pipeline; oldest evicted when the ring fills.

### Event content

Each event has: `id` (monotonic), `t` (ms since instance start), `kind`, and kind-specific payload.

Kinds emitted (reflects the actual pipeline as of 2026-08-19; add as new stabilizers ship):

- `note-on` — `{ pitch, velocity, noteId, source: "midi" | "audio", confidence? }`
- `note-off` — `{ noteId, t, source }`
- `chord-detected` — `{ root, quality, name, roman?, borrowed?, degree?, noteIds }` — from ChordDetectionStabilizer; `roman`/`borrowed`/`degree` populated when a key is prescribed
- `chord-released` — `{ chordId, t }`
- `functional-edge` — `{ sourceChordId, targetDegree, targetPc, targetDiatonic, weight, type }` — from HarmonyStabilizer, when a borrowed chord implies resolution to a diatonic destination
- `dynamics-event` — `{ intensity }` — from DynamicsStabilizer, per note onset

Notably NOT included (called out because earlier drafts / RFCs referenced them, wrongly):
- ~~Active grammar~~ — no grammar-switching concept exists; all three grammars always run
- ~~Tempo estimate~~ — the system does not infer tempo from onset patterns under any circumstances (SPEC 013 §Non-Goals; RhythmGrammar's `getEffectiveTempo` returns prescribed tempo only). Prescribed tempo is available in `state://<label>/current` via the `prescribedTempo` field.

### Disk log (rotating)

The in-memory ring is bounded (default 1000 events, ~seconds to minutes of history). For deeper lookback, events are also appended to a rotating disk log.

- **Location**: `$XDG_STATE_HOME/synesthetica/logs/<instance-label>/events-YYYY-MM-DD.jsonl` (one file per day per instance).
- **Format**: JSONL, one event per line, same shape as in-memory events.
- **Rotation**: new file at midnight local time.
- **Retention**: keep the last N days (default 7; `--log-retention-days <N>`). Older files deleted on daily rotation.
- **Read access**: via `state://<label>/recent-events/history?limit=<N>&before=<eventId>` — reads from the current day's file first, then earlier days as needed to fill `limit`. Bounded lookback (won't scan indefinitely).

Kept simple deliberately — no compression, no indexing, no querying by content. If we outgrow that, revisit.

### Coalescing on pull

Reads of `recent-events` return raw events (no coalescing) up to `limit`. The LLM decides what to make of density. If the LLM wants aggregated summaries ("what happened in the last 10 seconds?"), it aggregates on its side or we add a `?summary=true` param later.

## Error Surfacing

Every tool response is either `{ ok: true, state }` or `{ ok: false, error }`. Errors have:

- `code` — machine-readable, from a stable set. See per-tool docs.
- `message` — human-readable, safe to show the user verbatim.
- `details` — optional structured context (valid range, list of instance labels, etc.).

**LLM behaviour on error** (guidance in `posture://*` prompts, not enforced by the engine):
- Validation errors (`MACRO_VALUE_OUT_OF_RANGE`, `KEY_INVALID_PAIR`, etc.) — LLM corrects and retries once. If still failing, surfaces the error to the user.
- Missing-resource errors (`PRESET_NOT_FOUND`, `INSTANCE_NOT_FOUND`) — LLM surfaces immediately; retry doesn't help.
- Transient errors (engine restarting, WebSocket disconnected mid-op) — LLM retries with exponential backoff (up to 3 attempts).

**Engine-side invariants** (see §Invariants I24, I25):
- The engine never throws exceptions across the MCP boundary. All failures return structured errors.
- The engine validates every input against the tool's schema before executing. Schema-invalid ops return `SCHEMA_INVALID` without touching the engine state.

## Multi-Instance Routing

### Registry

The MCP server holds an in-memory `EngineRegistry`:

```
Map<label: string, EngineHandle>
```

Populated by `synesthetica start` invocations, drained by `synesthetica stop`. Exposed to the LLM via `instances://` resource.

### Label semantics

- First `synesthetica start`: label = `default` unless `--instance <label>` overrides.
- Nth `synesthetica start`: label required; refused with a helpful error if omitted.
- Labels are alphanumeric + hyphens, max 32 chars, unique per running CLI.
- Once assigned, a label persists for the life of the CLI process. Re-launching an instance with a previously-used label is fine (the previous engine was torn down; the label is free).

### Tool dispatch

Every tool takes an optional `instance` parameter:
- Omitted with one running instance → dispatch to that instance.
- Omitted with 0 or 2+ instances → error (`INSTANCE_REQUIRED` or `INSTANCE_NONE_RUNNING`).
- Supplied → look up in registry; dispatch or `INSTANCE_NOT_FOUND`.

### Presets are shared, not per-instance

The preset store is a single per-user directory (path per XDG conventions). Any instance can load or save to it. Preset content is instance-portable — it captures macro values, prescribed context, and active input, not a physical device binding.

### State is per-instance

Each instance has its own `state://<label>/*` resource. The `instances://` resource enumerates active labels so the LLM can discover state URIs.

## Concurrency Stance

- **One LLM client per Synesthetica CLI.** Not enforced (nothing stops a second client from connecting), but not designed for. If two clients connect and both issue ops, last-write-wins is the trivial behaviour; no coordination, no locking.
- **One user per session.** No accounts, no access control, no simultaneous edit protection.
- **Multiple engines per client is fully supported** (see §Multi-Instance Routing).
- **In-flight ops complete atomically.** An MCP tool call either succeeds or fails; the engine isn't left in a half-updated state.

## Invariants (new)

- **I24**: The MCP server never throws exceptions across the transport. All failures return structured error responses.
- **I25**: Every input is schema-validated before touching engine state. Schema-invalid ops are rejected without side effects.
- **I26**: Annotations are validated at server startup and on reload. Invalid annotations halt startup or reload with a clear diagnostic; the server never runs with partially-valid annotations.
- **I27**: Instance labels are unique per running CLI process. Label collisions on `synesthetica start` are rejected.
- **I28**: `state://<label>/current` updates are event-driven (no polling); the resource never returns stale data on read.
- **I29**: UI controls and MCP tools dispatch through the same engine setter path. There is one control surface, two consumers; both stay in sync via the shared subscription.
- **I30**: `state://<label>/recent-events` is pull-only. Subscribing to it returns an error. Musical activity is not pushed to LLM clients at pipeline cadence.

## Out of Scope

- **Speech-to-text plumbing** — LLM client's concern.
- **Preset schema versioning + migration** — see synesthetica-y72.
- **Preset export/import format** — see synesthetica-r0y.
- **User-created annotations** — future SPEC; the current design assumes annotations are baked at CLI-install time.
- **A GUI for MCP server management** — CLI-only.
- **Multi-user coordination** — see §Non-Goals.
- **Streaming responses from tools** — tool responses are one-shot. If a long-running op is added later, it gets its own tool with progress notifications.

## Open Questions (deferred to implementation)

- **Exact WebSocket protocol between CLI and browser-hosted engine** — message format, reconnect semantics, backpressure. Implementation-time concern; the `EngineHandle` interface hides it from the SPEC.
- **Log format details** — JSON schema for structured logs is TBD.
- **Preset store path** — likely `$XDG_DATA_HOME/synesthetica/presets/` on Linux, equivalents on macOS/Windows.
- **Compound-macro dispatch curves** — how a single `set_macro("time-horizon", 0.5)` fans out to per-target values. Deferred to implementation per RFC 011 §Compound-macro dispatch curves.
- **Rate limits on tool calls** — no LLM-client-side or server-side rate limits designed for v1. If an LLM issues a hundred `set_macro` calls in a second, they all execute. May need bounds later.

## Amendments Required

- **SPEC 004** — small amendment covering the annotation-type generalisation (discriminated MacroAnnotation) and the two new annotation types (SessionControlAnnotation, SystemConceptAnnotation). This SPEC cross-references SPEC 004 for the annotation contract; SPEC 004 should be updated to be internally consistent with the extended types.

## Related

- SPEC 004 — LLM Mediation and Annotations (parent contract; being amended in parallel)
- RFC 011 — LLM Control Plane and Transport Architecture (the decision doc this SPEC executes)
- docs/tunables.md — canonical list of the underlying controllable values macros map to
- docs/smoke-test/ — the semantic smoke test that validated the model
