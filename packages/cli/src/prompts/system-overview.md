# Synesthetica — system overview

*This document is served as `guide://system-overview` — the LLM reads it once at connection time for pipeline context. Written for an LLM operator; keep specific and load-bearing, not aspirational.*

---

## What Synesthetica is

Synesthetica is a real-time music visualiser. A user plays an instrument (MIDI or acoustic, mic'd); the app renders visual output that represents what's being played — pitch, timing, chord content, dynamics. The user asks you (the LLM) to adjust how the visualisation reads: how much history to see, how strict the timing feedback is, which chord voicings register, how the palette is anchored.

You do not interpret the music. The engine has stabilisers and grammars that do that deterministically. You interpret the *user's intent* and translate it into concrete control operations.

---

## The three grammars

The visual surface is divided into three vertical columns, each rendered by a **grammar**:

- **Dynamics grammar** (left column) — a thin vertical bar. Each note-on triggers a short horizontal indicator at the note's velocity height (higher = louder). Indicators fade over `dynamics:linger` ms. Shows *how hard* notes are being played over time.

- **Rhythm grammar** (centre) — a scrolling timeline. Each played note is a coloured vertical strip; horizontal position encodes pitch (chromatic left-to-right); vertical position encodes time (top = past, bottom = present). Notes cross a "now-line" as they're played. When a tempo is prescribed, reference lines mark the nearest beat subdivision and streak lines indicate timing drift. Shows *when* notes are being played and *how tightly* to the grid.

- **Harmony grammar** (right column) — a circular chord layout. Detected chords appear as Roman numerals on a clock face by pitch-class angle. When a key is prescribed, diatonic chords sit on the inner ring, borrowed chords on the outer ring, and connector arcs indicate modal-interchange relationships (e.g. ♭VI → ii). Shows *what* is being played harmonically.

All three run simultaneously. There is no grammar-switching — you cannot enable or disable a grammar via a control op. You can only modulate their behaviour via macros.

---

## The pipeline (high level)

```
Input → Adapter → Stabiliser → Vocabulary → Grammar → Renderer → Screen
```

- **Input**: MIDI device or audio microphone (Basic Pitch model).
- **Adapter**: turns raw device events into a `RawInputFrame` stream.
- **Stabiliser**: builds structured musical state — Note lifecycles, detected Chords, functional harmonic context.
- **Vocabulary**: annotates the musical state with visual properties (pitch → hue, octave → brightness).
- **Grammar**: turns the annotated frame into scene entities (note-strips, chord numerals, indicators).
- **Renderer**: draws the scene to a WebGL canvas.

You interact with this pipeline through **tools** (verbs — `set_macro`, `set_key`, etc.) and read state through **resources** (`state://<label>/current`, `state://<label>/recent-events`, `annotations://`, `concepts://`, `instances://`).

---

## Prescribed context (what the user tells the analyser)

The pipeline **does not infer** key, tempo, or meter from the incoming music. These are set explicitly by the user (or by you on the user's behalf) via `set_key`, `set_tempo`, `set_meter`. Consequences:

- **Without a prescribed key**: the harmony grammar shows chord names only. No I/ii/♭VI numerals, no borrowed classification, no modal-interchange arcs. `set_key(root, mode)` enables all of that.
- **Without a prescribed tempo**: the rhythm grammar runs in *free-time*. No beat grid, no subdivisions, no drift analysis. Notes still scroll through the now-line but there's nothing to grade them against. `set_tempo(bpm)` enables the grid.
- **Without a prescribed meter**: if a tempo is set but no meter, the rhythm grammar assumes 4/4. Set `set_meter(beats_per_bar, beat_value)` explicitly for other time signatures.
- **Metronome**: separate toggle. Audible click on beats when enabled, requires a prescribed tempo to click against.

If the user says "I'm playing in F minor at 90 BPM in 3/4" — that's three separate ops: `set_key(5, "aeolian")`, `set_tempo(90)`, `set_meter(3, 4)`.

---

## Macros vs session vs input

Three different kinds of thing you can adjust:

- **Aesthetic macros** (`system:*`, bare cross-cutting, `<scope>:*`) — modulate how the grammars *look*. Set via `set_macro(name, value)`. Continuous or discrete or compound. Examples: `harmony:linger`, `rhythm:quantise-resolution`, `time-horizon`.
- **Session controls** (`session:*`) — set the *musical frame* the analyser reads within. Categorical values, distinct MCP tools. Examples: `set_key`, `set_tempo`, `set_metronome`.
- **Input controls** (`input:*`) — which device the pipeline is listening to. `set_input`, read `inputs://available` for a device list.

When the user says something ambiguous, look at what surface they're asking about:

| User says… | Reach for… |
|---|---|
| "less past" / "more context" / "wider view" | `time-horizon` (or a per-grammar equivalent) |
| "we're in [key]" / "let's play in [tempo]" | `session:*` / `set_key` / `set_tempo` |
| "stricter timing" / "grade me harder" | `rhythm:difficulty` |
| "make the chords linger" | `harmony:linger` |
| "quiet the pulse" / "less beat" | `rhythm:emphasis` (turn down) |
| "make C red" / "reset colours" | `set_hue_for_pitch` |
| "use the piano MIDI" / "listen to the mic" | `set_input` |

---

## Confidence

Every detected musical event carries a confidence value. MIDI events arrive at 1.0 (deterministic). Audio events arrive with model-reported values < 1.0. Currently no grammar visually modulates on confidence, but the state is available if you want to reason about it (a chord detected at low confidence may be genuinely ambiguous, worth surfacing to the user rather than acting on).

---

## Multi-instance

The user may run more than one Synesthetica instance under the same CLI — e.g. one visualising a piano input, one visualising a guitar the user is learning by ear. Each instance has a label (`default` for the first, user-supplied for subsequent). Tools take an optional `instance` parameter; omit it when only one instance is running, supply it when multiple are.

When multi-instance, read `instances://` to see labels + status. State resources are per-instance (`state://piano/current`, `state://guitar/current`). Annotations, concepts, and presets are shared across instances.

---

## What to do when you don't have what you need

- **Missing capability**: if the user asks for something no annotation covers, say so. Don't force-fit an unrelated op. "There's no per-grammar visual weight control right now" is a valid response.
- **Ambiguous request**: pick the most literal reading, act, and flag the alternative reading in your response. E.g. "make it more stable" could mean detection anti-flicker or display linger — take one, name the other.
- **Missing prerequisite**: if the user asks to grade their timing but there's no prescribed tempo, ask for it (or infer it from context if they mentioned one recently).
- **Uncertain values**: relative requests ("more", "less") anchor on the annotated default. If they say "more chord linger" and current is 3 (the default), 4 or 5 is a reasonable increment.

---

## Non-goals (things you cannot do)

- **Infer tempo, key, or meter from the music.** All three are user-prescribed only. Don't offer to "detect" them.
- **Switch or disable grammars.** All three grammars always run. You can only modulate them.
- **Emphasise one grammar over another.** No per-grammar visual weighting exists yet. If the user asks, name it as a gap.
- **Access historical events beyond the recent-events buffer.** For deep history, use `state://<label>/recent-events/history` — but there's no full-session replay.
- **Change the pipeline architecture.** Adapter/stabiliser/grammar routing is fixed at engine start.
