# RFC 010: Functional Harmony Connections on the Harmony Clock

Status: Discovery → Resolved (visual form decided)
Date: 2026-04-28

## Summary

Extends the harmony clock to show functional relationships between chords — not just what was played, but the structural connections between borrowed and diatonic harmony. Introduces a directed graph of weighted functional edges emitted by the stabilizer, and a two-element visual model (chord numerals + connection strips) rendered by the grammar.

## Context

The harmony clock currently shows chord numerals positioned on two guide bands:
- **Diatonic ring**: seven slots for scale-degree chords
- **Borrowed ring**: interpolated positions for non-diatonic chords

All borrowed chords are treated identically. A ♭VII (subdominant borrowing from mixolydian) looks the same as a chromatic passing chord. The system shows *what* was played but not the structural relationships between chords.

In practice, many borrowed chords have strong functional connections to diatonic harmony:
- ♭VII in C major relates to IV (subdominant borrowing)
- V/V (D major in C) relates to V (secondary dominant)
- ♭VI relates to ii or IV (subdominant region)

These relationships are music-theoretic facts, not inferences about player intent. They are structural properties of Western functional harmony.

## Design Principles Applied

**Principle 3 (Emergent Power from Primitives):** Two independent visual elements — chord numerals and connection strips — combine to produce emergent meaning. When both ends of a connection are populated by played chords, the viewer perceives resolution. When only the source end is populated, the viewer perceives tension or expectation. Neither element asserts this; it emerges from their co-presence.

**Principle 4 (Perceptual Honesty):** Connection strips show structural relationships that exist in harmonic convention — not predictions of what the player will do. The system says "♭VII has a conventional path to IV," not "the player intends to resolve to IV." This is comparable to chord detection: the viewer cannot perceive functional relationships from pitch-class hues alone; the system must identify the structure and present it.

**Principle 9 (Observation Over Synthesis):** Chord numerals remain pure observation ("this chord was played"). Connection strips are valid synthesis in the same category as chord detection — structural relationships that require domain knowledge to identify. The system encodes conventional harmonic weight (a music-theoretic model), not a measurement.

## Model

### Directed Graph

The HarmonyStabilizer emits a directed graph of functional relationships alongside the existing `functionalProgression`. Each edge connects a source chord to a target chord and carries:

- **Weight** (0–1): Conventional strength of the functional relationship. V/V → V has high weight (secondary dominant resolution is one of the strongest patterns). ♭VI → ii has moderate weight (multiple plausible paths). Weight is music-theoretic judgement, not probabilistic prediction.
- **Relationship type** (enum): Subdominant borrowing, secondary dominant, modal interchange, etc. Included in the graph for completeness but **not encoded visually by default** — the base rendering uses uniform connection strips regardless of type. A user control may expose type encoding in a future iteration.

The graph is arbitrarily recursive: V/V/V → V/V → V → I forms a chain of edges. In practice, chains deeper than 2 are vanishingly rare.

### Two Visual Elements

The grammar renders two independent element types on the harmony clock:

1. **Chord numerals** (existing): Show what was played. Positioned on guide bands, coloured by root pitch-class hue, fading with age.

2. **Connection strips** (new): Paired gradient marks that show structural relationships between chords. Each functional edge produces two short gradient strips — one at the source chord, one at the target chord — linked by a shared midpoint colour. No lines cross the clock face.

### Connection Strip Design

Each functional edge renders as a **pair of gradient strips**:

- **Source strip**: Sits on the inner radial edge of the source chord numeral (the side facing the center). Colour flows from the source chord's pitch-class hue (nearest the numeral) to the midpoint hue (at the guide ring boundary). Almost reaches the numeral but doesn't quite touch.

- **Target strip**: Sits on the outer radial edge of the target chord's slot (the side facing outward). Colour flows from the target chord's pitch-class hue (nearest the slot) to the midpoint hue (at the guide ring boundary). Almost reaches the numeral position but doesn't quite touch.

The **midpoint hue** is the average of the source and target pitch-class hues. Both strips end at this colour where they face the guide ring boundary. If the two strips were aligned and joined, they would form a single smooth gradient: source hue → midpoint → target hue.

```
    Conceptual gradient (if strips were joined):

    source hue ▓▓▒░░▒▓▓ target hue
                  ↑
             midpoint hue

    As rendered (split across guide ring):

    Source numeral
    |▓▓▒░        ← source strip (inner edge, source hue → midpoint)
    ............. ← guide ring boundary
         ░▒▓▓|  ← target strip (outer edge, midpoint → target hue)
              Target slot
```

**Why this works:** The strips don't need to be physically adjacent — the shared midpoint colour is the visual link. The viewer's eye matches pairs by colour, not proximity. This avoids lines crossing the clock face, which would become unreadable with multiple simultaneous connections.

**Strip intensity** is driven by the edge weight. High-weight connections (V/V → V) produce vivid strips; low-weight connections (♭VI → ii) produce subtle ones.

### Temporal Unfolding

Connection strips have two states:

- **Unresolved**: The source chord has been played; the target has not (yet). Both strips appear — the source strip adjacent to the source numeral, the target strip marking the target's slot. The target chord numeral is absent. The viewer sees an expectation: a coloured mark at an empty slot.

- **Resolved**: Both source and target chords have been played. Both strips and both chord numerals are visible. Resolution is perceived from co-presence — the target strip now sits adjacent to an actual chord numeral, not an empty slot.

Both chord numerals and connection strips fade over time following the existing fade trail model.

```
    Unresolved (♭VII played, IV not yet):

    ♭VII ●
         |▓▓▒░       ← source strip present
         .............
              ░▒▓▓|  ← target strip present
              (IV)    ← slot marked, numeral absent


    Resolved (♭VII played, then IV played):

    ♭VII ●
         |▓▓▒░       ← source strip
         .............
              ░▒▓▓|  ← target strip
              IV ●    ← numeral now visible
```

### Ring Topology

Connections can span:
- **Across rings**: Borrowed chord → diatonic chord (the common case — ♭VII → IV, V/V → V). Source strip on inner edge of borrowed ring, target strip on outer edge of diatonic ring. Strips face toward each other across the middle guide ring.
- **Within the borrowed ring**: Borrowed chord → borrowed chord (higher-order chains — V/V/V → V/V). Same convention: source strip on inner edge, target strip on outer edge, both within the borrowed ring.

Two guide bands (diatonic ring + borrowed ring) are sufficient for any depth of functional nesting. Ring count encodes diatonic membership, not nesting depth. The depth of harmonic chains is encoded in the connection graph, not in additional rings.

## Stabilizer Responsibility

The HarmonyStabilizer determines functional relationships. The grammar renders them. This preserves the existing separation of concerns:

- Stabilizers produce musical abstractions (including functional analysis)
- Grammars see categories and relationships, not musical analysis
- The grammar does not infer why a chord is borrowed; it renders the connections the stabilizer provides

### Graph Structure (Sketch)

```ts
interface FunctionalEdge {
  /** Source chord ID */
  sourceChordId: ChordId;
  /** Target chord ID (null until the target chord is played) */
  targetChordId: ChordId | null;
  /** Target scale degree (for positioning the unresolved end) */
  targetDegree: number;
  /** Target pitch class */
  targetPc: PitchClass;
  /** Whether the target is diatonic */
  targetDiatonic: boolean;
  /** Conventional weight of this relationship (0–1) */
  weight: number;
  /** Relationship classification (not rendered by default) */
  type: FunctionalRelationType;
}

type FunctionalRelationType =
  | "secondary-dominant"
  | "subdominant-borrowing"
  | "modal-interchange"
  | "other";
```

The stabilizer adds edges to the graph when a chord is detected. If the target chord is subsequently played, the edge's `targetChordId` is populated (resolved).

## Open Questions (Remaining)

1. **Weight calibration.** What specific weights for common relationships? Needs a reference table grounded in music theory convention. Likely requires iteration with real progressions.

2. **Fan-out.** A single borrowed chord may connect to multiple diatonic targets (e.g. ♭VI → ii and ♭VI → IV). Weights should sum to ≤ 1 for a given source, or be independent? Independent weights are simpler but risk visual clutter; normalized weights enforce a "primary pull" reading.

3. **User control for relationship-type encoding.** What form does this take? A macro? A preset option? Deferred to implementation but the stabilizer graph carries the type metadata from day one.

4. **Guide ring reference points.** The current guide ring positions need revisiting — the calculations are correct but anchored to the wrong visual references. This is a prerequisite for connection strips since they sit at guide ring boundaries.

5. **Midpoint hue calculation.** Simple average of two hues on the colour wheel? Or perceptual midpoint? Hue averaging can produce unexpected results when hues are far apart (e.g. averaging 350° and 10° should give 0°, not 180°). Needs circular interpolation.

## Resolved Questions

1. ~~**Visual form of connection indicators.**~~ → Paired gradient strips with shared midpoint colour. No lines cross the clock face.

2. ~~**Within-ring connections.**~~ → Same source-inner/target-outer convention. Shared midpoint colour links them without requiring physical adjacency.

3. ~~**Nth-order rings.**~~ → Two guide bands sufficient. Nesting depth encoded in connection chains, not ring count.

## What This RFC Does NOT Cover

- Stabilizer detection algorithms for identifying functional relationships
- Weight calibration tables
- The user control for relationship-type display
- Changes to the chord symbol (top cell) — only the harmony clock (bottom cell) is affected
