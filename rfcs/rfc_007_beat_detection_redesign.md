# RFC 007: Beat Detection Redesign

---
id: RFC.beat.detection-v1
status: draft
owner: agent
last_updated: 2026-01-20
---

## 1. Purpose

This RFC proposes a fundamental redesign of beat detection based on two insights:

1. **Historic vs Prescriptive**: Setting a "tempo" infers future musical intent from historic behavior. This is underdetermined by the data—we cannot distinguish subdivisions from tempo changes, drift from intentional rubato, off-beat playing from syncopation.

2. **BPM is not required for rhythmic visualization**: We can illustrate rhythmic consistency through historic analysis alone. Intent-relative visuals (drift from grid, beat pulse) require explicit tempo, but many visualizations do not.

The proposed solution separates concerns:
- **Descriptive analysis**: The stabilizer performs purely historic, probabilistic analysis
- **Prescriptive tempo/meter**: BPM and time signature are set explicitly by the user via control op

---

## 2. Problem Statement

### Current Failure Mode

The current BeatDetectionStabilizer attempts to lock onto a tempo and track drift. This breaks when:

1. **Subdivisions in valid range**: Playing 8th notes at 60 BPM produces 500ms IOIs (= 120 BPM). If 120 BPM is in the valid range [40, 200], the system re-locks to 120 BPM.

2. **Tempo changes**: The system cannot distinguish "player changed tempo" from "player is playing subdivisions" from "player drifted".

3. **Off-beat playing**: Consistent off-beat playing (e.g., snare on 2 and 4) shows as 50% phase offset, which could also be interpreted as playing at double tempo with every other beat.

### Root Cause

The system conflates two distinct concepts:
- **What happened** (descriptive, historic, observable)
- **What was intended** (prescriptive, future-oriented, requires user input)

Tempo is prescriptive—it implies "this is the intended grid against which to measure". Only the user knows this.

---

## 3. Proposed Model

### 3.1 Stabilizer Output: RhythmicAnalysis

The BeatDetectionStabilizer outputs purely descriptive data:

```ts
export interface RhythmicAnalysis {
  /**
   * Detected time division between recent onsets.
   * This is the most prominent IOI cluster, not a "tempo".
   * Null if insufficient data or no clear pattern.
   */
  detectedDivision: Ms | null;

  /**
   * Raw onset timestamps within the analysis window.
   * Grammars can use these for historic visualization.
   */
  recentOnsets: SessionMs[];

  /**
   * How stable the detected division is across the window.
   * High stability = consistent spacing between onsets.
   * Range: 0.0 to 1.0
   */
  stability: number;

  /**
   * Confidence in the detected division.
   * Based on cluster strength and sample count.
   * Range: 0.0 to 1.0
   */
  confidence: Confidence;

  /**
   * Reference point for alignment.
   * The most recent onset that anchors the detected division.
   * Grammars can extrapolate a grid backward/forward from this.
   */
  referenceOnset: SessionMs | null;
}
```

### 3.2 Stability vs Confidence

These are distinct measures:

- **Confidence**: "How sure are we about the detected division?" Based on sample count and cluster clarity. Low confidence means "not enough data" or "ambiguous pattern".

- **Stability**: "How consistent is the player's timing?" Given a detected division, how much do actual IOIs deviate from it? High confidence + low stability = "we know they're playing quarter notes, but with significant rubato".

### 3.3 Prescribed Tempo and Meter via Control Op

Tempo and time signature are set explicitly by the user:

```ts
export interface MusicalFrame {
  // ... existing fields ...

  /**
   * User-prescribed tempo in BPM.
   * Set via direct input. Null means no explicit tempo.
   * When null, grammars should not show drift or beat-grid visuals.
   */
  prescribedTempo: number | null;

  /**
   * User-prescribed time signature.
   * Set via direct input. Null means no explicit meter.
   * When null, grammars should not show bar-boundary visuals.
   */
  prescribedMeter: TimeSignature | null;
}

export interface TimeSignature {
  beatsPerBar: number;    // e.g., 4 for 4/4, 3 for 3/4
  beatUnit: number;       // e.g., 4 for quarter note, 8 for eighth note
}
```

The control op interface:

```ts
// Direct input: user specifies BPM
{ type: 'set_tempo', bpm: number }

// Clear tempo: return to no-tempo mode
{ type: 'clear_tempo' }

// Set time signature
{ type: 'set_meter', beatsPerBar: number, beatUnit: number }

// Clear meter: return to no-meter mode
{ type: 'clear_meter' }
```

Note: Tap tempo is out of scope. External tools can provide this if needed.

### 3.4 What Grammars Can Do

| Scenario | prescribedTempo | prescribedMeter | Grammar Capability |
|----------|-----------------|-----------------|-------------------|
| Neither set | `null` | `null` | Historic visualization only. Can show onset patterns, detected divisions, stability. |
| Tempo only | `120` | `null` | Beat-relative visualization. Can show drift from grid, phase, beat pulse. |
| Both set | `120` | `{4, 4}` | Full intent-relative visualization. Can show bar boundaries, downbeats, beat position within bar. |

**Historic-only visualizations** (no prescribed tempo or meter needed):
- Pulse/glow on each onset
- Pattern showing recent onset spacing
- Stability indicator (steady vs rubato)
- Division groupings (detected clusters)

**Beat-relative visualizations** (require prescribed tempo):
- Beat grid with phase alignment
- Drift indicator (ahead/behind)
- Metronome-style pulse

**Bar-relative visualizations** (require prescribed tempo AND meter):
- Bar position (beat 1, 2, 3, 4)
- Downbeat emphasis
- Bar boundary markers
- Phrase-level structure

**Subdivision ratio**: Grammars can compute subdivision ratios from `detectedDivision` and `prescribedTempo` if needed. The data is available; no need for the stabilizer to pre-compute this.

---

## 4. Analysis Window

### Recommendation

The stabilizer should use a window of approximately **2-4 seconds** or **8-16 onsets**, whichever provides better coverage. This balances:

- **Responsiveness**: Shorter windows detect changes faster
- **Stability**: Longer windows smooth out single-onset variations
- **Musical relevance**: 4 seconds at 60 BPM = 4 beats = 1 bar

### Configuration

```ts
interface BeatDetectionConfig {
  windowMs: Ms;        // Time-based window (default: 3000)
  maxOnsets: number;   // Max onsets to retain (default: 16)
}
```

Grammars can apply their own smoothing or averaging over the stabilizer's output if needed.

---

## 5. Implementation

This is a clean replacement, not a migration. Remove the existing `BeatState` and related fields entirely.

### Changes to MusicalFrame

```ts
export interface MusicalFrame {
  t: SessionMs;
  partId: PartId;
  notes: Note[];
  chords: Chord[];

  // Replace beat: BeatState with:
  rhythmicAnalysis: RhythmicAnalysis;
  prescribedTempo: number | null;
  prescribedMeter: TimeSignature | null;

  // These are removed (were part of BeatState):
  // - beat.tempo (inferred tempo - category error)
  // - beat.phase (requires inferred tempo)
  // - beat.drift (requires inferred tempo)
  // - beat.beatInBar (requires inferred tempo)
  // - beat.beatsPerBar (use prescribedMeter instead)
  // - beat.confidence (moved to rhythmicAnalysis)
}
```

### Changes to BeatDetectionStabilizer

The stabilizer becomes simpler:
1. Collect onsets within window
2. Cluster IOIs using Dixon's algorithm
3. Output `RhythmicAnalysis` with detected division, stability, confidence
4. Do NOT attempt to lock, track phase, or adjust tempo

### Grammars

Update grammars to:
- Use `rhythmicAnalysis` for historic visualization
- Check `prescribedTempo !== null` before showing beat-relative visuals
- Check `prescribedMeter !== null` before showing bar-relative visuals

---

## 6. Design Decisions

1. **No tap tempo**: Out of scope. External tools can provide if needed.

2. **No tempo persistence**: Tempo and meter do not persist across sessions. User sets them fresh each session.

3. **Subdivision ratio**: Left to grammars. They can compute from `detectedDivision` and `prescribedTempo`.

4. **Single tempo**: All parts share the same prescribed tempo and meter. Multi-tempo support deferred.

---

## 7. Summary

| Concept | Current | Proposed |
|---------|---------|----------|
| Tempo source | Inferred by stabilizer | Explicit user input only |
| Meter source | Hardcoded `beatsPerBar` | Explicit user input only |
| Stabilizer output | `tempo`, `phase`, `drift` | `detectedDivision`, `stability`, `recentOnsets` |
| Beat-relative visualization | Always attempted | Only with `prescribedTempo` |
| Bar-relative visualization | Always attempted | Only with `prescribedTempo` AND `prescribedMeter` |
| Subdivision handling | Broken (re-locks to subdivision tempo) | N/A (no tempo locking) |

This design separates what we can observe (historic onset patterns) from what requires user intent (tempo/meter grid). It eliminates the category error of inferring future intent from past behavior.

### Visualization Capability Matrix

| Visual | No tempo | Tempo only | Tempo + Meter |
|--------|----------|------------|---------------|
| Onset pulse | ✓ | ✓ | ✓ |
| Detected division pattern | ✓ | ✓ | ✓ |
| Stability indicator | ✓ | ✓ | ✓ |
| Beat grid | ✗ | ✓ | ✓ |
| Drift indicator | ✗ | ✓ | ✓ |
| Bar position | ✗ | ✗ | ✓ |
| Downbeat emphasis | ✗ | ✗ | ✓ |
