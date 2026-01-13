# RFC 0003: Parts, Routing, and Per-Instrument Layout

Status: Draft
Author(s): Synesthetica
Date: 2026-01-09

### Related:
- RFC 0001 — Interaction Model
- RFC 0002 — Canonical Musical State + Motif API v0

## Summary

This RFC introduces Parts as a first-class concept, enabling:
- Multiple simultaneous instruments or streams
- multiple MIDI channels and programs
- multiple audio interface inputs
- future MPE controllers
- Independent visual treatment per instrument
- distinct motif stacks
- distinct registrations
- distinct layout and compositing policies
- Speech-driven binding such as:
- “This is the guitar — use Rainy Comets”
- “Keep the guitar on the left, piano on the right”
- “Overlay all instruments, make the guitar transparent”

This is achieved by:
1) Introducing a stable PartId
2) Adding a Router between CMS and downstream processing
3) Instantiating motif stacks per part
4) Making spatial layout and blending explicit compositor responsibilities

All existing invariants remain intact.

## Motivation

RFC 0002 assumes a single musical stream mapped to a single visual output.

In real musical practice, users expect:
- multiple instruments to coexist
- per-instrument visual identity
- live labeling (“this is the guitar”)
- spatial separation and layering

We want to support this without:
- exposing internal mechanics to users
- duplicating rulesets
- allowing motifs to redefine meaning

Goals
- G1: Support multiple simultaneous musical parts from MIDI and audio
- G2: Allow independent registrations and motifs per part
- G3: Enable spatial layout and compositing per part
- G4: Preserve separation of meaning (rulesets) and form (motifs)
- G5: Maintain a speech-first interaction model

Non-Goals
- NG1: Automatic instrument recognition
- NG2: A full spatial layout language (v0 is minimal)
- NG3: Allowing motifs to control spatial ownership or blending semantics
- NG4: Redesigning CMS semantics beyond adding part identity

## Core Concept: Part

A Part represents a musically and visually coherent stream of activity, typically corresponding to an instrument, voice, or audio input.

Examples:
- MIDI channel 1 (piano)
- MIDI channel 2 (guitar synth)
- Audio input 3 (microphone)
- Future: an MPE controller zone

## PartId

### Definition

A PartId is a stable identifier used to route musical data and visuals.

```ts
export type PartId = string;
```

### Requirements
- Stable over time
- Deterministic
- Assigned by adapters
- Opaque downstream (no module parses it)

### Examples
- midi:stream1:ch1
- midi:stream1:ch2
- audio:interfaceA:input3

## Changes to CMS (Amendment to RFC 0002)
- All musical data must carry a part: PartId.

### Musical Events

```ts
export interface NoteOn {
  type: "note_on";
  t: Ms;
  part: PartId;
  note: MidiNote;
  velocity: Velocity;
  pc: PitchClass;
  octave: number;
  provenance: Provenance;
}
```

(The same addition applies to NoteOff, Beat, and Chord.)

### Control and Distribution Signals

```ts
export interface ControlSignal {
  id: string;
  t: Ms;
  part: PartId;
  value: number;
  confidence: Confidence;
  timescale: Timescale;
  provenance: Provenance;
}
```

## Router (New Module)

### Responsibility

The Router:
- groups CMS frames by PartId
- applies per-part registration selection
- produces independent downstream pipelines per part

### Interface

```ts
export interface IRouter {
  route(frame: CMSFrame): Map<PartId, CMSFrame>;
}
```

### Notes
- Routing is structural only; it does not change meaning
- Stabilizers may run before or after routing, provided they respect part

## Part Registry and Activity Tracking

### Purpose

Enable speech commands such as:
- “This is the guitar”
- “Use Rainy Comets for the guitar”

### Part Registry

Maintains metadata about known parts.

```ts
export interface PartMeta {
  id: PartId;
  label?: string;           // e.g. "guitar"
  registrationId?: string;
}

export interface PartRegistry {
  getParts(): PartId[];
  getMeta(part: PartId): PartMeta;
  setLabel(part: PartId, label: string): void;
  assignRegistration(part: PartId, registrationId: string): void;
}
```

## Activity Tracker (Utility)

Tracks recent activity to resolve the deictic “this”.

### Responsibilities:
- maintain rolling activity scores per part
- expose the most active part over a time window

This utility does not affect musical or visual semantics.

## Per-Part Processing Model

For each part, the pipeline is logically independent:

```
CMSFrame(part)
  → Stabilizers
  → Ruleset
  → IntentFrame
  → Motif Stack (per-part instances)
  → SceneFrame(part)
```

Motifs are instantiated per part to avoid state collisions.

Motifs (Clarification)

### Motifs:
- are unaware of other parts
- consume only intents and events for their part
- emit entities tagged with their originating part

### Entity Amendment

```ts
export interface Entity {
  id: EntityId;
  part: PartId;
  kind: EntityKind;
  createdAt: Ms;
  updatedAt: Ms;
  style: Style;
  // ...
}
```

## Layout and Compositing

### Principle

Spatial placement and blending are not musical meaning.

Therefore they are:
- not handled by rulesets
- not handled by motifs
- handled in the compositor (or a dedicated layout stage)

### Layout Policy

Defines where a part lives on the canvas.

```ts
export interface LayoutPolicy {
  region: "left" | "right" | "top" | "bottom" | "center" | "full";
  scale?: number;
}
```

Applied as a deterministic transform to entity positions.

### Compositing Policy

Defines how a part blends visually.

```ts
export interface CompositingPolicy {
  opacityMultiplier?: number;
  blendMode?: "normal" | "additive" | "multiply";
  zOrder?: number;
}
```

### Registration Extension

Registrations may specify defaults for layout and compositing.

```ts
export interface Registration {
  id: string;
  name: string;

  motifs: Array<{
    motifId: string;
    enabled: boolean;
    params?: Record<string, unknown>;
    priority?: number;
  }>;

  layout?: LayoutPolicy;
  compositing?: CompositingPolicy;

  macros: {
    articulation: number;
    persistence: number;
    emphasis: {
      melody: number;
      harmony: number;
      rhythm: number;
      timbre: number;
    };
  };
}
```

Speech commands may override layout or compositing live without changing the registration identity.

Speech Interaction Examples (Non-Normative)
- “This is the guitar”
→ label the most active part as "guitar"
- “Use Rainy Comets for the guitar”
→ assign a registration to all parts labeled "guitar"
- “Keep the guitar to the left, piano to the right”
→ update layout policy per part
- “Overlay all instruments, make the guitar transparent”
→ set all layouts to full
→ apply opacityMultiplier = 0.5 to the guitar part

## MPE Compatibility

MPE support is additive:
- adapters emit additional per-note expressive events or signals
- all events continue to carry the same PartId
- rulesets may map expression dimensions to intents
- motifs remain unchanged

No redesign is required.

Invariants (Additive)
- I6: Every CMS item has exactly one PartId
- I7: Motifs do not read or reason about other parts
- I8: Spatial layout and blending are compositor concerns only
- I9: Musical meaning remains invariant across parts

### Test Implications

New fixtures should cover:
- multiple MIDI channels in one stream
- multiple audio inputs
- different registrations per part
- layout and compositing assertions (e.g. x-position ranges, opacity)

Golden tests should assert:
- no entity leakage across parts
- deterministic per-part outputs
- consistent application of layout transforms

Open Questions (Tracked)
- O1: Should MIDI program changes create new parts or mutate metadata?
- O2: How should global effects (e.g. rain) interact with per-part layout?
- O3: Do we need hierarchical parts (ensembles, sections) later?
