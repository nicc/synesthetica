# RFC 009: Visual Vocabulary Semantic Mappings

Status: Discovery
Date: 2026-01-26

## Summary

This RFC documents the design exploration for Synesthetica's visual vocabulary—the constraint system that ensures consistent visual semantics across all grammars. The vocabulary defines *what visual properties mean*, not how grammars render them.

## Context

Synesthetica is a real-time audio/MIDI visualizer for synesthetic ear training. The primary use case is pedagogical: building intuitive pitch and harmony recognition through consistent visual association.

The visual vocabulary (formerly called "ruleset") sits between musical abstractions (MusicalFrame) and grammars. It annotates musical elements with visual properties that encode meaning. Grammars then render these properties however they choose.

Key architectural constraint: Grammars know musical element *categories* (note, chord, beat) but not musical *analysis* (pitch class, chord quality). The vocabulary must encode all musical meaning through visual properties.

## Design Principles

1. **Model inherent musical structure; let permutations emerge.** Don't create separate visual symbols for every chord quality. Instead, model the structure (intervals, thirds-stacking) and let chord shapes emerge.

2. **Prioritize perceptual clarity over representational completeness.** Not everything needs visual representation. Focus on what supports ear training.

3. **Vocabulary constrains; grammars interpret.** The vocabulary defines what colors/shapes mean. Grammars decide how to paint with them.

4. **Support passive learning through consistent, ambient representation.** Users learn by exposure, not explicit instruction.

## Perceptual Foundations

Visual mappings must leverage preattentive processing—visual features detected in under 200-250ms without conscious attention.

### Preattentive Attributes (Ranked by Strength)

**Tier 1 (strongest):**
- Hue: ~12 categorical distinctions
- Motion: Binary (moving/still) + direction
- Size: ~4-6 discriminable levels
- Orientation: ~4-8 directions
- Spatial position: High discriminability

**Tier 2 (reliable):**
- Brightness/luminance: ~5-7 levels
- Saturation: ~3-5 levels
- Shape category: ~4-5 basic shapes
- Length: ~4-5 levels
- Curvature: Binary (curved/straight)

**Tier 3 (conditional):**
- Texture: ~2-3 levels (coarse distinctions only)
- Flicker: Binary
- Enclosure: Binary

### Key Implication

Hue is the strongest categorical preattentive attribute. Pitch class is the most important concept for ear training. This suggests pitch class → hue as a primary mapping.

### Integral vs Separable Dimensions

Hue, saturation, and brightness are *integral*—processed as a unified "color" percept. Mapping pitch class to hue and octave to brightness uses this relationship: each pitch (C4, C5, etc.) becomes a distinct color. This supports learning "pitch colors" but may make extracting pitch class independently of octave harder.

For ear training, this is acceptable: pitch class is primary, octave is secondary.

## Proposed Mappings

### Pitch → Color (Mandatory)

| Musical Concept | Visual Channel | Notes |
|-----------------|----------------|-------|
| Pitch class | Hue | 12 pitch classes → 12 hues (per SPEC_002) |
| Octave | Brightness | Lower=darker, higher=brighter |

Brightness range must preserve hue discriminability at extremes. Accept reduced octave discrimination at very low/high registers.

### Note Dynamics (Mandatory)

| Musical Concept | Visual Channel | Notes |
|-----------------|----------------|-------|
| Velocity | Size | Louder = larger (relative, not absolute) |
| Velocity | Attack sharpness | Harder strikes = sharper onset |

Size discrimination limited to ~4-5 perceptible levels.

### Note Phase (Mandatory)

| Musical Concept | Visual Channel | Notes |
|-----------------|----------------|-------|
| Note phase | Opacity/intensity | Attack=full, sustain=held, release=fade |

Attack ~50ms, release configurable (default ~500ms).

### Chord Quality → Shape (Mandatory)

Rather than arbitrary shape-to-quality mappings, we model chord structure directly using radial wedge representation.

**The Algorithm:**

1. **12 angular slots** (30° each), root at 12 o'clock
2. **Radius by thirds-distance:**
   - Triadic (root, 3rd, 5th): 1.0
   - Seventh: 0.618
   - Upper extensions (9th, 11th): 0.382
3. **Wedges vs lines:**
   - Diatonic chord tones: Wedge
   - Chromatic alterations: Line
   - Altered chord tones (e.g., ♭5 in dom7♭5): Wedge in altered position
4. **Margin style encodes triad quality:**
   - Major: Straight
   - Minor: Wavy
   - Diminished: Concave
   - Augmented: Convex
   - Sus2: Short dashes
   - Sus4: Long dashes

See SPEC_010 for full specification.

### Not Constrained (Grammar-Level)

| Concept | Rationale |
|---------|-----------|
| Spatial position | Grammars need layout freedom |
| Absolute size | Grammars scale for their purpose |
| Motion | Reserved for grammar emphasis |
| Harmonic tension | Interpretive, key-dependent |
| Chord function | Requires key context |
| Voicing/inversion | Grammar can indicate if relevant |
| Confidence visualization mechanism | Vocabulary says "show uncertainty"; grammar decides how |

## Uncertainty Representation

When detection confidence is low, the visual representation must indicate uncertainty.

**Candidates explored:**
- Jitter (motion-based): Intuitive, doesn't consume shape/color channels
- Edge blur (shape-based): May conflict with margin styles
- Reduced saturation (color-based): May conflict with pitch encoding

**Recommendation:** Test jitter first. Motion is preattentive and preserves other channels.

## Validation Requirements

The following chords should be rendered and verified for discriminability:

- Basic triads: C, Cm, Cdim, Caug
- Suspensions: Csus2, Csus4
- Sevenths: Cmaj7, Cm7, C7, Cdim7, Cm7♭5
- Extensions: Cmaj9, C7♯9, Cadd9

Validation criteria:
1. Shapes discriminable at a glance
2. Triad quality (margin) apparent
3. Extensions visible but subordinate
4. Altered tones read as modifications

## Open Questions

1. **Brightness range:** What range preserves hue discrimination while showing octave?
2. **Wedge proportions:** Do golden ratio multipliers (1.0, 0.618, 0.382) produce balanced shapes?
3. **Margin discriminability:** Can margin styles be distinguished at small sizes and fast tempos?
4. **Line styling:** How should chromatic alteration lines be rendered?
5. **Note + chord co-rendering:** When showing both, how do they relate spatially?

## Relationship to Existing Specs

- **SPEC_002** (Pitch-Class to Hue): Extended with octave→brightness mapping
- **SPEC_003** (Instrument Identity Invariants): New invariants I14-I17 proposed
- **SPEC_006** (Ruleset Statefulness): Visual vocabulary remains pure/stateless
- **SPEC_009** (Frame Types): AnnotatedMusicalFrame structure unchanged

## Next Steps

1. Prototype chord shape rendering
2. Validate margin discriminability at speed
3. Test brightness range for octave encoding
4. Determine uncertainty visualization mechanism
5. If validated, promote to SPEC_010

## References

- Ware, C. (2012). *Information Visualization: Perception for Design*. Morgan Kaufmann.
- Healey, C. G. (2012). "Attention and Visual Memory in Visualization and Computer Graphics." IEEE TVCG.
- Wolfe, J. M. & Horowitz, T. S. (2004). "What attributes guide the deployment of visual attention." Nature Reviews Neuroscience.
- Treisman, A. (1985). "Preattentive processing in vision." Computer Vision, Graphics, and Image Processing.
