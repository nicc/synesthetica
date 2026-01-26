# Semantic Mappings Analysis v2

> **ARCHIVED**: This document is superseded by [SPEC_010](../../specs/SPEC_010_visual_vocabulary.md) and [RFC_010](../../specs/RFC_010_visual_vocabulary_semantic_mappings.md). Retained for historical reference only.

**Status**: Archived
**Date**: 2026-01-23
**Approach**: Ignore prior incidental decisions; map the problem space before proposing solutions

---

## Part 1: The Musical Concepts (What We Have)

Musical elements that stabilizers can provide, ordered by reliability and importance.

### Tier 1: Certain and Fundamental

These are unambiguous from MIDI input.

| Concept | Source | Certainty | Notes |
|---------|--------|-----------|-------|
| **Pitch class** | Note data | 100% | Which of 12 chromatic pitches |
| **Octave** | Note data | 100% | Register (C4 vs C5) |
| **Note onset** | Note data | 100% | When a note starts |
| **Note release** | Note data | 100% | When a note ends |
| **Velocity** | Note data | 100% | How hard the key was struck |
| **Duration** | Note tracking | 100% | How long note is held |
| **Simultaneity** | Note tracking | 100% | Which notes sound together |

### Tier 2: Derived with High Confidence

Computed from Tier 1 data with reliable algorithms.

| Concept | Source | Certainty | Notes |
|---------|--------|-----------|-------|
| **Chord spelling** | Chord detection | 90%+ | Which pitch classes are present |
| **Chord root** | Chord detection | 85%+ | Lowest note or harmonic root |
| **Chord quality** | Chord detection | 85%+ | Major, minor, diminished, augmented |
| **Chord extensions** | Chord detection | 80%+ | 7ths, 9ths, etc. |
| **Inversion** | Chord detection | 80%+ | Which note is in bass |
| **Note density** | Beat detection | 90%+ | How many notes per time window |
| **Onset patterns** | Beat detection | 85%+ | Rhythmic regularity |

### Tier 3: Contextual and Interpretive

Require assumptions or statistical inference.

| Concept | Source | Certainty | Notes |
|---------|--------|-----------|-------|
| **Key/tonal center** | Key detection | 60-80% | Probabilistic, can be wrong |
| **Mode** | Key detection | 60-80% | Major vs minor (or modal) |
| **Chord function** | Progression analysis | 50-70% | I, IV, V etc. (requires key) |
| **Harmonic tension** | Progression analysis | Variable | Composite of multiple factors |
| **Cadence type** | Progression analysis | 60-75% | V-I, IV-I, deceptive, etc. |
| **Phrase boundaries** | Phrase detection | 50-70% | Where musical sentences end |
| **Tempo** | Beat detection | 70-85% | Unless prescribed by user |

### Tier 4: Highly Subjective

Depend heavily on style, context, or listener interpretation.

| Concept | Source | Certainty | Notes |
|---------|--------|-----------|-------|
| **Emotional valence** | Derived | Subjective | "Happy" vs "sad" |
| **Energy level** | Derived | Subjective | Composite metric |
| **Surprise/expectation** | Derived | Subjective | Requires learned model |

---

## Part 2: The Visual Expressions (What We Can Show)

Visual properties available for encoding meaning, ordered by perceptual impact.

### Tier 1: Immediate and Unambiguous

High perceptual salience; differences are obvious at a glance.

| Property | Discriminability | Continuous? | Notes |
|----------|------------------|-------------|-------|
| **Hue** | ~12 distinguishable | Discrete-ish | Human vision groups into categories |
| **Position** | High | Continuous | Where on screen (x, y) |
| **Size** | High | Continuous | Relative scale |
| **Shape category** | High | Discrete | Circle vs square vs triangle, etc. |
| **Presence/absence** | Binary | Discrete | Is it there or not |
| **Motion direction** | High | Discrete-ish | Up, down, left, right, expand, contract |

### Tier 2: Noticeable with Attention

Require some attention to perceive differences.

| Property | Discriminability | Continuous? | Notes |
|----------|------------------|-------------|-------|
| **Saturation** | ~5-7 levels | Continuous | Vivid vs muted |
| **Brightness/value** | ~5-7 levels | Continuous | Light vs dark |
| **Motion speed** | ~4-5 levels | Continuous | Fast vs slow |
| **Opacity** | ~5-6 levels | Continuous | Transparent to solid |
| **Edge sharpness** | ~3-4 levels | Continuous | Crisp vs blurry |
| **Texture density** | ~4-5 levels | Continuous | Sparse vs dense |

### Tier 3: Subtle, Require Comparison

Only noticeable when comparing adjacent elements.

| Property | Discriminability | Continuous? | Notes |
|----------|------------------|-------------|-------|
| **Brightness micro-variations** | Low | Continuous | Small % changes |
| **Saturation micro-variations** | Low | Continuous | Small % changes |
| **Texture grain** | Low | Continuous | Fine detail |
| **Motion smoothness** | Low | Continuous | Jitter vs smooth |
| **Glow intensity** | ~3-4 levels | Continuous | Amount of bloom |

### Tier 4: Temporal/Sequential

Only apparent over time or in sequence.

| Property | Discriminability | Continuous? | Notes |
|----------|------------------|-------------|-------|
| **Animation pattern** | Medium | Discrete | Pulse, wave, flicker |
| **Lifetime/decay** | Medium | Continuous | How long things persist |
| **Trail behavior** | Medium | Discrete | Fade, dissolve, persist |
| **Rhythm of appearance** | Medium | Continuous | Regular vs irregular |

---

## Part 3: The Mapping Problem

### Constraint: Limited High-Impact Channels

We have approximately:
- 12 discriminable hues
- 2-3 shape categories that read clearly
- 4-5 size levels
- 5-7 brightness/saturation levels
- A few motion directions

We need to encode:
- 12 pitch classes (exact match with hue!)
- 4+ chord qualities
- 3+ chord functions
- 2 modes (major/minor)
- Continuous tension
- Velocity/dynamics
- Note phase
- Confidence/uncertainty
- And more...

### The Core Tension

**Pitch class → hue consumes our best visual channel.**

If we commit 12 hues to 12 pitch classes (current SPEC_002), we cannot use hue to distinguish:
- Major from minor
- Tonic from dominant
- Resolved from tense

We must use secondary channels (saturation, brightness, shape, motion) for these—but those channels are less discriminable.

### Alternative: Don't Map Pitch Class to Hue

What if we freed hue for more important semantic distinctions?

| Hue mapping option | Pros | Cons |
|--------------------|------|------|
| Pitch class → hue | Learnable, deterministic, octave-equivalent | Consumes best channel for a possibly low-value mapping |
| Chord quality → hue | Emotionally resonant (warm major, cool minor) | Notes lose color identity |
| Chord function → hue | Shows harmonic structure | Key-dependent, unstable |
| Tension level → hue | Shows musical narrative | Continuous, harder to learn |
| Nothing → hue | Frees hue for aesthetic choice | Loses semantic encoding |

This is the fundamental question the spike (synesthetica-al3) must answer.

---

## Part 4: Musical Concepts by Importance

What actually matters for a meaningful visual experience?

### Essential (must visualize)

1. **Note presence**: When notes are sounding
2. **Pitch identity**: Which notes (even if not colored by pitch)
3. **Chord presence**: When harmony is present
4. **Rhythmic pulse**: The beat and timing

### Important (significantly enhances experience)

5. **Chord quality**: Major vs minor is emotionally salient
6. **Dynamics**: Loud vs soft affects intensity
7. **Tension/resolution**: The "story" of harmony
8. **Note duration**: Held vs staccato

### Nice to have (enriches but not essential)

9. **Chord function**: I, IV, V context
10. **Key/mode**: Global tonal context
11. **Inversion**: Bass note position
12. **Extensions**: 7ths, 9ths, etc.

### Probably skip (diminishing returns)

13. **Phrase boundaries**: Hard to detect, subtle
14. **Modulation**: Key changes (already hard to detect key)
15. **Secondary dominants**: Too music-theory-specific

---

## Part 5: Visual Expressions by Impact

What visual changes do people actually notice?

### Unmissable (use for most important concepts)

1. **Presence/appearance of elements**: Something appears
2. **Hue difference**: Red vs blue vs green
3. **Large size difference**: Big vs small
4. **Position on screen**: Where things are
5. **Shape category**: Round vs angular

### Noticeable (use for secondary concepts)

6. **Motion direction**: Growing vs shrinking, rising vs falling
7. **Saturation extremes**: Vivid vs gray
8. **Brightness extremes**: Bright vs dark
9. **Motion speed**: Fast vs slow

### Subtle (use for nuance, not primary encoding)

10. **Saturation gradations**: 60% vs 70% saturation
11. **Brightness gradations**: Not reliably perceived
12. **Texture variations**: Need attention to see
13. **Edge softness**: Ambient, not informational

---

## Part 6: Mapping Options

### Option A: Ruthlessly Prioritized (Minimum Viable)

Map only the most important musical concepts to the most impactful visual channels. Accept that some concepts won't have distinct visual representations.

| Musical Concept | Visual Property | Rationale |
|-----------------|-----------------|-----------|
| Note presence | Element appears | Binary, obvious |
| Pitch class | Hue (12 hues) | SPEC_002, learnable |
| Chord quality | Shape (round=major, angular=minor) | High discriminability |
| Velocity | Size | Intuitive (loud=big) |
| Tension | Motion (expand=tense, contract=resolve) | Dynamic, doesn't compete |

**What's NOT mapped:**
- Chord function (requires knowing major/minor first)
- Key/mode (affects chord coloring, but no direct visual)
- Inversion (too subtle)
- Extensions (too subtle)

**Pros**: Clear, learnable, no channel conflicts
**Cons**: Loses harmonic richness

---

### Option B: Function-Forward (Harmonic Narrative)

Prioritize the harmonic journey over individual pitch identity. Uses key context when available.

| Musical Concept | Visual Property | Rationale |
|-----------------|-----------------|-----------|
| Note presence | Element appears | Binary |
| Chord function | Hue (tonic=warm, dominant=cool, subdominant=neutral) | Shows harmonic narrative |
| Chord quality | Shape + texture (round/smooth=major, angular/rough=minor) | Secondary but visible |
| Velocity | Size | Intuitive |
| Tension | Saturation (low=resolved, high=tense) | Continuous mapping to continuous concept |
| Individual pitch | Position (vertical=register, horizontal=time) | Pitch without color |

**When key is disabled:**
- Hue defaults to chord root pitch class (fallback)
- Function-based coloring disabled

**Pros**: Tells the harmonic story; function is arguably more important than pitch identity
**Cons**: Pitch identity is lost to hue; key detection must be reliable; harder to learn

---

### Option C: Layered (Different Concepts at Different Scales)

Different visual scales carry different information. Zoom-dependent meaning.

| Scale | Musical Concept | Visual Property |
|-------|-----------------|-----------------|
| Global canvas | Mode | Background warmth (major=warm cast, minor=cool cast) |
| Regional | Tension | Field effects (calm vs turbulent) |
| Entity (chord) | Quality | Shape category |
| Entity (chord) | Function | Border/outline color |
| Entity (note) | Pitch class | Fill hue |
| Entity (note) | Velocity | Size |
| Entity (note) | Duration | Persistence/trail |

**Pros**: No channel conflicts; each concept has a home
**Cons**: Complex; may be hard to perceive all layers

---

### Option D: Emotion-First (Perceptual Grouping)

Group musical concepts that "feel similar" into single visual treatments. Don't try to encode everything separately.

| Perceptual Group | Musical Inputs | Visual Output |
|------------------|----------------|---------------|
| **Brightness/Energy** | Major mode + high velocity + low tension | Bright, vivid, expanded |
| **Darkness/Weight** | Minor mode + low velocity + high tension | Dark, muted, contracted |
| **Activity** | Note density + tempo | Motion speed, particle count |
| **Pitch band** | Register (octave) | Vertical position |
| **Identity** | Pitch class | Hue |

**Pros**: Perceptually coherent; maps to emotional experience
**Cons**: Loses fine-grained distinctions; harder to learn specific mappings

---

### Option E: Selective Redundancy

Use multiple channels for the most important concepts. Accept redundancy over ambiguity.

| Musical Concept | Primary Visual | Secondary Visual |
|-----------------|----------------|------------------|
| Chord quality | Shape (round/angular) | Saturation (vivid/muted) |
| Pitch class | Hue | — |
| Tension | Motion (expand/contract) | Edge blur (sharp/soft) |
| Velocity | Size | Brightness |

**Pros**: Important concepts are unmissable; graceful degradation
**Cons**: Uses more visual bandwidth; potentially busy

---

## Part 7: Recommendations for Spike

The spike (synesthetica-al3) should:

1. **Test pitch-class → hue value**: Is this mapping actually valuable? Do users learn it? Does it interfere with other mappings?

2. **Test shape for chord quality**: Can users reliably distinguish major (round) from minor (angular) shapes?

3. **Test motion for tension**: Does expand/contract feel like tension/resolution?

4. **Test with key disabled**: Does the visualization still work for atonal/modal music?

5. **Prototype Options A and B**: These represent the key tradeoff (pitch identity vs harmonic function).

---

## Part 8: Open Questions

1. **Is pitch-class → hue actually valuable?** It's learnable, but is learning it worth the cost of the hue channel?

2. **How important is chord function?** For jazz/classical, very. For ambient/electronic, less so.

3. **Should mode affect global aesthetics?** Major=bright, minor=dark is culturally loaded but intuitive.

4. **How do we handle key-disabled mode?** Fall back to pitch-based coloring? Use neutral palette?

5. **What's the minimum viable vocabulary?** If we could only map 3 concepts, which 3?

---

## References

- SPEC_002: Pitch-Class to Hue Mapping (current commitment)
- synesthetica-al3: SPIKE for vocabulary decisions
- Ware, C. (2012). Information Visualization: Perception for Design
- Munzner, T. (2014). Visualization Analysis and Design
