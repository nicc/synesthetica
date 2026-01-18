# SPEC 008: Pipeline Orchestration

Status: Approved
Date: 2026-01-16
Source: RFC 002, RFC 003, SPEC 005

## Summary

Defines the `IPipeline` interface and orchestration model that ties together adapters, stabilizers, rulesets, grammars, compositor, and renderer into a unified frame-production system.

## Overview

The pipeline is the central orchestrator of Synesthetica. It:
- Receives frame requests from the renderer (pull-based)
- Coordinates per-part processing through the full data flow
- Produces composited scene frames for rendering

## The Pipeline Interface

```ts
export interface IPipeline {
  requestFrame(targetTime: SessionMs): SceneFrame;
}
```

### Semantics

- **Pull-based**: The renderer drives timing by requesting frames at target times
- **Synchronous**: `requestFrame` blocks until the frame is ready
- **Composited**: Returns a single merged `SceneFrame` from all active parts

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           IPipeline                                      │
│                                                                          │
│  requestFrame(targetTime)                                                │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │   Adapters   │  For each source: adapter.nextFrame() → CMSFrame       │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │    Router    │  router.route(frame) → Map<PartId, CMSFrame>           │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼  For each part:                                                │
│  ┌──────────────┐                                                        │
│  │  Stabilizers │  stabilizer.apply(frame) → enriched CMSFrame           │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │   Ruleset    │  ruleset.map(frame) → IntentFrame                      │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │   Grammars   │  grammar.update(intents, prev) → SceneFrame(part)      │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         └─────────────────────────┐                                      │
│                                   ▼                                      │
│                          ┌──────────────┐                                │
│                          │  Compositor  │  compose([scenes]) → SceneFrame│
│                          └──────┬───────┘                                │
│                                 │                                        │
│                                 ▼                                        │
│                            SceneFrame                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Processing Steps

### 1. Adapter Collection

The pipeline polls all registered adapters for frames up to `targetTime`:

```ts
for (const adapter of adapters) {
  const frame = adapter.nextFrame();
  if (frame) collectedFrames.push(frame);
}
```

Adapters may return `null` if no new data is available.

#### Push-to-Pull Reconciliation

Adapters bridge between push-based input sources (e.g., Web MIDI events, Web Audio callbacks) and the pull-based pipeline model. This works via state buffering:

1. **External events push state changes** — MIDI note-on updates the adapter's internal state
2. **Pipeline pulls current state** — `nextFrame()` reads whatever state has accumulated since last call
3. **Decoupling** — The two sides operate independently; events don't directly trigger frame production

Adapters are **state-writers**, not frame-pushers. They maintain current musical state; the pipeline reads it on demand. This pattern was validated in the MIDI spike (see `docs/learnings/2026-01-18-midi-spike.md`).

### 2. Routing

The router splits collected CMS data by part:

```ts
const partFrames: Map<PartId, CMSFrame> = router.route(mergedFrame);
```

Each part receives only its own events and signals.

### 3. Per-Part Processing

For each part, the pipeline runs:

```ts
for (const [partId, cmsFrame] of partFrames) {
  // Stabilizers enrich the frame
  let enriched = cmsFrame;
  for (const stabilizer of stabilizers) {
    enriched = stabilizer.apply(enriched);
  }

  // Ruleset maps to intents
  const intents = ruleset.map(enriched);

  // Grammar stack produces scene
  const scene = grammarStack.update(intents, previousScene);
  partScenes.push(scene);
}
```

### 4. Composition

The compositor merges all part scenes:

```ts
const finalScene = compositor.compose(partScenes);
```

This applies layout transforms, blending, and z-ordering per the active policies.

### 5. Return

The composited `SceneFrame` is returned to the caller (renderer).

## Activity Tracking

The pipeline should record activity for deictic resolution (e.g. "this is the guitar"):

```ts
export interface IActivityTracker {
  recordActivity(part: PartId, t: SessionMs): void;
  getMostActive(windowMs: Ms): PartId | null;
}
```

The pipeline records activity when processing events for a part. The activity tracker is used by the speech interface to resolve "this" to the most recently active part.

## Diagnostics

Diagnostics emitted during processing are collected in the returned `SceneFrame`:

```ts
export interface SceneFrame {
  t: SessionMs;
  entities: Entity[];
  diagnostics: Diagnostic[];
}
```

Components add diagnostics via the frame or a shared collector. The renderer may display visual indicators for active diagnostics.

## Lifecycle

### Initialization

```ts
pipeline.init({
  adapters: [...],
  stabilizers: [...],
  ruleset: defaultRuleset,
  grammars: [...],
  compositor: defaultCompositor,
});
```

### Session Management

- **Start**: Initialize all stabilizers, reset state
- **Running**: Process frame requests
- **Stop**: Dispose stabilizers, clean up resources

### Part Registration

Parts are discovered dynamically as adapters emit events with new `PartId` values. The pipeline maintains a registry of known parts.

## Invariants Preserved

This orchestration model preserves all system invariants:

- **I1**: Same ruleset processes all parts regardless of source
- **I3**: Meaning lives in ruleset, grammars only see intents
- **I6**: Every CMS item has exactly one PartId
- **I7**: Grammars don't read other parts (per-part instantiation)
- **I8**: Layout/blending handled by compositor only

## What This Spec Does NOT Cover

- Specific stabilizer ordering (implementation decides)
- Grammar stack composition within a part
- Renderer implementation
- Session persistence

## Contract Location

- `IPipeline`: `packages/contracts/pipeline/interfaces.ts`
- `IActivityTracker`: `packages/contracts/pipeline/interfaces.ts`
- `SceneFrame`: `packages/contracts/scene/scene.ts`