# RFC 0012: Harmonic Series Overlay

Status: Draft (design agreed in conversation 2026-10-06; awaiting SVG promotion)
Author(s): Synesthetica
Date: 2026-10-06

### Related

- PRINCIPLES.md §4 (Perceptual Honesty), §9 (Observation Over Synthesis), §3 (Emergent Power from Primitives), §8 (Experiential Feedback Through Simulation)
- SPEC 010 — Visual Vocabulary (invariants I14–I18; chord shape elements)
- SPEC 012 — Polyphonic Audio Input (reserves a slot for spectral features; the measured-partials future path)
- packages/engine/src/lenses/README.md — promotion-through-SVG development method
- synesthetica-2rlv — tracking issue

## Summary

An optional overlay showing the harmonic series each sounding note *implies*: faint, fuzzy "ghost strips" in the rhythm lens at the real pitch of a note's lower partials, with opacity tied to a modelled partial level. Off by default. Partials are vocabulary annotations, never musical notes; nothing upstream of the vocabulary sees them.

The goal is a harmony lesson, not a timbre model. The information is in the interaction between notes: shared partials pile up where intervals cohere, and the overlay makes that coincidence visible so the player can perceive why a fifth sits inside a root, why a major triad's partials land on its 7th and 9th, and why the dominant seventh's ♭7 is already present in the root's series.

A chord-glyph treatment is deferred until the rhythm-lens version proves the idea.

## Motivation

Synesthetica builds musical intuition by representing what was played. The harmonic series is the physical reason intervals sound the way they do, but it is invisible in note events: two notes a fifth apart are just two strips. Overlaying each note's implied series lets perception do the work Principle 9 asks of it — the viewer sees a G land inside C's strongest ghost, or a B light up under a C major triad where none was played, and extracts the pattern themselves.

The user's stated intent: "I'm curious to see how I might try new things given a visual representation of harmonic interplay due to overtones."

## Principles check

**Perceptual honesty (§4).** MIDI carries no timbre. Any partial level we draw is modelled, not observed: a sine has no partials, a square wave has no even ones. This is therefore a *theoretical overlay* in the same class as the harmony clock's implied-resolution arcs, and it must be named and explained as such — in the manifest concept, the primer, and the panel tooltip. It is never "your overtones". Default off.

**Observation over synthesis (§9).** The overlay is synthesis, but it meets the spec's own test: the relationship (partial coincidence across notes) cannot be perceived from the raw observations, and it is cross-domain (acoustics → harmony).

**Emergent power from primitives (§3).** No new visual primitive. Ghost strips reuse the note-strip entity and shader; the only additions are two continuous parameters whose extremes are legible (see §Parameters).

**Real-time respect (§5).** Entity count grows by up to the partial cap per note. Mitigated by the cap and by culling below an opacity threshold (§Performance).

## Decisions already made (2026-10-06)

1. Envelope is **bloom at onset, then faster fade than the fundamental** — not a swell.
2. Partials are placed at their **real pitch**, not snapped to the pitch-class column.
3. Partials are **vocabulary annotations, never `Note`s**. Chord detection, dynamics and harmony stabilizers are unaffected, and the overlay must not read as notes beyond what was played.
4. Controls are **continuous**, not boolean. Level 0 is off.
5. Register is **"there-but-not-there"**: fuzzy, ghostly implication, visually distinct from the clean strips of what was played.
6. **Chord glyph deferred.** When it comes, it is a colourful smudge *outside* the glyph outline, not more lines inside it.
7. Ghost **colour is undecided** (column hue vs fundamental hue) and will be chosen from SVG snapshots.
8. Contract is designed so a **measured** partial provider (audio spectral features, SPEC 012) can replace the model later without touching lenses.

## The model

### What the display reduces to

Both lenses are octave-agnostic, so partials 2, 4, 8, 16 collapse onto the fundamental. The visible content of a single note is a fixed stencil translated by root:

| Partial n | 12·log₂(n) mod 12 | Interval | ET deviation | Level at 1/n |
|---|---|---|---|---|
| 3 (6, 12) | 7.02 | P5 | +2 ¢ | 0.33 |
| 5 (10) | 3.86 | M3 | −14 ¢ | 0.20 |
| 7 (14) | 9.69 | m7 | −31 ¢ | 0.14 |
| 9 | 2.04 | M2 | +4 ¢ | 0.11 |
| 11 | 5.51 | tritone-ish | −49 ¢ | 0.09 |
| 13 | 8.41 | m6-ish | +41 ¢ | 0.08 |
| 15 | 11.88 | M7 | −12 ¢ | 0.07 |

Octave-duplicate partials (6, 10, 12, 14) add to the level of the pitch class they land on rather than drawing a second strip.

Default cap: partials up to **n = 9** (P5, M3, m7, M2). The 7th partial is the pedagogically important one (dominant seventh) and must survive the default cap. 11 and 13 are available by raising the cap and are expected to read as noise.

### Level

```
level(n, velocity, age) = gain · n^(−rolloff) · bright(velocity, n) · decay(n, age)
```

- `gain` — the user-facing level macro, 0..1. 0 disables the overlay and emits no entities.
- `rolloff` — exponent, user-facing. 1.0 ≈ sawtooth (−6 dB/octave), 2.0 is piano/pluck-like (−12 dB/octave). Flat (0) gives an equal chromatic wash; steep (≥3) leaves only the fifth. Both extremes are legible, which is the Principle 3 test.
- `bright(velocity, n)` — harder strikes raise upper partials relative to the fundamental. Modelled as a small velocity-dependent reduction of the effective rolloff. This is the one velocity mapping and it satisfies I16 for ghosts without them competing with the fundamental.
- `decay(n, age)` — exponential, with a time constant that shortens as n rises: `τ(n) = τ₁ / n^k`. The fundamental's own strip keeps its existing phase-based opacity; only the ghosts decay faster. Rendered as a linear top→bottom opacity gradient on the strip (onset level at the top, current level at the bottom), which the existing shader already supports.

All of the above are named constants (docs/tunables.md convention): `PARTIAL_CAP`, `PARTIAL_ROLLOFF_DEFAULT`, `PARTIAL_VELOCITY_BRIGHTENING`, `PARTIAL_DECAY_TAU_MS`, `PARTIAL_DECAY_EXPONENT`, `GHOST_CULL_OPACITY`, `GHOST_WIDTH_RATIO`, `GHOST_EDGE_SOFTNESS`.

This models the harmonic series with a generic rolloff. It does not model the piano or any instrument.

### Real pitch

A partial's position is `root + 12·log₂(n)` in continuous semitones. The rhythm lens x-axis is already continuous (`pitchClassToX` is linear in pc), so a 7th partial sits 0.31 semitones left of the ♭7 column. Chord-glyph angles are likewise continuous (30° per semitone). This is cheap, more honest, makes the ghost visibly not-a-note, and shows why the 7th partial fights equal temperament. Positions wrap mod 12 for the octave-agnostic lenses.

## Pipeline placement

Partials are computed in the vocabulary stage (`MusicalVisualVocabulary.annotateNote`) and attached to the annotated note. They are not in `MusicalFrame`; stabilizers never see them.

### Contract additions (proposed)

```ts
// packages/contracts/annotated/annotated.ts

/** One modelled (or, later, measured) partial of a sounding note.
 *  Not a Note: stabilizers never see partials, and lenses must not
 *  render them as if they were played. */
export interface HarmonicPartial {
  /** Harmonic number ≥ 2 (octave duplicates already folded in) */
  n: number;
  /** Position above the fundamental in continuous semitones (12·log₂ n mod 12) */
  semitones: number;
  /** Nearest pitch class, for column lookup and hue */
  pc: PitchClass;
  /** Deviation from that pitch class in cents */
  cents: number;
  /** Level at onset, 0..1 (gain, rolloff and velocity applied) */
  onsetLevel: number;
  /** Level now, 0..1 (decay applied) */
  level: number;
  /** Hue, per the colour decision (column pc or fundamental) */
  color: ColorHSVA;
}

export interface AnnotatedNote {
  // ...existing fields
  /** Present only when the harmonic series overlay is enabled (gain > 0). */
  partials?: HarmonicPartial[];
}
```

```ts
// packages/contracts/pipeline/interfaces.ts (or a new contracts/acoustics module)

/** Supplies partial levels for a note. The modelled provider is the only
 *  implementation now; an audio-derived provider is the SPEC 012 future. */
export interface PartialLevelProvider {
  partials(note: Note, t: Ms, params: PartialModelParams): HarmonicPartial[];
}
```

The provider boundary is the composability seam: the vocabulary calls it, lenses read `partials`, and swapping the model for measurement is invisible downstream.

### Invariant (proposed, to be numbered in SPEC 010)

**Partials are not notes.** No stage upstream of the vocabulary receives partials; no lens renders a partial with the same entity treatment as a played note. The overlay must not read as notes the player did not play.

## Rhythm lens treatment

For each annotated note with `partials`, emit one ghost strip per partial:

- Entity `kind: "particle"`, `data.type: "ghost-strip"`, id `${lens}:ghost-${note.id}-${n}`.
- `x = pitchToX(note.pc + partial.semitones)` using the existing continuous mapping; wraps mod 12.
- Time extent identical to the fundamental's strip (onset → end or NOW line), so ghosts scroll with their note.
- `topOpacity = partial.onsetLevel · screenFade(top)`, `bottomOpacity = partial.level · screenFade(bottom)`, composing with the existing screen-position fade.
- Width `GHOST_WIDTH_RATIO` × note-strip width (thinner).
- No entity when `max(topOpacity, bottomOpacity) < GHOST_CULL_OPACITY`, and no entity at all when gain is 0.

**Renderer change (the only one required):** the note-strip ShaderMaterial gains an `edgeSoftness` uniform; the fragment shader multiplies opacity by a horizontal falloff (`smoothstep` from the strip's centre to its edge) so ghosts have no hard edges. Fundamentals keep `edgeSoftness = 0`. This is what carries the "there-but-not-there" register; opacity alone is already used for release phase and screen position and cannot carry it.

**Colour** — decided from snapshots:
- *Column hue*: the ghost at the G column is G-coloured. Honours "colour encodes pitch class" (I14 as stated in the `note-strip` concept). Risk: reads as a quietly played G.
- *Fundamental hue*: C's red in the G column. Carries provenance and shows coincidence as colour mixing; unmistakably not a played note. Breaks the column-colour expectation and needs an explicit I14 exception in SPEC 010.

## Chord glyph treatment (deferred)

Not in the first increment. Direction agreed: a colourful smudge outside the glyph outline rather than additional lines inside it, so the glyph's interval structure stays clean. This requires per-element opacity in the chord-shape renderer (today opacity is per entity only) and a new `ChordShapeElement.style` (e.g. `"halo"`) built in the vocabulary per I18. Clutter is the risk: a major triad's partials land on 9 of 12 angles. Revisit after the rhythm-lens proof, probably with aggregation (one halo per pitch class at summed level, thresholded) rather than per-tone elements.

## Parameters and control surface

Two continuous macros, vocabulary-scoped (precedent: `system:colour-mapping:reference`, consumed by `musical-visual`):

| Macro | Range | Default | Extremes |
|---|---|---|---|
| `system:harmonic-series:level` | 0..1 | 0 (off) | 0: no overlay, no entities. 1: ghosts at full modelled level. |
| `system:harmonic-series:rolloff` | 0..3 | 2.0 | 0: equal chromatic wash. 3: only the fifth survives. |

Manifest `notes` and `humanNotes` must state that the overlay is the theoretical harmonic series, not a measurement of the instrument. The primer explains the harmony-lesson reading (shared partials, dominant seventh, major vs minor third) so the LLM can point the player at what to look for.

Partial cap and decay constants stay file-level tunables for now; promote to macros only if snapshot review shows they need live adjustment.

## Performance

Worst case: 4 ghosts per note with a 10 s release window. Dense playing at ~8 notes/s gives ~80 notes on screen and ~320 ghost meshes before culling. Expect the decay model to cull most ghosts well before the window ends. Measure entity counts in the simulation harness; if it is not comfortably within budget, reduce the default cap to n = 7 before considering mesh batching.

## Development method

Per packages/engine/src/lenses/README.md:

1. **ASCII diagram** of C→G melodic and C major triad with ghosts, agreed before code.
2. **SVG snapshots** (`GENERATE_SNAPSHOTS=1`) for: C→G melodic, C–E–G, G7, M3 dyad vs m3 dyad, a dense passage. Decide colour here.
3. **Metric**: per-column summed ghost energy per frame. The lesson is real if the summed energy at B and D under C major, and at F under G7, is visibly above the noise floor while the m3 dyad shows no reinforcement.
4. Promote to the WebGL renderer; tune `GHOST_EDGE_SOFTNESS` and width by eye.

## Proposed glossary terms

- **Harmonic series overlay** — the feature; the optional display of each note's implied partials.
- **Partial** — one modelled component of a note's harmonic series; a vocabulary annotation, not a note.
- **Ghost strip** — the rhythm-lens rendering of a partial: a thinner, soft-edged, translucent strip at the partial's real pitch.

## Open questions

1. Ghost colour: column hue or fundamental hue (snapshot decision).
2. Does a linear top→bottom gradient represent the decay well enough, or does a long note need the strip split into segments?
3. Should ghosts of released notes keep decaying after release, or vanish with the note? (Proposed: keep decaying; they are already faint.)
4. Default rolloff 1.0 vs 2.0 — snapshot decision.
5. Whether the velocity-brightening term earns its place or is a complication the eye cannot read.

## Distance from spec

Spec-ready now: the contract additions, the provider seam, the partials-are-not-notes invariant, the macro ids, and the honesty framing. Not spec-ready: colour, edge treatment, defaults, and anything about the glyph. Expect one snapshot round in the rhythm lens, then a SPEC 010 amendment (new invariant, `HarmonicPartial`, I14 exception if fundamental hue wins) rather than a new spec.

## Non-goals

- Modelling timbre or any specific instrument.
- Measured spectra (future, via SPEC 012 spectral features; the provider seam is for this).
- Inharmonicity, stretched tuning, or partials above n = 15.
- Any change to chord detection, dynamics or harmony stabilizers.
- The chord-glyph treatment, in this increment.
