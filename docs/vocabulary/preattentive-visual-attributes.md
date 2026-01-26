# Preattentive Visual Attributes

> **ARCHIVED**: The key findings from this document are incorporated into [RFC 009](../../rfcs/rfc_009_visual_vocabulary_semantic_mappings.md). Retained for detailed reference.

**Purpose**: Reference for visual vocabulary design decisions
**Date**: 2026-01-26
**Status**: Archived (incorporated into RFC 009)

---

## What Are Preattentive Attributes?

Preattentive attributes are visual properties that the human visual system processes *before* conscious attention—in under 200-250ms, regardless of the number of elements displayed. These attributes "pop out" from their surroundings without requiring serial search.

This matters for Synesthetica because:
1. Musical events happen fast; the visual response must be perceived faster than conscious analysis
2. Multiple elements appear simultaneously; important distinctions must be obvious without scanning
3. Learning associations requires consistent, immediate recognition

---

## The Preattentive Attributes

### Tier 1: Strongest Preattentive Effects

These are detected fastest and most reliably.

| Attribute | Discriminability | Notes |
|-----------|------------------|-------|
| **Hue** | ~12 categorical distinctions | Red, orange, yellow, green, cyan, blue, purple, magenta, pink, brown, gray, white. Fine gradations require attention. |
| **Motion** | Binary (moving vs still) + direction | Motion onset is extremely salient. Direction requires slightly more attention. |
| **Size** | ~4-6 discriminable levels | Relative size is preattentive; absolute size estimation requires attention. |
| **Orientation** | ~4-8 directions | Tilted elements pop out from vertical/horizontal. |
| **Spatial position** | High | "Where" is processed before "what." |

### Tier 2: Reliable Preattentive Effects

Detected preattentively but with lower discriminability.

| Attribute | Discriminability | Notes |
|-----------|------------------|-------|
| **Brightness/luminance** | ~5-7 levels | Light vs dark is preattentive; fine gradations are not. Works best with high contrast. |
| **Saturation** | ~3-5 levels | Vivid vs muted is preattentive; subtle differences require comparison. |
| **Shape category** | ~4-5 basic shapes | Circle, square, triangle, cross discriminate well. More complex shapes require attention. |
| **Length** | ~4-5 levels | For lines/bars; works best when aligned. |
| **Curvature** | Binary (curved vs straight) | Curved elements pop out from straight; degree of curvature requires attention. |

### Tier 3: Conditional/Weak Preattentive Effects

Preattentive only under certain conditions.

| Attribute | Discriminability | Notes |
|-----------|------------------|-------|
| **Texture** | ~2-3 levels | Coarse distinctions only (smooth vs rough). Fine texture requires attention. |
| **Flicker/blink** | Binary | Presence is preattentive; rate discrimination is not. |
| **Stereoscopic depth** | Binary (near vs far) | Requires stereo display; gradations need attention. |
| **Enclosure** | Binary | Enclosed vs not is preattentive. |

### NOT Preattentive

These require serial, attentive processing.

| Attribute | Notes |
|-----------|-------|
| **Conjunctions** | "Find the red circle among red squares and blue circles" requires serial search. |
| **Number/counting** | Beyond ~4 items (subitizing limit), counting requires attention. |
| **Word/symbol reading** | Always requires attention. |
| **Fine gradations** | Distinguishing 60% from 70% saturation requires comparison. |
| **Complex shapes** | Distinguishing pentagon from hexagon requires attention. |

---

## Implications for Synesthetica Vocabulary

### Hue for Pitch Class: Well-Supported

- 12 pitch classes maps to ~12 discriminable hues
- Hue is preattentive and categorical—exactly what pitch class recognition needs
- **Caution**: Hue discrimination degrades at low saturation and extreme brightness

### Brightness for Octave: Reasonable

- ~5-7 discriminable levels maps adequately to musical octaves
- Brightness is preattentive when contrast is sufficient
- **Caution**: Very dark or very light colors lose hue discrimination; may need to constrain the brightness range to preserve pitch class recognition

### Shape for Chord Quality: Supported with Constraints

- 4-5 basic shape categories are preattentive
- Sufficient for major/minor/diminished/augmented/suspended
- **Caution**: Complex "generative" shapes (from third-signature algorithm) may not be preattentive if they're too similar. Need to ensure resulting shapes fall into discriminable categories.

### Size for Velocity: Well-Supported

- Relative size differences are preattentive
- Intuitive mapping (louder = bigger)
- **Caution**: Absolute size is not preattentive; velocity differences will be perceived relatively, not absolutely

### Motion: Reserved but Powerful

- Motion onset is the most salient preattentive attribute
- Direction discrimination is preattentive for ~4-8 directions
- **Recommendation**: Reserve for grammar use (pedagogical emphasis) rather than vocabulary constraints. Motion is too powerful to consume for ambient information.

### Texture: Limited Utility

- Only 2-3 levels discriminate preattentively
- Best used for binary or ternary distinctions (e.g., certain/uncertain)
- **Caution**: Fine texture variations will not be perceived at speed

---

## Perceptual Interactions and Conflicts

### Integral vs Separable Dimensions

Some visual dimensions are processed together (integral) and some independently (separable).

**Integral pairs** (hard to perceive independently):
- Hue + Saturation + Brightness (all aspects of "color")
- Width + Height of rectangles (perceived as "size" and "shape")
- X + Y position (perceived as "location")

**Separable pairs** (can perceive independently):
- Color + Shape
- Color + Size
- Color + Position
- Shape + Size

**Implication**: Mapping pitch class to hue and octave to brightness uses an integral pair. The *color* will be perceived holistically—which is fine if you want "C4" to feel like a distinct color from "C5." But if you need to extract pitch class *independently* of octave, this could be harder than using two separable dimensions.

### Asymmetric Interference

Some mappings interfere more in one direction than the other:
- Size differences interfere with brightness judgments more than brightness interferes with size
- Hue differences interfere with saturation judgments

**Implication**: If velocity (size) and octave (brightness) are both present, velocity variations might make octave harder to judge, but not vice versa. This is probably acceptable for ear training (pitch class is primary; octave is secondary).

---

## Design Recommendations

### Do

1. **Use hue for the most important categorical distinction** (pitch class)
2. **Use size for continuous/ordinal data** (velocity)
3. **Use basic shape categories** (circle, square, triangle, diamond) for chord quality
4. **Ensure high contrast** between brightness levels if using brightness for octave
5. **Reserve motion** for grammar-level pedagogical emphasis

### Don't

1. **Don't rely on fine gradations** of any attribute for critical distinctions
2. **Don't use conjunctions** for identification ("the red circle means X")
3. **Don't encode more than 4-5 levels** in any single attribute
4. **Don't use texture for primary information**—it's too subtle

### Test

1. **Shape generation algorithm**: Verify that generated chord shapes are discriminable at speed
2. **Brightness range**: Find the range where octave is distinguishable without losing hue discrimination
3. **Motion as emphasis**: Verify that grammar-added motion doesn't overwhelm vocabulary-level attributes

---

## References

- Healey, C. G. (2012). "Attention and Visual Memory in Visualization and Computer Graphics." IEEE TVCG.
- Ware, C. (2012). *Information Visualization: Perception for Design*, 3rd ed. Morgan Kaufmann. Chapter 5.
- Wolfe, J. M. & Horowitz, T. S. (2004). "What attributes guide the deployment of visual attention and how do they do it?" Nature Reviews Neuroscience.
- Treisman, A. (1985). "Preattentive processing in vision." Computer Vision, Graphics, and Image Processing.
On the radial wedge stacking with wraparound:

I