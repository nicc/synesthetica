# Synesthetica — system overview

*This document is the authored prose portion of the `get_started` MCP tool response. The LLM calls `get_started` once per conversation for pipeline context. Written for an LLM operator; keep specific and load-bearing, not aspirational.*

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

You interact with this pipeline through **MCP tools** — verbs like `set_macro`, `set_key`, and reader tools like `get_state`, `get_recent_events`, `list_inputs`, `list_presets`, `get_preset`. The server also exposes matching **resources** (`state://<label>/current`, `state://<label>/recent-events`, `annotations://`, `concepts://`, `presets://`) for user-triggered attachment, but Claude Desktop does not proxy resource reads through to the LLM as callable — so the reader tools are your autonomous read surface. Use tools; leave resources for the user to attach when they want to inspect something directly.

---

## Session lifecycle

The MCP server is always-on and cheap. The visualiser pipeline sits behind explicit tools:

- **`start_session`** — spawns the web-app subprocess + WS bridge + browser tab. Call this when the user signals musical intent (mentions playing, an instrument, tempo, rhythm, harmony, visualisation). Idempotent — a no-op if a session is already running.
- **`stop_session`** — tears everything down. Call when the user says they're done (thanks / that's it / stop / close). Idempotent.

Every setter tool (`set_macro`, `set_key`, etc.) and every reader tool (`get_state`, `get_recent_events`) requires a running session. Calling them cold returns `ENGINE_NOT_STARTED` — the LLM's cue to call `start_session` first and re-issue the original request. Standard flow for a musical request is: call `get_started` (once per conversation) → call `start_session` → user picks an input via `set_input` → do the requested work.

`state.session.phase` distinguishes three lifecycle states:
- **`no-session`** — pipeline hasn't started; call `start_session`.
- **`spawned`** — pipeline is up and setter tools take effect on consumers, but no input adapter is running yet. `startedAt` is still null, no notes flowing. This is a real intermediate state — the visualiser exists but has nothing to visualise.
- **`input-active`** — an input is selected; `startedAt` is stamped; events accrue. This is when the temporal-arithmetic guidance below is meaningful.

Prefer `state.session.phase` over `startedAt`/`effective` inference when reporting session state to the user — it names the `spawned` intermediate the other signals miss.

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
- **Input controls** (`input:*`) — which device the pipeline is listening to. `set_input(source)`; use `list_inputs` for the enumerated list of available MIDI + audio devices (each entry carries a `sourceString` ready to pass), and `get_state` for the current selection (in `state.input`).

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

Single instance today (`default`). Every tool accepts an optional `instance` parameter for a multi-instance future — omit it and calls route to `default`. Multi-instance routing (per-instance state, `instances://` enumeration) isn't wired yet; if the user says "start another piano session" that's a gap to name, not a control op to execute.

---

## What to do when you don't have what you need

- **Missing capability**: if the user asks for something no annotation covers, say so. Don't force-fit an unrelated op. "There's no per-grammar visual weight control right now" is a valid response.
- **Ambiguous request**: pick the most literal reading, act, and flag the alternative reading in your response. E.g. "make it more stable" could mean detection anti-flicker or display linger — take one, name the other.
- **Missing prerequisite**: if the user asks to grade their timing but there's no prescribed tempo, ask for it (or infer it from context if they mentioned one recently).
- **Uncertain values**: relative requests ("more", "less") anchor on the annotated default. If they say "more chord linger" and current is 3 (the default), 4 or 5 is a reasonable increment. Every macro's unit is invariant to session state — pick a value against the leaf's declared range without worrying about tempo/meter reinterpreting it.

---

## Non-goals (things you cannot do)

- **Infer tempo, key, or meter from the music.** All three are user-prescribed only. Don't offer to "detect" them.
- **Switch or disable grammars.** All three grammars always run. You can only modulate them.
- **Emphasise one grammar over another.** No per-grammar visual weighting exists yet. If the user asks, name it as a gap.
- **Access history beyond the in-memory recent-events buffer.** `get_recent_events` returns at most the buffer's capacity (~1000 events, roughly 30–60s of active playing). Poll for new events with the `since` arg, but there's no full-session replay or on-disk history.
- **Change the pipeline architecture.** Adapter/stabiliser/grammar routing is fixed at engine start.
