# SPEC 015 — Control-op validation error format

**Status**: canonical
**Depends on**: SPEC 013 (LLM control plane MCP)
**Supersedes**: none

## Purpose

Every MCP tool this project ships returns the same result shape. Errors carry structured codes the LLM can pattern-match on before re-reading the message. This spec pins the shape and enumerates every error code the tools produce today. Adding a new tool or a new failure mode means adding an entry here and to the tool.

## Result shape

Every tool handler returns a `ToolResult`:

```ts
type ToolResult =
  | { ok: true; state: StateSnapshot }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

- `ok: true` — the tool succeeded and returns the post-call state snapshot.
- `ok: false` — validation or engine failure. `code` is a stable SCREAMING_SNAKE_CASE string. `message` is human-readable. `details` (optional) carries structured context (e.g. `available: string[]`).

At the MCP transport layer, error results get wrapped as `{ content: [{type: "text", text: JSON.stringify(result)}], isError: true }`. See `packages/cli/src/mcpServer.ts` for the wrapping.

## Codes

Stable enumeration. Adding a code = updating this spec + the tool.

### Cross-cutting (any tool)

| Code | When | `details` |
|---|---|---|
| `SCHEMA_INVALID` | Argument type / shape doesn't match the tool's input schema, or a required arg is missing. | — |
| `INSTANCE_NOT_FOUND` | The `instance` arg doesn't match any running engine (multi-instance path). Message includes the currently-running labels. | — |
| `INSTANCE_REQUIRED` | Reserved (multi-instance Phase 3): omitted `instance` arg when 2+ engines are running. Not yet emitted. | — |
| `INSTANCE_NONE_RUNNING` | Reserved (Phase 3): omitted `instance` when zero engines are running. Not yet emitted. | — |
| `TOOL_UNKNOWN` | Client called a tool name the server doesn't advertise. Server-side; primarily defensive. | — |
| `ENGINE_ERROR` | The underlying engine handle rejected (WS transport failure, browser-side throw, filesystem error for presets, etc.). Message forwards the underlying reason. | — |

### Session control tools

`set_key`, `set_tempo`, `set_meter`, `set_chord_mode`, `set_metronome`:

| Code | When |
|---|---|
| `SCHEMA_INVALID` | Required arg missing (e.g. `set_meter` without both `beats_per_bar` and `beat_value`), or wrong type. |
| `KEY_INVALID_PAIR` | `set_key`: root and mode aren't both null or both set. |
| `TEMPO_OUT_OF_RANGE` | `set_tempo`: bpm outside [30, 240] and not null. |
| `METER_INVALID_PAIR` | `set_meter`: bpb and beat_value aren't both null or both set. |
| `METER_VALUE_UNSUPPORTED` | `set_meter`: beat_value not in {1, 2, 4, 8, 16}. |
| `CHORD_MODE_UNKNOWN` | `set_chord_mode`: mode not in {harmonic, bass-led}. |

### Input tool

`set_input`:

| Code | When |
|---|---|
| `SCHEMA_INVALID` | `source` missing or not a non-empty string. |

### Macro tools

`set_macro`, `set_hue_for_pitch`:

| Code | When | `details` |
|---|---|---|
| `SCHEMA_INVALID` | `name` not a string; `pc` outside [0, 11]; `hue` outside [0, 360]. | — |
| `MACRO_UNKNOWN` | `set_macro` called with an id not in the manifest. | `{ available: string[] }` — currently declared macro ids |
| `MACRO_VALUE_WRONG_TYPE` | Value shape wrong for the macro's type (e.g. string for continuous, number-only for discrete when enumValues are strings). | — |
| `MACRO_VALUE_OUT_OF_RANGE` | Continuous / compound value outside declared range. Message includes the range. | — |

### Preset tools

`switch_preset`, `save_preset`:

| Code | When | `details` |
|---|---|---|
| `SCHEMA_INVALID` | `name` missing or empty. | — |
| `PRESET_NOT_FOUND` | `switch_preset` called with a name that isn't on disk. | `{ available: string[] }` — currently-saved preset names |
| `ENGINE_ERROR` | Preset store failure (invalid name characters, filesystem error). | — |

## Message conventions

- Message starts with the specific problem, not a preamble. `"root must be an integer in [0, 11], got NaN"` — not `"Validation error: root..."`.
- Include the offending value when possible (`got ${bpm}`).
- Include the constraint the value violated (`in [30, 240]`, `one of {1, 2, 4, 8, 16}`).
- Reference the correct arg name from the tool's input schema.
- Avoid apologies, please/thank you, and marketing tone. Direct is respectful.

## `details` conventions

- Only present when structured context helps the caller decide what to do next.
- Discovery-shaped errors (`MACRO_UNKNOWN`, `PRESET_NOT_FOUND`) carry an `available` field listing valid values.
- Never include stack traces.
- Never include internal implementation details (file paths on disk, class names, etc.) except when they're part of a caller-actionable message (preset store path if the store itself is misconfigured — rare).

## LLM handling guidance

Codes are stable across releases. Message text may vary. The LLM should:

1. Match on `code` for classification, not on message text.
2. Use `details.available` (when present) as candidates to retry with — e.g. `MACRO_UNKNOWN` with `details.available` lets the LLM pick a nearest match.
3. Fall back to reading the message when no code fits (only `ENGINE_ERROR` today).
4. Surface `SCHEMA_INVALID` back to the user (usually indicates the LLM built a malformed call — self-correct and retry).

## New codes

Adding a code:

1. Write the code here, with When + `details` columns.
2. Add the code literal to the tool handler.
3. Cover with a test in `packages/cli/test/<tool>Tools.test.ts`.
4. Update `packages/cli/src/tools/registry.ts` or annotation notes only if the semantic change is user-visible (e.g. a new tool arg).

Don't add codes for one-off cases that fit an existing category. `SCHEMA_INVALID` covers arg-shape errors; splinter codes only when the caller would decide to retry differently.

## Coverage today

All shipped tools use codes from this enumeration. No tool returns unstructured errors. The `ENGINE_ERROR` catch-all in each handler is the only path where message-only diagnosis is required, and that's intentional (WS transport failures, filesystem I/O errors — no structured shape the LLM would benefit from).

Missing coverage that's worth filing:

- No `TOOL_UNKNOWN` test — defensive path, not currently exercised.
- No test for `INSTANCE_NOT_FOUND` under multi-instance conditions (Phase 3 concern).
- No integration test asserting the wrapped `isError: true` at the MCP transport layer.

Filed under synesthetica-5l9 (build-time annotation validation) and the general test coverage backlog.

## References

- SPEC 013 — LLM control plane (MCP transport, tool surface).
- `packages/cli/src/tools/sessionTools.ts` — session control codes.
- `packages/cli/src/tools/macroTools.ts` — macro codes.
- `packages/cli/src/tools/presetTools.ts` — preset codes.
- `packages/cli/src/mcpServer.ts` — TOOL_UNKNOWN + isError wrapping.
- `packages/cli/src/main.ts` — INSTANCE_NOT_FOUND.
- `packages/cli/test/{sessionTools,macroTools,presetTools}.test.ts` — behavioural coverage per code.
