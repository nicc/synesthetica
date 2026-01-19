# RFC 006: Annotated Musical Frames and Grammar Responsibility

Status: Implemented
Author(s): Synesthetica
Date: 2026-01-19
Related: RFC 005 (Pipeline Frame Types), RFC 002 (CMS + Grammar API)

## Summary

Revise the pipeline data flow so that:
1. **Rulesets** annotate musical elements with visual properties (palette, texture, jitter) rather than emitting abstract visual intents
2. **Grammars** receive annotated musical elements and decide *how* to render them (shapes, animations, emphasis)
3. **Grammars** are explicitly aware of a finite set of musical element categories (notes, chords, beats, bars, phrases)

This shifts creative agency: rulesets define a *consistent visual scheme*, grammars make *interpretive rendering choices*.

## Motivation

### Problem 1: Grammars Lack Creative Agency

In RFC 005, grammars receive pure visual intents like `{ type: "palette", base: "#ff0000", stability: 0.8 }`. The ruleset decides *what* to render and *how* it should look. Grammars are reduced to rendering engines that draw what they're told.

This prevents grammars from making meaningful interpretive choices:
- A "rhythm-focused" grammar cannot choose to emphasize beats over harmony
- A "chord progression" grammar cannot decide to render chords as persistent trails
- Grammars cannot focalise (emphasize/de-emphasize) musical elements based on their nature

### Problem 2: Rulesets Make Rendering Decisions

Currently, if a ruleset wants a note to appear as a particle, it must emit a particle-like intent. If it wants a chord to appear as a color wash, it must emit a different intent type. This couples the ruleset to specific visual representations.

Different grammars might want to render the *same* musical content in completely different ways:
- Grammar A: Notes as particles, chords as expanding blooms
- Grammar B: Notes as timeline markers, chords as background color shifts
- Grammar C: Only chords, shown as a horizontal progression trail

The ruleset shouldn't dictate these choices.

### Problem 3: Visual Intents Lack Musical Context

When a grammar receives `{ type: "palette", base: "#ff0000" }`, it doesn't know whether this represents a note, a chord, a beat, or something else. This matters because:
- A note might warrant a quick, ephemeral visual
- A chord might warrant a more persistent, structural visual
- A beat might warrant a rhythmic pulse
- A phrase boundary might warrant a transition effect

Without knowing *what* musical element triggered the intent, grammars cannot make these distinctions.

## Goals

- **G1**: Grammars can make interpretive choices about how to render musical elements
- **G2**: Rulesets define a consistent visual scheme (what colors/textures mean) without dictating rendering
- **G3**: Users develop intuition about the visual language across different grammars
- **G4**: Grammars remain isolated from raw MIDI/audio data
- **G5**: The architecture supports grammar composition (multiple grammars rendering different aspects)

## Non-Goals

- **NG1**: Solving grammar composition conflicts (deferred to experimentation)
- **NG2**: Defining all possible musical element categories
- **NG3**: Defining all possible visual annotation properties

## Design

### Revised Pipeline Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Pipeline                                        │
│                                                                              │
│  ┌──────────────┐                                                            │
│  │   Adapters   │  adapter.nextFrame() → RawInputFrame                       │
│  └──────┬───────┘                                                            │
│         │ RawInputFrame (MIDI/audio protocol events)                         │
│         ▼                                                                    │
│  ┌──────────────┐                                                            │
│  │  Stabilizers │  stabilizer.apply(raw) → MusicalFrame                      │
│  └──────┬───────┘                                                            │
│         │ MusicalFrame (notes, chords, beats - musical abstractions)         │
│         ▼                                                                    │
│  ┌──────────────┐                                                            │
│  │   Ruleset    │  ruleset.annotate(musical) → AnnotatedMusicalFrame         │
│  └──────┬───────┘                                                            │
│         │ AnnotatedMusicalFrame (musical elements + visual properties)       │
│         ▼                                                                    │
│  ┌──────────────┐                                                            │
│  │   Grammars   │  grammar.update(annotated, prev) → SceneFrame              │
│  └──────┬───────┘                                                            │
│         │                                                                    │
│         └─────────────────────────┐                                          │
│                                   ▼                                          │
│                          ┌──────────────┐                                    │
│                          │  Compositor  │  compose([scenes]) → SceneFrame    │
│                          └──────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Change: AnnotatedMusicalFrame

Instead of `IntentFrame` (pure visual intents), rulesets produce `AnnotatedMusicalFrame`:

```ts
/**
 * The output of a ruleset: musical elements annotated with visual properties.
 * Grammars receive this and decide how to render each element.
 */
export interface AnnotatedMusicalFrame {
  t: Ms;
  part: PartId;

  /** Annotated notes - grammars decide how/whether to render */
  notes: AnnotatedNote[];

  /** Annotated chords - grammars decide how/whether to render */
  chords: AnnotatedChord[];

  /** Beat/meter information with visual annotations */
  beat: AnnotatedBeat | null;

  /** Bar boundaries with visual annotations */
  bars: AnnotatedBar[];

  /** Phrase boundaries with visual annotations */
  phrases: AnnotatedPhrase[];

  /** Global dynamics with visual annotations */
  dynamics: AnnotatedDynamics;
}
```

### Visual Annotations

Each musical element carries visual annotations that the ruleset assigns based on the musical context:

```ts
/**
 * Visual properties that rulesets assign to musical elements.
 * These define "what this looks like" without specifying "what shape it is".
 */
export interface VisualAnnotation {
  /** Color palette for this element */
  palette: PaletteRef;

  /** Texture characteristics */
  texture: TextureRef;

  /** Motion characteristics */
  motion: MotionAnnotation;

  /**
   * Confidence/uncertainty for this specific element's visual mapping.
   * Distinct from the underlying musical element's detection confidence.
   * e.g., chord detection may have low confidence → high visual uncertainty
   * while note detection is typically high confidence → low visual uncertainty
   */
  uncertainty: Confidence;

  /** Optional label for debugging/display (not used for rendering decisions) */
  label?: string;
}

export interface PaletteRef {
  id: PaletteId;
  /** Resolved colors - grammars use these */
  primary: ColorHSVA;
  secondary?: ColorHSVA;
  accent?: ColorHSVA;
}

export interface TextureRef {
  id: TextureId;
  /** Resolved texture parameters */
  grain: number;        // 0-1
  smoothness: number;   // 0-1
  density: number;      // 0-1
}

export interface MotionAnnotation {
  /** How much this element should "jitter" or be unstable */
  jitter: number;       // 0-1

  /** Pulsing intensity (for rhythmic elements) */
  pulse: number;        // 0-1

  /** Flow direction/intensity */
  flow: number;         // -1..1 (negative = contracting, positive = expanding)
}
```

### Annotated Musical Elements

Each musical element type carries its musical data plus visual annotations:

```ts
/**
 * A note with visual annotations.
 * The note data comes from stabilizers; annotations come from ruleset.
 */
export interface AnnotatedNote {
  /** The underlying musical note */
  note: Note;

  /** Visual properties assigned by ruleset */
  visual: VisualAnnotation;
}

/**
 * A chord with visual annotations.
 *
 * Note: References are one-directional (chord → notes) to keep stabilizer
 * logic simple. Chords already track their constituent noteIds from detection.
 * Grammars that need to find which chord a note belongs to can iterate
 * through chords and check noteIds membership - the data volume is small.
 */
export interface AnnotatedChord {
  /** The underlying musical chord */
  chord: MusicalChord;

  /** Visual properties assigned by ruleset */
  visual: VisualAnnotation;

  /** IDs of constituent notes (from chord detection) */
  noteIds: NoteId[];
}

/**
 * Beat information with visual annotations.
 */
export interface AnnotatedBeat {
  /** Current beat state */
  beat: BeatState;

  /** Visual properties for beat visualization */
  visual: VisualAnnotation;

  /** Beat number within bar (1-indexed) */
  beatInBar: number;

  /** Whether this is a downbeat (beat 1) */
  isDownbeat: boolean;
}

/**
 * Bar boundary information.
 */
export interface AnnotatedBar {
  /** When this bar started */
  onset: Ms;

  /** Bar number (1-indexed from session start) */
  barNumber: number;

  /** Visual properties for bar boundary */
  visual: VisualAnnotation;
}

/**
 * Phrase boundary information.
 */
export interface AnnotatedPhrase {
  /** When this phrase started */
  onset: Ms;

  /** Phrase type (e.g., "call", "response", "bridge") */
  type: PhraseType;

  /** Visual properties for phrase boundary */
  visual: VisualAnnotation;
}

/**
 * Dynamics state with visual annotations.
 */
export interface AnnotatedDynamics {
  /** Current dynamics state */
  dynamics: DynamicsState;

  /** Visual properties for dynamics visualization */
  visual: VisualAnnotation;
}
```

### Interface Updates

#### IRuleset (Revised)

```ts
/**
 * Rulesets annotate musical frames with visual properties.
 * They do NOT decide what shapes or rendering techniques to use.
 */
export interface IVisualRuleset {
  id: string;

  /**
   * Annotate a musical frame with visual properties.
   *
   * The ruleset:
   * - Assigns palettes based on harmonic content
   * - Assigns textures based on timbral qualities
   * - Assigns motion properties based on rhythmic/dynamic context
   *
   * The ruleset does NOT:
   * - Decide what shape a note should be
   * - Filter out musical elements
   * - Make rendering decisions
   */
  annotate(frame: MusicalFrame): AnnotatedMusicalFrame;
}
```

#### IVisualGrammar (Revised)

```ts
/**
 * Grammars receive annotated musical frames and produce visual scenes.
 * They decide HOW to render each musical element (or whether to render it at all).
 */
export interface IVisualGrammar {
  id: string;

  init(context: GrammarContext): void;
  dispose(): void;

  /**
   * Process an annotated frame and produce a scene.
   *
   * The grammar:
   * - Decides which musical elements to render
   * - Decides what visual representation to use (particles, shapes, trails, etc.)
   * - Uses the visual annotations to style its chosen representations
   * - Maintains entity state across frames
   *
   * The grammar is aware of musical element categories (notes, chords, beats, etc.)
   * but uses them only for rendering decisions, not musical analysis.
   */
  update(input: AnnotatedMusicalFrame, previous: SceneFrame | null): SceneFrame;
}
```

### What Grammars Know

Grammars are explicitly aware of:

1. **Musical element categories**: note, chord, beat, bar, phrase
2. **Element lifecycle**: phase (attack/sustain/release for notes, active/decaying for chords)
3. **Element relationships**: which notes belong to which chord
4. **Visual annotations**: palette, texture, motion properties

Grammars do NOT know:
- Raw MIDI or audio data
- Pitch class, key, or harmonic analysis details
- Tempo detection internals
- Chord quality or voicing details (unless they choose to use `label`)

The key principle: **grammars know *categories* of musical elements, not musical *analysis***.

A grammar knows "this is a chord" and "it has this palette." It doesn't need to know "this is a Cmaj7 in first inversion" unless it explicitly wants to display that label.

**Critical design constraint**: Because grammars don't know chord quality, the ruleset MUST assign visually consistent annotations to similar musical concepts. All minor chords must share visual characteristics that distinguish them from major chords. All dominant 7ths must be visually distinguishable from major 7ths. This is the ruleset's core responsibility—defining a visual vocabulary that encodes musical meaning without grammars needing to understand that meaning.

### Example: Ruleset Annotation

> **Note**: The warm/cool palette example below is a placeholder for testing.
> A production ruleset will need a more nuanced palette system that:
> - Distinguishes more chord qualities (maj, min, dim, aug, dom7, maj7, min7, etc.)
> - Considers how chord colors interact with note colors
> - Potentially varies by harmonic context (same chord may look different in different keys)
>
> This is a product design challenge we'll iterate on. The architecture supports
> arbitrary palette complexity—the example is intentionally simple.

```ts
class WarmHarmonyRuleset implements IVisualRuleset {
  // PLACEHOLDER: Simple warm/cool for testing. Production will need richer palettes.
  private warmPalette: PaletteRef = {
    id: "warm-1",
    primary: { h: 30, s: 0.8, v: 0.9, a: 1 },   // Orange
    secondary: { h: 45, s: 0.7, v: 0.85, a: 1 }, // Gold
    accent: { h: 0, s: 0.9, v: 1, a: 1 },        // Red
  };

  private coolPalette: PaletteRef = {
    id: "cool-1",
    primary: { h: 220, s: 0.7, v: 0.85, a: 1 },  // Blue
    secondary: { h: 180, s: 0.6, v: 0.8, a: 1 }, // Cyan
    accent: { h: 280, s: 0.8, v: 0.9, a: 1 },    // Purple
  };

  annotate(frame: MusicalFrame): AnnotatedMusicalFrame {
    const annotatedNotes: AnnotatedNote[] = frame.notes.map(note => ({
      note,
      visual: {
        palette: this.getPaletteForNote(note, frame),
        texture: this.getTextureForNote(note),
        motion: this.getMotionForNote(note),
        uncertainty: note.confidence, // Notes from MIDI are high confidence
        label: this.formatNoteLabel(note), // Optional: "C4", "E5", etc.
      },
    }));

    const annotatedChords: AnnotatedChord[] = frame.chords.map(chord => ({
      chord,
      visual: {
        palette: this.getPaletteForChord(chord),
        texture: this.getTextureForChord(chord),
        motion: this.getMotionForChord(chord),
        uncertainty: 1 - chord.confidence, // Chord detection has varying confidence
        label: this.formatChordLabel(chord), // Optional: "Cmaj7", "Dm", etc.
      },
      noteIds: chord.noteIds,
    }));

    return {
      t: frame.t,
      part: frame.part,
      notes: annotatedNotes,
      chords: annotatedChords,
      beat: frame.beat ? this.annotateBeat(frame.beat) : null,
      bars: [],  // Bar detection not yet implemented
      phrases: [], // Phrase detection not yet implemented
      dynamics: this.annotateDynamics(frame.dynamics),
    };
  }

  private getPaletteForChord(chord: MusicalChord): PaletteRef {
    // Major chords get warm palette, minor get cool
    // This is the "consistent visual scheme" - same mapping across all grammars
    return chord.quality === "maj" ? this.warmPalette : this.coolPalette;
  }

  private getMotionForChord(chord: MusicalChord): MotionAnnotation {
    return {
      jitter: chord.confidence < 0.8 ? 0.3 : 0.1, // Low confidence = more jitter
      pulse: chord.phase === "active" ? 0.5 : 0.2,
      flow: 0.3, // Gentle expansion
    };
  }

  // ... other annotation methods
}
```

### Example: Grammar Interpretation

```ts
/**
 * A rhythm-focused grammar that emphasizes beats and note timing.
 * Renders notes as timing indicators, largely ignores harmonic content.
 */
class RhythmGrammar implements IVisualGrammar {
  update(input: AnnotatedMusicalFrame, previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];

    // Render beat as a central pulse
    if (input.beat) {
      entities.push(this.createBeatPulse(input.beat));
    }

    // Render notes as timing markers on a timeline
    // Use palette from annotations, but ignore texture (not relevant for this grammar)
    for (const annotatedNote of input.notes) {
      entities.push(this.createTimingMarker(annotatedNote));
    }

    // This grammar ignores chords entirely - they're not relevant to rhythm
    // (input.chords is available but unused)

    return { t: input.t, entities, diagnostics: [] };
  }

  private createTimingMarker(an: AnnotatedNote): Entity {
    // Position based on note onset relative to beat
    // Color from palette, size from velocity
    return {
      type: "line",
      position: this.calculateTimelinePosition(an.note),
      style: {
        color: an.visual.palette.primary,
        width: 2 + an.note.velocity / 127 * 4,
        // Apply jitter from motion annotation
        transform: {
          jitter: an.visual.motion.jitter * 5
        },
      },
    };
  }
}

/**
 * A harmony-focused grammar that emphasizes chord progressions.
 * Renders chords as persistent color regions, notes as particles within.
 */
class ChordProgressionGrammar implements IVisualGrammar {
  private chordHistory: Array<{ chord: AnnotatedChord; fadeStart: Ms }> = [];

  update(input: AnnotatedMusicalFrame, previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];

    // Track chord history for progression trail
    this.updateChordHistory(input);

    // Render chord progression as horizontal bands
    for (const entry of this.chordHistory) {
      entities.push(this.createChordBand(entry));
    }

    // Render active chord as a central glow
    for (const annotatedChord of input.chords) {
      if (annotatedChord.chord.phase === "active") {
        entities.push(this.createChordGlow(annotatedChord));
      }
    }

    // Render notes as small particles within the chord glow
    // Find which notes belong to active chords by checking chord.noteIds
    const notesInChords = new Set(
      input.chords.flatMap(ac => ac.noteIds)
    );
    for (const annotatedNote of input.notes) {
      if (notesInChords.has(annotatedNote.note.id)) {
        entities.push(this.createNoteParticle(annotatedNote));
      }
    }

    // This grammar ignores beat/bar information

    return { t: input.t, entities, diagnostics: [] };
  }

  private createChordGlow(ac: AnnotatedChord): Entity {
    return {
      type: "radialGradient",
      position: { x: 0.5, y: 0.5 }, // Center
      style: {
        innerColor: ac.visual.palette.primary,
        outerColor: { ...ac.visual.palette.primary, a: 0 },
        radius: 0.3,
        // Apply pulse from motion annotation
        pulseIntensity: ac.visual.motion.pulse,
      },
    };
  }
}
```

## Division of Responsibility

| Concern | Responsible Component |
|---------|----------------------|
| Protocol translation (MIDI → events) | Adapters |
| Musical abstraction (events → notes, chords) | Stabilizers |
| Visual scheme (what colors/textures mean) | Rulesets |
| Rendering decisions (what shapes, what to show) | Grammars |
| Layer composition | Compositor |

### What Each Component Decides

**Stabilizers decide:**
- When a note starts and ends
- What constitutes a chord
- Beat/tempo detection
- Phrase boundaries

**Rulesets decide:**
- Major = warm colors, minor = cool colors
- High velocity = high saturation
- Low confidence = high jitter
- The consistent visual vocabulary users learn

**Grammars decide:**
- Notes become particles (or lines, or nothing)
- Chords become glows (or bands, or color washes)
- Whether to show beats, bars, phrases
- How to emphasize or de-emphasize elements
- Spatial layout and animation

## Open Questions

### Q1: Grammar Composition

When multiple grammars run simultaneously, how do their outputs combine?

**Options considered:**
- **A. Layer independently**: Compositor stacks scenes by z-order. Risk: visual mud.
- **B. Spatial partitioning**: Grammars claim screen regions. Risk: complex coordination.
- **C. Single grammar per concern**: One grammar handles all rendering. Risk: monolithic grammars.
- **D. Entity-level merging**: Compositor merges entities intelligently. Risk: conflict resolution complexity.

**Current stance**: Defer to experimentation. Start with Option A (simple layering) and observe what problems emerge. The architecture doesn't preclude other approaches.

### Q2: Musical Element Granularity

The current design includes: notes, chords, beats, bars, phrases.

Should we add:
- Melodic contour?
- Harmonic function (tonic/dominant/etc.)?
- Articulation (staccato/legato)?
- Dynamics (crescendo/diminuendo as distinct elements)?

**Current stance**: Start minimal. Add elements as grammars demonstrate need.

### Q3: Visual Annotation Granularity

How much detail should visual annotations carry?

- **Minimal**: Just palette ID, texture ID, motion numbers
- **Resolved**: Include fully resolved colors, not just IDs
- **Rich**: Include gradients, animation curves, etc.

**Current stance**: Resolved (include colors). Grammars shouldn't need to look up palette definitions.

## Validation Plan

Before committing to implementation, validate the architecture with:

1. **Mock AnnotatedMusicalFrame**: Hand-craft test data representing a simple musical passage
2. **Two toy grammars**:
   - RhythmGrammar: Renders beats and note timing, ignores harmony
   - ChordGrammar: Renders chord progression, ignores rhythm
3. **Composition test**: Run both grammars, observe output quality

If the outputs are individually coherent and combined output is acceptable, proceed with implementation.

## Migration Path

### Phase 1: Contracts
1. Add `AnnotatedMusicalFrame` and related types to `@synesthetica/contracts`
2. Add `IVisualRuleset.annotate()` interface (keep `map()` for compatibility)
3. Update `IVisualGrammar.update()` signature

### Phase 2: Ruleset
1. Implement `annotate()` in `MusicalVisualRuleset`
2. Create annotation helpers for palette/texture/motion

### Phase 3: Validation
1. Create mock annotated frame
2. Implement two toy grammars
3. Test composition
4. Evaluate results

### Phase 4: Full Implementation (if validation passes)
1. Update existing `VisualParticleGrammar` to new interface
2. Update pipeline to use new flow
3. Remove legacy `IntentFrame` code

## Relationship to RFC 005

This RFC **amends** RFC 005:

1. **IntentFrame** is replaced by **AnnotatedMusicalFrame**
2. **VisualIntent** types are replaced by **VisualAnnotation** attached to musical elements
3. **IRuleset.map()** is replaced by **IVisualRuleset.annotate()**
4. Grammars now receive musical element categories (but not musical analysis)

The core data flow (Adapters → Stabilizers → Ruleset → Grammars → Compositor) remains unchanged.

## Summary

This RFC proposes that:
1. Rulesets annotate musical elements with visual properties (the "what it looks like")
2. Grammars decide how to render musical elements (the "what shape it takes")
3. Grammars are aware of musical element categories but not musical analysis
4. Users learn a consistent visual scheme that applies across all grammars

The key insight: **rulesets define vocabulary, grammars write sentences**.
