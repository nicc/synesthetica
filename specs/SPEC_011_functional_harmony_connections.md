# SPEC 011: Functional Harmony Connections

Status: Approved
Date: 2026-04-28
Source: RFC 010

## Summary

Defines the visual and data model for showing functional relationships between chords on the harmony clock. Introduces connection strips — paired gradient marks linked by a shared midpoint colour — and a directed graph of weighted functional edges emitted by the HarmonyStabilizer.

## Overview

The harmony clock (SPEC 010, grammar glossary) shows chord numerals on two guide bands: the diatonic ring (inner) and the borrowed ring (outer). This spec adds a mechanism for indicating structural relationships between chords — e.g. that ♭VII in C major has a subdominant relationship to IV — without drawing lines across the clock face.

Two independent visual primitives combine to represent functional harmony:

1. **Chord numerals** (existing): what was played.
2. **Connection strips** (new): structural relationships between chords.

Resolution emerges from co-presence: when both ends of a connection have been played, the viewer perceives resolution. Neither element asserts this.

## Connection Strip Visual Model

### Pair Structure

Each functional relationship produces a **pair of short gradient strips**, one at the source chord and one at the target chord. The strips are colour-linked but not physically connected.

- **Source strip**: Inner radial edge of the source chord numeral (the side facing center). Gradient flows from the source chord's pitch-class hue (nearest the numeral) to the midpoint hue (at the guide ring boundary). The strip almost reaches the numeral but leaves a small gap.

- **Target strip**: Outer radial edge of the target chord's slot (the side facing outward). Gradient flows from the target chord's pitch-class hue (nearest the slot) to the midpoint hue (at the guide ring boundary). Same small gap to the numeral position.

### Midpoint Hue

The midpoint hue is the perceptual average of the source and target pitch-class hues, computed via circular interpolation on the hue wheel (to avoid the 350°/10° averaging problem). This shared colour at the guide ring boundary is the visual link between paired strips.

If the two strips were aligned and joined, they would form one smooth gradient:

```
source hue ▓▓▒░░▒▓▓ target hue
              ↑
         midpoint hue
```

### Visual Intensity

Strip opacity and saturation scale with the edge weight (0–1). High-weight connections (e.g. V/V → V, weight ~0.9) produce vivid strips. Low-weight connections (e.g. ♭VI → ii, weight ~0.5) produce subtle ones.

### Relationship Type

The stabilizer graph carries relationship type metadata (secondary dominant, subdominant borrowing, modal interchange, etc.) on each edge. The **default rendering does not encode relationship type visually** — all connection strips use the same gradient form regardless of type. A future user control may expose type encoding (e.g. different strip patterns per type) for users who specifically request it.

## Temporal Model

### Unresolved State

When a source chord is played and the stabilizer emits a functional edge:

- The source chord numeral appears on its guide band (existing behaviour).
- The source strip appears on the inner edge of the source numeral.
- The target strip appears on the outer edge of the target's slot.
- The target chord numeral is **absent** — only the strip marks the slot.

The viewer sees: a played chord with an accent mark, and a coloured mark at an otherwise empty slot. This indicates expectation without asserting outcome.

### Resolved State

When the target chord is subsequently played:

- The target chord numeral appears at its slot (existing behaviour).
- Both strips remain (source and target).
- The viewer now sees two chord numerals with paired accent marks. Resolution is perceived from co-presence.

### Fade

Both chord numerals and connection strips fade following the existing fade trail model (brightness step-down on release, linear decay, stroke thickening). Strips are tied to their source chord's lifecycle — when the source chord's fade trail expires, its strips expire too.

## Ring Topology

### Cross-Ring Connections (Common Case)

Source on borrowed ring → target on diatonic ring. Source strip sits on inner edge of borrowed ring (facing center). Target strip sits on outer edge of diatonic ring (facing out). Both strips face toward the middle guide ring boundary.

### Within-Ring Connections (Higher-Order Chains)

Both chords on the borrowed ring (e.g. V/V/V → V/V). Same convention: source strip on inner edge, target strip on outer edge. The strips are within the same guide band. The shared midpoint colour links them without requiring physical adjacency.

### Ring Count

Two guide bands (diatonic ring + borrowed ring) are sufficient for any depth of functional nesting. Ring count encodes diatonic membership, not nesting depth. Chain depth is encoded in the connection graph.

## Stabilizer Graph

### Data Structure

The HarmonyStabilizer emits functional edges alongside the existing `functionalProgression`:

```ts
interface FunctionalEdge {
  /** Source chord ID */
  sourceChordId: ChordId;
  /** Target chord ID (null until the target chord is played) */
  targetChordId: ChordId | null;
  /** Target scale degree (1–7, for positioning the unresolved target strip) */
  targetDegree: number;
  /** Target pitch class (for hue computation) */
  targetPc: PitchClass;
  /** Whether the target is diatonic to the prescribed key */
  targetDiatonic: boolean;
  /** Conventional weight of this relationship (0–1) */
  weight: number;
  /** Relationship classification (metadata, not rendered by default) */
  type: FunctionalRelationType;
}

type FunctionalRelationType =
  | "secondary-dominant"
  | "subdominant-borrowing"
  | "modal-interchange"
  | "other";
```

### Graph Semantics

- The graph is a directed acyclic graph (DAG) of functional edges.
- Edges are added when a chord is detected and the stabilizer identifies a functional relationship.
- When the target chord is subsequently played, the edge's `targetChordId` is populated (resolved).
- A chord may be the source of multiple edges (fan-out) with independent weights.
- A chord may be the target of multiple edges (fan-in) from different source chords.
- The graph is arbitrarily deep but in practice rarely exceeds 2 levels.

### Responsibility Boundary

The stabilizer determines functional relationships and emits the graph. The grammar renders connection strips from the graph. The grammar does not infer functional relationships — it only visualises edges the stabilizer provides. This preserves the invariant that grammars see categories, not musical analysis (I3, I4).

## Glossary Impact

The following term should be added to the grammar glossary:

**Connection strip**
A short gradient mark sitting on the radial edge of a chord numeral or slot on the harmony clock. Connection strips appear in pairs — one at the source chord, one at the target chord — linked by a shared midpoint pitch-class hue. They indicate a functional relationship between chords without drawing lines across the clock face.

## Invariants

- **I3**: Meaning lives in the stabilizer (functional edge graph); the grammar renders visual categories (strips) without inferring harmony.
- **I4**: The grammar does not compute functional relationships.
- **I14**: Connection strip colours derive from the pitch-class hue invariant.
- **New (I20)**: Connection strips are paired — every source strip has a corresponding target strip with the same midpoint hue. There are no unpaired strips.

## What This Spec Does NOT Cover

- Stabilizer detection algorithms for identifying functional relationships
- Weight calibration tables for specific chord relationships
- User control for relationship-type visual encoding
- Guide ring reference point corrections (prerequisite, tracked separately)
- Midpoint hue circular interpolation algorithm (implementation detail)
