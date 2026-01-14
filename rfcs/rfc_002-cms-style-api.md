# RFC 0002: Canonical Musical State + Style API v0

Status: Draft  
Author(s): Synesthetica  
Date: 2026-01-08  
Related: RFC 001 (Interaction Model)

Amended by RFC 003

## Summary

Define a contract-first architecture for mapping music → visuals that supports:
- Two input channels (MIDI + raw audio) through the same downstream rulesets
- A fixed, “piano-like” synesthetic operating scheme (Instrument Definition)
- Flexible visual grammars (Styles) composed into Presets (user-facing configurations)
- Strong modular boundaries so modules and tests can be authored independently

This RFC specifies:
1) A source-agnostic intermediate representation: **Canonical Musical State (CMS)**
2) A rendering-agnostic intermediate representation: **Visual Intents**
3) A constrained, testable interface for contributed visual grammars: **Style API**
4) A speech-friendly user surface: **Presets**

## Motivation

We want the system to:
- Render MIDI “cleanly” (definitive events) and audio “noisily” (probabilistic inference)
- Without changing meaning or mapping rules between sources
- While preserving a stable instrument identity (not a modular synth rack)

The central idea: **uncertainty is first-class**.
MIDI and audio adapters produce the same CMS fields but with different confidence/entropy characteristics; the same ruleset yields different visual stability.

## Goals

- G1: One ruleset consumes CMS from both MIDI and audio.
- G2: Separate **meaning** (Instrument Definition / Ruleset) from **form** (Styles).
- G3: Enable independent development + testing of:
  - adapters
  - stabilizers
  - rulesets
  - styles
  - compositor
  - renderer
- G4: Keep speech-only UX practical:
  - users select Presets and adjust macro controls
  - users do not manipulate styles/rulesets directly in normal interaction

## Non-goals (v0)

- NG1: Choose specific MIR models for audio (pitch/chords/beat).
- NG2: Choose a rendering backend (GPU, canvas, Quil, etc.).
- NG3: Provide a full taxonomy of harmony / chord qualities.
- NG4: Design the end-user UI beyond the speech surface contract.
- NG5: Solve “ground truth” musical understanding from audio.

## Glossary (v0)

- Source: MIDI stream or audio stream.
- Adapter: converts a source into CMS frames (events + controls + uncertainty).
- CMS: Canonical Musical State; unified facts about music with confidence.
- Stabilizer: turns raw evidence into usable control signals (smoothing, gating).
- Ruleset: maps CMS → Visual Intents via instrument invariants.
- Visual Intent: rendering-agnostic "what to express" (palette/motion/texture/shape).
- Style: visual grammar consuming intents to emit scene entities (stars/comets/rain).
- Preset: user-facing selection of styles + macro controls (speech-friendly).

## Architectural boundaries (aligned with RFC1 layers)

### Layer 1: System-native core (strict, minimal, stable)
- Type definitions (CMS, intents, scene, interfaces)
- Core pipeline wiring and deterministic stepping
- Stabilizer primitives (gates, hysteresis, slew limiters)
- Compositor base implementation
- Renderer interface (implementation is pluggable)

### Layer 2: Produced primitives (rulesets and baseline styles)
- Reference Ruleset v0 (instrument definition)
- Reference Styles v0 (note stars, chord comets, rain decay)
- Reference Stabilizers (active note state, chord debounce)

### Composite layer: Orchestration + extensions
- Preset bundles (style selection + macro defaults)
- New styles, draw effects, and mutators authored against the Style API
- Constraint policies (e.g. "max changes per beat", "entity budget")
- Higher-level scene composition strategies

This preserves the "composite layer can create new draw effects and mutators" requirement
without changing the base interfaces.

## Invariants (instrument identity)

These define the fixed operating scheme (piano-like identity). Styles do not redefine them.

- I1: The same ruleset consumes CMS regardless of source.
- I2: Pitch-class → hue mapping is deterministic under a named invariant.
- I3: Meaning lives in rulesets, not styles.
- I4: Styles may not compute musical semantics (no pitch/chord inference).
- I5: Confidence/entropy affects rendering stability/noise, not meaning.

## Vagueness commitments (explicitly left open)

We commit to staying vague about:
- V1: Which audio pitch/chord/beat algorithms to use.
- V2: Which chord vocabulary is “correct” (triads-only is acceptable for v0).
- V3: Exact spatial metaphors (2D vs 3D coordinate systems).
- V4: The full set of Visual Intent channels (v0 keeps a minimal set).
- V5: How “section/phrase” is detected (optional later).
- V6: Rendering backend and performance constraints.

## Data model and interfaces (Types)

All interfaces are specified in TypeScript as the contract.

### Time, provenance, uncertainty

```ts
export type Ms = number;
export type Hz = number;
export type MidiNote = number;   // 0..127
export type Velocity = number;   // 0..127
export type Confidence = number; // 0..1

export type SourceId = "midi" | "audio" | (string & {});
export type StreamId = string;

export interface Provenance {
  source: SourceId;
  stream: StreamId;
  model?: string;
  version?: string;
}

export interface Span { t0: Ms; t1: Ms; }

export interface Uncertain<T> {
  value: T;
  confidence: Confidence;
  span?: Span;
  provenance: Provenance;
}
```

### Musical primitives

```ts
export type PitchClass = 0|1|2|3|4|5|6|7|8|9|10|11; // C=0..B=11

export interface NoteOn {
  type: "note_on";
  t: Ms;
  note: MidiNote;
  velocity: Velocity;
  channel?: number;
  pc: PitchClass;
  octave: number;
  provenance: Provenance;
}

export interface NoteOff {
  type: "note_off";
  t: Ms;
  note: MidiNote;
  channel?: number;
  provenance: Provenance;
}

export interface Beat {
  type: "beat";
  t: Ms;
  index: number;
  phase?: number; // 0..1
  confidence: Confidence;
  provenance: Provenance;
}

export type ChordQuality =
  | "maj" | "min" | "dim" | "aug"
  | "sus2" | "sus4"
  | "maj7" | "min7" | "dom7" | "hdim7" | "dim7"
  | "unknown";

export interface Chord {
  type: "chord";
  span: Span;
  root: PitchClass;
  quality: ChordQuality;
  confidence: Confidence;
  provenance: Provenance;
}

export type MusicalEvent = NoteOn | NoteOff | Beat | Chord;
```

### Continuous CMS Signals
```ts
export type Timescale = "micro" | "beat" | "phrase" | "section";

export interface ControlSignal {
  id: string;              // e.g. "loudness", "tension", "centroid"
  t: Ms;
  value: number;           // recommended: normalize to 0..1 unless documented
  confidence: Confidence;
  timescale: Timescale;
  provenance: Provenance;
}

export interface DistributionSignal {
  id: string;              // e.g. "pc_dist"
  t: Ms;
  probs: number[];         // length 12, sums to ~1
  confidence: Confidence;
  timescale: Timescale;
  provenance: Provenance;
}

export interface CMSFrame {
  t: Ms;
  events: MusicalEvent[];
  controls: ControlSignal[];
  distributions?: DistributionSignal[];
}

export interface ICMSStream {
  nextFrame(): CMSFrame | null;
}
```

### Source adapters
```ts
export interface ISourceAdapter {
  readonly source: SourceId;
  readonly stream: StreamId;
  nextFrame(): CMSFrame | null; // time-ordered frames
}
```

### Stabilisers (pure transforms)
```ts
export interface IStabilizer {
  id: string;
  apply(frame: CMSFrame): CMSFrame;
}
```

### Visual intents
```ts
export interface ColorHSVA { h: number; s: number; v: number; a?: number } // h:0..360

export interface PaletteIntent {
  type: "palette";
  t: Ms;
  base: ColorHSVA;
  accents?: ColorHSVA[];
  stability: number;     // 0..1
  confidence: Confidence;
}

export interface MotionIntent {
  type: "motion";
  t: Ms;
  pulse: number;         // 0..1
  flow: number;          // -1..1
  jitter: number;        // 0..1
  confidence: Confidence;
}

export interface TextureIntent {
  type: "texture";
  t: Ms;
  grain: number;         // 0..1
  turbulence: number;    // 0..1
  anisotropy: number;    // 0..1
  confidence: Confidence;
}

export interface ShapeIntent {
  type: "shape";
  t: Ms;
  sharpness: number;     // 0..1
  complexity: number;    // 0..1
  confidence: Confidence;
}

export type VisualIntent = PaletteIntent | MotionIntent | TextureIntent | ShapeIntent;

export interface IntentFrame {
  t: Ms;
  intents: VisualIntent[];
  events: MusicalEvent[];
  uncertainty: number;   // 0..1 (derived from confidence/entropy)
}
```

### Rulest (instrument definition)
```ts
export interface IRuleset {
  id: string;
  map(frame: CMSFrame): IntentFrame;
}
```

### Pitch-class -> hue invariant
```ts
export interface PitchHueInvariant {
  referencePc: PitchClass; // e.g. A=9
  referenceHue: number;    // degrees, e.g. 0
  direction?: "cw" | "ccw";
}

export function pcToHue(pc: PitchClass, inv: PitchHueInvariant): number {
  const dir = inv.direction === "ccw" ? -1 : 1;
  const steps = (pc - inv.referencePc + 12) % 12;
  return (inv.referenceHue + dir * steps * 30 + 360) % 360;
}
```

### Scene model
```ts
export type EntityId = string;

export interface Vec2 { x: number; y: number; }

export interface Style {
  color?: ColorHSVA;
  size?: number;
  opacity?: number;
  textureId?: string;
}

export type EntityKind = "particle" | "trail" | "field" | "glyph" | "group";

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  createdAt: Ms;
  updatedAt: Ms;
  position?: Vec2;
  velocity?: Vec2;
  life?: { ttlMs: Ms; ageMs: Ms };
  style: Style;
  data?: Record<string, unknown>;
}

export interface SceneFrame {
  t: Ms;
  entities: Entity[];
}
```

### Styles (visual grammar; may not change meaning)
```ts
export interface StyleContext {
  canvasSize: { width: number; height: number };
  rngSeed: number;
}

export interface IStyle {
  id: string;
  init(ctx: StyleContext): void;
  update(input: IntentFrame, previous: SceneFrame | null): SceneFrame;
  paramsSchema?: Record<string, unknown>;
}
```

### Compositor + renderer
```ts
export interface ICompositor {
  id: string;
  compose(frames: SceneFrame[]): SceneFrame;
}

export interface IRenderer {
  id: string;
  render(scene: SceneFrame): void;
}
```

### Preset (speech-only surface)
_Presets are the primary "player" UX. They bundle styles + macro controls._
_No style IDs need to be spoken; names resolve to IDs internally._

```ts
export interface Preset {
  id: string;
  name: string;

  styles: Array<{
    styleId: string;
    enabled: boolean;
    params?: Record<string, unknown>;
    priority?: number;
  }>;

  macros: {
    articulation: number;  // tight(0) .. loose(1)
    persistence: number;   // ephemeral(0) .. lingering(1)
    emphasis: { melody: number; harmony: number; rhythm: number; timbre: number; };
  };
}
```

## Policy: what styles may and may not do

### Styles MAY:
* emit and evolve entities (spawn on note_on, fade trails, apply decay fields)
* interpret intents and event timing (beat/chord spans)
* react to uncertainty (more jitter/blur/fuzz)

### Styles MUST NOT:
* infer pitch/chords/beat from audio or MIDI
* redefine pitch→hue or other invariant mappings
* change musical meaning (only form)

If a style needs musical semantics, that belongs upstream (adapter/stabilizer/ruleset).

## Test plan: Golden corpus v0

We define deterministic fixtures that allow unit tests without a renderer.

### Fixtures (JSON)
* fixtures/midi/simple_scale.json
* a C major scale note_on/off sequence
* fixtures/midi/triads_with_sustain.json
* triads with sustain pedal (CC64) and varying velocities
* fixtures/audio/mock_pc_dist.json
* synthetic pitch-class distributions with confidence drops
* fixtures/expected/ruleset_v0_intents_*.json
* expected intent frames for given CMS inputs
* fixtures/expected/style_note_stars_entities_*.json
* expected scene entity properties (counts, lifetimes, style ranges)
* fixtures/expected/style_chord_comets_entities_*.json
* fixtures/expected/composed_scene_*.json

### Deterministic rules for tests
* All modules must be deterministic given:
* same input frames
* same rngSeed
* Styles must not use system time; use frame.t.
* Entity IDs should be stable (e.g. derived from event identity + time).

## Vertical slice v0 (implementation order)

We implement a minimal end-to-end path (MIDI-first) that exercises all boundaries.

### Modules
1.	Adapter
* MidiAdapterV0 (note_on/off; optionally sustain CC)

2.	Stabilizers
* ActiveNoteStateV0 (tracks held notes, pedal state)
* ChordInferenceV0 (triads-only ok; emits Chord spans; debounced)
* ConfidenceGateV0 (mostly no-op for MIDI, used for parity)

3.	Ruleset
* RulesetV0
* pitch-class → palette.base.h (pcToHue)
* velocity/loudness proxy → palette.base.v
* beat (if available) → motion.pulse
* chord confidence/quality → texture regime

4.	Styles
* NoteStarsStyleV0 (spawn per note_on)
* ChordCometsStyleV0 (aggregate chords into trails)
* RainDecayStyleV0 (global decay/drift field)

5.	Compositor
* SimpleCompositorV0 (concat entities + apply decay field deterministically)

6.	Renderer
* DebugRendererV0 (log/JSON output is acceptable for v0)

## Acceptance criteria
* A1: Fixture simple_scale produces stable entities with hue changes matching pitch-class invariant.
* A2: triads_with_sustain produces chord comets with stable spans and controlled flicker.
* A3: Same CMS fed into the ruleset produces identical intents regardless of source.
* A4: Injected low-confidence/entropy (audio mock) increases jitter/decay effects but does not change core meaning.
* A5: Speech surface can select a Preset by name; no exposure of style IDs required.

## Interaction posture alignment (RFC1)

### Quiet posture:
* prefers stable visuals; higher smoothing; fewer parameter changes per beat
* applied by macros (articulation/persistence) and compositor constraints

### Conversational posture:
* more reactive; more visible uncertainty; faster transitions
* still respects invariants and style constraints

Presets encode posture defaults; posture is not a separate engine mode.

## Open questions (tracked, not blocking v0)
* O1: How do we represent MIDI CC (sustain/aftertouch) in CMS? (likely as ControlSignal ids)
* O2: Do we need a separate “phrase/section” timescale in v0, or can it be deferred?
* O3: How do we compute uncertainty scalar from distributions (entropy vs confidence)?
* O4: What is the minimal chord vocabulary for early usefulness?