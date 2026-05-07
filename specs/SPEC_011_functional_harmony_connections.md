# SPEC 011: Functional Harmony Connections

Status: Approved
Date: 2026-04-28 (revised 2026-05-06)
Source: RFC 010

## Summary

Defines:

1. The redesigned **harmony clock** layout that supports functional connection strips (revised cell sizing, ring radii, guide-ring anchoring).
2. The visual model for **connection strips** — paired gradient arcs that each carry the full source ↔ target hue gradient — and the directed graph of weighted functional edges emitted by the HarmonyStabilizer.
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
| Diatonic numeral ring | **0.47** | Centre of diatonic band |
| Middle guide ring | **0.62** | Between diatonic and borrowed numerals |
| Borrowed numeral ring | **0.77** | Centre of borrowed band |
| Outer guide ring | **0.92** | Outer bound of borrowed band |

Three guide rings define two equal-width annular bands (each 0.30 wide). Numeral rings sit at the radial centre of each band, so diatonic and borrowed read as the same width with their numerals visually centred between guide rings.

### Slot Tick Marks

Small radial ticks at each of the seven diatonic-ring slot angles, sized to mark the slot position even when no chord is currently played there. Helps hold the spatial structure in sparse states.

### Numeral Sizing

- Diatonic numeral: rendered at glyph scale × 0.8 (root pitch-class hue).
- Borrowed numeral: rendered at glyph scale × 1/φ ≈ 0.618 (gives the outer ring lighter visual weight matching its outside-the-key status).

Both scales are held independently so adjustments to one don't coincidentally resize the other.

## Connection Strip Visual Model

### Strip Structure

Each functional edge produces **one short gradient strip at the target chord's slot**. The source chord doesn't get its own strip — the source numeral itself is the visible originator of the relationship; an additional "from" strip duplicated information without adding meaning.

### Strip Directionality

The target strip sits **outward** of the target numeral (relative to the numeral itself, not the centre of the clock). The strip's anchored end — the side held at maximum opacity — sits on the adjacent guide ring on the side facing outward from the numeral:

| Target on | Anchored at |
|---|---|
| Diatonic ring | middle guide ring (between diatonic and borrowed) |
| Borrowed ring | outer guide ring |

### Ring Topology

Within-ring connections arise as a natural consequence of collapsing all non-diatonic chords into a single borrowed ring. A chain of secondary dominants (V/V/V → V/V → V → I) resolves through the borrowed ring at each step until it lands on a diatonic target — every borrowed→borrowed step is a within-ring connection; only the final step is cross-ring. The two-ring design (diatonic + borrowed) is sufficient at any depth of functional nesting; chain depth is encoded in the connection graph, not in additional rings.

### Strip Geometry

Each strip is a curved arc segment (a sector of an annulus) that sits snug against its anchored guide ring:

- **Arc width**: scales with the corresponding numeral ring (diatonic strips wider than borrowed strips by the same 1/φ factor that scales borrowed numerals down).
- **Radial height**: short — enough to read as a coloured accent mark without crowding the band.
- **Position**: the anchored end sits exactly on the adjacent guide ring; the chord-side edge extends radially toward (but does not touch) the numeral.

### Gradient

The target strip carries the full **source ↔ target hue gradient**:

- **Source hue** at the guide-ring side (anchored, full opacity) — gestures back toward the originating chord.
- **Target hue** at the target-numeral side (fading toward zero) — anchors the strip to the chord whose slot it marks.

There is **no synthetic midpoint hue** — every colour visible on a strip is one of the two pitch-class hues that actually participate in the relationship. This avoids implying a third note that isn't part of the music.

### Opacity Curve

Opacity is anchored at the guide-ring side and falls non-linearly toward the chord-side edge: `α(t) = 1 − t⁴`, where `t = 0` at the guide-ring side and `t = 1` at the chord-side edge. The curve holds near full opacity across the inner two-thirds of the strip, then drops rapidly through the final third — so the strip reads as anchored to the guide ring and reaching toward (but not touching) the numeral.

### Visual Intensity

Strip opacity scales with the edge's conventional weight (0–1). High-weight connections (V/V → V at ~0.92) produce vivid strips; low-weight connections (♭VI → ii at ~0.50) produce subtle ones. Weight is music-theoretic judgement, not probabilistic prediction.

### Fan-Out

A single source chord may have multiple outgoing edges. Two cases:

1. **Multi-target modal interchange** — e.g. ♭VI in major has plausible resolutions to both ii and IV; the modal interchange table emits both edges with their respective weights. Each edge targets a different diatonic position.

2. **Ambiguous secondary-dominant target** — when a major-quality borrowed chord's target degree has a non-major diatonic quality (V/ii, V/iii, V/vi, V/vii in major), the resolution is ambiguous in real time:
   - **Conventional reading**: V/X → diatonic X (e.g. V/ii → ii in C major = A → Dm).
   - **Chain reading**: V/X is itself the dominant of a V-chain step, so X is played as a borrowed major chord (e.g. V/V/V → V/V in A♭ major = F → B♭, where B♭ is borrowed).
   The stabilizer emits **both** edges from the same source — one to the diatonic target (`targetDiatonic: true`, conventional weight), one to the borrowed target at the same pc (`targetDiatonic: false`, chain-weight ≈ 0.7). Both target strips are visible until the player's actual resolution chord arrives at the target pc, at which point co-presence resolves the ambiguity perceptually.

   When the target degree's diatonic quality is major (V/V → V, V/IV → IV), there is no ambiguity — a single edge to the diatonic target is emitted.

Fan-in (multiple sources targeting the same chord slot) produces one strip per edge stacked at the target's slot. When this becomes visually congested, a future iteration may split the available arc width across the strips.

### Relationship Type

The stabilizer graph carries a relationship-type tag (secondary dominant, subdominant borrowing, modal interchange, etc.) on each edge. The **default rendering does not encode relationship type visually** — all connection strips use the same gradient form regardless of type. A user control may expose type encoding in a future iteration.

## Temporal Model

### Lifecycle

Connection strips are tied to the **source chord's lifecycle**. There is no separate resolution-tracking state.

- When a source chord is detected, the stabilizer emits one or more outgoing edges from the RELATIONSHIPS table.
- Each edge produces a single target strip at the target chord's slot.
- The strip is visible while the source chord is active, and fades with the source chord's fade trail (existing brightness step-down + linear decay model).
- When the source chord's fade trail expires, the strip expires.

The **target chord** plays no role in strip lifecycle. If the player plays the target chord, its numeral appears at the slot the strip already marks — and the viewer perceives resolution from this co-presence. If they don't, the strip fades unresolved.

This is consistent with Principle 4 (Perceptual Honesty): the system shows "this chord has structural paths to these targets" — not "this chord resolved" or "this chord will resolve."

### Resolved vs Unresolved (Perceptual)

- **Unresolved**: source numeral + target strip at an empty slot. The viewer reads expectation.
- **Resolved**: source numeral + target strip + target numeral at the marked slot. The viewer reads resolution.

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

**Connection strip** — A short gradient arc sitting on the outward radial edge of a target chord's slot on the harmony clock. The strip carries the full source ↔ target hue gradient (no synthetic midpoint colour): source hue sits at the guide-ring-anchored edge at full opacity, target hue at the chord-side edge fading to zero. Strips indicate a functional relationship between chords without drawing lines across the clock face — only one strip per edge, at the target slot; the source numeral itself signals the originating chord. Strip intensity scales with the connection's conventional weight.

## Invariants

- **I3**: Meaning lives in the stabilizer (functional edge graph); the grammar renders visual categories (strips) without inferring harmony.
- **I4**: The grammar does not compute functional relationships.
- **I14**: Connection strip colours derive from the pitch-class hue invariant.
- **I20** (new): Each functional edge produces exactly one connection strip — at the target slot, carrying the full source ↔ target hue gradient. There is no separate source strip; the source numeral itself signals the originating chord.

## What This Spec Does NOT Cover

- Stabilizer detection algorithms beyond the table lookup (e.g. how V/V is recognised from a played chord — that's HarmonyStabilizer implementation detail; existing chord detection plus the RELATIONSHIPS table is sufficient).
- Mode-specific RELATIONSHIPS tables for non-Ionian keys (the seed covers major; minor and modal variants follow the same pattern, derived as needed).
- User control for relationship-type visual encoding.
- Animation transitions between unresolved and resolved states (none specified — both are static visual states; the grammar renders whichever state holds at frame time).
