# RFC 010: Functional Harmony Connections on the Harmony Clock

Status: Discovery
Date: 2026-04-28

## Summary

Extends the harmony clock to show functional relationships between chords — not just what was played, but the structural connections between borrowed and diatonic harmony. Introduces a directed graph of weighted functional edges emitted by the stabilizer, and a two-element visual model (chord numerals + connection indicators) rendered by the grammar.

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

**Principle 3 (Emergent Power from Primitives):** Two independent visual elements — chord numerals and connection indicators — combine to produce emergent meaning. When both ends of a connection are populated by played chords, the viewer perceives resolution. When only the source end is populated, the viewer perceives tension or expectation. Neither element asserts this; it emerges from their co-presence.

**Principle 4 (Perceptual Honesty):** Connection indicators show structural relationships that exist in harmonic convention — not predictions of what the player will do. The system says "♭VII has a conventional path to IV," not "the player intends to resolve to IV." This is comparable to chord detection: the viewer cannot perceive functional relationships from pitch-class hues alone; the system must identify the structure and present it.

**Principle 9 (Observation Over Synthesis):** Chord numerals remain pure observation ("this chord was played"). Connection indicators are valid synthesis in the same category as chord detection — structural relationships that require domain knowledge to identify.

## Model

### Directed Graph

The HarmonyStabilizer emits a directed graph of functional relationships alongside the existing `functionalProgression`. Each edge connects a source chord to a target chord and carries:

- **Weight** (0–1): Conventional strength of the functional relationship. V/V → V has high weight (secondary dominant resolution is one of the strongest patterns). ♭VI → ii has moderate weight (multiple plausible paths). Weight is music-theoretic judgement, not probabilistic prediction.
- **Relationship type** (enum): Subdominant borrowing, secondary dominant, modal interchange, etc. Included in the graph for completeness but **not encoded visually by default** — the base rendering uses uniform connection indicators regardless of type. A user control may expose type encoding in a future iteration.

The graph is arbitrarily recursive: V/V/V → V/V → V → I forms a chain of edges. In practice, chains deeper than 2 are vanishingly rare.

### Two Visual Elements

The grammar renders two independent element types on the harmony clock:

1. **Chord numerals** (existing): Show what was played. Positioned on guide bands, coloured by root pitch-class hue, fading with age.

2. **Connection indicators** (new): Show structural relationships between chords. Each indicator connects a source position to a target position on the harmony clock. Visual intensity driven by edge weight.

### Temporal Unfolding

Connection indicators have two states:

- **Unresolved**: The source chord has been played; the target has not (yet). The connection indicator appears, gesturing from the source chord numeral toward the target's slot. The target chord numeral is absent.

- **Resolved**: Both source and target chords have been played. Both chord numerals are visible; the connection indicator links them. The viewer perceives the resolution.

Both chord numerals and connection indicators fade over time following the existing fade trail model.

### Ring Topology

Connections can span:
- **Across rings**: Borrowed chord → diatonic chord (the common case — ♭VII → IV, V/V → V)
- **Within the borrowed ring**: Borrowed chord → borrowed chord (higher-order chains — V/V/V → V/V)

This means two guide bands (diatonic ring + borrowed ring) are sufficient for any depth of functional nesting. Ring count encodes diatonic membership, not nesting depth. The depth of harmonic chains is encoded in the connection graph, not in additional rings.

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
  /** Target chord ID (may not have been played yet) */
  targetChordId: ChordId | null;
  /** Target scale degree (for positioning the unresolved end) */
  targetDegree: number;
  /** Target pitch class */
  targetPc: PitchClass;
  /** Whether the target is diatonic */
  targetDiatonic: boolean;
  /** Conventional weight of this relationship (0–1) */
  weight: number;
  /** Relationship classification */
  type: FunctionalRelationType;
}

type FunctionalRelationType =
  | "secondary-dominant"
  | "subdominant-borrowing"
  | "modal-interchange"
  | "other";
```

The stabilizer adds edges to the graph when a chord is detected. If the target chord is subsequently played, the edge's `targetChordId` is populated (resolved).

## Open Questions

1. **Visual form of connection indicators.** Lines? Arcs? Fading gradients? The visual must work for both cross-ring and within-ring connections. Within-ring connections are harder because source and target are at similar radii.

2. **Weight calibration.** What specific weights for common relationships? Needs a reference table grounded in music theory convention. Likely requires iteration with real progressions.

3. **Fan-out.** A single borrowed chord may connect to multiple diatonic targets (e.g. ♭VI → ii and ♭VI → IV). Weights should sum to ≤ 1 for a given source, or be independent? Independent weights are simpler but risk visual clutter; normalized weights enforce a "primary pull" reading.

4. **User control for relationship-type encoding.** What form does this take? A macro? A preset option? Deferred to implementation but the stabilizer graph carries the type metadata from day one.

5. **Guide ring reference points.** The current guide ring positions (from the 7-degree wheel work) need revisiting — the calculations are correct but anchored to the wrong visual references. This is a prerequisite for connection indicators since they need to visually bridge between guide bands.

## What This RFC Does NOT Cover

- Specific rendering implementation (ASCII → SVG → WebGL promotion applies)
- Stabilizer detection algorithms for identifying functional relationships
- Weight calibration tables
- The user control for relationship-type display
- Changes to the chord symbol (top cell) — only the harmony clock (bottom cell) is affected
