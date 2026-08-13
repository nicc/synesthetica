# Tunables catalogue

Canonical list of every controllable value in the pipeline. Written 2026-08-13 for a review of which levers actually matter for LLM-mediated control.

## Reading this doc

- **Location** — where it lives (`grammar/RhythmGrammar.ts:61` etc.)
- **Value** — current default
- **Controls** — what it changes
- **Experiential impact** — my best guess at what a user would notice; ⭐ = a change you'd see, ⭐⭐ = a change you'd feel, ⭐⭐⭐ = a change that reframes the reading
- **Musical pertinence** — my best guess at how much this maps to musical intent; 🎵 = coloured by musical concept, 🎵🎵 = shapes a musical concept, 🎵🎵🎵 = load-bearing for musical interpretation
- **Class** — how I'd categorise it: `layout` (spatial structure), `cosmetic` (visual polish), `dynamics` (temporal feel), `detection` (what the pipeline sees), `interpretive` (how the pipeline reads what it sees)

Ranks are opinions — treat as starting points.

---

## True macros (already user-tunable in code)

Only RhythmGrammar exposes true macros at the moment. The others are configured entirely through file-level constants.

| Macro | File | Default | Range | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|---|---|
| `horizon` | RhythmGrammar (state) | 1.0 | 0–1 | Field of vision — how much history/future is visible on the rhythm strip. Lower = tighter, more zoomed-in NOW; higher = more context. | ⭐⭐⭐ | 🎵🎵🎵 | interpretive |
| `subdivisionDepth` | RhythmGrammar (state) | "16th" | quarter / 8th / 16th | Grid resolution for drift analysis. Affects reference-line placement and "tight vs drifted" labelling. | ⭐⭐ | 🎵🎵🎵 | interpretive |
| `referenceLinger` | RhythmGrammar (state) | 1.3 | multiplier | Reference lines + streaks linger this multiple of the note window. Longer = clearer visual memory of recent timing. | ⭐⭐ | 🎵🎵 | dynamics |

---

## RhythmGrammar — top-level constants

| Constant | Value | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `MAX_GRID_HISTORY_MS` | 8000 | Ceiling on how far back grid lines render at max horizon | ⭐ | 🎵 | dynamics |
| `MAX_GRID_FUTURE_MS` | 2000 | Ceiling on how far ahead grid lines render at max horizon | ⭐ | 🎵 | dynamics |
| `MAX_NOTE_HISTORY_MS` | 8000 | Ceiling on how far back note strips render at max horizon | ⭐⭐ | 🎵🎵 | dynamics |
| `MIN_NOTE_HISTORY_BEATS` | 1 | Floor on note history at min horizon (in beats — tempo-relative) | ⭐⭐ | 🎵🎵 | dynamics |
| `DEFAULT_REFERENCE_LINGER_MULTIPLIER` | 1.3 | Default for the `referenceLinger` macro | ⭐⭐ | 🎵🎵 | dynamics |
| `PULSE_DECAY_MS` | 120 | Exponential decay τ of the NOW-line beat pulse | ⭐⭐ | 🎵🎵 | dynamics |
| `PULSE_OPACITY_BOOST` | 0.4 | Peak opacity added to the NOW line on each beat | ⭐⭐ | 🎵🎵 | cosmetic |
| `PULSE_VALUE_BOOST` | 0.2 | Peak HSV value added to the NOW line on each beat | ⭐ | 🎵 | cosmetic |
| `TIGHT_TOLERANCE_MS` | 30 | Threshold below which a note is "on the grid" (reference line shows) | ⭐⭐ | 🎵🎵🎵 | interpretive |
| `STREAK_COUNT` | 3 | Number of streak lines per note | ⭐ | 🎵 | cosmetic |
| `MIN_NOTE_STRIP_HEIGHT` | 0.008 | Floor on rendered note height (short notes stay visible) | ⭐ | 🎵 | layout |
| `GRID_COLORS.beatLine` | `{h:200,s:0.2,v:0.5,a:0.4}` | Beat grid line colour | ⭐ | 🎵 | cosmetic |
| `GRID_COLORS.barLine` | `{h:200,s:0.3,v:0.6,a:0.5}` | Bar grid line colour | ⭐ | 🎵 | cosmetic |
| `GRID_COLORS.nowLine` | `{h:0,s:0,v:0.8,a:0.6}` | NOW line colour | ⭐⭐ | 🎵 | cosmetic |
| `GRID_COLORS.referenceLine` | `{h:0,s:0,v:0.9,a:0.7}` | Per-note reference line colour | ⭐⭐ | 🎵🎵 | cosmetic |

## HarmonyGrammar — top-level constants

Progression clock:

| Constant | Value | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `PROGRESSION_FADE_VALUE` | 3 | Fade window (bars if tempo set, seconds otherwise). Governs how long chords linger after release. | ⭐⭐⭐ | 🎵🎵 | dynamics |
| `RELEASE_BRIGHTNESS_STEP` | 0.30 | Immediate brightness drop on chord release, before linear fade | ⭐⭐ | 🎵 | cosmetic |
| `WIDTH_COMPENSATION_EXPONENT` | 1.8 | Non-linear opacity compensation as strokes thicken through the fade | ⭐ | — | cosmetic |
| `STROKE_WIDTH_FRESH` | 2 | Chord numeral stroke while held or fresh | ⭐ | 🎵 | cosmetic |
| `STROKE_WIDTH_FADED` | 8 | Chord numeral stroke at full fade (chunky/blocky) | ⭐⭐ | 🎵 | cosmetic |
| `CLOCK_RADIUS_FRACTION` | 0.35 | Clock radius as fraction of cell size | ⭐ | — | layout |
| `GUIDE_RING_INNER_FRACTION` | 0.32 | Inner guide ring radius | ⭐ | — | layout |
| `GUIDE_RING_MIDDLE_FRACTION` | 0.62 | Middle guide ring (diatonic edge) | ⭐ | — | layout |
| `GUIDE_RING_OUTER_FRACTION` | 0.92 | Outer guide ring (borrowed edge) | ⭐ | — | layout |
| `GLYPH_SIZE` | 2.4 | Uppercase numeral height (world units) | ⭐ | — | layout |
| `DIATONIC_SCALE` | 0.8 | Diatonic-ring glyph scale relative to `GLYPH_SIZE` | ⭐ | 🎵 | cosmetic |
| `BORROWED_SCALE` | 1/φ ≈ 0.618 | Borrowed-ring glyph scale — lighter visual weight for outside-the-key chords | ⭐⭐ | 🎵🎵 | interpretive |
| `VIEWPORT_ASPECT` | 100/75 | Compensates renderer's asymmetric x/y scaling — technical, not a design lever | — | — | layout |
| `STRUCTURE_OPACITY` | 0.25 | Guide rings + slot ticks opacity | ⭐ | — | cosmetic |
| `STRUCTURE_COLOR` | `{h:200,s:0.2,v:0.4}` | Guide rings + slot ticks colour | ⭐ | — | cosmetic |

Connection strips + connector arcs:

| Constant | Value | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `STRIP_RADIAL_FRACTION` | 0.068 | Strip radial extent (short — accent, not band) | ⭐ | 🎵 | cosmetic |
| `STRIP_ARC_WIDTH` | `GLYPH_SIZE × 1.5` | Strip angular width in world units | ⭐ | 🎵 | cosmetic |
| `MAX_STRIP_OPACITY` | 1.0 | Peak strip opacity at full edge weight | ⭐⭐ | 🎵🎵 | cosmetic |
| `CONNECTOR_ANIMATION_MS` | 60 | Duration of the arc-drawing animation from source to target strip | ⭐⭐ | 🎵🎵 | dynamics |
| `CONNECTOR_HALF_THICKNESS_NORMALIZED` | 0.001 | Arc stroke half-thickness | ⭐ | 🎵 | cosmetic |
| `ARROW_HEIGHT_MULTIPLIER` | 2 | Arrow indicator height as multiple of arc thickness | ⭐ | 🎵 | cosmetic |
| `CONNECTOR_OPACITY_MULTIPLIER` | 0.8 | Arc + strip peak opacity multiplier (currently shared) | ⭐⭐ | 🎵🎵 | cosmetic |
| `ASSUMED_WORLD_WIDTH` | 100 | Coupling constant — must match renderer's worldWidth. Not a design lever. | — | — | layout |

Scrolling chord strip (mini roman numerals on rhythm timeline):

| Constant | Value | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `STRIP_GLYPH_SIZE` | 1.2 | Mini numeral height | ⭐ | 🎵 | layout |
| `STRIP_STROKE_WIDTH` | 1.5 | Mini numeral stroke | ⭐ | — | cosmetic |
| `STRIP_BAR_OPACITY` | 0.25 | Chord-duration bar opacity behind each numeral | ⭐ | 🎵 | cosmetic |
| `CHORD_FADE_OUT_MS` | 120 | How long a chord shape fades out after end (smooths hard cut) | ⭐ | 🎵 | dynamics |
| `DEFAULT_HUE_INVARIANT.referencePc` | 9 (A) | Which pitch class = referenceHue | ⭐⭐⭐ | 🎵🎵🎵 | interpretive |
| `DEFAULT_HUE_INVARIANT.referenceHue` | 0 (red) | Which colour anchors the pitch-hue mapping | ⭐⭐⭐ | 🎵🎵🎵 | interpretive |
| `DEFAULT_HUE_INVARIANT.direction` | "cw" | Which way the wheel rotates through the chromatic scale | ⭐⭐⭐ | 🎵🎵🎵 | interpretive |

## DynamicsGrammar — top-level constants

| Constant | Value | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `FADE_MS` | 2000 | Fade window for velocity indicator dots | ⭐⭐ | 🎵🎵 | dynamics |
| `INDICATOR_THICKNESS_MIN` | 0.003 | Thickness at min velocity | ⭐ | 🎵 | cosmetic |
| `INDICATOR_THICKNESS_MAX` | 0.012 | Thickness at max velocity | ⭐⭐ | 🎵🎵 | cosmetic |
| `MIN_OPACITY` | 0.25 | Floor opacity so faint hits stay visible | ⭐ | 🎵 | cosmetic |
| `MIN_INTENSITY` | 1/127 | Floor intensity value (avoids zero) | — | — | layout |
| `TICK_LENGTH` | 0.25 | Length of dynamics-bar range ticks | ⭐ | — | layout |
| `OUTLINE_OPACITY` | 0.4 | Structural outline opacity | ⭐ | — | cosmetic |
| `TICK_OPACITY` | 0.25 | Range tick opacity | ⭐ | — | cosmetic |
| `OUTLINE_THICKNESS` | 0.001 | Outline stroke thickness | ⭐ | — | cosmetic |

## Layout (shared) — top-level constants

Structural, define the three-column layout (dynamics / rhythm / harmony). Rarely a design lever — changing these reshuffles the whole viewport.

| Constant | Value | Controls | Class |
|---|---|---|---|
| `BAR_TOP` | 1/6 | Top of usable bar area | layout |
| `BAR_BOTTOM` | 5/6 | Bottom of usable bar area | layout |
| `DYNAMICS_COLUMN_WIDTH` | 0.04 | Dynamics column width | layout |
| `DYNAMICS_BAR_WIDTH_FRACTION` | 0.6 | Dynamics bar width within column | layout |
| `GAP_LEFT` | 0.05 | Gap between dynamics and rhythm | layout |
| `GAP_RIGHT` | 0.05 | Gap between rhythm and harmony | layout |
| `NOTE_STRIP_BASE_WIDTH` | 0.015 | Base width of a note strip | layout |
| `CHORD_STRIP_WIDTH` | 0.02 | Chord strip width | layout |
| `HARMONY_COLUMN_WIDTH` | 0.42 | Harmony column width | layout |
| `HARMONY_CHORD_CELL_HEIGHT` | 0.21 | Chord shape cell height | layout |
| `NOW_LINE_Y` | 0.85 | Vertical position of the NOW line (0=top, 1=bottom) | interpretive (⭐⭐⭐ — moving this changes the whole time-flow reading) |
| `TIME_HORIZON_HISTORY_MS` | 8000 | Absolute-ms history bound (mirrors grammar constants) | dynamics |
| `TIME_HORIZON_FUTURE_MS` | 2000 | Absolute-ms future bound | dynamics |

---

## MusicalVisualVocabulary — default config

The "vocabulary" is the ruleset that maps musical events to visual style. It has three tunables that RhythmGrammar and HarmonyGrammar both consume via `DEFAULT_HUE_INVARIANT`:

| Field | Default | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `referencePc` | 9 (A) | Which pitch class anchors the hue wheel | ⭐⭐⭐ | 🎵🎵🎵 | interpretive |
| `referenceHue` | 0 (red) | Which colour = referencePc | ⭐⭐⭐ | 🎵🎵🎵 | interpretive |
| `hueDirection` | "cw" | Chromatic step direction on the colour wheel | ⭐⭐⭐ | 🎵🎵🎵 | interpretive |

The `HarmonyGrammar.DEFAULT_HUE_INVARIANT` const above is currently a duplicate — HarmonyGrammar doesn't use the vocabulary's config. Worth reconciling.

## Vocabulary — chord shape geometry

Defined in `renderChordShape.ts` and `ChordShapeBuilder.ts`:

| Constant | Value | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `HUB_RADIUS` | 0.3 | Chord-shape hub radius (fraction of arm length) | ⭐ | 🎵 | cosmetic |
| `ARM_LENGTH.*` | table | Per-interval arm length | ⭐⭐ | 🎵🎵 | interpretive |
| `BASE_WIDTH` | 30 | Base width of chord arms | ⭐ | 🎵 | cosmetic |

---

## Stabilizer configs

Constructor-configurable. Currently no runtime tuning surface but each has a defaults block.

### NoteTrackingStabilizer

| Field | Default | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `attackDurationMs` | 50 | Duration of the "attack" phase on a fresh note | ⭐⭐ | 🎵🎵 | interpretive |
| `releaseWindowMs` | 10000 | How long a released note stays tracked before fully dropping | ⭐⭐ | 🎵🎵 | dynamics |
| `SUSTAIN_PEDAL_CC` | 64 | MIDI CC number for sustain pedal — spec-mandated, not a lever | — | — | detection |
| `SUSTAIN_PEDAL_THRESHOLD` | 64 | Value at which sustain is considered "down" (0–63 up, 64–127 down) | — | — | detection |

### ChordDetectionStabilizer

| Field | Default | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `pitchDecayMs` | 400 | How long a released pitch stays "in the pot" for chord inference | ⭐⭐⭐ | 🎵🎵🎵 | interpretive |
| `minPitchClasses` | 2 | Minimum unique pitches to attempt chord inference | ⭐⭐ | 🎵🎵 | interpretive |
| `hysteresisMs` | 50 | Minimum time before switching detected chord (prevents flicker) | ⭐⭐ | 🎵🎵 | interpretive |
| `progressionWindowMs` | 60000 | Rolling window of chord progression history | ⭐ | 🎵 | dynamics |

### DynamicsStabilizer

| Field | Default | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `windowMs` | 8000 | Contour window (how much history feeds the dynamics contour) | ⭐⭐ | 🎵🎵 | dynamics |
| `trendWindowMs` | 1000 | Short window for trend (crescendo/decrescendo) detection | ⭐⭐ | 🎵🎵 | interpretive |
| `trendDeadZone` | 0.1 | Threshold below which no trend is emitted | ⭐ | 🎵 | interpretive |

### HarmonyStabilizer

| Field | Default | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `INTERVAL_DISSONANCE` | table | Per-interval dissonance weight for tension calc | ⭐⭐ | 🎵🎵 | interpretive |
| `QUALITY_TENSION` | table | Per-chord-quality tension weight | ⭐⭐ | 🎵🎵 | interpretive |
| `MODAL_INTERCHANGE_MAJOR` | table | Which borrowed chords imply which diatonic destinations, with weights | ⭐⭐⭐ | 🎵🎵🎵 | interpretive |
| `SECONDARY_DOMINANT_WEIGHTS` | table | Per-target-degree weights for V/X → X reads | ⭐⭐ | 🎵🎵🎵 | interpretive |
| `CHAIN_RESOLUTION_WEIGHT` | 0.7 | Weight applied to chain (V/V/V-style) chain interpretations | ⭐⭐ | 🎵🎵 | interpretive |
| `DEFAULT_PROGRESSION_WINDOW_MS` | 60000 | Rolling progression history window | ⭐ | 🎵 | dynamics |

---

## Audio adapter thresholds

`packages/adapters/src/audio/AudioInputAdapter.ts`. All exposed as constructor config; documented in SPEC 012.

| Constant | Default | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `SAMPLE_RATE` | 22050 | Model input sample rate (fixed by Basic Pitch) | — | — | detection |
| `WINDOW_SAMPLES` | 43844 (2 s − FFT_HOP) | Model window (fixed by Basic Pitch) | — | — | detection |
| `RING_CAPACITY` | 65536 | Ring buffer capacity in samples | — | — | detection |
| `DEFAULT_HOP_MS` | 50 | Inference cadence — smaller = lower latency, more CPU | ⭐⭐ | 🎵🎵 | detection |
| `DEFAULT_ONSET_THRESHOLD` | 0.5 | Confidence gate for note-on | ⭐⭐⭐ | 🎵🎵🎵 | detection |
| `DEFAULT_FRAME_THRESHOLD` | 0.2 | Confidence gate for "note still sounding" (below = release) | ⭐⭐⭐ | 🎵🎵🎵 | detection |
| `DEFAULT_MIN_NOTE_LENGTH_FRAMES` | 5 (~58 ms) | Reject notes shorter than this | ⭐⭐ | 🎵🎵 | detection |
| `DEFAULT_NOTE_OFF_TIMEOUT_MS` | 160 | Silence gap before emitting note-off | ⭐⭐⭐ | 🎵🎵🎵 | detection |
| `DEFAULT_FRESH_ONSET_MAX_AGE_MS` | 300 | Max onset age for emitting a fresh note-on (kills retroactive markers) | ⭐⭐⭐ | 🎵🎵 | detection |
| `DEFAULT_RESTRIKE_GAP_MS` | 120 | Minimum onset gap to classify as re-strike vs continuation | ⭐⭐⭐ | 🎵🎵🎵 | detection |

---

## Renderer — internal magic numbers (obscured)

These live in `ThreeJSRenderer.ts` and don't surface as top-level constants. They're the ones I'd expect Nic wants flagged.

| Location | Value | Controls | Impact | Pertinence | Class |
|---|---|---|---|---|---|
| `updateConnectionArrow` line 773 | `AA_OVERLAP_WORLD = 0.03` | Arrow-into-arc overlap for closing sub-pixel AA gaps. Function-local. | ⭐ | — | cosmetic |
| `updateConnectionArrow` line 782 | `N_BASE_SEGMENTS = 8` | Curved-base segment count. Function-local. Perf/smoothness tradeoff. | — | — | cosmetic |
| Guide-ring drawer | `linewidth: 1.5` | Guide-ring stroke width in pixels. Hardcoded in the drawer, not top-level. | ⭐ | — | cosmetic |
| Slot-tick drawer | `linewidth: 1.5` | Slot-tick stroke width in pixels. Same. | ⭐ | — | cosmetic |
| `worldWidth` config default | 100 | Renderer world width in normalized units — `ASSUMED_WORLD_WIDTH` mirrors it | — | — | layout |
| `worldHeight` config default | 75 | Renderer world height | — | — | layout |
| Various `??` colour fallbacks | `{h:0,s:0,v:0.5}` etc. | Default colours for entities missing explicit style.color. Ideally never hit. | — | — | cosmetic |

---

## Obscured / inline params on the entity contract (Nic's specific ask)

These are the ones NOT expressed as top-level constants — they live inside entity `data` payloads or shader uniforms, defaulted at the point of read.

| Entity type | Data field | Default | Where read | Notes |
|---|---|---|---|---|
| `note-strip` | `topOpacity` | falls back to `style.opacity` | ThreeJSRenderer line 370 | Per-note top-edge fade, computed inline in RhythmGrammar. |
| `note-strip` | `bottomOpacity` | falls back to `style.opacity` | ThreeJSRenderer line 372 | Per-note bottom-edge fade. |
| `chord-duration-bar` (in HarmonyGrammar's scrolling strip) | `topOpacity` | inline calc | HarmonyGrammar line 1077 | Same gradient pattern as note strips. |
| `chord-duration-bar` | `bottomOpacity` | inline calc | HarmonyGrammar line 1078 | Same. |
| `connection-strip` | `plateauFraction` | 0.1 (grammar), 0.2 (renderer fallback) | HarmonyGrammar line 944 → renderer 628 → uniform 877 | The one Nic flagged. Strip's opacity plateau before the smoothstep fade. |
| `connection-arc` | `halfThickness` | 0.002 (renderer fallback), passed by grammar as `CONNECTOR_HALF_THICKNESS_NORMALIZED` | Renderer 648 | Arc stroke thickness. |
| `connection-arrow` | `arcHalfThicknessNormalized` | 0.001 (renderer fallback) | Renderer 747 | Arrow's reference to arc thickness for overlap calc. |
| `connection-arrow` | `heightNormalized` | 0.004 (renderer fallback) | Renderer | Arrow height. |
| Adapter config `dedupWindowMs` | (removed) | — | — | Was a plumbed-but-unused knob; pruned recently. Noted here to close the loop. |

---

## Summary count

| Category | # constants | # macros | # obscured |
|---|---:|---:|---:|
| RhythmGrammar | 14 | 3 | 2 |
| HarmonyGrammar | 25 | 0 | 3 |
| DynamicsGrammar | 9 | 0 | 0 |
| Layout (shared) | 20 | 0 | 0 |
| Vocabulary | 3 | 0 | 0 |
| Chord-shape | 3 | 0 | 0 |
| NoteTrackingStabilizer | 2 (+2 spec) | 0 | 0 |
| ChordDetectionStabilizer | 4 | 0 | 0 |
| DynamicsStabilizer | 3 | 0 | 0 |
| HarmonyStabilizer | 5 tables + 1 window | 0 | 0 |
| AudioInputAdapter | 10 (3 model-fixed, 7 tunable) | 0 | 0 |
| Renderer-internal | ~6 | — | — |
| **Total tunable** | **~85** | **3** | **~6** |

The gap between 85 tunable constants and 3 actual macros is roughly the answer to "what do we actually control?"

---

## Musical-pertinence shortlist (my picks)

The subset I'd argue actually matters for a language-mediated interface:

**Interpretive (changes what the pipeline reads):**
- Pitch-hue mapping (referencePc / referenceHue / hueDirection)
- ChordDetection: pitchDecayMs, hysteresisMs
- HarmonyStabilizer: MODAL_INTERCHANGE_MAJOR, SECONDARY_DOMINANT_WEIGHTS (these define the whole modal-interchange story)
- Rhythm: subdivisionDepth, TIGHT_TOLERANCE_MS
- Audio: onsetThreshold, frameThreshold, noteOffTimeoutMs, restrikeGapMs

**Dynamics (changes how time feels):**
- RhythmGrammar: horizon, referenceLinger, MAX_NOTE_HISTORY_MS, PULSE_DECAY_MS
- Harmony: PROGRESSION_FADE_VALUE, CONNECTOR_ANIMATION_MS
- NoteTracking: releaseWindowMs
- Dynamics: FADE_MS, windowMs, trendWindowMs

**Cosmetic (changes how it looks but not what it says):**
- All the strip/glyph/stroke sizes and opacities
- Colour defaults for structural elements

**Layout (structural — you'd only tune these once):**
- Column widths, gaps, ring fractions, NOW_LINE_Y

Everything in the cosmetic and layout buckets probably belongs OUT of the LLM-mediated interface — they're setup-time, not intent-time. Everything in interpretive and dynamics is where the LLM has meaningful work to do.

---

## Gaps I noticed while doing this

1. **`DEFAULT_HUE_INVARIANT` is duplicated** — defined in HarmonyGrammar.ts AND in MusicalVisualVocabulary's DEFAULT_CONFIG. They can drift. Should be single-source.
2. **`plateauFraction` has two different defaults** (0.1 in the grammar entity, 0.2 as renderer fallback). One should defer to the other.
3. **RhythmGrammar is the only grammar with real macros.** HarmonyGrammar and DynamicsGrammar are entirely constant-driven. If macros are the LLM's primary lever (per SPEC 004), that's a coverage gap.
4. **Stabilizer configs are constructor-only.** No `setConfig()` methods; can't retune at runtime. If the LLM needs to adjust `pitchDecayMs` mid-session, the plumbing isn't there.
5. **HarmonyStabilizer tables aren't parameterised.** Modal interchange weights are hardcoded. If we ever want mode-specific tables (e.g. dorian, mixolydian), the shape needs generalising.
