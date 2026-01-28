# Chord Shape Validation

Visual validation of the SPEC 010 chord shape algorithm (v3.3 - Hub-Styled).

## Design Principles (v3.3)

- **Unified shape**: One continuous outline for the entire chord (no separate arm outlines)
- **Central hub**: Always-filled circle at center provides visual weight
- **Arms radiate from hub edge**: Like compass needles pointing outward
- **All tips are pointed**: Arms taper to a point regardless of quality
- **Hub style shows quality**: Wavy/straight/concave/convex applied only to hub arcs (arms always straight)
- **Wider bases**: Arms sit firmly on the hub (30° base width)
- **Tier determines length**: Triadic = long, seventh = medium, extensions = short
- **Context-aware tiers**: ♭5 is triadic in diminished chords (it's THE fifth), extension elsewhere
- **Root-independent**: Shapes represent interval relationships, not specific pitches

## Files

- `chord-shapes.html` — Interactive browser visualization of all chord shapes
- Individual SVG files for each chord type

## SPEC 010 Algorithm Reference

### Angular Positions (30° per slot, root at 12 o'clock)

| Position | Interval |
|----------|----------|
| 0° | Root (1) |
| 30° | ♭2/♭9 |
| 60° | 2/9 |
| 90° | ♭3 |
| 120° | 3 |
| 150° | 4/11 |
| 180° | ♯4/♭5 |
| 210° | 5 |
| 240° | ♯5/♭6 |
| 270° | 6/13 |
| 300° | ♭7 |
| 330° | 7 |

### Arm Length (from hub edge)

| Category | Intervals | Length |
|----------|-----------|--------|
| Triadic | Root, 3rd, 5th | 0.7 (full) |
| Seventh | 7th (any type) | 0.45 |
| Extensions | 9th, 11th, 13th, sus tones | 0.25 |

**Context-aware classification:**
- ♭5 (semitone 6) is **triadic** in diminished chords (dim, dim7, hdim7) — it's THE structural fifth
- ♭5 remains **extension** in other contexts (e.g., ♯11 in lydian voicings)
- Sus2/Sus4 tones (2nd, 4th) remain **extension** — the short arm conveys "seeking resolution"

Hub radius: 0.3 of base radius (always filled)
Base width: 30° (arms sit firmly on hub)

### Hub Styles (Triad Quality)

| Quality | Hub Style | Visual Effect |
|---------|-----------|---------------|
| Major | Circular | Standard circular arcs between arms |
| Minor | Wavy | Sine wave on hub arcs only, arms straight |
| Diminished | Concave | Hub curves inward (cubic bezier for smooth junctions) |
| Augmented | Convex | Hub curves outward from center |
| Sus2 | Dashed (short) | Hub arcs dashed, arms solid |
| Sus4 | Dashed (long) | Hub arcs dashed, arms solid |

All arms have straight edges and pointed tips. Hub style applies only to the central hub arcs, not the arm edges.

### Rendering Rules

- **Diatonic chord tones** → Solid arms from hub
- **Chromatic alterations** (♭9, ♯9, ♯11, etc.) → Lines (not filled arms)
- **Altered chord tones** (e.g., ♭5 in dom7♭5) → Arm at altered position

## Validation Checklist

When viewing chord shapes, verify:

1. **Unified outline** — Entire shape has one continuous outline (no separate arm outlines)
2. **Hub is always visible** — Central filled circle anchors the shape
3. **All tips are pointed** — Arms taper to a point
4. **Hub style is discriminable** — Circular vs wavy vs concave vs convex
5. **Arm edges are always straight** — Only the hub shows quality styling
6. **Length hierarchy is clear** — Triadic > seventh > extension
7. **Arms sit firmly on hub** — Wide base (30°) provides visual stability
8. **Sus chords read as "suspended"** — Dashed hub + short arm signals open quality
9. **Diminished ♭5 is full length** — Context-aware tier makes it triadic
10. **Chromatic alterations read as "modifications"** — Lines distinct from arms

## Chord Shapes

Shapes are root-independent — they encode interval relationships, not specific pitches.

### Triads

| Quality | Shape Characteristics |
|---------|----------------------|
| Major | Unified shape; 3 arms at 0°, 120°, 210°; circular hub |
| Minor | Unified shape; 3 arms at 0°, 90°, 210°; wavy hub |
| Diminished | Unified shape; 3 arms at 0°, 90°, 180°; concave hub |
| Augmented | Unified shape; 3 arms at 0°, 120°, 240°; convex hub |
| Sus2 | Unified shape; 3 arms at 0°, 60°, 210°; dashed hub (short arm for 2nd) |
| Sus4 | Unified shape; 3 arms at 0°, 150°, 210°; dashed hub (short arm for 4th) |

### Seventh Chords

| Quality | Shape Characteristics |
|---------|----------------------|
| Major 7th | 4 arms; 7th at 330° (shorter); circular hub |
| Minor 7th | 4 arms; ♭7 at 300° (shorter); wavy hub |
| Dominant 7th | 4 arms; ♭7 at 300° (shorter); circular hub |
| Diminished 7th | 4 arms; evenly spaced (symmetric); concave hub; ♭5 full length |
| Half-diminished | 4 arms; ♭5 at 180° (full length), ♭7 at 300°; concave hub |

### Extended Chords

| Quality | Shape Characteristics |
|---------|----------------------|
| Major 9th | 5 arms; 9th at 60° (shortest); circular hub |
| Dominant 7♯9 | 4 arms + line; ♯9 rendered as LINE at 90°; circular hub |
| Add9 | 4 arms; no 7th; 9th at 60° (short); circular hub |

## Usage

Open `chord-shapes.html` in a browser to see all chord shapes rendered according to SPEC 010 v3.3.

## Related Specs

- [SPEC 010: Visual Vocabulary](../../../specs/SPEC_010_visual_vocabulary.md)
- [SPEC 003: Instrument Identity Invariants](../../../specs/SPEC_003_instrument_identity_invariants.md) (I18)
