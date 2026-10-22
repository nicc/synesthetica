# SPEC 008: Pipeline Orchestration

Status: Approved
Date: 2026-01-19
Source: RFC 002, RFC 003, RFC 005, RFC 006, SPEC 005

## Summary

Defines the `IPipeline` interface and orchestration model that ties together adapters, stabilizers, vocabularies, lenses, compositor, and renderer into a unified frame-production system.

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
│  │   Adapters   │  adapter.nextFrame() → RawInputFrame                   │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │    Router    │  router.route(frame) → Map<PartId, RawInputFrame>      │
│  └──────┬───────┘  (not implemented — single part; see §2 Routing)      │
│         │                                                                │
│         ▼  For each part:                                                │
│  ┌──────────────┐                                                        │
│  │  Stabilizers │  stabilizer.apply(raw, upstream) → MusicalFrame        │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │  Vocabulary  │  vocabulary.annotate(musical) → AnnotatedMusicalFrame  │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │    Lenses    │  lens.update(annotated, prev) → SceneFrame             │
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

## Frame Types

See SPEC_009 for detailed frame type definitions. Summary:

| Stage | Input | Output | Interface |
|-------|-------|--------|-----------|
| Adapters | External input | RawInputFrame | IRawSourceAdapter |
| Stabilizers | RawInputFrame | MusicalFrame | IMusicalStabilizer |
| Vocabularies | MusicalFrame | AnnotatedMusicalFrame | IVisualVocabulary |
| Lenses | AnnotatedMusicalFrame | SceneFrame | IVisualLens |

## Stabilizer DAG

Stabilizers form a directed acyclic graph (DAG) based on their dependencies. Some stabilizers are independent, while others depend on upstream stabilizer output. All run sequentially on the frame thread.

### Independent Stabilizers

These process RawInputFrame directly:

- **NoteTrackingStabilizer** — Correlates note_on/note_off into Notes with duration

(Note: tempo/meter are user-prescribed via control ops, not inferred
from onset patterns. Free-time mode is the default when nothing is
prescribed. See RFC 007 for historical rationale.)

### Derived Stabilizers

These require output from upstream stabilizers:

- **DynamicsStabilizer** (`dynamics`) — Analyzes velocity patterns from Note[] (depends on `note-tracking`)
- **ChordDetectionStabilizer** (`chord-detection`) — Detects chords from active notes and maintains the recent `progression` (depends on `note-tracking`)
- **HarmonyStabilizer** (`harmony`) — Produces `harmonicContext`: tension, and functional analysis when a key is prescribed (depends on `chord-detection`)

Not implemented: phrase detection (synesthetica-nob). `MusicalFrame.phrases` exists in the contract but no stabilizer writes it, and the merge step below does not carry it.

### DAG Resolution

The pipeline topologically sorts stabilizers based on declared dependencies:

```ts
export interface IMusicalStabilizer {
  id: string;
  dependencies?: string[];  // IDs of stabilizers this one depends on

  // Derived stabilizers receive upstream MusicalFrame
  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame;
}
```

Execution order (`VisualPipeline.applyStabilizers`):
1. Stabilizers are topologically sorted once, when the part's state is created. A dependency cycle, or a dependency on an id that no registered stabilizer has, throws (a configuration error; SPEC_007).
2. Stabilizers run sequentially in that order.
3. A stabilizer with dependencies receives the merged outputs of those dependencies as `upstream`. A stabilizer with no dependencies receives its own previous output instead.
4. Each output is merged into the running MusicalFrame. A stabilizer that throws is reset and its `upstream` (or an empty frame) stands in for its output, so dependants and lenses still run (SPEC_007).
5. The final MusicalFrame goes to the vocabulary.

### Merge Semantics

When multiple stabilizers produce output, `VisualPipeline.mergeMusicalFrames` combines them field by field:

| Field | Merge rule | Intended owner |
|-------|-----------|----------------|
| `notes[]` | Union, deduplicated by note id; on a duplicate id the later frame wins | NoteTrackingStabilizer |
| `chords[]` | Union, deduplicated by chord id; later frame wins | ChordDetectionStabilizer |
| `progression` | Union of chord ids in first-seen order; `undefined` if empty | ChordDetectionStabilizer |
| `dynamics` | Last frame whose `dynamics.events` is non-empty; otherwise an empty state | DynamicsStabilizer |
| `harmonicContext` | Last frame that has one | HarmonyStabilizer |
| `prescribedTempo`, `prescribedMeter`, `prescribedKey`, `chordInterpretation` | Always taken from the pipeline (control ops), never from stabilizer output | — |
| `phrases` | Dropped | — |

Ownership is a convention, not enforced: the pipeline does not check which stabilizer wrote a field. If two stabilizers write the same field, the merge is last-writer-wins in execution order (or union, for the array fields). The current stabilizers each write distinct fields, so no conflict arises in practice. Derived stabilizers pass upstream fields through in their output, which the dedupe absorbs.

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

Adapters are **state-writers**, not frame-pushers. They maintain current raw input; the pipeline reads it on demand.

### 2. Routing

**Not implemented.** `IRouter` is defined in `packages/contracts/routing/router.ts`, but `VisualPipeline` does not use one. It concatenates all adapters' inputs into one RawInputFrame and processes a single part (`config.partId`, default `"default"`).

The intended model: the router splits collected raw input by part, and each part receives only its own raw input.

```ts
const partFrames: Map<PartId, RawInputFrame> = router.route(mergedFrame);
```

### 3. Per-Part Processing

For the part, the pipeline runs:

```ts
// Stabilizers transform raw input to musical abstractions (see §Stabilizer DAG)
const musicalFrame = applyStabilizers(partState, rawFrame);

// Musical-frame listeners (e.g. the recent-events buffer) see the frame before annotation
for (const cb of musicalFrameListeners) cb(musicalFrame);

// Vocabulary annotates musical elements with visual properties
const annotatedFrame = vocabulary.annotate(musicalFrame);

// Each lens produces a scene from the same annotated frame
for (const lens of lenses) {
  const scene = lens.update(annotatedFrame, previousScenes.get(lens.id));
  partScenes.push(scene);
}
```

If no vocabulary is set, the pipeline returns an empty scene with a `pipeline-no-vocabulary` warning diagnostic. A lens that throws is skipped for that frame with an error diagnostic; the other lenses still draw (SPEC_007).

### 4. Composition

The compositor merges all part scenes:

```ts
const finalScene = compositor.compose(partScenes);
```

The only compositor is `IdentityCompositor` (`packages/engine/src/stubs/IdentityCompositor.ts`), which concatenates entities and diagnostics. Layout transforms, blending, and z-ordering are not implemented. If no compositor is set, the pipeline concatenates scenes itself.

### 5. Return

The composited `SceneFrame` is returned to the caller (renderer).

## Activity Tracking

The pipeline records activity for deictic resolution (e.g. "this is the guitar"):

```ts
export interface IActivityTracker {
  recordActivity(part: PartId, t: SessionMs): void;
  getMostActive(windowMs: Ms): PartId | null;
}
```

Activity is recorded based on note count in the MusicalFrame.

## Diagnostics

Diagnostics emitted during processing are collected in the returned `SceneFrame`:

```ts
export interface SceneFrame {
  t: SessionMs;
  entities: Entity[];
  diagnostics: Diagnostic[];
}
```

Components add diagnostics via the frame or a shared collector.

## Lifecycle

### Initialization

```ts
const pipeline = new VisualPipeline({
  canvasSize: { width, height },
  rngSeed: Date.now(),
  partId: "main",
});

pipeline.addAdapter(adapter);
pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
pipeline.addStabilizerFactory(() => new DynamicsStabilizer({ partId }));
pipeline.addStabilizerFactory(() => new ChordDetectionStabilizer({ partId }));
pipeline.addStabilizerFactory(() => new HarmonyStabilizer({ partId }));
pipeline.setVocabulary(new MusicalVisualVocabulary());
// Lenses receive AnnotatedMusicalFrame and decide how to render
pipeline.addLens(new RhythmLens());
pipeline.addLens(new HarmonyLens());
pipeline.addLens(new DynamicsLens());
pipeline.setCompositor(new IdentityCompositor());
```

### Session Management

- **Start**: Initialize all stabilizers via factory, reset state
- **Running**: Process frame requests
- **Stop**: Dispose stabilizers, clean up resources

### Stabilizer Factory

The pipeline uses a stabilizer factory because each part needs its own stabilizer instance with its own state:

```ts
pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
```

## Invariants Preserved

This orchestration model preserves all system invariants:

- **I1**: Same vocabulary processes all parts regardless of source
- **I3**: Meaning lives in vocabulary. Lenses consume stabilizer-derived analysis (e.g. `harmonicContext`) and vocabulary annotations through the AnnotatedMusicalFrame; they do not compute musical analysis themselves (I4)
- **I6**: Every raw input can be routed to a part (trivially, while there is a single part — see §2 Routing)
- **I7**: Lenses don't read other parts (per-part instantiation)
- **I8**: Layout/blending handled by compositor only

## Implementation

The canonical implementation is `VisualPipeline` in `packages/engine/src/VisualPipeline.ts`.

## Lens Composition Model

When multiple lenses are active within a part, their outputs combine additively.

### Current Model: Additive Composition

Each lens receives the same `AnnotatedMusicalFrame` and produces its own `SceneFrame`. The compositor merges these frames by concatenating entity lists:

```ts
// Simplified composition
const composed: SceneFrame = {
  t: frames[0].t,
  entities: frames.flatMap(f => f.entities),
  diagnostics: frames.flatMap(f => f.diagnostics),
};
```

### Design Constraints for Additive Composition

For additive composition to produce coherent visuals, lenses must be designed to **not overlap**:

1. **Non-overlapping screen regions**: The three lenses share a three-column layout (`packages/engine/src/lenses/layout.ts`): DynamicsLens in the left column, RhythmLens in the centre, HarmonyLens on the right. Each positions its entities within its own column.

2. **Distinct entity identity**: Entity ids are prefixed with the lens id (e.g. `rhythm-lens:…`, `harmony-lens:…`), so entities from different lenses never collide. Entity `data.type` values are mostly lens-specific (RhythmLens: `beat-line`, `bar-line`, `now-line`, `streak`; HarmonyLens: `chord-shape`, `roman-numeral`, `connector-strip`; DynamicsLens: `dynamics-indicator`), but some renderer primitives are shared (`note-strip` and `text-label` are used by both RhythmLens and HarmonyLens).

3. **Non-overlapping input emphasis**: Lenses focus on different aspects of the input
   - RhythmLens reads notes and the prescribed tempo/meter; it ignores chords
   - HarmonyLens reads chords, the prescribed key, and `harmonicContext` (tension, functional progression, functional edges)
   - DynamicsLens reads `dynamics`
   - This prevents "doubled" responses to the same musical event

4. **Consistent palette usage**: Lenses that colour by pitch take it from the vocabulary — RhythmLens from each note's `visual.palette`, HarmonyLens from the frame's `hueInvariant` — so a pitch class has the same colour in every column. DynamicsLens uses fixed structural colours.

### Limitations

This additive model works well when:
- Lenses are designed as a complementary set
- Presets curate compatible lens combinations
- Each lens has a clear, non-overlapping visual domain

It breaks down when:
- Two lenses both respond to the same musical events with conflicting visuals
- Lenses produce entities that visually compete for attention
- No coordination exists between independent lens authors

### Future Work

See synesthetica-n63 for exploration of more sophisticated composition models:
- Priority-based layering
- Domain declarations (lens declares which channels it consumes)
- Slot-based composition (lenses fill predefined visual slots)
- Intent arbitration (intents merged before reaching lenses)

For Phase 1, the additive model with carefully designed non-overlapping lenses is sufficient.

## What This Spec Does NOT Cover

- Renderer implementation
- Session persistence
- Specific stabilizer implementations (see SPEC_006)

## Contract Location

- `IPipeline`: `packages/contracts/pipeline/interfaces.ts`
- `IActivityTracker`: `packages/contracts/pipeline/interfaces.ts`
- `SceneFrame`: `packages/contracts/scene/scene.ts`
