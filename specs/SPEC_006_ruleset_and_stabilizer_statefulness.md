# SPEC 006: Ruleset and Stabilizer Statefulness

Status: Approved
Date: 2026-01-15
Source: RFC 002

## Summary

Defines where temporal state lives in the pipeline. Rulesets remain pure (stateless); stabilizers are explicitly stateful and responsible for computing time-dependent derived signals.

## The Problem

Some musical mappings require history:
- **Harmonic tension** depends on chord progression over time
- **Beat phase** requires memory of recent beats
- **Phrase-level dynamics** need lookback over several bars

The question: where should this temporal reasoning live?

## Decision: Stabilizers Handle History, Rulesets Stay Pure

**Stabilizers** are stateful. They:
- Accumulate evidence over time
- Compute derived signals (tension trajectory, beat phase, phrase position)
- Enrich CMSFrames with these derived signals

**Rulesets** remain pure functions. They:
- Map a single enriched CMSFrame to IntentFrame
- Do not maintain internal state
- Are testable with single-frame fixtures

## Rationale

### Why Stabilizers Own Temporal State

1. **Aligned with existing role** — Stabilizers already "convert raw CMS evidence into usable control signals" (Glossary). Derived signals like tension and beat phase are exactly that.

2. **Musical knowledge is acceptable** — Stabilizers already handle "chord debounce" which requires harmonic understanding. Extending to "harmonic tension over N beats" is natural.

3. **Clean separation** — Stabilizers accumulate and derive; rulesets interpret a snapshot. This keeps responsibilities clear.

4. **Testability** — Rulesets can be tested with single-frame fixtures. Stabilizers can be tested with sequences.

### Why Rulesets Stay Pure

1. **Deterministic mapping** — Given the same enriched CMSFrame, a ruleset always produces the same IntentFrame. No hidden state.

2. **Easier to reason about** — The ruleset is the "instrument definition" — it shouldn't behave differently based on how long the session has been running.

3. **Simpler testing** — Golden tests can use single frames, not sequences.

## Interface Changes

### IStabilizer (Updated)

```ts
export interface IStabilizer {
  id: string;

  /** Called once when the stabilizer is initialized */
  init(): void;

  /** Called once when the session ends or stabilizer is removed */
  dispose(): void;

  /**
   * Process a frame, potentially using and updating internal state.
   * Returns an enriched CMSFrame with derived signals.
   */
  apply(frame: CMSFrame): CMSFrame;

  /**
   * Reset internal state (e.g., on session restart or part reassignment).
   */
  reset(): void;
}
```

### IRuleset (Unchanged)

```ts
export interface IRuleset {
  id: string;

  /**
   * Pure function: maps CMS snapshot to visual intents.
   * No internal state. Same input always produces same output.
   */
  map(frame: CMSFrame): IntentFrame;
}
```

## Examples of Derived Signals

Stabilizers may add these to CMSFrame:

| Signal | Description | Computed From |
|--------|-------------|---------------|
| `harmonicTension` | 0-1 tension level | Chord progression over N beats |
| `beatPhase` | Position within current beat | Recent beat onsets |
| `phrasePosition` | Position within musical phrase | Beat count, cadence detection |
| `dynamicTrend` | Rising/falling/stable | Loudness over time window |
| `activityDensity` | Note density over time | Recent note events |

These appear as control signals in CMSFrame, consumed by rulesets like any other signal.

## Stabilizer Lifecycle

```
Session Start
  → stabilizer.init()

Each Frame
  → stabilizer.apply(frame) → enriched CMSFrame

Part Reassignment / Mode Change
  → stabilizer.reset()

Session End
  → stabilizer.dispose()
```

## Testing Implications

### Stabilizer Tests
- Test with sequences of CMSFrames
- Verify derived signals are computed correctly
- Test reset behavior

### Ruleset Tests
- Test with single enriched CMSFrames
- Golden tests can use snapshot fixtures
- No sequence dependencies

## What This Spec Does NOT Cover

- Specific stabilizer implementations (TensionStabilizer, BeatPhaseStabilizer, etc.)
- Schema for derived signals in CMSFrame
- Stabilizer ordering/composition

## Contract Location

Updated interface in `packages/contracts/pipeline/interfaces.ts`
