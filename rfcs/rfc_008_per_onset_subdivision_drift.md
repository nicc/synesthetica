# RFC 008: Per-Onset Subdivision Drift Analysis

Status: Draft
Date: 2026-01-21
Issue: synesthetica-4f0

## Problem

Currently, drift measurement is simplistic: each onset is compared against a single grid (either the detected division or the prescribed beat). This fails for common musical patterns:

- Playing tight 8th notes against a quarter-note tempo shows every off-beat as "drifting"
- A perfectly-timed 16th note shows as significantly late/early relative to the beat
- Grammars cannot distinguish "note is on an off-beat" from "note is mistimed"

The current `RhythmicAnalysis` structure provides:
- `recentOnsets: Ms[]` — raw onset timestamps
- `detectedDivisionTimes: Ms[]` — grid timestamps based on median onset anchor

This forces grammars to compute drift themselves, duplicating logic and lacking subdivision awareness.

## Solution

Replace raw onset timestamps with structured per-onset drift data that includes measurements at 4 subdivision levels:

```typescript
interface SubdivisionDrift {
  label: string;        // "quarter"|"8th"|"16th"|"32nd" or "1x"|"2x"|"4x"|"8x"
  period: Ms;           // Subdivision period in ms
  drift: Ms;            // Signed error (negative = early, positive = late)
  nearest: boolean;     // True if this is the closest subdivision
}

interface OnsetDrift {
  t: Ms;                              // Onset timestamp
  subdivisions: SubdivisionDrift[];   // 4 elements, coarse to fine
}
```

### Label Semantics

**Tier 2/3 (prescribed tempo):** Labels are musical note values
- Level 0: "quarter" (base = 60000/tempo)
- Level 1: "8th" (base/2)
- Level 2: "16th" (base/4)
- Level 3: "32nd" (base/8)

**Tier 1 (no prescribed tempo):** Labels are relative multipliers
- Level 0: "1x" (base = detectedDivision)
- Level 1: "2x" (base/2)
- Level 2: "4x" (base/4)
- Level 3: "8x" (base/8)

### The `nearest` Flag

Exactly one subdivision has `nearest: true` — the one where the onset is closest to a grid position. This lets grammars quickly find the most relevant subdivision without scanning for smallest absolute drift.

**Example:** Note at t=260ms with quarter=500ms
```typescript
subdivisions: [
  { label: "quarter", period: 500, drift: 260, nearest: false },
  { label: "8th", period: 250, drift: 10, nearest: true },     // Tight 8th!
  { label: "16th", period: 125, drift: 10, nearest: false },
  { label: "32nd", period: 62.5, drift: 10, nearest: false },
]
```

The grammar can see this is a tight 8th note (10ms drift) rather than a sloppy quarter (260ms drift).

## Contract Changes

### RhythmicAnalysis (modified)

```typescript
interface RhythmicAnalysis {
  detectedDivision: Ms | null;      // Unchanged
  onsetDrifts: OnsetDrift[];        // NEW: replaces recentOnsets + detectedDivisionTimes
  stability: number;                // Unchanged
  confidence: Confidence;           // Unchanged
}
```

**Removed:**
- `recentOnsets: Ms[]` — replaced by `onsetDrifts[].t`
- `detectedDivisionTimes: Ms[]` — redundant; grammars can compute grid from base period

## Implementation

### BeatDetectionStabilizer Changes

1. Remove `computeDivisionTimes()` method
2. Add `computeOnsetDrifts(basePeriod: Ms, labels: string[]): OnsetDrift[]`:
   - For each onset, compute drift at 4 subdivision levels
   - Mark the subdivision with smallest absolute drift as `nearest: true`
3. Determine base period and labels:
   - If `prescribedTempo`: base = 60000/tempo, labels = ["quarter", "8th", "16th", "32nd"]
   - Else if `detectedDivision`: base = detectedDivision, labels = ["1x", "2x", "4x", "8x"]
   - Else: return empty array

### Drift Calculation

For each onset `t` and period `p`:
```typescript
const position = t / p;
const fractional = position - Math.floor(position);
// Normalize to [-0.5, 0.5] range
const drift = fractional > 0.5 ? (fractional - 1) * p : fractional * p;
```

### Grid Anchoring

For Tier 2/3 (prescribed tempo): anchor on T=0 (session start)
For Tier 1 (detected division): anchor on median onset (as currently implemented)

## Grammar Impact

### TestRhythmGrammar Changes

1. `createDivisionTicks()`:
   - Compute grid from base period anchored on T=0/median
   - No longer depends on `detectedDivisionTimes`

2. `createDriftRings()`:
   - Iterate `onsetDrifts` instead of `recentOnsets`
   - Use `onset.subdivisions.find(s => s.nearest)?.drift` for ring sizing
   - Can use `label` in entity data for debugging

3. Remove `calculateDrift()`:
   - Now redundant; stabilizer provides per-onset drift

## Future Extensions

Not in scope for this RFC, but enabled by this design:

- **Multi-level visualization:** Show all 4 drift rings with varying emphasis
- **Quantization granularity macro:** Let user set minimum subdivision (e.g., "only show drift to 8th notes")
- **Triplet support:** Would require 6 levels instead of 4

## Migration

This is a breaking change to `RhythmicAnalysis`. Consumers must update:
- Code iterating `recentOnsets` → iterate `onsetDrifts` and access `.t`
- Code using `detectedDivisionTimes` → compute from base period or use onset drift data
