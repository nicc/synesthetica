# SPEC 010: Visual Vocabulary

Status: Approved
Date: 2026-01-26
Source: RFC 009

## Summary

Defines the mandatory visual vocabulary constraints for Synesthetica—the semantic mappings between musical concepts and visual properties that all grammars must respect.

## Overview

The visual vocabulary sits between stabilizers and grammars. It annotates musical elements with visual properties that encode meaning. This specification defines which mappings are mandatory (grammars cannot override) versus advisory (grammars may interpret).

Design principle: Model inherent musical structure; let permutations emerge.

## Mandatory Constraints

### 1. Pitch Class → Hue

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Pitch class (0-11) | Hue | Each pitch class maps to a distinct hue |

The mapping follows SPEC_002:
- 12 pitch classes → 12 hues (30° rotation per semitone)
- Default: A=0° (red), ascending chromatic = clockwise
- Configurable reference pitch and direction

**Invariant I14:** Pitch-class to hue mapping is inviolable. Grammars receive hue through `PaletteRef.primary.h` and must not recompute from pitch data.

### 2. Octave → Brightness

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Octave | Brightness (HSV V) | Lower octaves darker, higher octaves brighter |

**Specification:**
- Minimum brightness: 0.3 (preserves hue discrimination)
- Maximum brightness: 0.95 (avoids washout)
- Linear interpolation across playable range (approximately octaves 1-8)

**Invariant I15:** Octave to brightness mapping is mandatory. Grammars receive brightness through `PaletteRef.primary.v`.

### 3. Velocity → Size and Attack

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Velocity (0-127) | Relative size | Louder notes are larger |
| Velocity (0-127) | Attack sharpness | Harder strikes have sharper onset |

**Specification:**
- Size is relative, not absolute. Grammars control base scale.
- Velocity maps to size multiplier: 0.5 (pp) to 2.0 (ff)
- Attack sharpness: high velocity = instant appearance; low velocity = 50ms fade-in

**Invariant I16:** Velocity must affect visual prominence. Louder notes must be more visually salient than quieter notes.

### 4. Note Phase → Intensity Envelope

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Note phase | Opacity/intensity | Attack=full, sustain=held, release=fade |

**Specification:**
- Attack phase (~50ms): Full opacity (1.0)
- Sustain phase: Maintained opacity (grammar may modulate ±10%)
- Release phase (default 500ms): Linear fade to zero

**Invariant I17:** Note phase must affect visual intensity. Released notes must fade.

### 5. Chord Quality → Shape Geometry

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Chord intervals | Radial wedge positions | 12 angular slots, root at 12 o'clock |
| Thirds-distance | Wedge radius | Triadic=1.0, 7th=0.618, extensions=0.382 |
| Triad quality | Margin style | Major=straight, minor=wavy, dim=concave, aug=convex |

**Radial Representation:**

Angular positions (30° per slot, root at 0°/12 o'clock):

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

**Radius Multipliers:**

| Category | Intervals | Radius |
|----------|-----------|--------|
| Triadic | Root, 3rd, 5th | 1.0 |
| Seventh | 7th (any type) | 0.618 |
| Extensions | 9th, 11th, 13th | 0.382 |

**Margin Styles:**

| Triad Quality | Style |
|---------------|-------|
| Major | Straight edge |
| Minor | Wavy edge |
| Diminished | Concave edge |
| Augmented | Convex edge |
| Sus2 | Short dashes |
| Sus4 | Long dashes |

**Rendering Rules:**
- Diatonic chord tones: Rendered as wedges
- Chromatic alterations (♭9, ♯9, ♯11, etc.): Rendered as lines
- Altered chord tones (e.g., ♭5 in dom7♭5): Rendered as wedges in altered position

## Advisory Properties (Grammar-Level)

These are not constrained by vocabulary. Grammars have full control:

| Property | Rationale |
|----------|-----------|
| Spatial position | Grammars need layout freedom |
| Absolute size/scale | Grammars scale for their rendering approach |
| Motion | Reserved for pedagogical emphasis |
| Harmonic tension | Interpretive, requires key context |
| Chord function (tonic, dominant, etc.) | Requires harmonic analysis beyond vocabulary scope |
| Voicing/inversion details | Grammar may indicate bass note, interval stacking |

## Uncertainty Visualization

**Constraint:** When detection confidence < 0.7, the visual representation must indicate uncertainty.

**Recommended mechanism:** Subtle position jitter (±2-3px at 60fps). Motion is preattentive and doesn't consume shape or color channels.

**Alternative mechanisms** (grammar choice):
- Edge blur
- Reduced saturation (use sparingly; conflicts with pitch encoding)

## Contract Implications

### Note-Level Annotations

The vocabulary extends `AnnotatedNote` with velocity and phase properties:

```ts
// In packages/contracts/annotated/annotated.ts

/** Velocity-derived visual properties (Invariant I16) */
interface VelocityAnnotation {
  sizeMultiplier: number;  // 0.5 to 2.0
  attackMs: number;        // 0 to 50ms
}

/** Phase-derived visual properties (Invariant I17) */
interface PhaseAnnotation {
  phase: NotePhase;        // "attack" | "sustain" | "release"
  intensity: number;       // 1.0 at attack, fading during release
}

interface AnnotatedNote {
  note: Note;
  visual: VisualAnnotation;
  velocity: VelocityAnnotation;  // From velocity
  phaseState: PhaseAnnotation;   // From note phase
}
```

### Chord Shape Geometry

The vocabulary computes chord shapes using the radial wedge algorithm:

```ts
// In packages/contracts/annotated/annotated.ts

type RadiusTier = "triadic" | "seventh" | "extension";

interface ChordShapeElement {
  angle: number;           // 0-360, root at 0° (12 o'clock)
  radius: number;          // 1.0, 0.618, or 0.382
  tier: RadiusTier;
  style: "wedge" | "line"; // Wedge for diatonic, line for chromatic
  interval: string;        // e.g., "3", "♭7", "♯9"
}

type MarginStyle =
  | "straight"    // Major
  | "wavy"        // Minor
  | "concave"     // Diminished
  | "convex"      // Augmented
  | "dash-short"  // Sus2
  | "dash-long";  // Sus4

interface ChordShapeGeometry {
  elements: ChordShapeElement[];
  margin: MarginStyle;
  rootAngle: 0;            // Always 0° (12 o'clock)
}

interface AnnotatedChord {
  chord: MusicalChord;
  visual: VisualAnnotation;
  noteIds: NoteId[];
  shape: ChordShapeGeometry;  // Computed by vocabulary (Invariant I18)
}
```

### Constants

```ts
// In packages/contracts/intents/colors.ts

const RADIUS_BY_TIER = {
  triadic: 1.0,
  seventh: 0.618,
  extension: 0.382,
} as const;

const INTERVAL_ANGLES: Record<number, number> = {
  0: 0,     // Root
  1: 30,    // ♭2/♭9
  2: 60,    // 2/9
  3: 90,    // ♭3
  4: 120,   // 3
  5: 150,   // 4/11
  6: 180,   // ♯4/♭5
  7: 210,   // 5
  8: 240,   // ♯5/♭6
  9: 270,   // 6/13
  10: 300,  // ♭7
  11: 330,  // 7
} as const;
```

### PaletteRef Population

```ts
// For a note:
palette.primary.h = pcToHue(note.pitch.pc, invariant);
palette.primary.s = 0.8;  // Base saturation
palette.primary.v = octaveToBrightness(note.pitch.octave);  // 0.3-0.95

// For a chord:
palette.primary.h = pcToHue(chord.root, invariant);
palette.primary.s = chordSaturation(chord.quality);  // Minor slightly desaturated
palette.primary.v = averageOctaveBrightness(chord.voicing);
```

## Invariants

| ID | Invariant | Meaning |
|----|-----------|---------|
| I14 | Pitch-class to hue is inviolable | Same pitch class always produces same hue; grammars cannot override |
| I15 | Octave to brightness is mandatory | Lower octaves darker, higher brighter |
| I16 | Velocity affects visual prominence | Louder notes must be more visually salient |
| I17 | Note phase affects intensity | Released notes must fade |
| I18 | Chord quality determines shape geometry | Radial wedge algorithm is fixed; grammars receive shapes |

These extend the invariants defined in SPEC_003.

## Implementation

The canonical implementation is `MusicalVisualVocabulary` in `packages/engine/src/vocabulary/MusicalVisualVocabulary.ts` (to be created).

### Helper Functions (in contracts)

```ts
// In packages/contracts/intents/colors.ts
function octaveToBrightness(octave: number, config?: OctaveBrightnessConfig): number;
function velocityToSizeMultiplier(velocity: Velocity, config?: VelocitySizeConfig): number;
function velocityToAttackMs(velocity: Velocity, config?: VelocityAttackConfig): number;
```

### Builder Function (in engine)

```ts
// In packages/engine/src/vocabulary/chordShape.ts (to be created)
function buildChordShape(chord: MusicalChord): ChordShapeGeometry;
```

## What This Spec Does NOT Cover

- Specific rendering implementations (grammar responsibility)
- Chord detection algorithms (stabilizer responsibility)
- Spatial layout strategies
- Animation timing details beyond phase envelope
- Audio-derived feature mappings (future work)

## Contract Location

**Pipeline interface:**
- `IVisualVocabulary`: `packages/contracts/pipeline/interfaces.ts`

**Annotated types:**
- `VisualAnnotation`, `AnnotatedNote`, `AnnotatedChord`: `packages/contracts/annotated/annotated.ts`
- `VelocityAnnotation`, `PhaseAnnotation`: `packages/contracts/annotated/annotated.ts`
- `ChordShapeGeometry`, `ChordShapeElement`, `MarginStyle`, `RadiusTier`: `packages/contracts/annotated/annotated.ts`

**Helper functions and constants:**
- `PitchHueInvariant`, `pcToHue`: `packages/contracts/intents/colors.ts`
- `octaveToBrightness`, `velocityToSizeMultiplier`, `velocityToAttackMs`: `packages/contracts/intents/colors.ts`
- `RADIUS_BY_TIER`, `INTERVAL_ANGLES`, `INTERVAL_LABELS`: `packages/contracts/intents/colors.ts`

## Relationship to Other Specs

- **SPEC_002**: Pitch-class to hue mapping (extended with I14)
- **SPEC_003**: Instrument identity invariants (extended with I14-I18)
- **SPEC_006**: Ruleset statefulness (vocabulary remains pure)
- **SPEC_009**: Frame types (AnnotatedMusicalFrame structure unchanged, AnnotatedNote/AnnotatedChord extended)
