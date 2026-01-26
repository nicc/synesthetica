# Visual Vocabulary Specification v3

> **ARCHIVED**: This document is superseded by [SPEC_010](../../specs/SPEC_010_visual_vocabulary.md) and [RFC 009](../../rfcs/rfc_009_visual_vocabulary_semantic_mappings.md). Retained for historical reference only.

**Status**: Archived (promoted to SPEC_010)
**Date**: 2026-01-26
**Supersedes**: semantic-mappings-v2.md

---

## Overview

This document specifies the visual vocabulary for Synesthetica—the constraint system that ensures consistent visual semantics across all grammars. The vocabulary defines *what visual properties mean*, not how grammars render them.

**Design principles:**
1. Model inherent musical structure; let permutations emerge
2. Prioritize perceptual clarity over representational completeness
3. Vocabulary constrains; grammars interpret
4. Support passive learning through consistent, ambient representation

**Primary use case:** Ear training (recognizing pitch relationships, chord qualities, harmonic patterns)

---

## Part 1: The Constraints

### 1.1 Pitch → Color

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Pitch class | Hue | Mandatory: each of 12 pitch classes maps to a distinct hue |
| Octave | Brightness | Mandatory: lower octaves are darker, higher octaves are brighter |

**Specification:**
- Pitch class hue mapping follows SPEC_002 (or its successor)
- Brightness range should preserve hue discriminability at extremes
- Accept reduced octave discrimination at extremes (very low, very high registers)

**Rationale:** Hue is the most discriminable preattentive attribute. Pitch class is the most important concept for ear training. Brightness is perceptually ordered (dark=low, bright=high) and integral with hue, creating unified "pitch colors."

### 1.2 Note Dynamics → Size and Attack

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Velocity | Size | Mandatory: louder notes are larger |
| Velocity | Attack sharpness | Mandatory: harder strikes have sharper onset |

**Specification:**
- Size is relative, not absolute (grammars control base scale)
- Attack sharpness: high velocity = instant appearance; low velocity = brief fade-in
- Size discrimination limited to ~4-5 perceptible levels

**Rationale:** Size is preattentive and intuitive for intensity. Attack sharpness ties two related concepts (velocity and onset character) to one visual behavior without consuming an additional channel.

### 1.3 Note Phase → Intensity Envelope

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Note phase | Opacity/intensity | Mandatory: attack=full, sustain=sustained, release=fade |

**Specification:**
- Attack phase (~50ms): full intensity
- Sustain phase: maintained intensity (grammar may modulate slightly)
- Release phase (configurable, default ~500ms): fade to zero

**Rationale:** Consistent phase rendering ensures visual responsiveness feels unified across grammars. Without this constraint, the same note could appear crisp in one grammar and sluggish in another, breaking passive learning.

### 1.4 Chord Quality → Radial Wedge Shape

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Chord structure | Shape geometry | Mandatory: radial wedge shape derived from chord intervals |
| Triad quality | Margin style | Mandatory: margin encodes major/minor/dim/aug/sus |

**Specification:** See Part 2 (Chord Shape Algorithm).

**Rationale:** The shape *is* the chord structure, not an arbitrary mapping. This supports learning chord construction, not just chord labels.

---

## Part 2: Chord Shape Algorithm

### 2.1 Radial Interval Representation

The chord shape is constructed from wedges arranged radially around a center point.

**Angular positions (12 slots, 30° each, root at 12 o'clock):**

| Clock Position | Degrees | Interval |
|----------------|---------|----------|
| 12:00 | 0° | Root (1) |
| 1:00 | 30° | ♭2 / ♭9 |
| 2:00 | 60° | 2 / 9 |
| 3:00 | 90° | ♭3 |
| 4:00 | 120° | 3 |
| 5:00 | 150° | 4 / 11 |
| 6:00 | 180° | ♯4 / ♭5 |
| 7:00 | 210° | 5 |
| 8:00 | 240° | ♯5 / ♭6 |
| 9:00 | 270° | 6 / 13 |
| 10:00 | 300° | ♭7 |
| 11:00 | 330° | 7 |

**Root is always at 12 o'clock.** The shape rotates with the chord root (a D chord has D's hue at 12 o'clock), but the structure is always root-anchored.

### 2.2 Radius by Thirds-Distance

Intervals are rendered at different radii based on their distance in stacked thirds from the root:

| Category | Intervals | Radius Multiplier |
|----------|-----------|-------------------|
| Triadic | Root, 3rd, 5th | 1.0 |
| Seventh | 7th | 0.618 |
| Upper extensions | 9th, 11th | 0.382 |

**Rationale:** The triadic skeleton is always most prominent. Extensions are visible but subordinate. Three radius levels preserve perceptual clarity.

### 2.3 Wedges vs Lines

| Interval Type | Rendering |
|---------------|-----------|
| Diatonic chord tones | Wedge |
| Chromatic alterations (♭9, ♯9, ♯11, ♭13, etc.) | Line radiating from center |
| Altered chord tones (e.g., ♭5 in dom7♭5) | Wedge in altered position |

**Wedge width** emerges naturally from angular spacing. A major 3rd (spanning from ♭3 to 3 position) appears wider than a minor 3rd.

**Absent intervals** create deep indentations (gaps between wedges). A triad has three wedges with large gaps; an 11th chord fills more slots with shallower gaps.

### 2.4 Margin Styles (Triad Quality)

| Triad Quality | Margin Style |
|---------------|--------------|
| Major | Straight |
| Minor | Wavy |
| Diminished | Concave |
| Augmented | Convex |
| Sus2 | Short dashes |
| Sus4 | Long dashes |

**Margin style applies to all wedges in the shape**, encoding the fundamental triad quality. The 7th and extensions inherit the margin of their parent triad.

### 2.5 Examples

**C Major triad (C-E-G):**
- Wedges at: 0° (root), 120° (major 3rd), 210° (5th)
- All at radius 1.0
- Straight margins
- Wide wedge at 3rd position (major 3rd spans more degrees)

**C Minor 7 (C-E♭-G-B♭):**
- Wedges at: 0° (root), 90° (minor 3rd), 210° (5th), 300° (♭7)
- Root/3rd/5th at radius 1.0; ♭7 at radius 0.618
- Wavy margins
- Narrower wedge at 3rd position (minor 3rd)

**C Major 9 (C-E-G-B-D):**
- Wedges at: 0° (root), 120° (major 3rd), 210° (5th), 330° (major 7th), 60° (9th)
- Root/3rd/5th at 1.0; 7th at 0.618; 9th at 0.382
- Straight margins
- 9th wedge appears between root and 3rd, close to center

**C7♭5 (C-E-G♭-B♭):**
- Wedges at: 0° (root), 120° (major 3rd), 180° (♭5), 300° (♭7)
- Gap at 210° (natural 5th position)
- Straight margins (major triad quality, despite alteration)
- ♭5 rendered as wedge, not line (it's a chord tone, not a color tone)

**C7♯9 (C-E-G-B♭-D♯):**
- Wedges at: 0°, 120°, 210°, 300°
- Line at 90° (♯9 = ♭3 enharmonically, chromatic alteration)
- Straight margins

---

## Part 3: What Vocabulary Does NOT Constrain

These are grammar-level concerns:

| Concept | Why Grammar-Level |
|---------|-------------------|
| Spatial position | Grammars need layout freedom (radial, linear, 3D, etc.) |
| Absolute size | Grammars scale shapes for their pedagogical purpose |
| Motion | Reserved for grammar emphasis; too powerful to consume for ambient info |
| Harmonic tension | Interpretive, key-dependent; grammar can visualize if relevant |
| Chord function | Requires key context; grammar can show for harmony-focused pedagogy |
| Voicing/inversion | Grammar can indicate bass note, interval stacking, etc. |
| Confidence visualization | Vocabulary defines *that* uncertainty is shown; grammar defines *how* (jitter, blur, etc.) |

---

## Part 4: Confidence and Uncertainty

**Constraint:** When chord detection confidence is below threshold, the visual representation must indicate uncertainty.

**Mechanism:** To be determined by spike. Candidates:
- Subtle jitter (motion-based; intuitive but may be distracting)
- Edge blur / texture (shape-based; may conflict with margin styles)
- Reduced saturation (color-based; may conflict with pitch encoding)

**Recommendation:** Test jitter first. Motion is preattentive and doesn't consume shape or color channels.

---

## Part 5: Validation Matrix

The spike should render these chords and verify:
1. Shapes are discriminable at a glance
2. Triad quality (margin) is apparent
3. Extensions are visible but subordinate
4. Altered tones read as "modifications"

| Chord | Expected Shape Characteristics |
|-------|-------------------------------|
| C | 3 wedges, straight margins, wide 3rd |
| Cm | 3 wedges, wavy margins, narrow 3rd |
| Cdim | 3 wedges, concave margins, narrow 3rd and 5th |
| Caug | 3 wedges, convex margins, wide 3rd and 5th |
| Csus2 | 3 wedges (root, 2nd, 5th), short-dash margins |
| Csus4 | 3 wedges (root, 4th, 5th), long-dash margins |
| Cmaj7 | 4 wedges, straight margins, 7th at medium radius |
| Cm7 | 4 wedges, wavy margins, ♭7 at medium radius |
| C7 | 4 wedges, straight margins, ♭7 at medium radius |
| Cdim7 | 4 wedges, concave margins, all diminished intervals |
| Cm7♭5 | 4 wedges, wavy margins, ♭5 position filled |
| Cmaj9 | 5 wedges, straight margins, 9th close to center |
| C7♯9 | 4 wedges + line at ♯9, straight margins |
| Cadd9 | 4 wedges (no 7th), straight margins, 9th at short radius, visible gap at 7th |

---

## Part 6: Open Questions for Spike

1. **Brightness range:** What range preserves hue discrimination while showing octave?
2. **Wedge proportions:** Do the golden ratio multipliers (1.0, 0.618, 0.382) produce visually balanced shapes?
3. **Margin discriminability:** Can wavy/concave/convex/dashed margins be distinguished at small sizes and fast tempos?
4. **Line styling:** How should chromatic alteration lines be rendered (thickness, length, caps)?
5. **Uncertainty treatment:** Jitter vs blur vs desaturation—which is least disruptive?
6. **Note + chord co-rendering:** When grammar shows both notes and chord shape, how do they relate spatially?

---

## References

- SPEC_002: Pitch-Class to Hue Mapping
- preattentive-attributes.md: Perceptual constraints reference
- Ware, C. (2012). Information Visualization: Perception for Design