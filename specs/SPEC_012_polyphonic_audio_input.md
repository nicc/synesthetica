# SPEC 012: Polyphonic Audio Input via Basic Pitch

Status: Approved
Date: 2026-05-12
Source: design conversation (May 2026); supersedes the Meyda evaluation captured in synesthetica-y7q

## Summary

Defines the first audio input adapter for Synesthetica: a polyphonic note-event source driven by Spotify's Basic Pitch model. The adapter listens to live microphone input, runs the model in a Web Worker over a sliding window, and produces `RawInputFrame`s shaped to match the existing MIDI path. The pipeline downstream is unchanged — note events are note events.

A second adapter for monophonic continuous-pitch input (voice, single instrument) is anticipated as a separate path and noted at the end of this spec; it is not designed here.

## Goals

1. Live microphone → polyphonic note events through the existing pipeline.
2. End-to-end latency target ≤ 150 ms typical, 200 ms ceiling, measured from note onset at the microphone to the corresponding visual change on screen.
3. Confidence values are first-class — every audio-derived event carries a confidence; downstream grammars and stabilizers may filter, weight, or visually modulate based on it.
4. MIDI and audio inputs are mutually exclusive. Only one input source is active per session.
5. The audio path is opt-in — MIDI-only users do not pay the Basic Pitch download cost.

## Non-Goals

- **Monophonic continuous-pitch input** — captured as a follow-up; the pitch-bend contract here is designed to extend cleanly into that case.
- **File input** — live mic only. A test harness may accept files, but the production app does not.
- **Sub-100ms latency** — not achievable with Basic Pitch's windowed inference. Targeting that would require a different model.
- **MIDI-channel-scoped pitch bend** (the traditional pitch wheel that bends all notes on a channel). When/if MIDI pitch bend is added later, it will be modelled per active note (MPE-style) and reuse the same per-note pitch-bend contract defined here.
- **Polyphony beyond ~6 simultaneous notes** — Basic Pitch's effective polyphony, not a hard contract.

## Principles Honoured

- **P2 Simplicity over cleverness** — single adapter, single architecture, no parallel pipeline. The audio path produces the same `RawInputFrame` shape as MIDI; everything downstream is unchanged.
- **P3 Emergent power from primitives** — no new musical abstraction. Note events stay the primitive; we just produce them from a new source.
- **P4 Perceptual honesty** — confidence is plumbed end-to-end. The system does not pretend audio is as certain as MIDI.
- **P5 Real-time respect** — bounded latency, off-main-thread inference, lock-free ring buffer, no blocking on the audio thread.
- **P6 Composability** — adapter is hidden behind `IRawSourceAdapter`; pipeline does not know its input is audio.
- **P8 Experiential feedback through simulation** — a test harness that pipes pre-recorded audio (and ideally a ground-truth MIDI alignment) through the adapter is required for latency and accuracy validation.

## Contract Additions

Three new variants on `RawInput`:

```ts
/** Note onset detected by an audio analyser. */
export interface AudioNoteOn {
  type: "audio_note_on";
  t: Ms;                  // when the note actually occurred (mic time)
  noteId: string;         // adapter-generated; stable for the note's lifetime
  pitch: number;          // MIDI note number, may be fractional (non-12TET sources)
  velocity: number;       // 0..1, derived (RMS-based); NOT MIDI 0-127
  confidence: Confidence; // model's confidence in the onset
}

/** Note release detected by an audio analyser. */
export interface AudioNoteOff {
  type: "audio_note_off";
  t: Ms;
  noteId: string;         // matches the AudioNoteOn that opened the note
  confidence: Confidence;
}

/**
 * Continuous pitch deviation sample for an active note.
 *
 * Used for two cases (designed once, applied twice):
 *  1. Polyphonic audio: per-note pitch contour from Basic Pitch
 *     (vibrato, slides, intonation drift)
 *  2. Future monophonic audio: pitch trajectory of the single voice
 *     (sampled at the analyser's frame rate)
 *  3. Future MIDI MPE pitch bend: per-note bend value
 *
 * Tied to a note by noteId so downstream consumers can associate
 * the trajectory with the right ongoing note.
 */
export interface AudioPitchBend {
  type: "audio_pitch_bend";
  t: Ms;
  noteId: string;
  semitones: number;      // signed deviation from nominal pitch (AudioNoteOn.pitch)
  confidence: Confidence;
}
```

Notes on shape:

- `velocity` is `0..1` and explicitly derived (RMS over a window around onset, normalised). It is not comparable to MIDI velocity in absolute terms because microphone level and source loudness vary. It is useful relative to itself within a session.
- `pitch` is a fractional MIDI note number so the same field carries the result of pitch-class detection from a model that may not be locked to 12TET.
- `noteId` is opaque to the adapter's consumers — they only need it to associate bend samples with the right note.

### Backward compatibility

The existing `AudioOnset`, `AudioPitch`, `AudioLoudness` types remain in the contract. They are now interpreted as feature-only (untied to a note) and are not produced by this adapter — they are reserved for a future feature-extraction adapter (e.g. Meyda-style spectral features supplementing note events). No code currently emits or consumes them; they are forward-looking placeholders.

### `Confidence`

Already defined in `core/time`. Range `0..1`. The MIDI adapter implicitly emits events at confidence `1.0`; the audio adapter emits the model's reported confidence.

## Architecture

Three threads, isolated behind one adapter:

```
                     ┌───────────────────────────┐
  Microphone ──►─────│  AudioWorkletProcessor    │  (audio thread)
                     │                           │
                     │  • acquire 48k samples    │
                     │  • resample to 22.05k     │
                     │  • write to SAB ring      │
                     └──────────────┬────────────┘
                                    │  SharedArrayBuffer
                                    │  (single-producer / single-consumer)
                                    ▼
                     ┌───────────────────────────┐
                     │  Inference Worker         │  (worker thread)
                     │                           │
                     │  • poll ring on hop tick  │
                     │  • copy 250ms window      │
                     │  • run Basic Pitch        │
                     │  • derive velocity (RMS)  │
                     │  • post events on port    │
                     └──────────────┬────────────┘
                                    │  postMessage (note + bend events)
                                    ▼
                     ┌───────────────────────────┐
                     │  AudioInputAdapter        │  (main thread)
                     │                           │
                     │  • collect events         │
                     │  • dedupe across windows  │
                     │  • drain on nextFrame()   │
                     └──────────────┬────────────┘
                                    │  IRawSourceAdapter.nextFrame()
                                    ▼
                          existing pipeline
```

### Why this split

- **AudioWorkletProcessor on the audio thread**: the only place we can receive `getUserMedia` audio with guaranteed timing. It does nothing heavy — resample + write to ring. No allocations in the audio thread per spec convention.
- **Inference Worker**: Basic Pitch is computationally significant. Running it on the main thread would block the 60Hz render loop. The worker polls the ring at the configured hop interval and runs the model.
- **Main-thread adapter facade**: the only place that integrates with the existing `IRawSourceAdapter` pull contract. It buffers events from the worker's `MessagePort` and drains them on `nextFrame()`.

### Ring buffer

A `SharedArrayBuffer` carrying a Float32 sample ring plus two `Uint32Array` indices (head, tail) accessed with `Atomics.load` / `Atomics.store`. Single producer (worklet) writes samples and bumps head; single consumer (worker) reads samples and bumps tail. No locks. Size chosen to hold ~1 second of audio at 22.05 kHz (≈ 22050 samples = 88 KB) — generous enough to absorb scheduling jitter, small enough to keep memory pressure trivial.

The ring buffer implementation lives in `packages/adapters/src/audio/AudioRing.ts` and is unit-tested without the audio context (writes from one fake "producer", reads from a fake "consumer").

### Sliding-window inference

- **Sample rate**: 22.05 kHz (Basic Pitch native rate). Resampling happens in the worklet (linear or polyphase; benchmark later).
- **Window**: 250 ms (≈ 5512 samples). The model receives this as one inference input.
- **Right-context within window**: ~100 ms. The model emits onsets that lag the actual onset by at most this much, since it needs to see a bit of the future to confirm.
- **Hop**: 30 ms. The worker runs inference every 30 ms on the newest 250 ms of audio.
- **Deduplication**: each window overlaps the previous by ~220 ms; the same note may be detected in several consecutive windows. The adapter facade keeps a short-term cache keyed by `(pitch, onset_time_quantised_to_~50ms)` and only emits a given onset once.
- **Note-off coherence**: the model predicts both onset and offset for each note. We follow option (a) from the design discussion: emit `AudioNoteOff` when the model confirms an offset, even if that means the release is a few hops later than a fast RMS-decay detector would emit. This favours coherence with the model's own view; if it turns out to feel laggy, the fallback is a separate fast-decay note-off detector.

### Velocity derivation

For each emitted `AudioNoteOn`:

1. Take the ~50 ms of audio bracketing the onset.
2. Compute RMS.
3. Map to `0..1` with a session-local normaliser (running max with slow decay) so a quiet session and a loud session both span the available range.

Marked as derived in the contract; downstream consumers know it is not absolute.

## Latency Budget

End-to-end, from mic onset to corresponding visual:

| Stage | Budget | Notes |
|---|---|---|
| Microphone → AudioWorklet | 5–15 ms | depends on browser audio backend; can't be controlled |
| Worklet resample + ring write | < 1 ms | per buffer |
| Wait for next inference tick (hop) | 0–30 ms (avg 15 ms) | governed by hop length |
| Model right-context | 60–100 ms | needs future audio to confirm onset |
| Inference time | 10–40 ms | Basic Pitch is a small CNN; runs in WASM or WebGL backend |
| Worker → main thread post | < 5 ms | postMessage |
| Pipeline + render | ~16 ms | next frame |
| **Total typical** | **~140 ms** | |
| **Total ceiling** | **~200 ms** | the worklet driver may add jitter; rare worst-case |

If measurements show consistent latency above 200 ms, options:

- Drop hop length to 20 ms (more frequent inference, more compute).
- Reduce window from 250 ms to 180 ms (less right-context; accuracy may degrade).
- Run on WebGPU backend rather than WASM (if available).

These knobs are exposed in adapter config, not hardcoded.

## Cross-Origin Isolation

`SharedArrayBuffer` requires the page to be cross-origin-isolated. The web app must serve:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

In dev: configure `vite.config.ts` `server.headers`. In production: configure host-level headers. The audio adapter must fail loud if `crossOriginIsolated === false` (we cannot proceed without SAB; falling back to copy-based message passing would 5–10× the per-frame work).

## Adapter Lifecycle

### Construction

```ts
new AudioInputAdapter({
  sessionStart: performance.now(),
  inferenceConfig?: {
    windowMs?: 250,
    hopMs?: 30,
    rightContextMs?: 100,
  },
});
```

### Activation

The model is fetched and instantiated lazily on first `start()` call (when the user enables audio input). Subsequent stop/start in the same session reuses the loaded model. The model is ~10 MB; first-use delay is ~2–5 s on broadband.

### Mutual exclusion

The web app maintains a single active adapter at a time. Switching between MIDI and audio (or, later, between poly audio and mono audio) tears down the current adapter via `stop()` and constructs the new one. The pipeline does not need to know about this — it only sees `nextFrame()` results from whatever adapter is wired.

### Permissions

`getUserMedia({ audio: true })` triggers the standard browser permission prompt. Denied or revoked permission causes `start()` to reject with an explanatory error; the adapter never emits silently-failing zero-confidence events.

## Stabilizer Integration

`NoteTrackingStabilizer` currently consumes `MidiNoteOn` / `MidiNoteOff`. It must also consume `AudioNoteOn` / `AudioNoteOff`, treating them identically except:

1. `velocity` is `0..1` from audio, `0..127` from MIDI. The stabilizer normalises to `0..1` internally (MIDI velocity / 127) so both sources produce the same `AnnotatedNote` shape.
2. `confidence` is propagated through. The stabilizer records the input event's confidence on the `AnnotatedNote` and does not multiply or smooth it.
3. `noteId` from audio is used to match `AudioNoteOff` to `AudioNoteOn`. MIDI matching by `(channel, note)` continues to work as before.

`AudioPitchBend` is consumed by `NoteTrackingStabilizer` as well — it appends a sample to the matching note's pitch trajectory. This is new state on `AnnotatedNote`:

```ts
interface AnnotatedNote {
  // ... existing fields ...
  /** Per-note continuous pitch deviation samples, time-sorted. Empty for
   *  MIDI input today; populated by audio adapters. */
  pitchTrajectory?: PitchSample[];
}

interface PitchSample {
  t: Ms;
  semitones: number;   // signed deviation from nominal pitch
  confidence: Confidence;
}
```

Grammars that don't care about trajectory ignore the field. The rhythm grammar may later use it to render note strips with sideways deviation; the future mono pitch-accuracy grammar will be its primary consumer.

## Out-of-Order Events

Audio events arrive at the pipeline with timestamps in the past (the inference latency). This is OK: the pipeline tolerates events at past timestamps as long as they fit within the in-flight window. Concretely:

- An `AudioNoteOn` with `t = T_now - 150ms` is enqueued on the next `nextFrame()` call and stabilized into a note that exists in the "current" musical state.
- The rhythm grammar renders this note at its original `t`, which is ~150 ms past the NOW line. The note appears scrolled-up, exactly where it should be for when it actually happened. The viewer's experience is "the note appeared 150ms after I played it, and it appeared in the right place on the timeline" — i.e. latency without distortion.

The stabilizer must accept events with `t < current_frame_t` for an audio source. We document this as a stabilizer behavioural requirement.

## Test Harness

A test harness that bypasses live mic and feeds pre-recorded audio through the same adapter pipeline. Used for:

- Latency measurement (audio with embedded click track, measure detection delay vs. ground truth).
- Accuracy validation (audio with paired MIDI ground truth, compute precision/recall on note events).
- Regression testing.

Not user-facing. Lives in `packages/adapters/test/audio/` and uses local audio fixtures.

## What This Spec Does NOT Cover

- **Monophonic continuous-pitch input** (CREPE-based path). Pitch-bend contract anticipates it but the adapter, grammar, and stabilizer changes are out of scope.
- **MIDI pitch bend**. When added, will reuse `AudioPitchBend`'s shape (renamed or aliased).
- **Adapter selection UI**. The mechanism for the user to choose between MIDI and audio inputs lives in the web app, not in this spec.
- **Vite cross-origin-isolation configuration** — that's an implementation task, not an architectural decision.
- **Model versioning and caching strategy** — the Basic Pitch model file is cached by the browser via standard `Cache-Control`; no custom logic.

## Invariants

- **I21 (new)**: Audio-sourced note events carry a confidence value < 1.0 representing the analyser's certainty. MIDI events carry confidence 1.0. Downstream consumers may treat any event with confidence below a configurable threshold as low-trust and modulate visuals accordingly, but the pipeline does not silently drop low-confidence events.
- **I22 (new)**: Adapters do not block the main thread. Audio inference runs in a Web Worker; audio acquisition runs in an AudioWorklet. The main-thread adapter facade does only message-port handling and event buffering.
- **I23 (new)**: Note events from any adapter are eventually consistent with respect to time — they may arrive at the pipeline with `t` values in the past, but the rendered scene reflects them at their original timestamps once they arrive.
