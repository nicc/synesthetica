# SPEC 005: Frame Timing and Clock Semantics

Status: Approved
Date: 2026-01-15
Source: RFC 002, RFC 003

## Summary

Defines the timing model for Synesthetica's pipeline: how frames are requested, timestamped, and synchronized across multiple sources.

## Clock Model

### Pull-Based Frame Requests

The renderer drives the pipeline using a **pull-based** model:

```
Renderer requests frame at time T
  → Pipeline produces SceneFrame for T
  → Renderer draws
```

This mirrors `requestAnimationFrame` semantics:
- The display determines frame rate
- The pipeline produces frames on demand
- No frame buffer or queue management needed

### Why Pull, Not Push

Push-based (pipeline emits frames continuously):
- Requires buffering/dropping if renderer can't keep up
- Adds complexity for synchronization
- Wastes computation on frames that won't be displayed

Pull-based:
- Simple request/response flow
- No wasted frames
- Natural backpressure

## Timestamp Semantics

### Session-Relative Timestamps

All timestamps are **milliseconds relative to session start**, not Unix epoch.

```ts
type SessionMs = number;  // ms since session start
```

**Rationale:**
- Simpler arithmetic (no BigInt, no overflow concerns)
- Easier debugging (small numbers)
- No timezone/clock-sync issues
- Sufficient precision for real-time audio-visual work

### Session Epoch

A session begins when the engine initializes. The epoch (T=0) is:
- The moment the pipeline becomes ready to process
- Before any adapters begin emitting events

All raw input, musical frames, intents, and scene frames share this timeline.

## Latency Handling

### Accepted Latencies for v0

Different sources have different inherent latencies:

| Source | Typical Latency |
|--------|-----------------|
| MIDI (hardware) | ~1-5ms |
| MIDI (software) | ~5-20ms |
| Audio (real-time) | ~20-100ms (analysis dependent) |

For v0, we **accept differing latencies** between sources:
- Each adapter timestamps events as they arrive
- No attempt to align or compensate across sources
- Visual output reflects when evidence was received, not when sound occurred

### Implications

- MIDI-derived visuals appear before audio-derived visuals for the same musical moment
- This is acceptable for ear training where parts are typically single-source
- Cross-source timing alignment is deferred to future work

### Future Consideration

Adapters may expose a `defaultLatencyMs` hint that could be used for compensation. This is not implemented in v0 but the adapter interface does not preclude it.

## Multi-Source Synchronization

### Per-Part Independence

Each part operates on its own timeline segment:

```
Source A → Adapter A → RawInputFrame → Stabilizer → MusicalFrame(partA, T) → Pipeline → SceneFrame(partA)
Source B → Adapter B → RawInputFrame → Stabilizer → MusicalFrame(partB, T) → Pipeline → SceneFrame(partB)
```

Parts do not share musical state. Musical interpretation happens independently per part.

### Why Per-Part (Not Consolidated)

Consolidated interpretation would require re-interpreting musical intent from combined evidence (e.g., Part 1's C-E-G + Part 2's E-G-B = Cmaj7). This:
- Violates I3 (meaning lives in rulesets, not downstream)
- Loses attribution needed for ear training
- Requires fusion logic that belongs upstream of musical state

Per-part preserves:
- Attribution (who played what)
- Independent interpretation (essential for comparing reference vs. attempt)
- Architectural simplicity

### Visual Merging

The compositor merges per-part SceneFrames into a unified visual output. This is **visual blending** (opacity, layering, spatial overlap), not musical re-interpretation.

## Frame Production Flow

```
1. Renderer calls pipeline.requestFrame(targetTime)
2. For each active part:
   a. Adapter provides RawInputFrame up to targetTime
   b. Stabilizer transforms RawInputFrame → MusicalFrame
   c. Ruleset transforms MusicalFrame → VisualIntentFrame
   d. Grammar stack produces SceneFrame(part)
3. Compositor merges per-part SceneFrames
4. Merged SceneFrame returned to renderer
5. Renderer draws
```

## Contract Types

```ts
// In packages/contracts/core/time.ts
export type SessionMs = number;  // ms since session start

// Pipeline interface in packages/contracts/pipeline/interfaces.ts
export interface IPipeline {
  requestFrame(targetTime: SessionMs): SceneFrame;
}
```

## What This Spec Does NOT Cover

- Musical tempo/beat alignment (handled by stabilizers)
- Frame interpolation or prediction
- Latency compensation strategies
- Ensemble/fusion modes (see deferred work)

## Deferred Work

**Ensemble Mode**: A future mode where multiple sources contribute to a single unified musical interpretation (cross-part harmonic analysis). This would require:
- A fusion step upstream of MusicalFrame generation
- Loss of per-part attribution at the MusicalFrame level
- Different architectural trade-offs

This is explicitly deferred. The current per-part design is optimized for ear training where attribution matters. See beads issue for context.
