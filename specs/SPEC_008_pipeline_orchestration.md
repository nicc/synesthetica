# SPEC 008: Pipeline Orchestration

Status: Approved
Date: 2026-01-19
Source: RFC 002, RFC 003, RFC 005, RFC 006, SPEC 005

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
│  │   Adapters   │  adapter.nextFrame() → RawInputFrame                   │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │    Router    │  router.route(frame) → Map<PartId, RawInputFrame>      │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼  For each part:                                                │
│  ┌──────────────┐                                                        │
│  │  Stabilizers │  stabilizer.apply(raw) → MusicalFrame                  │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │   Ruleset    │  ruleset.annotate(musical) → AnnotatedMusicalFrame     │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │   Grammars   │  grammar.update(annotated, prev) → SceneFrame          │
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
| Rulesets | MusicalFrame | AnnotatedMusicalFrame | IVisualRuleset |
| Grammars | AnnotatedMusicalFrame | SceneFrame | IVisualGrammar |

## Stabilizer DAG

Stabilizers form a directed acyclic graph (DAG) based on their dependencies. Some stabilizers are independent (can run in parallel), while others depend on upstream stabilizer output.

### Independent Stabilizers

These process RawInputFrame directly:

- **NoteTrackingStabilizer** — Correlates note_on/note_off into Notes with duration
- **BeatDetectionStabilizer** — Detects beats from onset patterns
- **DynamicsStabilizer** — Analyzes velocity patterns

### Derived Stabilizers

These require output from upstream stabilizers:

- **ChordDetectionStabilizer** — Needs active notes from NoteTrackingStabilizer
- **PhraseDetectionStabilizer** — Needs beats and note density patterns
- **ProgressionStabilizer** — Needs chords over time

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

Execution order:
1. Run all stabilizers with no dependencies (in parallel if supported)
2. Merge their outputs into an intermediate MusicalFrame
3. Run stabilizers that depend only on completed ones
4. Repeat until all stabilizers have run
5. Final MusicalFrame goes to ruleset

### Merge Semantics

When multiple stabilizers produce output, their contributions merge:

- `notes[]` — Union of all notes (NoteTrackingStabilizer owns this)
- `chords[]` — Union of all chords (ChordDetectionStabilizer owns this)
- `beat` — Single authoritative source (BeatDetectionStabilizer owns this)
- `dynamics` — Single authoritative source (DynamicsStabilizer owns this)
- `progression` — ChordId references (ProgressionStabilizer owns this)
- `phrases` — Phrase boundaries (PhraseDetectionStabilizer owns this)

Ownership is enforced: only one stabilizer may write to each field.

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

The router splits collected raw input by part:

```ts
const partFrames: Map<PartId, RawInputFrame> = router.route(mergedFrame);
```

Each part receives only its own raw input.

### 3. Per-Part Processing

For each part, the pipeline runs:

```ts
for (const [partId, rawFrame] of partFrames) {
  // Stabilizers transform raw input to musical abstractions
  const musicalFrame = stabilizer.apply(rawFrame, previousMusical);

  // Ruleset annotates musical elements with visual properties
  const annotatedFrame = ruleset.annotate(musicalFrame);

  // Grammar produces scene from annotated musical elements
  const scene = grammar.update(annotatedFrame, previousScene);
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
pipeline.addStabilizerFactory(() => new ChordDetectionStabilizer({ partId }));
pipeline.setRuleset(new MusicalVisualRuleset());
// Grammars receive AnnotatedMusicalFrame and decide how to render
pipeline.addGrammar(new TestRhythmGrammar());
pipeline.addGrammar(new TestChordProgressionGrammar());
pipeline.setCompositor(new IdentityCompositor());
```

### Session Management

- **Start**: Initialize all stabilizers via factory, reset state
- **Running**: Process frame requests
- **Stop**: Dispose stabilizers, clean up resources

### Stabilizer Factory

The pipeline uses a stabilizer factory because each part needs its own stabilizer instance with its own state:

```ts
pipeline.setStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
```

## Invariants Preserved

This orchestration model preserves all system invariants:

- **I1**: Same ruleset processes all parts regardless of source
- **I3**: Meaning lives in ruleset; grammars see annotated musical elements (categories only, not analysis)
- **I6**: Every raw input can be routed to a part
- **I7**: Grammars don't read other parts (per-part instantiation)
- **I8**: Layout/blending handled by compositor only

## Implementation

The canonical implementation is `VisualPipeline` in `packages/engine/src/VisualPipeline.ts`.

## Grammar Composition Model

When multiple grammars are active within a part, their outputs combine additively.

### Current Model: Additive Composition

Each grammar receives the same `AnnotatedMusicalFrame` and produces its own `SceneFrame`. The compositor merges these frames by concatenating entity lists:

```ts
// Simplified composition
const composed: SceneFrame = {
  t: frames[0].t,
  entities: frames.flatMap(f => f.entities),
  diagnostics: frames.flatMap(f => f.diagnostics),
};
```

### Design Constraints for Additive Composition

For additive composition to produce coherent visuals, grammars must be designed to **not overlap**:

1. **Non-overlapping entity types**: Each grammar should produce distinct visual entity types
   - Example: TestRhythmGrammar produces `onset-marker`, `drift-ring`, `beat-line`, `bar-line`, `division-tick`, `downbeat-glow`
   - Example: TestChordProgressionGrammar produces `chord-glow`, `chord-history`, `chord-note`
   - These entity types never overlap, so combining grammars produces complementary visuals

2. **Non-overlapping input consumption**: Grammars should focus on different aspects of the input
   - Example: TestRhythmGrammar ignores chords entirely
   - Example: TestChordProgressionGrammar ignores rhythm information
   - This prevents "doubled" responses to the same musical event

3. **Consistent palette usage**: Both grammars use the same visual annotations (palette colors from ruleset)
   - Ensures visual coherence even when grammars produce different entity types
   - Example: Both grammars use warm palette for major chords, cool palette for minor

### Limitations

This additive model works well when:
- Grammars are designed as a complementary set
- Presets curate compatible grammar combinations
- Each grammar has a clear, non-overlapping visual domain

It breaks down when:
- Two grammars both respond to the same musical events with conflicting visuals
- Grammars produce entities that visually compete for attention
- No coordination exists between independent grammar authors

### Future Work

See synesthetica-n63 for exploration of more sophisticated composition models:
- Priority-based layering
- Domain declarations (grammar declares which channels it consumes)
- Slot-based composition (grammars fill predefined visual slots)
- Intent arbitration (intents merged before reaching grammars)

For Phase 1, the additive model with carefully designed non-overlapping grammars is sufficient.

## What This Spec Does NOT Cover

- Renderer implementation
- Session persistence
- Specific stabilizer implementations (see SPEC_006)

## Contract Location

- `IPipeline`: `packages/contracts/pipeline/interfaces.ts`
- `IActivityTracker`: `packages/contracts/pipeline/interfaces.ts`
- `SceneFrame`: `packages/contracts/scene/scene.ts`
