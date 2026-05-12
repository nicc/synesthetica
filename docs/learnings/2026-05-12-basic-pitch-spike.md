# Basic Pitch Sliding-Window Spike

**Date:** 2026-05-12
**Issue:** synesthetica-w1z
**Decision:** Proceed with SPEC 012, with architecture amendments

## What was tested

Whether [`@spotify/basic-pitch`](https://www.npmjs.com/package/@spotify/basic-pitch) can be used in a real-time streaming context for the polyphonic audio adapter (SPEC 012). Specifically:

1. Whether the model can detect onsets near the END of its input window (and how much post-onset audio is required for reliable detection)
2. How long inference actually takes
3. How polyphony behaves

Test fixtures were synthesised sine bursts (monophonic A4 = MIDI 69, and a C-major triad). Real-instrument validation is still required before launch — see "What remains untested".

## Headline findings

### 1. The model's input window is hard-coded to 2 seconds

Not a configurable hyperparameter. The model architecture (TF.js GraphModel) expects exactly `22050 * 2 - 256 = 43,844` samples (~1.988 s) per inference call. SPEC 012's "250ms window with 30ms hop" was wrong — that's not achievable with this model.

This sounds bad for latency, but it isn't, because of finding #2.

### 2. Onset detection works with very little post-onset audio

Sweeping how much post-onset audio is included in the window (the rest of the window is silence or pre-onset audio):

```
postOnsetMs | detected | conf  | inferenceMs (WASM)
       50ms |     yes  | 0.615 |   124
      100ms |     yes  | 0.784 |   115
      150ms |     yes  | 0.780 |   112
      200ms |     yes  | 0.637 |   115
      300ms |     yes  | 0.799 |   127
      ...
```

With as little as **50 ms of post-onset audio**, the model reports the onset at conf > 0.6. By **100 ms** it's at conf > 0.78. So the model only needs the onset itself + a brief tail to be inside its 2-second view; everything before the onset can be silence or earlier audio. This means the achievable latency is bounded by inference time and a small post-onset waiting period, not by the 2-second window length.

This was the most important question of the spike, and it answered favourably.

### 3. Inference time

Measured on this machine (Apple Silicon, Node 24):

| Backend | Median | p95 |
|---|---|---|
| TF.js CPU (pure JS) | 1340 ms | 1357 ms |
| TF.js WASM (no SIMD) | 116 ms | 124 ms |
| TF.js WASM + SIMD | not measured here | likely 60–90 ms |
| TF.js WebGL (browser) | not measured here | typically 30–60 ms for this size model |
| TF.js WebGPU (browser) | not measured here | typically 20–40 ms |

CPU backend is unusable. WASM is acceptable but not ideal. **Production must use WebGL or WebGPU in the browser.** The `@spotify/basic-pitch` package imports `@tensorflow/tfjs` (the all-backends bundle), so backend selection happens at app init.

### 4. Polyphony

For a C major triad (C4, E4, G4 = MIDI 60, 64, 67) with a relaxed onset threshold of 0.3:

```
postOnsetMs | found pitches                | recall | extras
       100  | 60,63,64,65,66,67,68         |  1.00  |   4
       200  | 60,64,67                     |  1.00  |   0
       400  | 55,60,64,65,67,68            |  1.00  |   3
       800  | 60,63,64,65,67,68            |  1.00  |   3
```

Recall is perfect — all three notes always detected. Precision is moderate at low thresholds — phantom notes appear at adjacent semitones, common for multipitch CNNs whose posteriors spread across nearby pitches. The 200ms row is clean by coincidence; in production we'll need **(a)** a higher onset threshold (probably 0.5–0.6) and **(b)** an adjacency-suppression pass — if the same time-frame has high onset confidence at adjacent pitches, prefer the highest-confidence one.

## Implications for SPEC 012

The spec needs amending in three places. Captured in commit accompanying this writeup:

### Window size

```diff
- Window: 250 ms (≈ 5512 samples)
+ Window: 2000 ms (43,844 samples — model architectural constraint)
```

### Ring buffer size

```diff
- Size chosen to hold ~1 second of audio
+ Size chosen to hold ~2.5 seconds of audio (window + safety margin
+ for jitter)
```

### Latency budget

The budget table is still roughly right, but it should explicitly note:

- The 2-second window does **not** mean 2-second latency — only ~50–100 ms of post-onset audio is needed inside the window for reliable detection.
- Backend selection matters enormously: WebGL/WebGPU is required for the target.

Revised numbers:

| Stage | Budget |
|---|---|
| Mic → AudioWorklet | 5–15 ms |
| Worklet resample + ring write | < 1 ms |
| Wait for next inference tick (30–50 ms hop) | 0–50 ms |
| Post-onset audio accumulation in window | 50–100 ms |
| Inference (WebGL) | 30–60 ms |
| Worker → main thread post | < 5 ms |
| Pipeline + render | ~16 ms |
| **Typical** | **~150 ms** |
| **Ceiling (degraded conditions)** | **~250 ms** |

The 200 ms ceiling in the original spec is achievable with WebGL but tight. Worth flagging that we may end up at 200–250 ms in practice and asking the user whether that's acceptable before final integration.

### New: confidence threshold + adjacency suppression

The adapter must filter the model's onset posteriors. SPEC 012 should add:

- A confidence threshold (start at 0.5, tunable)
- Adjacency suppression: within a time-frame, if multiple adjacent pitches have onsets above threshold, keep only the highest

Both belong in the inference worker (immediately after model output, before posting events to the main thread).

## What this spike did NOT test

- Real-instrument audio (guitar, piano, voice). Synthetic sines are favourable cases.
- Audio with noise / room reverb / non-anechoic recordings.
- Sustained or fast-decaying notes (only steady ~600ms bursts were tested).
- Note-off latency (offset prediction) — only onset detection was measured.
- Inference time in actual browsers (WebGL, WebGPU). Tested only in Node WASM. Production perf may differ.
- Streaming-mode behavior with overlapping windows (the spike used isolated windows, not a continuously-running rolling buffer).

These belong in implementation testing, not pre-implementation validation. The spike's purpose was to answer "can this approach work at all and within rough latency targets" — yes, with caveats.

## Decision

**Proceed with SPEC 012, amend it to reflect the 2-second window and revised latency budget.** The spike validates the architectural approach; remaining risks are tunings and edge cases that surface during implementation.

## Reproducibility

The spike harness is in [`spikes/audio-latency/run.cjs`](../../spikes/audio-latency/run.cjs). Run with:

```bash
cd spikes/audio-latency
npm install
npm run spike
```
