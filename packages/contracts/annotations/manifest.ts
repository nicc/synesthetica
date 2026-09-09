/**
 * Production annotation manifest — the deployed macro / session /
 * concept / lens annotations shipped to LLMs (via MCP resources)
 * and rendered as UI controls (via the panel generator).
 *
 * Single source of truth: MCP tool advertisement, UI widget generation,
 * and default-value seeding all read this file.
 *
 * TypeScript enforces the shape from ./annotations.ts.
 */

import type {
  MacroAnnotation,
  SessionControlAnnotation,
  SystemConceptAnnotation,
  LensAnnotation,
  PresetAnnotation,
  ToolAnnotation,
  ResourceAnnotation,
  DerivedStateAnnotation,
} from "./annotations";

// ============================================================================
// Macros
// ============================================================================

const macros: MacroAnnotation[] = [
  // -----------------------------------------------------------------
  // Continuous — single 0..1 (or range-limited) dial to one param
  // -----------------------------------------------------------------
  {
    id: "harmony:linger",
    name: "Harmony linger",
    aliases: ["chord linger", "chord fade", "harmony persistence"],
    type: "continuous",
    range: [0.5, 30],
    default: 3, // seconds
    affects: ["harmony", "phrasing"],
    directionality: {
      low: {
        description: "chord symbols fade quickly; fewer overlapping numerals on the clock",
        tendsTo: ["emphasise the current chord", "reduce visual accumulation"],
      },
      high: {
        description: "chord symbols linger; harmonic pattern accumulates visibly",
        tendsTo: ["emphasise progression memory", "reveal recurring cadences"],
      },
    },
    notes: [
      "Seconds of chord memory. The value is always seconds regardless of prescribed tempo — do the bars↔seconds arithmetic yourself if the user asks in bars.",
      "Range comfortably under the stabilizer's 60-second progression window, so values here never silently clip.",
    ],
    consumers: [{ kind: "lens", id: "harmony-lens", macroKey: "linger" }],
  },

  {
    id: "harmony:arpeggio-tolerance",
    name: "Arpeggio tolerance",
    aliases: ["chord tolerance", "arpeggio patience", "harmonic window"],
    type: "continuous",
    range: [100, 2000],
    default: 400, // matches ChordDetectionStabilizer.pitchDecayMs
    affects: ["harmony", "phrasing"],
    directionality: {
      low: {
        description: "notes must be simultaneous to count as a chord",
        tendsTo: ["reject arpeggios and rolled chords", "favour block chords"],
      },
      high: {
        description: "arpeggios and rolled chords register as chord voicings",
        tendsTo: ["catch arpeggios and broken/rolled chords", "risk false positives on melody"],
      },
    },
    notes: [
      "Unit is chord detection window in ms.",
    ],
    consumers: [{ kind: "stabilizer", id: "chord-detection", macroKey: "harmony:arpeggio-tolerance" }],
  },

  {
    id: "harmony:note-threshold",
    name: "Chord note threshold",
    aliases: ["chord minimum notes", "notes per chord"],
    type: "continuous",
    range: [2, 6],
    default: 2, // matches ChordDetectionStabilizer.minPitchClasses
    affects: ["harmony"],
    directionality: {
      low: {
        description: "two-note intervals register as chords",
        tendsTo: ["catch sparse harmony", "increase chord flicker"],
      },
      high: {
        description: "only fuller chord voicings register as chords",
        tendsTo: ["reject sparse voicings", "stabilise chord surface"],
      },
    },
    notes: [
      "Denotes the number of notes required to constitute a chord.",
    ],
    consumers: [{ kind: "stabilizer", id: "chord-detection", macroKey: "harmony:note-threshold" }],
  },

  {
    id: "harmony:detection-stability",
    name: "Chord detection stability",
    aliases: ["chord hysteresis", "chord anti-flicker"],
    type: "continuous",
    range: [0, 500],
    default: 50, // matches ChordDetectionStabilizer.hysteresisMs
    affects: ["harmony"],
    directionality: {
      low: {
        description: "chord detection switches immediately as voicing changes",
        tendsTo: ["react quickly", "risk visible flicker between ambiguous voicings"],
      },
      high: {
        description: "chord detection waits before switching, holding the historic reading in the interest of stability",
        tendsTo: ["stabilise the chord surface", "delay reaction to genuine changes"],
      },
    },
    notes: [
      "Hysteresis or lag on chord detection.",
      "Unit is ms.",
    ],
    consumers: [{ kind: "stabilizer", id: "chord-detection", macroKey: "harmony:detection-stability" }],
  },

  {
    id: "dynamics:linger",
    name: "Dynamics linger",
    aliases: ["velocity fade", "dynamics persistence"],
    type: "continuous",
    range: [500, 8000],
    default: 2000, // matches DynamicsLens.DEFAULT_FADE_MS
    affects: ["dynamics"],
    directionality: {
      low: {
        description: "velocity indicators disappear quickly after each note",
        tendsTo: ["emphasise the strike", "reduce visual accumulation"],
      },
      high: {
        description: "velocity indicators persist, building a visible dynamics trail",
        tendsTo: ["emphasise dynamic contour", "increase visual density"],
      },
    },
    notes: [
      "Determines how long each note's velocity indicator lingers on the dynamics lens.",
      "Unit is ms.",
    ],
    consumers: [{ kind: "lens", id: "dynamics-lens", macroKey: "linger" }],
  },

  {
    id: "rhythm:horizon",
    name: "Rhythm horizon",
    aliases: ["rhythm view", "rhythm scroll", "timeline extent"],
    type: "continuous",
    range: [0, 1],
    default: 1.0,
    affects: ["rhythm"],
    directionality: {
      low: {
        description: "tight NOW; little history, no lookahead on the rhythm timeline",
        tendsTo: ["emphasise the current moment", "reduce visual load", "make rhythm practice more difficult"],
      },
      high: {
        description: "generous history and future context on the rhythm timeline",
        tendsTo: ["emphasise pattern over moment", "reveal recurring gestures", "assist rhythm practice by visually anticipating beats"],
      },
    },
    notes: [
      "Determines how much note history is shown on the vertically-scrolling rhythm lens.",
      "Can be set independently of the compound time-horizon macro (which fans out to this leaf plus harmony:linger and dynamics:linger). Use rhythm:horizon to isolate rhythm's history without touching the other two lenses.",
      "Unit is decimal fraction of available space.",
    ],
    consumers: [{ kind: "lens", id: "rhythm-lens", macroKey: "horizon" }],
  },

  {
    id: "rhythm:tightness-tolerance",
    name: "Tightness tolerance",
    aliases: ["strictness threshold", "grading tolerance", "drift threshold"],
    type: "continuous",
    range: [10, 100],
    default: 30, // matches RhythmLens TIGHT_TOLERANCE_DEFAULT_MS
    affects: ["rhythm", "articulation"],
    directionality: {
      low: {
        description: "strict — only near-perfect timing suppresses drift streaks",
        tendsTo: ["expose timing imprecision", "grade harshly"],
      },
      high: {
        description: "forgiving — a wider window still counts as on time and hides drift cues",
        tendsTo: ["accommodate looseness", "suppress timing feedback"],
      },
    },
    notes: [
      "Drift threshold in milliseconds. Notes whose onset falls within this window of the nearest beat subdivision render as 'tight' and suppress the streak-line motion cue.",
      "Unit is ms.",
    ],
    consumers: [{ kind: "lens", id: "rhythm-lens", macroKey: "tightnessTolerance" }],
  },

  {
    id: "rhythm:reference-linger",
    name: "Reference-marker linger",
    aliases: ["drift-marker trail", "reference trail"],
    type: "continuous",
    range: [1.0, 3.0],
    default: 1.3, // matches RhythmLens DEFAULT_REFERENCE_LINGER_MULTIPLIER
    affects: ["rhythm"],
    directionality: {
      low: {
        description: "reference lines and streaks fade with the note",
        tendsTo: ["cleaner timeline", "not accentuate timing inaccuracy"],
      },
      high: {
        description: "timing markers linger past the note's fade, leaving a trail",
        tendsTo: ["persistent timing feedback", "increase visual density", "accentuate timing inaccuracy"],
      },
    },
    notes: [
      "Multiplier applied to the note-history window for reference lines and streak markers.",
      "Unit is dimensionless multiplier (1.0 = fades with the note; 2.0 = twice as long).",
    ],
    consumers: [{ kind: "lens", id: "rhythm-lens", macroKey: "referenceLinger" }],
  },

  {
    id: "rhythm:pulse-intensity",
    name: "Beat-pulse intensity",
    aliases: ["pulse strength", "beat prominence", "now-line pulse"],
    type: "continuous",
    range: [0, 1],
    default: 0.5, // 0.5 preserves the historic pulse baseline exactly
    affects: ["rhythm"],
    directionality: {
      low: {
        description: "subdued beat pulse on the NOW line — quick decay, faint peak",
        tendsTo: ["reduce metronomic feel", "visually let notes carry rhythm"],
      },
      high: {
        description: "prominent beat pulse — longer decay, brighter peak",
        tendsTo: ["emphasise pulse", "visually reinforce beat feel"],
      },
    },
    notes: [
      "Single dial that scales the beat-pulse decay, opacity boost, and value boost together. At 0.5 the pulse matches the historic baseline.",
      "Skipped in free-time mode (requires a prescribed tempo to have a beat to pulse on).",
    ],
    consumers: [{ kind: "lens", id: "rhythm-lens", macroKey: "pulseIntensity" }],
  },

  {
    id: "system:colour-mapping:reference",
    name: "Colour anchor",
    aliases: ["reference hue", "palette anchor", "colour reference"],
    type: "continuous",
    range: [0, 360],
    default: 0, // red at pitch class 0 (C) — matches MusicalVisualVocabulary.DEFAULT_CONFIG
    affects: ["harmony", "melody"],
    directionality: {
      low: {
        description: "anchor colour toward red end of the wheel",
      },
      high: {
        description: "anchor colour rotates through the full wheel back to red",
      },
    },
    notes: [
      "Anchors the pitch C (pitch class 0) to this hue. Every other pitch class is derived by wheel rotation (+30° per semitone, clockwise).",
      "To anchor a different pitch class instead — e.g. 'make G red' — use set_hue_for_pitch(7, 0); the server computes the equivalent reference value.",
      "Unit is degree on the colour wheel with red at 0.",
    ],
    consumers: [{ kind: "vocab", id: "musical-visual", macroKey: "system:colour-mapping:reference" }],
  },

  // -----------------------------------------------------------------
  // Discrete — enum with labels
  // -----------------------------------------------------------------
  {
    id: "rhythm:quantise-resolution",
    name: "Quantise resolution",
    aliases: ["subdivision", "beat resolution", "grid depth"],
    type: "discrete",
    enumValues: [
      { value: "quarter", label: "quarter notes (loose)" },
      { value: "8th", label: "eighth notes" },
      { value: "16th", label: "sixteenth notes (default)" },
      { value: "32nd", label: "thirty-second notes (finest)" },
    ],
    default: "16th", // matches RhythmLens.macros.quantiseResolution
    affects: ["rhythm"],
    notes: [
      "Determines the reference subdivision for timing drift analysis. Drift is measured as the signed distance from the note's onset to the nearest subdivision (not the nearest beat) — `beatMs / 4` for the default `16th`, `beatMs / 2` for `8th`, `beatMs` for `quarter`, `beatMs / 8` for `32nd`.",
      "Coarser resolutions are more likely to show inaccurate timing due to fewer matching grid divisions, which counter-intuitively feels stricter but is actually an easier timing intent; finer resolutions will look more forgiving by matching to more grid divisions but is actually grading to a more difficult intent.",
      "Read `state.macros.effective[\"rhythm:quantise-resolution\"]` before reporting drift verdicts to the user and name the actual subdivision in your answer — its value directly controls what the on-screen streak lines are measuring against.",
    ],
    consumers: [{ kind: "lens", id: "rhythm-lens", macroKey: "quantiseResolution" }],
  },

  // -----------------------------------------------------------------
  // Compound — one dial fanning to multiple underlying params
  // -----------------------------------------------------------------
  {
    id: "time-horizon",
    name: "Time horizon",
    aliases: ["field of vision", "scroll extent", "look-back"],
    type: "compound",
    range: [0, 1],
    default: 1.0,
    targets: ["rhythm:horizon", "harmony:linger", "dynamics:linger"],
    affects: ["rhythm", "harmony", "dynamics", "phrasing"],
    directionality: {
      low: {
        description: "tight NOW across all three lenses; little history, no lookahead",
        tendsTo: ["emphasise the current moment", "reduce visual load"],
      },
      high: {
        description: "generous history and future context on all three lenses",
        tendsTo: ["emphasise pattern over moment", "increase visual density"],
      },
    },
    notes: [
      "Cross-lens shortcut. When you want to isolate one lens's history, use the per-lens macros (rhythm:horizon, harmony:linger, dynamics:linger) instead.",
    ],
  },

  {
    id: "rhythm:difficulty",
    name: "Rhythm difficulty",
    aliases: ["strictness", "practice difficulty", "rhythm strictness"],
    type: "compound",
    range: [0, 1],
    default: 0.5,
    targets: [
      // Both targets invert: higher difficulty ↔ narrower view ↔
      // stricter drift grading. Without inversion, higher difficulty
      // would give MORE tolerance (backwards) and a WIDER view (also
      // arguably backwards for a "harder" mode).
      { id: "rhythm:horizon", invert: true },
      { id: "rhythm:tightness-tolerance", invert: true },
    ],
    affects: ["rhythm", "articulation"],
    directionality: {
      low: {
        description: "forgiving — wide view, generous drift tolerance",
        tendsTo: ["support learning", "reduce visual grading"],
      },
      high: {
        description: "strict — narrow view, tight drift grading",
        tendsTo: ["expose imprecise timing", "reward precision"],
      },
    },
    cautions: [
      "At maximum, tiny timing deviations become visible; can feel punishing.",
    ],
  },

  {
    id: "rhythm:emphasis",
    name: "Rhythm emphasis",
    aliases: ["beat emphasis", "rhythm prominence"],
    type: "compound",
    range: [0, 1],
    default: 0.5,
    targets: [
      "rhythm:pulse-intensity", // brighter, longer beat pulse on the NOW line
      "rhythm:reference-linger", // reference lines / streaks trail past the note fade
    ],
    affects: ["rhythm"],
    directionality: {
      low: {
        description: "subdued rhythm cues; beat pulses and drift markers are quiet",
        tendsTo: ["let harmony/dynamics dominate the read", "reduce metronomic feel"],
      },
      high: {
        description: "prominent beat pulses and lingering drift markers",
        tendsTo: ["emphasise pulse", "make timing feedback visible"],
      },
    },
  },
];

// ============================================================================
// Session controls
// ============================================================================

const sessionControls: SessionControlAnnotation[] = [
  // ---- Input ----
  {
    id: "input:source",
    name: "Input source",
    aliases: ["device", "instrument", "mic"],
    type: "enum",
    enumValues: [],
    dynamicOptions: true,
    nullable: false,
    notes: [
      "MIDI device or audio input. Enumerate connected devices via the `list_inputs` tool; the currently-selected source is on `state.input` from `get_state`. (The panel widget populates from the same device list.)",
      "Audio device labels only appear after getUserMedia permission is granted for the origin (i.e. after at least one audio session has started). Before that, additional audio entries surface as placeholder names ('Audio input 1', etc.) alongside a 'Default microphone' fallback.",
    ],
  },

  // ---- Key ----
  {
    id: "session:tonic",
    name: "Tonic",
    aliases: ["key root", "tonal centre"],
    type: "enum",
    enumValues: [
      { value: 0, label: "C" },
      { value: 1, label: "C♯ / D♭" },
      { value: 2, label: "D" },
      { value: 3, label: "E♭" },
      { value: 4, label: "E" },
      { value: 5, label: "F" },
      { value: 6, label: "F♯ / G♭" },
      { value: 7, label: "G" },
      { value: 8, label: "A♭" },
      { value: 9, label: "A" },
      { value: 10, label: "B♭" },
      { value: 11, label: "B" },
    ],
    nullable: true,
    notes: [
      "The tonic pitch class for key-aware analysis. Paired with session:mode; use set_key(root, mode) to set both together.",
      "Clear to disable functional harmony analysis.",
      "The same pitch-class encoding (0=C, 1=C♯/D♭, …, 11=B) is used by set_hue_for_pitch's pc argument.",
    ],
  },
  {
    id: "session:mode",
    name: "Mode",
    type: "enum",
    enumValues: [
      { value: "ionian", label: "major (Ionian)" },
      { value: "dorian", label: "Dorian" },
      { value: "phrygian", label: "Phrygian" },
      { value: "lydian", label: "Lydian" },
      { value: "mixolydian", label: "Mixolydian" },
      { value: "aeolian", label: "minor (Aeolian)" },
      { value: "locrian", label: "Locrian" },
    ],
    default: "ionian",
    nullable: true,
    notes: [
      "Paired with session:tonic. Set both together via set_key(root, mode).",
      "Defaults to major (Ionian) when a tonic is set without an explicit mode.",
    ],
  },
  {
    id: "session:key",
    name: "Key",
    type: "pair",
    pair: ["session:tonic", "session:mode"],
    nullable: true,
    notes: ["Composite of tonic + mode."],
  },

  // ---- Tempo ----
  {
    id: "session:tempo",
    name: "Tempo",
    aliases: ["bpm", "beats per minute"],
    type: "number",
    range: [30, 240],
    unit: "BPM",
    nullable: true,
    notes: [
      "Anchors grid + linger calculations to musical time.",
      "Clear to fall back to seconds-based windows.",
      "The system does not infer tempo from onset patterns — it must be set explicitly.",
      "Drives metronome.",
    ],
  },

  // ---- Meter ----
  {
    id: "session:beats-per-bar",
    name: "Beats per bar",
    aliases: ["beats/bar"],
    type: "number",
    range: [1, 16],
    nullable: true,
    notes: [
      "The numerator of the time signature. Paired with session:beat-value; use set_meter(beats_per_bar, beat_value) to set both together.",
    ],
  },
  {
    id: "session:beat-value",
    name: "Beat value",
    aliases: ["beat unit", "note value"],
    type: "enum",
    enumValues: [
      { value: 1, label: "whole (1)" },
      { value: 2, label: "half (2)" },
      { value: 4, label: "quarter (4)" },
      { value: 8, label: "eighth (8)" },
      { value: 16, label: "sixteenth (16)" },
    ],
    nullable: true,
    notes: [
      "The denominator of the time signature. Paired with session:beats-per-bar; use set_meter(beats_per_bar, beat_value) to set both together.",
    ],
  },
  {
    id: "session:meter",
    name: "Time signature",
    aliases: ["meter"],
    type: "pair",
    pair: ["session:beats-per-bar", "session:beat-value"],
    nullable: true,
    notes: ["Composite of beats-per-bar + beat-value."],
  },

  // ---- Chord interpretation ----
  {
    id: "session:chord-mode",
    name: "Chord mode",
    aliases: ["chord interpretation"],
    type: "enum",
    enumValues: [
      { value: "harmonic", label: "harmonic" },
      { value: "bass-led", label: "bass-led" },
    ],
    nullable: false,
    notes: [
      "How chord detection identifies the root. Harmonic mode identifies chords by pitch-class content, ignoring voicing/inversion. Bass-led mode uses the lowest sounding note as the chord root.",
    ],
  },

  // ---- Metronome ----
  {
    id: "session:metronome",
    name: "Metronome",
    type: "boolean",
    nullable: false,
    notes: ["Audible click on each beat when a tempo is prescribed."],
  },
];

// ============================================================================
// System concepts (terminology dictionary)
// ============================================================================

const concepts: SystemConceptAnnotation[] = [
  // ------- Rhythm lens concepts -------
  {
    term: "note-strip",
    definition:
      "The vertical coloured bar rendered per played note in the rhythm lens. Horizontal position encodes pitch (chromatic left-to-right, octave agnostic); vertical position encodes time (top = onset, bottom = release); colour encodes pitch class (via the pitch-hue mapping).",
    related: ["now-line", "reference-line", "drift", "pitch-hue-mapping"],
  },

  {
    term: "now-line",
    definition:
      "The horizontal line near the bottom of the rhythm view that marks the present moment. Notes arise from it as they're played. History scrolls above; upcoming beats render below (when a tempo is prescribed).",
    related: ["note-strip", "rhythm-horizon"],
  },

  {
    term: "reference-line",
    definition:
      "A short horizontal mark rendered on a note-strip at the nearest beat subdivision. Present when a tempo is prescribed. Compared visually against the note's onset to reveal timing drift.",
    related: ["drift", "note-strip", "quantise-resolution"],
  },

  {
    term: "drift",
    definition:
      "The timing offset between a played note's onset and the nearest beat subdivision, given the prescribed tempo and quantise resolution. Notes within roughly 30 ms (by default; depends on tightness tolerance) are considered on-the-grid and show no drift marks. Notes further out show streak lines whose direction (up/down) and length encode how early or late the note landed. Direction of the streak can be interpreted as a nudge on the vertical orientation of the timeline - pointing up / trailing down shows that the nearest quantised subdivision was earlier than the note, pointing down / trailing up shows that it was later.",
    related: ["reference-line", "quantise-resolution", "rhythm-difficulty"],
    examples: [
      "A note played 60 ms after the beat shows an upward-pointing (downward-trailing) streak.",
      "A note played on-the-grid shows a reference line through it with no streaks.",
    ],
  },

  {
    term: "rhythm-horizon",
    definition:
      "How much of the rhythm timeline is visible at once. At full horizon, several seconds of history scroll above the now-line; at minimum horizon, only a beat or two is visible.",
    related: ["now-line", "note-strip"],
  },

  {
    term: "beat-pulse",
    definition:
      "A brief brightening of the now-line on each beat when a tempo is prescribed. Its intensity and decay are controlled by the rhythm:emphasis macro.",
    related: ["now-line", "rhythm-emphasis"],
  },

  // ------- Harmony lens concepts -------
  {
    term: "progression-clock",
    definition:
      "The circular chord progression layout in the bottom cell of the harmony lens (also called the harmony clock). Chord numerals sit around a clock face by pitch-class angle (I at 0). When a key is prescribed, an inner ring shows diatonic degrees (I–vii) and an outer ring shows borrowed chords; connector arcs indicate modal-interchange relationships between them.",
    related: ["guide-ring", "connector-strip", "borrowed-chord", "modal-interchange"],
  },

  {
    term: "guide-ring",
    definition:
      "One of three faint circles on the progression clock (inner / middle / outer). The middle ring anchors the diatonic numerals; the outer ring anchors borrowed numerals. Provides structural bearings for the eye.",
    related: ["progression-clock"],
  },

  {
    term: "borrowed-chord",
    definition:
      "A chord drawn from outside the current diatonic key. E.g. in C major, an A♭ major chord (♭VI) is borrowed from C minor. Borrowed chords render on the outer ring of the progression clock rather than the inner ring, and often carry connector arcs to the diatonic destinations they imply.",
    related: ["modal-interchange", "progression-clock", "guide-ring"],
    examples: [
      "♭VI in C major is A♭ major (borrowed from the parallel minor).",
      "♭VII in C major is B♭ major (a common subdominant borrowing).",
    ],
  },

  {
    term: "modal-interchange",
    definition:
      "A functional-harmony relationship where a borrowed chord implies resolution toward one or more diatonic chords. Rendered as a directional connector arc + terminating strip on the progression clock, arcing from the borrowed chord's position toward the target degree's position.",
    related: ["borrowed-chord", "connector-strip", "connector-arc", "progression-clock"],
    examples: [
      "♭VI often pulls toward ii or IV (subdominant borrowing).",
      "♭VII typically pulls toward IV.",
    ],
  },

  {
    term: "connector-arc",
    definition:
      "The animated arc that draws from a borrowed chord's position on the progression clock toward its implied resolution target. Coloured by the source chord's hue. Terminates in a connector-strip at the target. Only borrowed chords with a modal interchange relationship to a diatonic chord spawn connector arcs and connector strips.",
    related: ["modal-interchange", "connector-strip"],
  },

  {
    term: "connector-strip",
    definition:
      "A short, wider terminating mark at the target end of a connector arc. Gradient-coloured from source hue (arc side) to target hue (chord side). Marks where the borrowed chord's implied resolution lands on the clock.",
    related: ["connector-arc", "modal-interchange"],
  },

  {
    term: "chord-quality-glyph",
    definition:
      "The radial visual language rendered in the upper section of the harmony lens, illustrating the QUALITY (nature) of the currently-detected chord — major, minor, sus, dominant seventh, etc. Composed of a central hub and outward spokes: the hub encodes the overall chord quality; each spoke represents one note of the chord (by its degree relative to the root, not its absolute pitch), oriented at a fixed angle around the hub with the root at 0°. Independent of the progression clock below it — the glyph describes what the chord IS; the clock describes what the chord DOES in the key.",
    related: ["glyph-spoke", "glyph-hub", "progression-clock"],
    examples: [
      "A C major triad shows a hub coded 'major' and three long spokes at the root, third, and fifth positions.",
      "A Cmaj7 shows the same triad shape plus one medium-length spoke at the seventh.",
      "A Csus2 replaces the third spoke with a short spoke at the ninth (second).",
    ],
  },

  {
    term: "glyph-spoke",
    definition:
      "One outward line from the chord-quality-glyph hub, representing a single note in the chord relative to the root. Length encodes the note's structural role: triadic notes (root, third, fifth) are longest; seventh is mid-length; other diatonic extensions are shortest; non-diatonic / chromatic tones render as thin lines that don't participate in the overall shape.",
    related: ["chord-quality-glyph", "glyph-hub"],
  },

  {
    term: "glyph-hub",
    definition:
      "The centre of the chord-quality-glyph, indicating the overall chord quality (major, minor, diminished, augmented, sus2/sus4, dominant, etc.). The hub's shape and colour summarise the chord's character in a single mark; the spokes around it enumerate its notes.",
    related: ["chord-quality-glyph", "glyph-spoke"],
  },

  // ------- Dynamics lens concepts -------
  {
    term: "dynamics-indicator",
    definition:
      "A short horizontal mark in the dynamics lens (vertical bar on the left of the view) rendered per note onset. Its vertical position encodes velocity — higher up = louder. Fades out over the dynamics:linger window.",
    related: ["dynamics-linger"],
  },

  // ------- Cross-cutting concepts -------
  {
    term: "pitch-hue-mapping",
    definition:
      "The scheme by which each of the twelve pitch classes maps to a hue on the colour wheel. Anchored on pitch C (pitch class 0); the anchor hue defaults to red. Other pitches are derived by rotating around the wheel (+30° per semitone, clockwise by default). Consistent across all lenses.",
    related: ["colour-anchor"],
  },

  {
    term: "colour-anchor",
    definition:
      "The colour assigned to the anchor pitch (C by default). All other pitch-class colours are derived by wheel rotation from this anchor. Changing the anchor rotates the whole palette; use set_hue_for_pitch(pc, hue) to move the anchor onto a different pitch.",
    related: ["pitch-hue-mapping"],
  },

  {
    term: "prescribed-context",
    definition:
      "The user-set musical frame the analyser reads within: key (tonic + mode), tempo, meter, chord-interpretation mode. These are never inferred — the user sets them via session:* controls. Without a prescribed key, functional harmony analysis is disabled; without a tempo, the rhythm lens runs in free-time (no beat grid, no drift analysis).",
    related: ["free-time", "key-aware"],
  },

  {
    term: "key-aware",
    definition:
      "When a key is prescribed, the progression clock (bottom cell of the harmony lens) enables functional analysis: chord degrees (I, ii, ♭VI, etc.), borrowed classification, and modal-interchange relationships. Without a key, the progression clock shows chord names only. The chord glyph (top cell) is key-independent.",
    related: ["prescribed-context", "progression-clock", "borrowed-chord"],
  },

  {
    term: "free-time",
    definition:
      "The rhythm lens's mode when no tempo is prescribed. Notes scroll through the now-line with no beat grid, no reference lines, no drift analysis. Grid + drift features re-enable when the user prescribes a tempo.",
    related: ["prescribed-context", "now-line", "drift"],
  },
  {
    term: "part",
    definition:
      "A logical routing target within a single Synesthetica instance — think 'voice' or 'channel' rather than 'instance'. Every musical event, entity, and adapter carries a partId (string). The v1 shape ships a single part called \"main\": all notes and chords route to it, and every event you'll see in get_recent_events has `part: \"main\"`. Multi-part routing (\"this is the guitar, apply X to guitar\") is designed for but not shipped — see PartSelector in the contracts. Don't try to filter or group by `part` today; if the user asks about per-instrument routing, name it as planned-not-shipped.",
    related: ["prescribed-context"],
  }
];

// ============================================================================
// Lenses
// ============================================================================

const lenses: LensAnnotation[] = [
  {
    id: "rhythm-lens",
    name: "Rhythm lens",
    aliases: ["rhythm view", "timeline"],
    illustrates: ["rhythm", "articulation", "phrasing"],
    traits: ["directional", "reactive", "high-contrast"],
    notes: [
      "Central column. Note strips scroll upward through the NOW line.",
      "Reference lines and streaks visualise drift against the current subdivision (when a tempo is prescribed).",
      "Shows how individual notes appear in time, with visual feedback on timing accuracy and pitch.",
    ],
    macroResponses: {
      "time-horizon": {
        responsiveness: "strong",
        notes: "compound; fans to rhythm:horizon (among others)",
      },
      "rhythm:horizon": {
        responsiveness: "strong",
        notes: "the scrolling window's history + lookahead extent",
      },
      "rhythm:quantise-resolution": {
        responsiveness: "strong",
        notes: "reference subdivision used for drift calculation + grid density",
      },
      "rhythm:tightness-tolerance": {
        responsiveness: "strong",
        notes: "drift threshold below which streak-line motion cues are suppressed",
      },
      "rhythm:reference-linger": {
        responsiveness: "strong",
        notes: "how long reference lines + drift streaks trail past the source note",
      },
      "rhythm:pulse-intensity": {
        responsiveness: "strong",
        notes: "brightness + duration of the NOW-line beat pulse",
      },
      "rhythm:difficulty": {
        responsiveness: "strong",
        notes: "compound; fans to rhythm:horizon + rhythm:tightness-tolerance (both inverted)",
      },
      "rhythm:emphasis": {
        responsiveness: "strong",
        notes: "compound; fans to rhythm:pulse-intensity + rhythm:reference-linger",
      },
    },
  },

  {
    id: "harmony-lens",
    name: "Harmony lens",
    aliases: ["chord view"],
    illustrates: ["harmony", "phrasing"],
    traits: ["layered", "persistent", "stable"],
    notes: [
      "Right column. Vertically divided in two. Upper section shows chord quality. Lower section shows functional harmony.",
      "Functional harmony shows chord numerals arranged on a clock face by pitch-class angle, divided into diatonic and non-diatonic rings, with the chord name in the middle. Modal-interchange relationships shown as directional connector arcs to target strips. Only chord name appears when no key is prescribed.",
      "Chord quality shows the nature of the chord using a bespoke visual language oriented around a radial shape with spokes representing each note degree (1st, 3rd, 7th etc) and a hub representing the overall chord quality (minor, suspended 2nd etc). Root note is at 0 degrees. Triadic notes are the longest. 7ths are mid length. All other diatonic notes are shortest. Non-diatonic / chromatic notes indicated as lines that do not constitute the overall shape.",
    ],
    macroResponses: {
      "harmony:linger": {
        responsiveness: "strong",
        notes: "how long released chords remain on the clock",
      },
      "harmony:arpeggio-tolerance": {
        responsiveness: "moderate",
        notes: "affects whether arpeggios register as chords",
      },
      "harmony:note-threshold": {
        responsiveness: "moderate",
        notes: "minimum voicing size for chord detection",
      },
      "harmony:detection-stability": {
        responsiveness: "moderate",
        notes: "anti-flicker on the chord surface (hysteresis on chord switching)",
      },
      "system:colour-mapping:reference": {
        responsiveness: "strong",
        notes: "shifts the palette of all chord numerals, connector strips, and glyph shapes",
      },
      "time-horizon": {
        responsiveness: "strong",
        notes: "compound; fans to harmony:linger (among others)",
      },
    },
  },

  {
    id: "dynamics-lens",
    name: "Dynamics lens",
    aliases: ["dynamics bar", "velocity view"],
    illustrates: ["dynamics", "articulation"],
    traits: ["transient", "reactive", "minimal"],
    notes: [
      "Left column. Vertical bar; per-note indicator lines at velocity height.",
      "Indicator lines fade over dynamics:linger ms.",
    ],
    macroResponses: {
      "dynamics:linger": {
        responsiveness: "strong",
        notes: "fade window for velocity indicators",
      },
      "time-horizon": {
        responsiveness: "strong",
        notes: "compound; fans to dynamics:linger (among others)",
      },
    },
  },
];

// ============================================================================
// Tools (MCP verbs)
// ============================================================================
//
// Editorial voice for each MCP tool: description shipped in
// tools/list, aliases the LLM can recognise from user speech, notes,
// and examples. The tool's actual schema + handler live in
// packages/cli/src/tools/*.ts; the CLI reads description from here
// at registration so this file is the single edit point for the
// LLM-facing wording.
//
// UI panel does NOT render tools — tools are verbs, not adjustable
// controls. The panel generator reads macros + sessionControls only.

const tools: ToolAnnotation[] = [
  // ---- Session controls ----
  {
    id: "set_key",
    description:
      "Set the prescribed key (tonic + mode) so the progression clock (bottom cell of the harmony lens) can perform functional analysis (I, ii, ♭VI degrees; borrowed-chord classification; modal-interchange arcs). Both null to clear.",
    aliases: ["set key", "in the key of", "we're in", "change key"],
    notes: [
      "root: pitch class 0..11 (0=C, 1=C♯/D♭, …, 11=B). mode: 'ionian' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian' | 'locrian'. Set both together as a pair.",
      "Clearing (both null) disables numerals and borrowed classification — the progression clock shows chord names only. The chord glyph (top cell) is unaffected.",
    ],
    examples: [
      "set_key(root: 5, mode: 'aeolian') — F minor.",
      "set_key(root: null, mode: null) — clear the key.",
    ],
  },

  {
    id: "set_tempo",
    description:
      "Set the prescribed tempo in BPM. Enables the rhythm lens's beat grid, drift analysis, and beat pulse. Null clears (rhythm falls back to free-time; grid features disable).",
    aliases: ["set bpm", "set tempo", "change tempo", "we're at"],
    notes: [
      "Range 30–240 BPM. The system never infers tempo from onset patterns — it must be set explicitly.",
      "Also drives the metronome click when session:metronome is enabled.",
      "**BPM convention**: the value counts quarter notes per minute (not beat-value units). So a bar's duration in seconds is `beats_per_bar × 60/BPM × 4/beat_value`. In 4/4 the `4/beat_value` term is 1 and it collapses to `beats_per_bar × 60/BPM`; in 6/8 at 120 BPM a bar is `6 × 60/120 × 4/8 = 1.5 seconds`. Use this when converting user requests in bars to a seconds-valued macro.",
    ],
    examples: [
      "set_tempo(bpm: 120) — standard mid-tempo.",
      "set_tempo(bpm: null) — clear; rhythm lens goes free-time.",
    ],
  },

  {
    id: "set_meter",
    description:
      "Set the prescribed time signature as (beats_per_bar, beat_value). Enables bar-relative visualisation. Both null to clear.",
    aliases: ["set time signature", "in", "meter"],
    notes: [
      "beat_value must be one of {1, 2, 4, 8, 16}. Both args must be both null (clear) or both set.",
      "Defaults to 4/4 when a tempo is set without an explicit meter.",
      "Nomenclature: 'cut time' → set_meter(2, 2); 'common time' → (4, 4); 'compound' phrasing usually means /8 with beats_per_bar in {6, 9, 12} (dotted-quarter feel). See set_tempo for how BPM interacts with beat_value.",
    ],
    examples: [
      "set_meter(beats_per_bar: 6, beat_value: 8) — 6/8.",
      "set_meter(beats_per_bar: 3, beat_value: 4) — waltz.",
      "set_meter(beats_per_bar: 2, beat_value: 2) — cut time.",
    ],
  },

  {
    id: "set_chord_mode",
    description:
      "Choose how chord detection identifies the root: 'harmonic' (by pitch-class content, ignoring voicing/inversion) or 'bass-led' (lowest sounding note is the root).",
    aliases: ["chord interpretation", "chord reading", "how to read chords"],
    notes: [
      "Harmonic is the default and suits most contexts. Bass-led is useful for jazz voicings where the bass note carries functional meaning.",
    ],
  },

  {
    id: "set_metronome",
    description:
      "Enable or disable the audible metronome click. Requires a prescribed tempo to click against; a no-op otherwise.",
    aliases: ["click on", "click off", "metronome on", "metronome off"],
  },

  {
    id: "set_input",
    description:
      "Select the input source (MIDI device or audio input). Use the `list_inputs` tool for the enumerated list of available devices — each entry carries a `sourceString` ready to pass here. Format: `midi:<device-id>`, 'audio' (default microphone), or `audio:<device-id>` (specific audio input). Current selection is on `state.input` from `get_state`.",
    aliases: ["use", "listen to", "switch to", "input"],
    notes: [
      "**Input switching is mid-session, not new-session.** Swapping input keeps the same session alive — `startedAt`, `now`, all macros (intents + effective), all session controls (`chordMode`, `tempo`, `key`, `meter`, `metronome`), and the `recent-events` buffer all carry over. Only the adapter changes. `session.phase` stays `input-active` throughout. If you want a fresh session (clock reset, buffer cleared), call `stop_session` first.",
    ],
    examples: [
      "set_input(source: 'midi:Yamaha P-125') — listen to that MIDI keyboard.",
      "set_input(source: 'audio:default') — listen to the default microphone.",
    ],
  },

  // ---- Macros ----
  {
    id: "set_macro",
    description:
      "Set any aesthetic macro (system:*, cross-cutting, or `<scope>:*`). Value shape depends on the macro's type: number for continuous / compound, string or number for discrete. Every macro's range, default, and directionality is embedded in the Macros section of the `get_started` primer.",
    aliases: ["adjust", "tune", "set macro", "change how"],
    notes: [
      "Compound macros fan out to leaf targets via a linear default curve; per-target inversion is applied when the compound's semantic runs opposite the leaf's natural range. See the compound's targets field in the manifest.",
      "`get_state.macros.intents` reflects the last value asked for per macro — populated by any of `set_macro`, `set_hue_for_pitch`, `switch_preset`, or a panel widget edit. Compound macros are keyed by their compound id. `get_state.macros.effective` is what pipeline consumers are actually running with. Read `intents` to see what has been asked for (by anyone — you or the user via the panel); read `effective` to see what the pipeline is doing right now.",
      "**Compound-vs-leaf routing**: prefer the compound when the user's frame is cross-lens ('everything more expansive' → time-horizon; 'harder rhythm practice' → rhythm:difficulty). Prefer the leaf when the request targets one lens ('just the chord fade' → harmony:linger; 'only the rhythm horizon' → rhythm:horizon). Compounds do a linear fan-out — set a leaf directly when you want a specific value on one target without disturbing siblings.",
    ],
    examples: [
      "set_macro(name: 'harmony:linger', value: 6) — chord symbols linger visibly on the clock.",
      "set_macro(name: 'rhythm:emphasis', value: 0.9) — pronounced beat pulse + drift-marker trails.",
      "set_macro(name: 'rhythm:quantise-resolution', value: '8th') — grade drift against eighth-note subdivisions.",
    ],
  },

  {
    id: "set_hue_for_pitch",
    description:
      "Rotate the colour wheel so a specific pitch class maps to a specific hue. Adjusts system:colour-mapping:reference server-side so the LLM doesn't compute wheel-rotation math for anchor requests.",
    aliases: ["set colour", "make X red", "colour anchor", "map pitch to colour"],
    notes: [
      "pc: 0..11 (0=C, …, 11=B). hue: 0..360 degrees (0=red).",
      "Default anchor is C=red. Every other pitch class is derived by wheel rotation (+30° per semitone, clockwise).",
    ],
    examples: [
      "set_hue_for_pitch(pc: 7, hue: 0) — make G red instead of C.",
      "set_hue_for_pitch(pc: 4, hue: 120) — anchor E to green.",
    ],
  },

  // ---- Presets ----
  {
    id: "switch_preset",
    description:
      "Load a named preset. Every macro and prescribed control (key, tempo, meter, chord mode, metronome) snaps to the preset's stored value. **Input source is NOT part of a preset** — whichever input the user has selected stays selected. Enumerate names via the `list_presets` tool; inspect one without loading via `get_preset(name)`.",
    aliases: ["load preset", "switch preset", "recall"],
    notes: [
      "On failure the error's details.available field lists all preset names known to the store.",
      "A successful load sets `state.activePreset` (read via `get_state`) to the loaded name — so the LLM can see which preset is current without tracking it manually.",
      "**Anchoring after a load**: macros.intents is repopulated with the preset's stored values (that IS what the user just asked for). A relative request immediately after switch_preset ('a bit more chord linger') anchors on those loaded intents, not on the annotated defaults.",
      "Input is deliberately excluded from presets so that loading one doesn't hijack the pipeline's current listening surface — a preset saved on a MIDI keyboard should still be usable on a microphone-only setup, and vice versa.",
    ],
  },

  {
    id: "save_preset",
    description:
      "Save the current control-surface state as a named preset. Overwrites if the name already exists.",
    aliases: ["save as", "remember this", "save preset"],
    notes: [
      "Name must be `[a-zA-Z0-9_-]{1,64}`. Stored on disk at `$XDG_DATA_HOME/synesthetica/presets/<name>.json`.",
      "Captures: macro values + session state (key, tempo, meter, chord mode, metronome). **Input source is NOT captured** — presets are aesthetic/musical state, not device selection. See switch_preset notes for the rationale.",
    ],
  },

  {
    id: "delete_preset",
    description:
      "Delete a saved preset by name. Errors with PRESET_NOT_FOUND if no preset by that name exists. Doesn't touch `state.activePreset` — the label may still reference the deleted name, since it's informational (nothing continues to live from a preset once it's loaded).",
    aliases: ["remove preset", "forget preset", "delete preset"],
    notes: [
      "Preset files live on disk (`$XDG_DATA_HOME/synesthetica/presets/<name>.json`). Deletion is immediate and unrecoverable — no trash / undo layer.",
      "On PRESET_NOT_FOUND the error's `details.available` lists all preset names known to the store, in case the user typo'd the name.",
    ],
  },

  // ---- Session lifecycle ----
  //
  // The MCP server is always-on and cheap; the pipeline (web-app + WS
  // bridge + browser tab) sits behind these tools. LLM calls
  // start_session when the user signals musical intent, stop_session
  // when they're done. See SPEC 014 §Lifecycle.
  {
    id: "start_session",
    description:
      "Spawn the visualiser: open the web-app in a browser tab, start the WS bridge, and connect the engine. Call this when the user signals musical intent. Idempotent — a no-op if a session is already running. Every other engine tool (set_macro, set_key, get_state, etc.) requires a running session and returns ENGINE_NOT_STARTED otherwise.",
    aliases: ["start", "let's play", "begin session", "open the visualiser"],
    notes: [
      "The browser tab opens automatically (Chrome by default) when the CLI is running under a windowed shell. Under headless / stdio-only conditions the visualiser URL is returned in the tool result's data.webAppUrl for manual open.",
    ],
  },

  {
    id: "stop_session",
    description:
      "Tear the visualiser down: close the web-app subprocess and WS bridge. Call this when the user says they're done. Idempotent. Preset saves remain valid across sessions.",
    aliases: ["stop", "we're done", "close the visualiser", "end session"],
  },

  // ---- Read surface (tool wrappers over resource content) ----
  //
  // MCP treats resources as a first-class primitive, but Claude
  // Desktop only surfaces tools to the LLM as callable — resources
  // land only via user-triggered attachment. These tools give the LLM
  // an autonomous read path. The underlying resource URIs remain for
  // user-triggered attachment and for clients that DO proxy resources.
  {
    id: "get_started",
    description:
      "Return the full Synesthetica primer AND a `primer` token that every other tool in this server requires. Response shape: `{ ok: true, data: { primer, token }, state }`. Call this once per conversation before acting on other Synesthetica tools — everything needed to interpret the user's musical requests is in `data.primer`, and you'll need `data.token` on every subsequent call.",
    aliases: ["primer", "get started", "onboard", "what is synesthetica"],
    notes: [
      "Synesthetica advertises this tool with a strong hint in the MCP initialize instructions. Call it early — before set_macro, set_key, set_tempo, or any other tool — so the LLM has the ranges + directionality + tool aliases to interpret speech accurately.",
      "`data` is `{ primer, token }`. `primer` is the prose you read; `token` is the argument you pass as `primer` on every non-get_started call. `state` is a defaulted empty snapshot for shape compatibility. Call get_state separately to see current engine state.",
      "Token is a stateless fingerprint of the primer text (SHA-256 truncated). If you get a `PRIMER_INVALID` error on a later tool call, the primer has changed and your token is stale — the error's `details` carry the fresh `primer` + `token` so you can retry in one round-trip without re-calling this tool manually.",
    ],
  },

  {
    id: "get_state",
    description:
      "Return the current engine state: macros (intents + effective), prescribed session context (key, tempo, meter, chord mode, metronome), input source, active preset, phase, and session-time anchors. This is your autonomous read surface for state — the matching `state://<label>/current` resource carries the same content but exists for user-triggered attachment, not LLM reads.",
    aliases: ["what's set", "current state", "read state", "how are things"],
    notes: [
      "`macros.intents` reflects the last value asked for per macro — populated by any of `set_macro`, `set_hue_for_pitch`, `switch_preset`, or a panel widget edit (the user dragging a slider in the visualiser tab dispatches through the same path as your tool calls). Compound macros are keyed by their compound id. `macros.effective` is what pipeline consumers are actually running with. Divergence between the two is often legitimate — a compound intent alongside a directly-set leaf, a preset apply + subsequent tweak, or the user editing a slider while you were reading state — treat as information, not an automatic bug.",
      "startedAt is null until state.session.phase reaches `input-active` — the pipeline can be up (phase `spawned`) with no input selected, in which case startedAt stays null. Check `phase` to distinguish 'no session' from 'session ready but idle'.",
    ],
  },

  {
    id: "list_inputs",
    description:
      "List connected MIDI + audio input devices. Each entry carries a sourceString ready to pass to set_input(source). This is your autonomous read surface for enumerating devices — the matching `inputs://` resource carries the same content but exists for user-triggered attachment.",
    aliases: ["available inputs", "what inputs", "devices", "list devices"],
    notes: [
      "Read on demand — hot-plug notifications aren't wired yet. Audio device labels only appear after the browser has been granted microphone permission at least once for this origin.",
      "**If the list looks shorter than expected** (e.g. only the microphone when the user says a MIDI keyboard is plugged in), check `state.permissions.midi` before assuming a hardware problem. `denied` means the browser refused MIDI (user must re-enable via browser site settings — not a re-prompt path). `granted` with no MIDI entry is when to suspect a cable. `prompt` is transient — a race window during page load before `requestMIDIAccess` resolves; re-read once rather than telling the user to click anything.",
    ],
  },

  {
    id: "list_presets",
    description:
      "List saved presets by name, with savedAt + prescribed session context at save time. Use switch_preset(name) to load one. This is your autonomous read surface for preset enumeration — the matching `presets://` resource carries the same content but exists for user-triggered attachment.",
    aliases: ["available presets", "what presets", "saved presets"],
    notes: [
      "Returns preset SUMMARIES (name + savedAt + session) only. For a preset's macro values without loading it, use get_preset(name).",
      "Input source is not part of preset content — loading a preset never changes what the pipeline is listening to.",
    ],
  },

  {
    id: "get_preset",
    description:
      "Return one preset's full stored content — macro values + session controls — WITHOUT loading it. Use to answer 'what's in my practice preset?' before deciding whether to switch. Input source is not part of a preset. This is your autonomous read surface for one preset's content — the matching `presets://<name>` resource carries the same content but exists for user-triggered attachment.",
    aliases: ["show preset", "preview preset", "what's in preset"],
    notes: [
      "Non-destructive read. The current control surface is untouched. On unknown name, error's details.available lists preset names for retry.",
    ],
    examples: [
      "get_preset(name: 'practice') — inspect what practice would restore before deciding.",
    ],
  },

  {
    id: "get_recent_events",
    description:
      "Return recent musical events (note-on/off, chord-detected/changed) wrapped in a temporal envelope `{startedAt, now, events}`. Each event's `t` is milliseconds since startedAt. Read this to answer 'what did I just play?', 'summarise the last few chords', 'how long ago was that?'. This is your autonomous read surface for musical history — the matching `state://<label>/recent-events` resource carries the same content but exists for user-triggered attachment. `limit` defaults to 100 and is capped by the buffer (default 10k events, ~1 hour of typical play). Cross-session recall is a non-goal; earlier sessions aren't persisted.",
    aliases: ["recent activity", "what did I play", "recent events"],
    notes: [
      "Pull-only per SPEC 013 §I30 — musical activity at pipeline cadence would pump inference in some clients. Read when the LLM decides it needs context.",
      "See **Session time** above for bitemporal semantics (`t` vs `frameT`), ordering guarantees, and how to answer temporal questions. This tool inherits all of it.",
      "**Event field shapes:** `note-on` carries `{ noteId, part, pitch (MIDI), pitchClass, octave, velocity, confidence }` — confidence is 1.0 for MIDI, model-reported for audio (< 1.0). `note-off` carries `{ noteId, part, pitch (MIDI), pitchClass, octave, velocity }` — pitch is repeated so the event stands alone; `noteId` matches the corresponding note-on if you need the confidence. `chord-detected` and `chord-changed` carry `{ chordId, part, voicing (MIDI), pitchClasses, bass, harmonic: {root, quality}, bassLed: {root, quality}, isInverted, inversion, previousChordId? }`. Chord events do NOT currently carry a confidence field — reason about note-level confidence from the constituent note-on events if you need it.",
      "`part` is always `\"main\"` in v1 — don't group or filter by it.",
      "**Token budget.** Rough sizes: note-on ~80 tokens, note-off ~65, chord event ~180. `limit: 100` at 2–3 events/sec ≈ 10–15k tokens for ~30–40 sec of history. Scales linearly: `limit: 500` ≈ 60–80k, `limit: 1000` ≈ 120–160k. Prefer `since:` for polling; large `limit` only when you actually need the sweep.",
    ],
    examples: [
      "get_recent_events(limit: 20) — the last twenty events.",
      "get_recent_events(since: 143) — poll for events after the last id seen.",
    ],
  },

  {
    id: "clear_recent_events",
    description:
      "Drop everything in the recent-events buffer. The visualiser is unaffected — only the LLM's `get_recent_events` history view is cleared. The session clock, adapters, macros, and session controls all carry on. Use when the user explicitly asks for a fresh reading horizon (\"let's start over, ignore what I just played\"); ASK before calling if they didn't. Clearing means you lose access to prior events for reasoning — 'how has my playing changed' style questions won't have data from before the clear.",
    aliases: ["clear history", "reset history", "fresh start", "forget what I played"],
    notes: [
      "This is a user-directed reset, not a token-management primitive. Prefer `since:` polling on `get_recent_events` to bound your own token usage; reach for `clear_recent_events` when the USER wants the buffer emptied.",
      "Returns the current engine state (unchanged by the clear) for shape consistency with other tools.",
    ],
  },
];

// ============================================================================
// Resources (MCP nouns — data surfaces the LLM can read)
// ============================================================================
//
// Editorial voice for MCP resources whose content isn't already
// covered by a per-item annotation. Each macro / session control /
// concept / lens / preset already carries its OWN annotation and
// becomes an annotations://* resource — those don't need entries
// here. This section is for the state + preset-index + annotations-
// bundle URIs.
//
// The composed system-overview prompt renders these as `## Resources`
// so the LLM knows what it can read without having to browse
// resources/list.

const resources: ResourceAnnotation[] = [
  {
    uri: "inputs://",
    name: "Available inputs",
    description:
      "Currently-connected MIDI devices + audio inputs, as an array of { kind, name, id, sourceString }. `sourceString` is exactly what to pass to set_input(source) — no reconstruction needed. Pull-only for now (hot-plug notifications not wired yet).",
    aliases: ["available devices", "connected devices", "MIDI + audio list"],
    notes: [
      "User-attach surface. The LLM should call `list_inputs` instead — same content, autonomous read path.",
      "The audio entry represents the default microphone routed through Basic Pitch; per-device audio enumeration isn't yet exposed.",
      "MIDI device availability depends on the browser hosting the engine — Chrome is the most reliable; some Firefox versions may miss devices (synesthetica-qko).",
    ],
    examples: [
      "Empty MIDI: [{ kind: 'audio', name: 'Default microphone (Basic Pitch)', id: 'default', sourceString: 'audio' }]",
      "With a keyboard: [{ kind: 'midi', name: 'Yamaha P-125', id: '…', sourceString: 'midi:…' }, { kind: 'audio', … }]",
    ],
    subscribable: false,
  },

  {
    uri: "state://<label>/current",
    name: "Current state snapshot",
    description:
      "Snapshot of the current control surface for one instance: macro values, prescribed context (key/tempo/meter/chord-mode/metronome), active preset, input source, and temporal frame (startedAt + now). Subscribable — the CLI pushes an update whenever any control changes.",
    aliases: ["current state", "state snapshot", "engine state"],
    notes: [
      "User-attach surface. The LLM should call `get_state` instead — same content, autonomous read path.",
      "Setter tools return the resolved state in their `state` field on success, so an explicit read isn't needed right after a mutation.",
      "startedAt is ISO wall-clock at session start; now is session-ms computed fresh at read time. Two consecutive reads will show `now` advancing.",
      "startedAt and now are null until session.phase reaches `input-active` — the pipeline can be up (phase `spawned`) with no input adapter yet, in which case both are still null. Check `phase` to distinguish 'no session' from 'session ready but idle'.",
    ],
    examples: [
      "state://default/current — the only instance today; multi-instance planned but not shipped.",
    ],
    subscribable: true,
  },

  {
    uri: "state://<label>/recent-events",
    name: "Recent musical events",
    description:
      "Musical event stream from the pipeline's MusicalFrame — note-on, note-off, chord-detected, chord-changed. Wrapped in a temporal envelope { startedAt, now, events }. Pull-only per SPEC 013 §I30 (subscribing would pump inference in some MCP clients).",
    aliases: ["recent events", "history", "recent playing", "musical history"],
    notes: [
      "User-attach surface. The LLM should call `get_recent_events` instead — same content, autonomous read path.",
      "Musical-layer event stream — semantic facts (pitch classes, chord root/quality), not visual entities.",
      "Supports `?limit=N` (default 100, max 1000) and `?since=<id>` query params.",
      "Each event's `t` is session-ms; combine with envelope.startedAt for wall-clock, or with envelope.now for 'age' math.",
    ],
    examples: [
      "state://default/recent-events?limit=20 — most recent 20 events.",
      "state://default/recent-events?since=42 — everything after event id 42 (useful for incremental polling).",
    ],
    subscribable: false,
  },

  {
    uri: "presets://",
    name: "Presets — index",
    description:
      "List of saved preset summaries { name, savedAt, session }. User-attach surface — the LLM should call `list_presets` for the same content via the autonomous read path.",
    aliases: ["preset list", "available presets"],
    notes: [
      "User-attach surface. The LLM should call `list_presets` instead — same content, autonomous read path.",
      "Presets are user-managed; the manifest doesn't ship defaults.",
      "Input source is intentionally excluded from preset content — loading a preset never changes what the pipeline is listening to.",
    ],
    subscribable: false,
  },

  {
    uri: "presets://<name>",
    name: "Preset — one entry",
    description:
      "Full stored content of one preset: macros + session (key/tempo/meter/chord-mode/metronome) + savedAt. User-attach surface — the LLM should call `get_preset(name)` for the same content via the autonomous read path. Input source is not part of a preset.",
    subscribable: false,
  },

  {
    uri: "annotations://manifest",
    name: "Annotation manifest (bundled)",
    description:
      "The full annotation manifest as one JSON document — macros, session controls, concepts, lenses, presets, tools, resources. Convenience for clients that prefer one fetch over per-URI browsing.",
    notes: [
      "Every individual macro / session control / concept / lens / preset also has its own `annotations://<category>/<id>` resource for finer-grained reads.",
      "The `get_started` tool response already embeds this content, so the LLM rarely needs the bundle — reserve it for user-triggered attach or clients that proxy resource reads natively.",
    ],
    subscribable: false,
  },
];

// ============================================================================
// Presets
// ============================================================================
//
// Presets are USER-MANAGED at runtime — saved via save_preset(name),
// switched via switch_preset(name), enumerated via list_presets, and
// stored on disk at $XDG_DATA_HOME/synesthetica/presets/*.json.
//
// This array is for SHIPPED default presets — a curated set the app
// bundles for first-run users to try. Empty for now; populate when we
// author defaults. Each entry follows PresetAnnotation shape (name,
// emphasises, deEmphasises, traits, notes).
const presets: PresetAnnotation[] = [];

// ============================================================================
// Manifest (what the LLM consumes)
// ============================================================================

// ============================================================================
// Derived state
// ============================================================================

const derivedState: DerivedStateAnnotation[] = [
  {
    id: "permissions",
    name: "Browser permissions",
    aliases: ["midi permission", "microphone permission", "audio permission"],
    derivedFrom: [
      "actual outcome of navigator.requestMIDIAccess() for midi",
      "actual outcome of getUserMedia() for audio",
      "browser Permissions API query as a fallback initial hint",
    ],
    values: ["granted", "prompt", "denied"],
    notes: [
      "Browser permission state for the pipeline's input sources: `{ midi, audio }`. Each is `granted | prompt | denied`. Derived from the actual outcome of the underlying API (requestMIDIAccess resolved → `granted`; rejected → `denied`; same for getUserMedia), NOT from the Permissions API's `query({name})` which is unreliable for MIDI in Chrome (doesn't fire onchange when the user grants via the requestMIDIAccess prompt).",
      "**Semantics of `prompt`:** we haven't asked yet. For MIDI that's a brief race window during page load before requestMIDIAccess resolves; re-read once. For microphone that's the normal state before the user picks audio input (getUserMedia hasn't been called). `prompt` does NOT mean 'a permission dialog is showing' — don't tell the user to click Allow based on `prompt` alone.",
      "**Read this before diagnosing an unexpectedly-short `list_inputs`.** `denied` for MIDI means the browser refused (user must re-enable via browser site settings; re-prompting isn't a path). `granted` with no MIDI entry is when to suspect a cable. `prompt` right after `start_session` is a race; re-read.",
    ],
  },
  {
    id: "session.phase",
    name: "Session phase",
    aliases: ["session state", "lifecycle phase", "session status"],
    derivedFrom: ["start_session", "set_input", "stop_session"],
    values: ["no-session", "spawned", "input-active"],
    notes: [
      "Where the session sits in its lifecycle. Distinguishes states a plain startedAt/null can't: `no-session` (no pipeline; call start_session), `spawned` (pipeline is up and setter tools take effect on consumers, but no input adapter is running — startedAt still null, no notes flowing), `input-active` (an input is selected, startedAt stamped, events accruing).",
      "When reporting session state to the user, prefer this field over inferring from startedAt or effective — it names the intermediate 'spawned' phase that both other signals miss.",
      "**Tracks selection, not liveness.** Hot-plug isn't wired: if a MIDI device unplugs mid-session, phase stays `input-active` until the input is explicitly changed or the session stops. If the user reports 'nothing's happening' while phase reads `input-active`, treat their observation as the authority and suggest re-selecting the input or reconnecting the device — don't tell them the session is healthy on the strength of the field alone.",
    ],
  },
];

export const productionManifest = {
  macros,
  sessionControls,
  derivedState,
  concepts,
  lenses,
  presets,
  tools,
  resources,
};
