/**
 * Production annotation manifest — the deployed macro / session /
 * concept / grammar annotations shipped to LLMs (via MCP resources)
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
  GrammarAnnotation,
  PresetAnnotation,
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
    range: [0.5, 8],
    default: 3, // matches HarmonyGrammar.PROGRESSION_FADE_VALUE
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
      "Unit is bars when a tempo is prescribed, seconds otherwise.",
      "Capped by the stabilizer's progression window; asking for more silently clips.",
    ],
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
  },

  {
    id: "dynamics:linger",
    name: "Dynamics linger",
    aliases: ["velocity fade", "dynamics persistence"],
    type: "continuous",
    range: [500, 8000],
    default: 2000, // matches DynamicsGrammar.DEFAULT_FADE_MS
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
      "Determines how long each note's velocity indicator lingers on the dynamics grammar.",
      "Unit is ms.",
    ],
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
      "Determines how much note history is shown on the vertically-scrolling rhythm grammar.",
      "Independent from the compound time-horizon macro. Use rhythm:horizon to isolate rhythm's history without touching harmony:linger or dynamics:linger.",
      "Unit is decimal fraction of available space.",
    ],
  },

  {
    id: "rhythm:tightness-tolerance",
    name: "Tightness tolerance",
    aliases: ["strictness threshold", "grading tolerance", "drift threshold"],
    type: "continuous",
    range: [10, 100],
    default: 30, // matches RhythmGrammar TIGHT_TOLERANCE_DEFAULT_MS
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
  },

  {
    id: "rhythm:reference-linger",
    name: "Reference-marker linger",
    aliases: ["drift-marker trail", "reference trail"],
    type: "continuous",
    range: [1.0, 3.0],
    default: 1.3, // matches RhythmGrammar DEFAULT_REFERENCE_LINGER_MULTIPLIER
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
    default: "16th", // matches RhythmGrammar.macros.subdivisionDepth
    affects: ["rhythm"],
    notes: [
      "Determines the reference subdivision for timing drift analysis.",
      "Coarser resolutions are more likely to show inaccurate timing due to fewer matching grid divisions, which counter-intuitively feels stricter but is actually an easier timing intent; finer resolutions will look more forgiving by matching to more grid divisions but is actually grading to a more difficult intent.",
    ],
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
        description: "tight NOW across all three grammars; little history, no lookahead",
        tendsTo: ["emphasise the current moment", "reduce visual load"],
      },
      high: {
        description: "generous history and future context on all three grammars",
        tendsTo: ["emphasise pattern over moment", "increase visual density"],
      },
    },
    notes: [
      "Cross-grammar shortcut. When you want to isolate one grammar's history, use the per-grammar macros (rhythm:horizon, harmony:linger, dynamics:linger) instead.",
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
    aliases: ["beat emphasis", "rhythm prominence", "pulse strength"],
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
      "MIDI device or audio input. Populated at runtime from connected devices; see inputs://available.",
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
  // ------- Rhythm grammar concepts -------
  {
    term: "note-strip",
    definition:
      "The vertical coloured bar rendered per played note in the rhythm grammar. Horizontal position encodes pitch (chromatic left-to-right, octave agnostic); vertical position encodes time (top = onset, bottom = release); colour encodes pitch class (via the pitch-hue mapping).",
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

  // ------- Harmony grammar concepts -------
  {
    term: "harmony-clock",
    definition:
      "The circular chord progression layout in the harmony grammar. Chord numerals sit around a clock face by pitch-class angle (I at 0). When a key is prescribed, an inner ring shows diatonic degrees (I–vii) and an outer ring shows borrowed chords; connector arcs indicate modal-interchange relationships between them.",
    related: ["guide-ring", "connector-strip", "borrowed-chord", "modal-interchange"],
  },

  {
    term: "guide-ring",
    definition:
      "One of three faint circles on the harmony clock (inner / middle / outer). The middle ring anchors the diatonic numerals; the outer ring anchors borrowed numerals. Provides structural bearings for the eye.",
    related: ["harmony-clock"],
  },

  {
    term: "borrowed-chord",
    definition:
      "A chord drawn from outside the current diatonic key. E.g. in C major, an A♭ major chord (♭VI) is borrowed from C minor. Borrowed chords render on the outer ring of the harmony clock rather than the inner ring, and often carry connector arcs to the diatonic destinations they imply.",
    related: ["modal-interchange", "harmony-clock", "guide-ring"],
    examples: [
      "♭VI in C major is A♭ major (borrowed from the parallel minor).",
      "♭VII in C major is B♭ major (a common subdominant borrowing).",
    ],
  },

  {
    term: "modal-interchange",
    definition:
      "A functional-harmony relationship where a borrowed chord implies resolution toward one or more diatonic chords. Rendered as a directional connector arc + terminating strip on the harmony clock, arcing from the borrowed chord's position toward the target degree's position.",
    related: ["borrowed-chord", "connector-strip", "connector-arc", "harmony-clock"],
    examples: [
      "♭VI often pulls toward ii or IV (subdominant borrowing).",
      "♭VII typically pulls toward IV.",
    ],
  },

  {
    term: "connector-arc",
    definition:
      "The animated arc that draws from a borrowed chord's position on the harmony clock toward its implied resolution target. Coloured by the source chord's hue. Terminates in a connector-strip at the target. Only borrowed chords with a modal interchange relationship to a diatonic chord spawn connector arcs and connector strips.",
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
      "The radial visual language rendered in the upper section of the harmony grammar, illustrating the QUALITY (nature) of the currently-detected chord — major, minor, sus, dominant seventh, etc. Composed of a central hub and outward spokes: the hub encodes the overall chord quality; each spoke represents one note of the chord (by its degree relative to the root, not its absolute pitch), oriented at a fixed angle around the hub with the root at 0°. Independent of the functional-harmony clock below it — the glyph describes what the chord IS; the clock describes what the chord DOES in the key.",
    related: ["glyph-spoke", "glyph-hub", "harmony-clock"],
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

  // ------- Dynamics grammar concepts -------
  {
    term: "dynamics-indicator",
    definition:
      "A short horizontal mark in the dynamics grammar (vertical bar on the left of the view) rendered per note onset. Its vertical position encodes velocity — higher up = louder. Fades out over the dynamics:linger window.",
    related: ["dynamics-linger"],
  },

  // ------- Cross-cutting concepts -------
  {
    term: "pitch-hue-mapping",
    definition:
      "The scheme by which each of the twelve pitch classes maps to a hue on the colour wheel. Anchored on pitch C (pitch class 0); the anchor hue defaults to red. Other pitches are derived by rotating around the wheel (+30° per semitone, clockwise by default). Consistent across all grammars.",
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
      "The user-set musical frame the analyser reads within: key (tonic + mode), tempo, meter, chord-interpretation mode. These are never inferred — the user sets them via session:* controls. Without a prescribed key, functional harmony analysis is disabled; without a tempo, the rhythm grammar runs in free-time (no beat grid, no drift analysis).",
    related: ["free-time", "key-aware"],
  },

  {
    term: "key-aware",
    definition:
      "When a key is prescribed, the harmony grammar enables functional analysis: chord degrees (I, ii, ♭VI, etc.), borrowed classification, and modal-interchange relationships. Without a key, chords are shown by name only.",
    related: ["prescribed-context", "harmony-clock", "borrowed-chord"],
  },

  {
    term: "free-time",
    definition:
      "The rhythm grammar's mode when no tempo is prescribed. Notes scroll through the now-line with no beat grid, no reference lines, no drift analysis. Grid + drift features re-enable when the user prescribes a tempo.",
    related: ["prescribed-context", "now-line", "drift"],
  }
];

// ============================================================================
// Grammars
// ============================================================================

const grammars: GrammarAnnotation[] = [
  {
    id: "rhythm-grammar",
    name: "Rhythm grammar",
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
    id: "harmony-grammar",
    name: "Harmony grammar",
    aliases: ["harmony clock", "chord view"],
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
    id: "dynamics-grammar",
    name: "Dynamics grammar",
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

export const productionManifest = {
  macros,
  sessionControls,
  concepts,
  grammars,
  presets,
};
