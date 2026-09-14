# SPEC 007: Error and Diagnostic Model

Status: Approved
Date: 2026-01-15
Source: RFC 002, RFC 004

## Summary

Defines how errors and diagnostics are categorized, propagated, and surfaced in Synesthetica. The system favors graceful degradation for runtime issues while failing fast for configuration and invariant violations.

## Design Principles

### Graceful Degradation

The system should "keep playing" when possible. A failing lens shouldn't stop the whole pipeline — it should be skipped with a diagnostic. The user experience matters more than strict error propagation.

### Fail Fast for Bugs

Configuration errors and invariant violations indicate bugs. These should fail loudly at load time or immediately when detected, not be silently degraded.

### Visibility

All diagnostics are logged. Additionally, renderers should provide visual indicators so users know something went wrong without needing to check logs.

## Error Categories

### Runtime Diagnostics (Graceful Degradation)

| Category | Code | Example | Strategy |
|----------|------|---------|----------|
| **Input** | `input` | MIDI parse error, audio buffer underrun | Continue with partial data |
| **Stabilizer** | `stabilizer` | State overflow, NaN detected | Reset stabilizer, continue |
| **Lens** | `lens` | Exception in update() | Skip lens for this frame |
| **Control** | `control` | Invalid preset ID, out-of-range macro | Reject op, return error to caller |

### Configuration Errors (Fail Fast)

| Category | Example | Strategy |
|----------|---------|----------|
| **Missing reference** | Preset references non-existent lens | Fail at load time |
| **Schema violation** | Lens params don't match schema | Fail at load time |
| **Invariant violation** | Vocabulary returns null | Fail immediately (indicates bug) |

## Diagnostic Type

```ts
export type DiagnosticCategory = "input" | "stabilizer" | "lens" | "control";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  /** Unique identifier for deduplication */
  id: string;

  /** Category for grouping and visual indication */
  category: DiagnosticCategory;

  /** Severity level */
  severity: DiagnosticSeverity;

  /** Human-readable message */
  message: string;

  /** When the diagnostic was emitted */
  timestamp: SessionMs;

  /** Optional: which component emitted this */
  source?: string;

  /** Optional: associated part */
  partId?: PartId;

  /**
   * Persistence mode:
   * - "transient": auto-clears after a few seconds
   * - "sticky": persists until condition clears
   */
  persistence: "transient" | "sticky";
}
```

## Validation Result (Control Ops)

When the LLM submits a control op that fails validation:

```ts
export interface ValidationError {
  /** Which field or parameter failed */
  field: string;

  /** What went wrong */
  reason: string;

  /** Optional: what values are valid */
  hint?: string;
}

export interface ControlOpResult {
  /** Whether the op was accepted */
  success: boolean;

  /** If rejected, why */
  errors?: ValidationError[];

  /** Diagnostics emitted during execution (even if successful) */
  diagnostics?: Diagnostic[];
}
```

## Diagnostic Flow

```
Component detects issue
  → Creates Diagnostic
  → Logs to console/file (always)
  → Adds to frame's diagnostic list
  → Compositor passes diagnostics through to SceneFrame
  → Renderer displays visual indicator (recommended)
```

### SceneFrame Amendment

```ts
export interface SceneFrame {
  timestamp: SessionMs;
  entities: Entity[];
  diagnostics: Diagnostic[];  // Added
}
```

## Visual Indicator (Recommended Renderer Behavior)

Renderers SHOULD display visual indicators for active diagnostics. This is not a contract requirement but a strong recommendation for user experience.

### Suggested Implementation

Display category-specific icons in a consistent location (e.g., top-right corner):

| Category | Suggested Icon | Meaning |
|----------|----------------|---------|
| `input` | 🔌 | Input/adapter issue |
| `stabilizer` | ⚙️ | Stabilizer issue |
| `lens` | 🎨 | Lens issue |
| `control` | 🎛️ | Control op rejected |

### Indicator Behavior

- **Transient diagnostics**: Icon flashes briefly, then fades
- **Sticky diagnostics**: Icon persists until condition clears
- **Multiple diagnostics**: Show count badge or stack icons

### Example

```
┌────────────────────────────────────┐
│                          🔌 ⚙️ x2  │  ← Indicator area
│                                    │
│         [Visual content]           │
│                                    │
└────────────────────────────────────┘
```

## Error Propagation by Component

### Adapters

```ts
// Adapters return null on failure, emit diagnostic
interface ISourceAdapter {
  nextFrame(): CMSFrame | null;  // null = no data this frame
}
```

When an adapter encounters a parse error:
1. Log the error
2. Emit a diagnostic (category: "input", persistence: "transient")
3. Return null or partial CMSFrame
4. Pipeline continues with available data

### Stabilizers

When a stabilizer encounters an error:
1. Log the error
2. Emit a diagnostic (category: "stabilizer")
3. Call `reset()` to clear corrupted state
4. Return input frame unchanged (pass-through)

### Lenses

When a lens throws during `update()`:
1. Log the exception
2. Emit a diagnostic (category: "lens")
3. Skip this lens for the current frame
4. Continue with other lenses

### Vocabularies

Vocabularies are pure functions and should not throw. If they do:
1. This indicates a bug
2. Log the error
3. Fail the frame (do not attempt graceful degradation)

### Control Surface

When a control op fails validation:
1. Do not apply the op
2. Return `ControlOpResult` with `success: false` and `errors`
3. Emit diagnostic (category: "control", persistence: "transient")
4. LLM can use errors to inform next action

## Logging Requirements

All diagnostics MUST be logged regardless of visual indication:

```ts
// Minimum log format
[timestamp] [category] [severity] message
  source: componentId
  partId: partId (if applicable)
```

Implementations may use structured logging (JSON) for easier parsing.

## What This Spec Does NOT Cover

- Log storage and rotation policies
- Remote telemetry
- User-facing error messages (LLM interprets diagnostics)
- Retry strategies

## Contract Location

New types in `packages/contracts/diagnostics/diagnostics.ts`
