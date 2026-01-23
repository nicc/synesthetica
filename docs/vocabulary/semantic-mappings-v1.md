# Semantic Mappings Analysis v1

**Status**: Working document
**Date**: 2026-01-23
**Context**: Downstream of incidental decisions made during initial development

This document catalogs the semantic mappings between musical and visual elements in Synesthetica, identifies potential conflicts, and proposes areas for further exploration.

---

## Current Mappings (Implemented)

### Pitch Class → Hue (SPEC_002)

The primary color invariant. Defined in `packages/contracts/intents/colors.ts`.

| Musical Element | Visual Property | Mapping |
|-----------------|-----------------|---------|
| Pitch class | Hue | `pcToHue()` function |
| Reference: A (pc=9) | Reference: Red (hue=0) | Configurable |
| Direction | Clockwise | Each semitone = 30° |

**Properties**:
- Deterministic and inviolable
- Octave-equivalent (C4 and C5 produce same hue)
- Users learn this mapping over time

### Velocity → Visual Intensity

Implemented in `MusicalVisualVocabulary`.

| Musical Element | Visual Property | Mapping |
|-----------------|-----------------|---------|
| Note velocity | Brightness | `velocity / 127` normalized |
| Note velocity | Size | `0.3 + (velocity / 127) * 0.7` |

### Note Phase → Visual Lifecycle

| Musical Element | Visual Property | Mapping |
|-----------------|-----------------|---------|
| Attack phase | Full opacity | Immediate |
| Sustain phase | Maintained | Duration-based |
| Release phase | Fade out | Controlled by grammar |

### Confidence → Visual Stability

| Musical Element | Visual Property | Mapping |
|-----------------|-----------------|---------|
| Detection confidence | Uncertainty annotation | `1 - confidence` |
| Low confidence | Jitter/noise | Grammar interprets |

---

## Proposed Mappings (Not Yet Implemented)

### Chord Quality → Visual Properties

**SUGGESTION**: These are proposals, not decisions.

| Musical Element | Visual Property | Option A | Option B |
|-----------------|-----------------|----------|----------|
| Major quality | Palette warmth | Warm tones | Brighter |
| Minor quality | Palette warmth | Cool tones | Darker |
| Diminished | Texture | Angular | Turbulent |
| Augmented | Texture | Expanded | Diffuse |

**Open Question**: Should chord quality affect hue, saturation, brightness, texture, or some combination?

### Harmonic Tension → Visual Properties

**SUGGESTION**: Tension is computed by stabilizers as a continuous 0-1 value.

| Tension Level | Visual Property (Option A) | Visual Property (Option B) |
|---------------|---------------------------|---------------------------|
| Low (resolved) | Smooth, stable | Compact, centered |
| Medium | Moderate motion | Medium spread |
| High (unresolved) | Turbulent, jittery | Expanded, dispersed |

**Open Question**: Should the vocabulary pass a discrete category or continuous value? Vocabulary decides representation; grammar decides form.

### Key/Mode → Global Visual Properties

**SUGGESTION**: Key context affects the overall visual atmosphere.

| Musical Element | Visual Property | Proposal |
|-----------------|-----------------|----------|
| Major key | Modal brightness | Brighter base values |
| Minor key | Modal brightness | Darker base values |
| Modal interchange | Transition | Gradual shift |

### Chord Function → Color Relationships

**SUGGESTION**: Functional harmony creates color relationships.

| Function | Visual Relationship | Proposal |
|----------|---------------------|----------|
| Tonic (I) | Primary | Stable, grounded |
| Dominant (V) | Tension | Contrasting |
| Subdominant (IV) | Transitional | Complementary |
| Secondary dominants | Borrowed | Shifted palette |

**Open Question**: This potentially conflicts with pitch-class → hue. A V chord in different keys would have different pitch classes but the same function. Do we color by function or root pitch?

### Inversion → Visual Emphasis

**SUGGESTION**: Bass note position affects visual weight.

| Inversion | Visual Property | Proposal |
|-----------|-----------------|----------|
| Root position | Normal weight | Balanced |
| First inversion | Bass emphasis | Lower visual weight |
| Second inversion | Strong bass emphasis | Bottom-heavy |

---

## Semantic Conflicts

### Conflict 1: Pitch Class vs. Chord Function Coloring

**The Problem**:
- SPEC_002 mandates pitch class → hue (C is always hue 90°)
- Functional harmony suggests dominant chords should contrast with tonic
- A V chord's root pitch class varies by key, but its function is constant

**Potential Resolutions**:
1. **Preserve pitch-hue, use saturation/brightness for function**: Root color from pitch, function affects intensity
2. **Add secondary color channel**: Primary from pitch, accent from function
3. **Choose one**: Document that we prioritize pitch over function (accept limitation)

**Recommendation**: Option 1 preserves the inviolable pitch-hue invariant while adding harmonic meaning through other visual channels.

### Conflict 2: Chord Root vs. Individual Note Colors

**The Problem**:
- Each note in a chord has its own pitch-class color
- The chord as a whole has a root pitch-class
- Should chord visualizations use root color or show all constituent colors?

**Potential Resolutions**:
1. **Grammar decides**: Vocabulary provides both; grammar chooses representation
2. **Blended approach**: Root color dominant, constituent colors as accents
3. **Context-dependent**: Use constituent for arpeggios, root for block chords

**Recommendation**: Vocabulary annotates both root and constituent colors. Grammars have creative agency to choose representation.

### Conflict 3: Tension Representation

**The Problem**:
- Multiple sources of tension (dissonance, harmonic, voice leading)
- Should vocabulary combine into single value or expose components?

**Potential Resolutions**:
1. **Single combined value**: Simpler for grammars, less expressive
2. **Component values**: More expressive, more complex grammar logic
3. **Combined + dominant component**: Best of both worlds

**Recommendation**: Provide combined tension value plus the dominant contributing factor. Grammars can use either.

---

## Unmapped Musical Semantics

These musical concepts currently have no visual mapping:

| Musical Concept | Notes |
|-----------------|-------|
| Melodic contour | Rising/falling lines could affect motion direction |
| Phrase boundaries | Could trigger visual section changes |
| Rhythmic density | Note frequency could affect visual density |
| Register | High/low octaves could affect vertical position |
| Articulation | Staccato/legato could affect visual sharpness |
| Dynamics trend | Crescendo/diminuendo could affect expansion |

---

## Next Steps

1. **Spike**: Conduct experiments to evaluate proposed mappings visually
2. **Decide**: Resolve semantic conflicts through visual testing
3. **Implement**: Add approved mappings to `MusicalVisualVocabulary`
4. **Test**: Create golden tests for vocabulary invariants

---

## References

- SPEC_002: Pitch-Class to Hue Mapping
- RFC 006: Annotated Musical Frame Types
- Lerdahl-Jackendoff: Tonal Pitch Space (tension model)
- Krumhansl: Cognitive Foundations of Musical Pitch
