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
 *   2. Feed to the LLM as its annotation manifest (JSON serialisable).
 *   3. Run the smoke test: 8–12 realistic utterances, ask the LLM to
 *      produce control ops against control-ops.schema.json.
 *   4. Evaluate: did it pick sensible ops? Where did it guess? What's
 *      missing?
 *
 * Deliberately incomplete — enough for the smoke test to reveal
 * whether the annotation model is coherent, not a final manifest.
 * Ranges/directionality are best-guesses to be tuned.
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
  // Continuous — single 0..1 dial mapping to one underlying param
  // -----------------------------------------------------------------
  {
    id: "harmony:linger",
    name: "Harmony linger",
    aliases: ["chord linger", "chord fade", "harmony persistence"],
    type: "continuous",
    range: [0.5, 8], // bars if tempo set, seconds otherwise
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
    aliases: ["chord tolerance", "arpeggio patience", "note-decay"],
    type: "continuous",
    range: [100, 2000], // ms
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
      { value: "16th", label: "sixteenth notes (tight)" },
    ],
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
    targets: [
      "rhythm:horizon",
      "harmony:linger",
      "dynamics:linger",
    ],
    affects: ["rhythm", "harmony", "dynamics", "phrasing"],
    directionality: {
      low: {
        description: "tight NOW; little history, no lookahead",
        tendsTo: ["emphasise the current moment", "reduce visual load"],
      },
      high: {
        description: "generous history and future context on all three grammars",
        tendsTo: ["emphasise pattern over moment", "increase visual density"],
      },
    },
    notes: [
      "Cross-grammar. Fans linearly to each target's range at implementation time.",
    ],
  },

  {
    id: "rhythm:difficulty",
    name: "Rhythm difficulty",
    aliases: ["strictness", "practice difficulty", "rhythm strictness"],
    type: "compound",
    range: [0, 1],
    targets: [
      "rhythm:horizon",       // tighter view at higher difficulty
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
    id: "system:colour-mapping:reference",
    name: "Colour anchor",
    aliases: ["reference hue", "palette anchor", "colour reference"],
    type: "continuous",
    range: [0, 360], // hue degrees
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
    ],
  },
];

// ============================================================================
// System concepts (terminology dictionary)
// ============================================================================

const concepts: SystemConceptAnnotation[] = [
  {
    term: "note-strip",
    definition:
      "The vertical coloured bar rendered per played note in the rhythm grammar. Positioned by pitch (horizontal) and time (vertical), coloured by pitch class.",
    related: ["now-line", "reference-line"],
  },

  {
    term: "now-line",
    definition:
      "The horizontal line near the bottom of the rhythm view marking the present moment. Notes cross this line as they're played; history scrolls above, future subdivisions render below.",
    related: ["note-strip"],
  },

  {
    term: "borrowed-chord",
    definition:
      "A chord drawn from outside the current diatonic key. E.g. in C major, an E♭ major chord (♭III) is borrowed from C minor. Borrowed chords render on the outer ring of the harmony clock rather than the inner (diatonic) ring.",
    related: ["modal-interchange", "harmony-clock", "guide-ring"],
    examples: ["♭VI in C major is A♭ major (borrowed from C minor)"],
  },

  {
    term: "modal-interchange",
    definition:
      "A functional-harmony relationship where a borrowed chord implies resolution toward one or more diatonic chords. Rendered as directional connector arcs on the harmony clock.",
    related: ["borrowed-chord", "connection-strip", "harmony-clock"],
    examples: ["♭VI → ii (subdominant borrowing)", "♭VII → IV"],
  },

  {
    term: "harmony-clock",
    definition:
      "The circular chord layout in the harmony grammar. Inner ring shows diatonic degrees (I–vii); outer ring shows borrowed chords. Connection arcs indicate modal-interchange relationships between chords.",
    related: ["guide-ring", "connection-strip", "borrowed-chord"],
  },

  {
    term: "drift",
    definition:
      "The timing offset between a played note's onset and the nearest beat subdivision. Notes within TIGHT_TOLERANCE_MS (~30 ms) are considered on-the-grid; further-drifted notes show streak lines indicating direction and magnitude.",
    related: ["reference-line", "quantise-resolution"],
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
      "Reference lines and streaks visualise drift against the current subdivision.",
    ],
    macroResponses: {
      "time-horizon": {
        responsiveness: "strong",
        notes: "governs how much scrolling history and lookahead is visible",
      },
      "rhythm:difficulty": {
        responsiveness: "strong",
        notes: "compound: tightens both view and grading",
      },
      "rhythm:quantise-resolution": {
        responsiveness: "strong",
        notes: "changes drift reference and grid density",
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
