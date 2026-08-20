/**
 * Semantic smoke test — annotation seed (RFC 011 Plan step 6, synesthetica-dib).
 *
 * A representative slice of the macro / session / concept / grammar
 * annotations, drafted as a jumping-off point. TypeScript enforces
 * the shape (see packages/contracts/annotations/annotations.ts).
 *
 * How this file is used:
 *   1. Nic edits — refine descriptions, add/remove entries, tune
 *      aliases and directionality to what the LLM should hear.
 *   2. Regenerate manifest.json (npm run smoke:regen).
 *   3. Feed to the LLM as its annotation manifest (JSON serialisable).
 *   4. Run the smoke test / production integration; LLM uses this
 *      manifest to interpret user requests.
 */

import type {
  MacroAnnotation,
  SessionControlAnnotation,
  SystemConceptAnnotation,
  GrammarAnnotation,
} from "@synesthetica/contracts";

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
        description: "chords release quickly; fewer overlapping numerals on the clock",
        tendsTo: ["emphasise the current chord", "reduce visual accumulation"],
      },
      high: {
        description: "chords linger; harmonic pattern accumulates visibly",
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
    aliases: ["chord tolerance", "arpeggio patience", "note decay"],
    type: "continuous",
    range: [100, 2000],
    default: 400, // matches ChordDetectionStabilizer.pitchDecayMs
    affects: ["harmony", "phrasing"],
    directionality: {
      low: {
        description: "notes must be simultaneous to count as a chord",
        tendsTo: ["reject arpeggios", "favour block chords"],
      },
      high: {
        description: "arpeggios and rolled chords register as chord voicings",
        tendsTo: ["catch broken chords", "risk false positives on melody"],
      },
    },
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
        description: "even two-note intervals register as chords (dyads count)",
        tendsTo: ["catch sparse harmony", "increase chord flicker"],
      },
      high: {
        description: "chord detection waits for fuller voicings",
        tendsTo: ["reject dyads", "stabilise chord surface"],
      },
    },
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
        description: "detection switches chords immediately as voicing changes",
        tendsTo: ["react quickly", "risk visible flicker between ambiguous voicings"],
      },
      high: {
        description: "detection waits before switching, favouring the current reading",
        tendsTo: ["stabilise the chord surface", "delay reaction to genuine changes"],
      },
    },
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
        tendsTo: ["emphasise the current moment", "reduce visual load"],
      },
      high: {
        description: "generous history and future context on the rhythm timeline",
        tendsTo: ["emphasise pattern over moment", "reveal recurring gestures"],
      },
    },
    notes: [
      "Independent from the compound time-horizon macro. Use rhythm:horizon to isolate rhythm's history without touching harmony:linger or dynamics:linger.",
    ],
  },

  {
    id: "system:colour-mapping:reference",
    name: "Colour anchor",
    aliases: ["reference hue", "palette anchor", "colour reference"],
    type: "continuous",
    range: [0, 360],
    default: 0, // red — matches MusicalVisualVocabulary.DEFAULT_CONFIG.referenceHue
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
      "Anchors the pitch A to this hue. Every other pitch class is derived by wheel rotation.",
      "To set 'C is red', use set_hue_for_pitch(0, 0) — server handles the math.",
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
      "Determines the reference subdivision for drift analysis.",
      "Coarser resolutions forgive more; finer resolutions grade more strictly.",
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
      "rhythm:horizon", // tighter view at higher difficulty
      "rhythm:tight-tolerance", // stricter drift grading at higher difficulty
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
      "rhythm:reference-linger", // longer drift-marker persistence
      "rhythm:pulse-decay", // slower NOW-line beat pulse decay
      "rhythm:pulse-opacity-boost", // brighter pulse peak
      "rhythm:pulse-value-boost", // stronger HSV value boost on pulse
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
  {
    id: "session:tonic",
    name: "Tonic",
    aliases: ["key root", "tonal centre"],
    type: "number",
    range: [0, 11],
    unit: "pitch class",
    nullable: true,
    notes: [
      "Sets the tonic pitch class for key-aware analysis. Paired with session:mode.",
      "Clear (set null) to disable functional harmony analysis.",
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
    nullable: true,
    notes: ["Paired with session:tonic. Set both together via set_key(root, mode)."],
  },

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
      "Clear (set null) to fall back to seconds-based windows.",
      "The system does not infer tempo from onset patterns — it must be set explicitly.",
    ],
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
      "The vertical coloured bar rendered per played note in the rhythm grammar. Horizontal position encodes pitch (chromatic left-to-right); vertical position encodes time (top = past, bottom = present); colour encodes pitch class (via the pitch-hue mapping).",
    related: ["now-line", "reference-line", "drift", "pitch-hue-mapping"],
  },

  {
    term: "now-line",
    definition:
      "The horizontal line near the bottom of the rhythm view that marks the present moment. Notes cross it as they're played. History scrolls above; upcoming subdivisions (when a tempo is prescribed) render below.",
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
      "The timing offset between a played note's onset and the nearest beat subdivision, given the prescribed tempo. Notes within roughly 30 ms are considered on-the-grid and show no drift marks. Notes further out show streak lines whose direction (up/down) and length encode how early or late the note landed.",
    related: ["reference-line", "quantise-resolution", "rhythm-difficulty"],
    examples: [
      "A note played 60 ms after the beat shows a downward-trailing streak.",
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
      "The circular chord layout in the harmony grammar. Chord numerals sit around a clock face by pitch-class angle. When a key is prescribed, an inner ring shows diatonic degrees (I–vii) and an outer ring shows borrowed chords; connector arcs indicate modal-interchange relationships between them.",
    related: ["guide-ring", "connection-strip", "borrowed-chord", "modal-interchange"],
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
    related: ["borrowed-chord", "connection-strip", "connector-arc", "harmony-clock"],
    examples: [
      "♭VI often pulls toward ii or IV (subdominant borrowing).",
      "♭VII typically pulls toward IV.",
    ],
  },

  {
    term: "connector-arc",
    definition:
      "The animated arc that draws from a borrowed chord's position on the harmony clock toward its implied resolution target. Coloured by the source chord's hue. Terminates in a connection-strip at the target.",
    related: ["modal-interchange", "connection-strip"],
  },

  {
    term: "connection-strip",
    definition:
      "A short, wider terminating mark at the target end of a connector arc. Gradient-coloured from source hue (arc side) to target hue (chord side). Marks where the borrowed chord's implied resolution lands on the clock.",
    related: ["connector-arc", "modal-interchange"],
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
      "The scheme by which each of the twelve pitch classes maps to a hue on the colour wheel. Anchored on pitch A (pitch class 9); the anchor hue defaults to red. Other pitches are derived by rotating around the wheel — either clockwise or counter-clockwise depending on direction. Consistent across all grammars.",
    related: ["colour-anchor"],
  },

  {
    term: "colour-anchor",
    definition:
      "The colour assigned to the anchor pitch (A by default). All other pitch-class colours are derived by wheel rotation from this anchor. Changing the anchor rotates the whole palette.",
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
  },

  {
    term: "confidence",
    definition:
      "How certain the pipeline is about a detected event. MIDI events arrive at confidence 1.0 (deterministic). Audio events arrive with model-reported confidence < 1.0. Currently informational only — no grammar modulates its output based on confidence, though the design supports it.",
    related: [],
  },
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
    ],
    macroResponses: {
      "time-horizon": {
        responsiveness: "strong",
        notes: "governs how much scrolling history and lookahead is visible",
      },
      "rhythm:horizon": {
        responsiveness: "strong",
        notes: "same effect as time-horizon but isolated to rhythm",
      },
      "rhythm:difficulty": {
        responsiveness: "strong",
        notes: "compound: tightens both view and grading",
      },
      "rhythm:quantise-resolution": {
        responsiveness: "strong",
        notes: "changes drift reference and grid density",
      },
      "rhythm:emphasis": {
        responsiveness: "strong",
        notes: "beat pulse prominence + drift-marker linger",
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
      "Right column. Chord numerals arranged on a clock face by pitch-class angle.",
      "Modal-interchange relationships shown as directional connector arcs to target strips.",
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
        notes: "anti-flicker on the chord surface",
      },
      "system:colour-mapping:reference": {
        responsiveness: "strong",
        notes: "shifts the palette of all chord numerals and connectors",
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
    },
  },
];

// ============================================================================
// Manifest (what the LLM consumes)
// ============================================================================

export const smokeTestManifest = {
  macros,
  sessionControls,
  concepts,
  grammars,
};
