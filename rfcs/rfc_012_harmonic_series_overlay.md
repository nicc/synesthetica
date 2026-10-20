# RFC 0012: Harmonic Series Overlay

Status: Implemented in the rhythm lens (2026-10-20); canonical text now in SPEC 010 §6 and I31. Open items below remain exploratory.
Author(s): Synesthetica
Date: 2026-10-06

### Related

- PRINCIPLES.md §4 (Perceptual Honesty), §9 (Observation Over Synthesis), §3 (Emergent Power from Primitives), §8 (Experiential Feedback Through Simulation)
- SPEC 010 — Visual Vocabulary (invariants I14–I18; chord shape elements)
- SPEC 012 — Polyphonic Audio Input (reserves a slot for spectral features; the measured-partials future path)
- packages/engine/src/lenses/README.md — promotion-through-SVG development method
- synesthetica-2rlv — tracking issue

## Summary

An optional overlay showing the harmonic series each sounding note *implies*: wide, soft, translucent "overtone strips" in the rhythm lens at the real pitch of a note's lower partials, with opacity set by a modelled partial level. Off by default. Partials are vocabulary annotations, never musical notes; nothing upstream of the vocabulary sees modelled partials.

The goal is a harmony lesson, not a timbre model. The information is in the interaction between notes: shared partials pile up where intervals cohere, and the overlay makes that coincidence visible so the player can perceive why a fifth sits inside a root, why a major triad's partials land on its 9th and major 7th, and why the dominant seventh's ♭7 is already present in the root's series.

A chord-glyph treatment is deferred until the rhythm-lens version proves the idea.

## Motivation

Synesthetica builds musical intuition by representing what was played. The harmonic series is the physical reason intervals sound the way they do, but it is invisible in note events: two notes a fifth apart are just two strips. Overlaying each note's implied series lets perception do the work Principle 9 asks of it — the viewer sees a G played in the column C's strongest overtone strip occupies (inside it when C is held, below it when C was released), or a B light up under a C major triad where none was played, and extracts the pattern themselves.

The user's stated intent: "I'm curious to see how I might try new things given a visual representation of harmonic interplay due to overtones."

## Principles check

**Perceptual honesty (§4).** MIDI carries no timbre. Any partial level we draw is modelled, not observed: a sine has no partials, a square wave has no even ones. This is therefore a *theoretical overlay* in the same class as the harmony clock's implied-resolution arcs, and it must be named and explained as such — in the manifest concept, the primer, and the panel tooltip. It is never "your overtones". Default off.

Overtone strips occupy exactly their fundamental's time extent. They do not extend past the note's end, since that would show a partial sounding after the note stopped.

**Observation over synthesis (§9).** The overlay is synthesis, but it meets the spec's own test: the relationship (partial coincidence across notes) cannot be perceived from the raw observations, and it is cross-domain (acoustics → harmony).

**Emergent power from primitives (§3).** No new visual primitive. Overtone strips reuse the note-strip entity shape and shader; the additions are two continuous parameters whose extremes are legible (see §Parameters) and two shader controls (edge softness, additive blend).

**Real-time respect (§5).** Entity count grows by up to four per note at the default cap. Mitigated by the cap and by culling below an opacity threshold (§Performance).

## Decisions

Agreed 2026-10-06 unless marked.

1. *(Revised 2026-10-20.)* Overtone strips **fade with their note strip**: opacity is the partial level multiplied by the note strip's own opacity at the same point, so the ratio between them holds throughout. This replaces the earlier bloom-at-onset, faster-than-fundamental decay, which needed the strip's gradient to encode a second time course on an axis that already means time.
2. Partials are placed at their **real pitch**, not snapped to the pitch-class column.
3. Partials are **vocabulary annotations, never `Note`s**. Chord detection, dynamics and harmony stabilizers are unaffected, and the overlay must not read as notes beyond what was played.
4. Controls are **continuous**, not boolean. Level 0 is off.
5. *(Revised 2026-10-20.)* Register is **ethereal**: overtone strips are wider and less opaque than note strips, soft-edged, and visually distinct from the clean strips of what was played. A wider strip is required, not just preferred: a coincident partial (C's 3rd under a played G, +2 ¢) would otherwise sit entirely behind the note strip it reinforces. Surface treatment (steam, dust, swirl) is a later rendering decision; it must not be busy.
6. **Chord glyph deferred.** When it comes, it is a colourful smudge *outside* the glyph outline, not more lines inside it.
7. *(Revised 2026-10-20.)* Overtone strip **colour is a user toggle**, `system:harmonic-series:colour`: `pitch` (default, the landing pitch class's hue) or `fundamental` (the originating note's hue). Fundamental shows origin at the expense of harmonic intuition, and is recorded as an I14 exception for overtone strips only.
8. *(Revised 2026-10-20.)* **Modelled partials are computed in the vocabulary.** Measured partials, if added, would come from an upstream stabilizer (audio spectral features, SPEC 012) as a separate frame field, and the vocabulary would read those instead of calling the model. No provider interface until a second source exists; the seam is a pure function returning partial levels.
9. *(2026-10-20.)* Partials whose harmonic number is a power of two (1, 2, 4, 8) share the fundamental's pitch class in these octave-agnostic lenses and are **not drawn**.
10. *(2026-10-20.)* **Overlapping overtone strips blend additively**, so shared partials visibly pile up.
11. *(2026-10-20; revised after in-app review.)* **Default rolloff 0.2.** At 1.0 the 7th partial read as too faint in the app; 0.2 keeps it at ≈ 45% of the fifth. The default level when the overlay is switched on is well below 1, and a level→opacity curve may be added; both are set from seeing it, not up front.

## The model

### What the display reduces to

Both lenses are octave-agnostic, so the visible content of a single note is a fixed stencil translated by root:

| Partial n | 12·log₂(n) mod 12 | Interval | ET deviation | Level at 1/n |
|---|---|---|---|---|
| 3 (6, 12) | 7.02 | P5 | +2 ¢ | 0.33 |
| 5 (10) | 3.86 | M3 | −14 ¢ | 0.20 |
| 7 (14) | 9.69 | m7 | −31 ¢ | 0.14 |
| 9 | 2.04 | M2 | +4 ¢ | 0.11 |
| 11 | 5.51 | tritone-ish | −49 ¢ | 0.09 |
| 13 | 8.41 | m6-ish | +41 ¢ | 0.08 |
| 15 | 11.88 | M7 | −12 ¢ | 0.07 |

Partials within the cap that are octave duplicates of an odd partial (6 of 3, 10 of 5, 12 of 3, 14 of 7) add their level to that partial rather than drawing a second strip.

Default cap: partials up to **n = 9**, giving four overtone strips per note: P5 (0.50 with 6 folded in), M3 (0.20), m7 (0.14), M2 (0.11) at rolloff 1.0. The 7th partial is the pedagogically important one (dominant seventh) and must survive the default cap *and* the default level after culling. It is the faintest element of the stencil, so this is the binding constraint on the default level and any curve. 11 and 13 are available by raising the cap and land between columns; expected to read as noise.

### Level

```
level(n) = gain · Σ m^(−rolloff)   over m ≤ cap with odd part n
```

- `gain` — the user-facing level macro, 0..1. 0 disables the overlay and emits no entities.
- `rolloff` — exponent, user-facing. 1.0 ≈ sawtooth (−6 dB/octave), 2.0 is piano/pluck-like (−12 dB/octave). Flat (0) gives an equal wash across the stencil; steep (≥3) leaves only the fifth. Both extremes are legible, which is the Principle 3 test. At 2.0 the 7th partial falls to ≈ 0.02, which is why the default is 1.0.
- Level does not vary with the note's age. Fading comes from the note strip's own opacity (Decision 1).
- *Velocity brightening* (harder strikes raising upper partials) is omitted from the first increment. It is the one term that models the instrument rather than the series, and no lens applies velocity to note strips yet either (synesthetica-taqk). Revisit after the rhythm-lens increment.

Named constants (docs/tunables.md convention): `PARTIAL_CAP`, `PARTIAL_ROLLOFF_DEFAULT`, `OVERTONE_CULL_OPACITY`, `OVERTONE_WIDTH_RATIO`, `OVERTONE_EDGE_SOFTNESS`.

This models the harmonic series with a generic rolloff. It does not model the piano or any instrument.

### Real pitch

A partial's position is `root + 12·log₂(n)` in continuous semitones, wrapped mod 12, expressed as the nearest pitch class plus a cents offset. The rhythm lens places it at `pitchClassToX(pc) + (cents / 100) · columnSpacing`. A 7th partial therefore sits 0.31 semitones left of the ♭7 column, roughly 0.8 note-strip widths. This is cheap, more honest, makes the overtone strip visibly not-a-note, and shows why the 7th partial fights equal temperament.

Partials just flat of C (e.g. D's 7th at C −31 ¢, A♭'s 5th at C −14 ¢) sit left of the C column, and partials just sharp of B sit right of the B column. The existing `pc / 11` mapping is unchanged; the worst offset at the default cap (±31 ¢ ≈ 0.012) fits inside the side gaps.

## Pipeline placement

Modelled partials are computed in the vocabulary stage (`MusicalVisualVocabulary.annotateNote`) and attached to the annotated note. They are not in `MusicalFrame`; stabilizers never see them.

### Contract additions (proposed)

```ts
// packages/contracts/annotated/annotated.ts

/** One partial of a sounding note, as annotated by the vocabulary.
 *  Not a Note: chord detection, dynamics and harmony analysis never
 *  see partials, and lenses must not render them as if they were played. */
export interface HarmonicPartial {
  /** Odd harmonic number ≥ 3 (octave duplicates already folded in) */
  n: number;
  /** Nearest pitch class to the partial's real pitch */
  pc: PitchClass;
  /** Deviation from that pitch class in cents, −50..50 */
  cents: number;
  /** Level, 0..1 (gain and rolloff applied) */
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

The model is a pure engine function returning `{ n, level }` per partial; the vocabulary derives `pc`, `cents` and `color`. A measured source would supply the same `{ n, level }` shape from upstream.

### Invariant (proposed; I31 is the next free number across specs)

**Partials are not notes.** Modelled partials exist only as vocabulary annotations; measured partials, if added, enter as a separate frame field, never as notes. No lens renders a partial with the entity treatment of a played note. The overlay must not read as notes the player did not play.

## Rhythm lens treatment

For each annotated note with `partials`, emit one overtone strip per partial:

- Entity `kind: "particle"`, `data.type: "overtone-strip"`, id `${lens}:overtone-${note.id}-${n}`.
- `x = pitchClassToX(partial.pc) + (partial.cents / 100) · columnSpacing`.
- Time extent identical to the fundamental's note strip (onset → end or NOW line, same minimum-height rule), so overtone strips scroll with their note and never extend past it.
- `topOpacity = partial.level · noteStrip.topOpacity`, `bottomOpacity = partial.level · noteStrip.bottomOpacity`.
- Width `OVERTONE_WIDTH_RATIO` × note-strip width, with the ratio > 1.
- No entity when `max(topOpacity, bottomOpacity) < OVERTONE_CULL_OPACITY`, and no entity at all when gain is 0.

**Renderer changes:** the note-strip ShaderMaterial gains an `edgeSoftness` uniform; the fragment shader multiplies opacity by a horizontal falloff (`smoothstep` from the strip's centre to its edge). Overtone strips use additive blending; note strips keep `edgeSoftness = 0` and normal blending. Opacity alone is already used for release phase and screen position and cannot carry the register.

A later surface treatment (steam, dust, swirl) is preferably procedural noise in the same fragment shader, with density tracking level, rather than a CPU particle system: it adds no entities, and additive overlap then reads as denser.

**Colour** — a user toggle (`system:harmonic-series:colour`), decided 2026-10-20 after the snapshot round:
- *`pitch`* (default): the overtone strip at the G column is G-coloured. Honours "colour encodes pitch class" (I14), and coincident partials from different notes share one colour, so pile-up reads as one reinforced pitch. Risk: reads as a quietly played G; the register (width, softness, additive glow) carries the distinction.
- *`fundamental`*: C's red in the G column. Carries provenance and shows coincidence as colour mixing; unmistakably not a played note. Costs the colour-means-pitch reading. Recorded in SPEC 010 §6 as an I14 exception for overtone strips only.

## Chord glyph treatment (deferred)

Not in the first increment. Direction agreed: a colourful smudge outside the glyph outline rather than additional lines inside it, so the glyph's interval structure stays clean. This requires per-element opacity in the chord-shape renderer (today opacity is per entity only) and a new `ChordShapeElement.style` (e.g. `"halo"`) built in the vocabulary per I18. Clutter is the risk: a major triad's partials land on 9 of 12 angles (confirmed in the ASCII round). Revisit after the rhythm-lens proof, probably with aggregation (one halo per pitch class at summed level, thresholded) rather than per-tone elements.

## Parameters and control surface

Two continuous macros and one discrete toggle, vocabulary-scoped (precedent: `system:colour-mapping:reference`, consumed by `musical-visual`):

| Macro | Range | Default | Extremes |
|---|---|---|---|
| `system:harmonic-series:level` | 0..1 | 0 (off) | 0: no overlay, no entities. 1: overtone strips at full modelled level. |
| `system:harmonic-series:rolloff` | 0..3 | 1.0 | 0: equal wash across the stencil. 3: only the fifth survives. |
| `system:harmonic-series:colour` | `pitch` / `fundamental` | `pitch` | Discrete. Landing pitch-class hue, or originating note's hue. |

At level 1 the brightest overtone columns rival note strips (0.75 at D under C major, 0.95 at A under G7, against 1.0), so the overlay reads as notes not played. The useful range is well below 1; the panel's suggested starting value and any level→opacity curve are set from seeing it.

Manifest `notes` and `humanNotes` must state that the overlay is the theoretical harmonic series, not a measurement of the instrument. The primer explains the harmony-lesson reading (shared partials, dominant seventh, major vs minor third) so the LLM can point the player at what to look for.

Partial cap and visual constants stay file-level tunables for now; promote to macros only if review shows they need live adjustment.

## Performance

Worst case: 4 overtone strips per note with a 10 s release window. Dense playing at ~8 notes/s gives ~80 notes on screen and ~320 overtone meshes before culling. Because overtone strips fade with their note strip, culling comes from level × screen fade, not from a separate decay, so most overtone strips live as long as their note. Measure entity counts in the simulation harness; if it is not comfortably within budget, reduce the default cap to n = 7 before considering mesh batching.

## Development method

Per packages/engine/src/lenses/README.md:

1. **ASCII diagram** — agreed 2026-10-20 (below).
2. **SVG snapshots** (`GENERATE_SNAPSHOTS=1`) for: C→G detached, C→G legato, C–E–G, G7, M3 dyad vs m3 dyad, a dense passage. These check lens output (position, extent, level, culling, counts). The register (softness, additive blend, surface treatment) is judged in the WebGL renderer; SVG cannot represent it faithfully.
3. **Metrics**, at gain 1 and rolloff 1.0 (scale by gain):
   - *C major*: column energy at D (0.75) and B (0.70) exceeds any single partial in the stencil (max 0.50).
   - *M3 vs m3*: column energy does **not** separate them — C–E♭ peaks higher (G 0.70, B♭ 0.64) than C–E (G and B 0.50). The distinction is coincidence with a played note: in C–E, C's 5th partial lies within 14 ¢ of the played E; in C–E♭, no partial of C lands on E♭.
   - *Dominant seventh*: G alone puts 0.14 at F (−31 ¢). It must survive culling at the default level.
   - *Entity count* for the dense passage.
4. Promote to the WebGL renderer; tune `OVERTONE_EDGE_SOFTNESS` and width by eye; decide colour.

### ASCII (agreed 2026-10-20)

Rolloff 1.0, cap 9, gain 1, additive sums; screen-position fade omitted (it applies to both strip types equally). `█` note strip; overtone strips by summed level: `·` < 0.17, `░` < 0.35, `▒` < 0.6, `▓` ≥ 0.6. Six characters per semitone, so the cents offsets are to scale.

```
A. C then G, detached — C's fifth overtone strip sits in G's column, above it
         C     C#    D     D#    E     F     F#    G     G#    A     A#    B
         █          ···        ░░░                ▒▒▒             ···
         █          ···        ░░░                ▒▒▒             ···
         █          ···        ░░░                ▒▒▒             ···

                    ▒▒▒             ···            █          ···        ░░░
                    ▒▒▒             ···            █          ···        ░░░
NOW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

B. C held into G — G lands inside C's overtone strip; D piles up (C·9 + G·3)
         █          ···        ░░░                ▒▒▒             ···
         █          ···        ░░░                ▒▒▒             ···
         █          ▓▓▓        ░░░  ···           ▒█▒         ··· ···    ░░░
         █          ▓▓▓        ░░░  ···           ▒█▒         ··· ···    ░░░
                    ▒▒▒             ···            █          ···        ░░░
NOW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

C. C major, held — D and B light up; C's 5th partial sits flat of the played E
         █        ··▓▓▓        ░░█  ···     ···   ▒█▒  ░░░    ··· ···    ░▓▓▒
         █        ··▓▓▓        ░░█  ···     ···   ▒█▒  ░░░    ··· ···    ░▓▓▒
NOW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Glossary terms (proposed; entered in GLOSSARY_FULL.md and lenses/GLOSSARY.md)

- **Harmonic series overlay** — the feature; the optional display of each note's implied partials.
- **Partial** — one component of a note's harmonic series; a vocabulary annotation, not a note. Partial n is overtone n − 1; this project counts partials.
- **Overtone strip** — the rhythm-lens rendering of a partial with n ≥ 3: a wider, soft-edged, translucent strip at the partial's real pitch, fading with its note strip.

## Open questions

1. Default level when enabled, and whether level→opacity needs a curve. Constraint: the 7th partial survives culling.
2. Surface treatment for the ethereal register (procedural noise preferred), after the soft-edge version is seen.
3. Whether the velocity-brightening term earns its place.

Resolved 2026-10-20: colour (user toggle, default pitch), separate decay (dropped; fades with note strip), post-release behaviour (fades with note strip), default rolloff (0.2 after in-app review), partials between B and C (nearest pc + cents offset; mapping unchanged), provider interface (none until a second source).

## SPEC 010 amendment (entered 2026-10-20)

The text below was entered into SPEC 010 (§6, Harmonic Partial Annotations,
I31) when the rhythm-lens increment landed. SPEC 010 is canonical; this copy
is kept for history and is not updated.

**§6 Harmonic Series Overlay**

| Musical Concept | Visual Channel | Constraint |
|-----------------|----------------|------------|
| Partial pitch (12·log₂ n above the fundamental, continuous) | Position | Real pitch, not snapped to pitch class |
| Modelled partial level | Opacity | Multiplies the fundamental's own opacity; ratio held as both fade |
| Shared partials across notes | Additive blending | Coincident partials visibly sum |

- Partials with power-of-two n (1, 2, 4, 8) are not drawn; octave duplicates of odd partials fold into them; one element per odd partial.
- Default cap n = 9; the 7th partial must survive the default cap and default level.
- Level: `gain · Σ m^(−rolloff)` over folded partials; `gain = 0` emits nothing.
- The fundamental's own phase envelope (I17) is unchanged.
- Register: wider than a note strip, soft-edged, translucent; an overtone strip must be visibly distinct from a played note and must not extend past its fundamental's time extent.
- Colour and velocity brightening: filled in from the snapshot decision. If fundamental hue wins, record an explicit I14 exception here.

**Invariant I31:** Partials are not notes. Modelled partials exist only as vocabulary annotations on `AnnotatedNote`; measured partials, if added, enter from an upstream stabilizer as a separate frame field, never as notes. Chord detection, dynamics and harmony analysis are unaffected, and no lens renders a partial with the entity treatment of a played note.

**Contract Implications → Harmonic Partial Annotations:** the `HarmonicPartial` and `AnnotatedNote.partials` definitions from §Pipeline placement above.

**What This Spec Does NOT Cover:** amend "Audio-derived feature mappings (future work)" to note that measured partials would arrive from an upstream stabilizer in the `{ n, level }` shape the model produces.


Still open after the amendment: default level and any level→opacity curve, edge treatment tuning, surface treatment, and anything about the glyph.

## Non-goals

- Modelling timbre or any specific instrument.
- Measured spectra (future, via SPEC 012 spectral features and an upstream stabilizer).
- Inharmonicity, stretched tuning, or partials above n = 15.
- Any change to chord detection, dynamics or harmony stabilizers.
- The chord-glyph treatment, in this increment.
