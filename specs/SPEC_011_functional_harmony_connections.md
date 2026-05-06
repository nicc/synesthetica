# SPEC 011: Functional Harmony Connections

Status: Approved
Date: 2026-04-28 (revised 2026-05-06)
Source: RFC 010

## Summary

Defines:

1. The redesigned **harmony clock** layout that supports functional connection strips (revised cell sizing, ring radii, guide-ring anchoring).
2. The visual model for **connection strips** — paired gradient marks linked by a shared midpoint hue — and the directed graph of weighted functional edges emitted by the HarmonyStabilizer.
3. The seed **RELATIONSHIPS** table the stabilizer uses to determine when an edge exists.

## Overview

The harmony clock occupies the bottom-right cell of the harmony column. It shows chord numerals on two guide bands — the **diatonic ring** (inner) and the **borrowed ring** (outer) — with the prescribed key's tonic at 12 o'clock and scale degrees proceeding clockwise. This spec extends that design to surface structural relationships between chords (e.g. ♭VII → IV, V/V → V) without drawing lines across the clock face.

Two independent visual primitives combine to represent functional harmony:

1. **Chord numerals** (existing): what was played.
2. **Connection strips** (new): structural relationships between chords.

Resolution emerges from co-presence: when both ends of a connection have chord numerals, the viewer perceives resolution. Neither element asserts this; it emerges from their co-presence (Principle 3, 4, 9).

## Harmony Clock Layout

### Cell Sizing

The harmony column contains two cells: chord glyph (top) and harmony clock (bottom). The clock's progression is the visual focus and gets more space.

| | Previous | This spec |
|---|---|---|
| Harmony column width | 0.30 | **0.42** |
| Chord cell vertical | 0.30 | **0.21** |
| Progression cell vertical | 0.30 | **0.42** |
| Cell gap | 0.06 | **0.04** |
| Rhythm column width | 0.56 | **0.44** |

Cells are square (column width = larger cell vertical = 0.42). The rhythm column shrinks to make room; note strips remain readable at the smaller width.

### Clock Interior Radii

All radii expressed as fractions of clock radius. The clock radius equals half the progression cell width (0.21 in normalized viewport coords).

| Element | Fraction | Anchored to |
|---|---|---|
| Chord label area | 0.00 → 0.32 | Chord-name text fits within this circle |
| Inner guide ring | **0.32** | Outer edge of label area |
| Diatonic numeral ring | **0.45** | Inner band, biased inward (label breathing room) |
| Middle guide ring | **0.62** | Between diatonic and borrowed numerals |
| Borrowed numeral ring | **0.80** | Outer band, near band centre |
| Outer guide ring | **1.00** | Clock outer edge |

Guide rings anchor to layout boundaries (label edge, between-rings boundary, clock edge) rather than being derived from numeral positions. The diatonic ring is biased slightly inward to give the chord label more breathing room.

### Slot Tick Marks

Small radial ticks at each of the seven diatonic-ring slot angles, sized to mark the slot position even when no chord is currently played there. Helps hold the spatial structure in sparse states.

### Numeral Sizing

- Diatonic numeral: rendered at full glyph scale (root pitch-class hue).
- Borrowed numeral: rendered at glyph scale × 1/φ ≈ 0.618 (gives the outer ring lighter visual weight matching its outside-the-key status).

## Connection Strip Visual Model

### Pair Structure

Each functional edge produces a **pair of short gradient strips**, one at the source chord and one at the target chord. The strips are colour-linked but not physically connected — the viewer's eye matches pairs by colour, not proximity. This avoids lines crossing the clock face.

### Strip Directionality

The "from" strip sits **inward** of the source numeral; the "to" strip sits **outward** of the target numeral. This convention is relative to the numeral itself, not relative to the centre of the clock. Each strip's midpoint-coloured end anchors to the adjacent guide ring on the appropriate side of its numeral:

| Chord on | Role | Strip side | Midpoint anchored at |
|---|---|---|---|
| Diatonic ring | source (from) | inward of numeral | inner guide ring (0.32) |
| Diatonic ring | target (to) | outward of numeral | middle guide ring (0.62) |
| Borrowed ring | source (from) | inward of numeral | middle guide ring (0.62) |
| Borrowed ring | target (to) | outward of numeral | outer guide ring (1.00) |

For cross-ring connections (the common case — source on borrowed, target on diatonic), both strips' midpoint ends land on the middle guide ring, producing a continuous-gradient feel if the two strips were aligned. For within-ring connections, the strips anchor to different guide rings; the visual link is purely chromatic via the shared midpoint hue.

### Strip Geometry

Each strip is a thin tangent-oriented polygon:

- **Arc width**: matches the numeral's effective rendered arc-width (full glyph scale on the diatonic ring; glyph scale × 1/φ on the borrowed ring).
- **Radial height**: short — enough to read as a coloured accent mark without crowding the band.
- **Position**: the midpoint-coloured end sits exactly on the anchor guide ring; the chord-coloured end extends radially toward (but does not touch) the numeral.

### Gradient

The gradient runs along the strip's radial axis:

- 0%: midpoint hue at full opacity (anchor guide ring side)
- 90%: chord pitch-class hue at full opacity
- 100%: chord pitch-class hue at 0% opacity (numeral side, soft fade)

The 10% fade at the numeral-facing end keeps the strip visually distinct from the numeral while still attributing the strip's identity via the chord hue.

### Midpoint Hue

The midpoint hue is the perceptual average of the source and target pitch-class hues, computed via circular interpolation on the hue wheel (so e.g. midpoint(350°, 10°) = 0°, not 180°).

### Visual Intensity

Strip opacity scales with the edge's conventional weight (0–1). High-weight connections (V/V → V at ~0.92) produce vivid strips; low-weight connections (♭VI → ii at ~0.50) produce subtle ones. Weight is music-theoretic judgement, not probabilistic prediction.

### Fan-Out

A single source chord may have multiple outgoing edges (e.g. ♭VI → ii AND ♭VI → IV). Multiple source strips at the same chord position split the available arc width — N edges produce N stripes, each at arc-width / N, arranged side by side along the tangent.

Fan-in (multiple sources targeting the same diatonic chord) produces multiple target strips at the target's slot, similarly split.

### Relationship Type

The stabilizer graph carries a relationship-type tag (secondary dominant, subdominant borrowing, modal interchange, etc.) on each edge. The **default rendering does not encode relationship type visually** — all connection strips use the same gradient form regardless of type. A user control may expose type encoding in a future iteration.

## Temporal Model

### Lifecycle

Connection strips are tied to the **source chord's lifecycle**. There is no separate resolution-tracking state.

- When a source chord is detected, the stabilizer emits one or more outgoing edges from the RELATIONSHIPS table.
- Each edge produces a pair of strips (source + target).
- Both strips are visible while the source chord is active, and fade with the source chord's fade trail (existing brightness step-down + linear decay model).
- When the source chord's fade trail expires, both strips expire.

The **target chord** plays no role in strip lifecycle. If the player plays the target chord, its numeral appears at the slot the target strip already marks — and the viewer perceives resolution from this co-presence. If they don't, the strips fade unresolved.

This is consistent with Principle 4 (Perceptual Honesty): the system shows "this chord has structural paths to these targets" — not "this chord resolved" or "this chord will resolve."

### Resolved vs Unresolved (Perceptual)

- **Unresolved**: source numeral + paired strips, no target numeral. The viewer reads expectation.
- **Resolved**: source numeral + paired strips + target numeral at the marked slot. The viewer reads resolution.

Both cases are produced by the same data. The difference is whether the target chord happens to be played within the fade window.

## Stabilizer Graph

### FunctionalEdge

The HarmonyStabilizer emits functional edges alongside the existing `functionalProgression`:

```ts
interface FunctionalEdge {
  /** Source chord ID (the chord whose detection triggered this edge) */
  sourceChordId: ChordId;
  /** Target scale degree (1–7) within the prescribed key */
  targetDegree: number;
  /** Target pitch class (for hue computation and angular positioning) */
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

Notable: there is **no `targetChordId`** field. The target is identified by degree + pitch class — it's a slot position on the harmony clock, not a played chord. When/if a chord is played at that slot, the grammar renders its numeral via the normal chord-numeral path; the strip pair already marks the slot.

### Edge Emission

Edges are emitted at the moment a chord is detected:

1. The HarmonyStabilizer detects a chord and constructs its `FunctionalChord`.
2. Looks up the chord's identity (by Roman numeral or quality+degree+borrowed status) in the RELATIONSHIPS table.
3. For each matched outgoing relationship, emits one `FunctionalEdge` with the edge's weight and type from the table.
4. Edges are attached to `HarmonicContext.functionalEdges[]` (a new field).

A chord may have zero, one, or many outgoing edges. If no entry in the RELATIONSHIPS table matches, no edges are emitted (the chord still appears as a numeral, just without functional connections).

### HarmonicContext Extension

```ts
interface HarmonicContext {
  // ... existing fields ...
  /** Active functional edges (one per source chord, expires with source). */
  functionalEdges: FunctionalEdge[];
}
```

Edges remain in the array while their source chord is within its fade window; they are removed when the source's fade trail expires.

### Responsibility Boundary

The stabilizer determines functional relationships and emits the graph. The grammar renders connection strips from the graph. The grammar does not infer functional relationships — it only visualises edges the stabilizer provides. This preserves I3 and I4: grammars see categories and relationships, not musical analysis.

## RELATIONSHIPS Table (Seed)

The table is keyed by chord identity (Roman numeral with quality) within the prescribed key/mode. Values are arrays of outgoing relationships. Weights are music-theoretic judgement calls; iteration with real progressions will refine them.

```ts
type RelationshipEntry = {
  /** Target degree within the prescribed key */
  targetDegree: number;
  /** Target chord quality marker (informational; positioning uses degree + key) */
  targetMarker: string;
  /** Conventional weight (0–1) */
  weight: number;
  type: FunctionalRelationType;
};

// Seed table — Major key (Ionian). Other modes derived analogously.
const RELATIONSHIPS_MAJOR: Record<string, RelationshipEntry[]> = {
  // Subdominant borrowings (modal interchange from parallel minor / mixolydian)
  "♭VII":  [{ targetDegree: 4, targetMarker: "IV",  weight: 0.85, type: "subdominant-borrowing" }],
  "♭III":  [{ targetDegree: 6, targetMarker: "vi",  weight: 0.65, type: "modal-interchange"     }],
  "♭VI":   [
    { targetDegree: 2, targetMarker: "ii", weight: 0.55, type: "subdominant-borrowing" },
    { targetDegree: 4, targetMarker: "IV", weight: 0.50, type: "subdominant-borrowing" },
  ],
  "iv":    [{ targetDegree: 1, targetMarker: "I",   weight: 0.75, type: "modal-interchange"     }],
  "♭II":   [{ targetDegree: 5, targetMarker: "V",   weight: 0.80, type: "modal-interchange"     }], // Neapolitan

  // Secondary dominants (V/X resolves to X)
  "V/V":   [{ targetDegree: 5, targetMarker: "V",   weight: 0.92, type: "secondary-dominant"    }],
  "V/ii":  [{ targetDegree: 2, targetMarker: "ii",  weight: 0.88, type: "secondary-dominant"    }],
  "V/vi":  [{ targetDegree: 6, targetMarker: "vi",  weight: 0.88, type: "secondary-dominant"    }],
  "V/IV":  [{ targetDegree: 4, targetMarker: "IV",  weight: 0.82, type: "secondary-dominant"    }],
  "V/iii": [{ targetDegree: 3, targetMarker: "iii", weight: 0.80, type: "secondary-dominant"    }],
};
```

Detection notes:

- **Identifying a chord** as `V/V`, `V/ii`, etc. requires recognising the dominant-quality chord whose root is the dominant of a target degree. e.g. in C major: D-F♯-A is V/V because D is V of V (G).
- **Identifying** `♭VII`, `♭III`, etc. is straightforward — the existing `FunctionalChord.degree + borrowed + chromaticOffset` already encodes the Roman numeral.
- The RELATIONSHIPS table is keyed by these identities; lookup is direct.
- Adding a new non-diatonic relationship in future means adding an entry to the table — no model changes.

## Glossary Impact

The following term is in the grammar glossary (already added):

**Connection strip** — A short gradient mark sitting on the radial edge of a chord numeral or slot on the harmony clock. Connection strips appear in pairs — one at the source chord, one at the target chord — linked by a shared midpoint pitch-class hue. They indicate a functional relationship between chords without drawing lines across the clock face.

## Invariants

- **I3**: Meaning lives in the stabilizer (functional edge graph); the grammar renders visual categories (strips) without inferring harmony.
- **I4**: The grammar does not compute functional relationships.
- **I14**: Connection strip colours derive from the pitch-class hue invariant.
- **I20** (new): Connection strips are paired — every source strip has a corresponding target strip with the same midpoint hue. There are no unpaired strips.

## What This Spec Does NOT Cover

- Stabilizer detection algorithms beyond the table lookup (e.g. how V/V is recognised from a played chord — that's HarmonyStabilizer implementation detail; existing chord detection plus the RELATIONSHIPS table is sufficient).
- Mode-specific RELATIONSHIPS tables for non-Ionian keys (the seed covers major; minor and modal variants follow the same pattern, derived as needed).
- User control for relationship-type visual encoding.
- Midpoint hue circular interpolation algorithm (implementation detail).
- Animation transitions between unresolved and resolved states (none specified — both are static visual states; the grammar renders whichever state holds at frame time).
