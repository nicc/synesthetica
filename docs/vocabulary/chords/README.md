# Chord Shape Validation

Visual validation of the SPEC 010 chord shape algorithm (v3.2 - Unified Shape).

## Design Principles (v3.2)

- **Unified shape**: One continuous outline for the entire chord (no separate arm outlines)
- **Central hub**: Always-filled circle at center provides visual weight
- **Arms radiate from hub edge**: Like compass needles pointing outward
- **All tips are pointed**: Arms taper to a point regardless of quality
- **Edge style shows quality**: Wavy/straight/concave/convex applied to entire shape outline
- **Wider bases**: Arms sit firmly on the hub (30° base width)
- **Tier determines length**: Triadic = long, seventh = medium, extensions = short
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
| Extensions | 9th, 11th, 13th | 0.25 |

Hub radius: 0.3 of base radius (always filled)
Base width: 30° (arms sit firmly on hub)

### Edge Styles (Triad Quality)

| Quality | Edge Style | Visual Effect |
|---------|------------|---------------|
| Major | Straight | Clean diagonal edges |
| Minor | Wavy | Smooth sine wave along entire outline |
| Diminished | Concave | Edges curve inward toward center |
| Augmented | Convex | Edges curve outward from center |
| Sus2 | Straight + short dash | Dashed outline |
| Sus4 | Straight + long dash | Dashed outline |

All arms have pointed tips. Edge style applies to entire unified shape outline.

### Rendering Rules

- **Diatonic chord tones** → Solid arms from hub
- **Chromatic alterations** (♭9, ♯9, ♯11, etc.) → Lines (not filled arms)
- **Altered chord tones** (e.g., ♭5 in dom7♭5) → Arm at altered position

## Validation Checklist

When viewing chord shapes, verify:

1. **Unified outline** — Entire shape has one continuous outline (no separate arm outlines)
2. **Hub is always visible** — Central filled circle anchors the shape
3. **All tips are pointed** — Arms taper to a point
4. **Edge style is discriminable** — Straight vs wavy vs concave vs convex
5. **Length hierarchy is clear** — Triadic > seventh > extension
6. **Arms sit firmly on hub** — Wide base (30°) provides visual stability
7. **Sus chords read as "suspended"** — Dashed outline signals open quality
8. **Chromatic alterations read as "modifications"** — Lines distinct from arms

## Chord Shapes

Shapes are root-independent — they encode interval relationships, not specific pitches.

### Triads

| Quality | Shape Characteristics |
|---------|----------------------|
| Major | Unified shape; 3 arms at 0°, 120°, 210°; straight edges |
| Minor | Unified shape; 3 arms at 0°, 90°, 210°; wavy edges |
| Diminished | Unified shape; 3 arms at 0°, 90°, 180°; concave edges |
| Augmented | Unified shape; 3 arms at 0°, 120°, 240°; convex edges |
| Sus2 | Unified shape; 3 arms at 0°, 60°, 210°; dashed (short) |
| Sus4 | Unified shape; 3 arms at 0°, 150°, 210°; dashed (long) |

### Seventh Chords

| Quality | Shape Characteristics |
|---------|----------------------|
| Major 7th | 4 arms; 7th at 330° (shorter); straight edges |
| Minor 7th | 4 arms; ♭7 at 300° (shorter); wavy edges |
| Dominant 7th | 4 arms; ♭7 at 300° (shorter); straight edges |
| Diminished 7th | 4 arms; evenly spaced (symmetric); concave edges |
| Half-diminished | 4 arms; ♭5 at 180°, ♭7 at 300°; concave edges |

### Extended Chords

| Quality | Shape Characteristics |
|---------|----------------------|
| Major 9th | 5 arms; 9th at 60° (shortest); straight edges |
| Dominant 7♯9 | 4 arms + line; ♯9 rendered as LINE at 90°; straight edges |
| Add9 | 4 arms; no 7th; 9th at 60° (short); straight edges |

## Usage

Open `chord-shapes.html` in a browser to see all chord shapes rendered according to SPEC 010 v3.2.

## Related Specs

- [SPEC 010: Visual Vocabulary](../../../specs/SPEC_010_visual_vocabulary.md)
- [SPEC 003: Instrument Identity Invariants](../../../specs/SPEC_003_instrument_identity_invariants.md) (I18)
