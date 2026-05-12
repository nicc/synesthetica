/**
 * Spike: Basic Pitch sliding-window latency and accuracy (synesthetica-w1z)
 *
 * Pre-spike finding (from reading the source of @spotify/basic-pitch):
 *   The model has a HARD 2-second input window
 *   (AUDIO_WINDOW_LENGTH_SECONDS = 2 in src/inference.ts). Inputs are
 *   framed into 2s chunks with ~1.64s hop and 348ms overlap. The
 *   250ms-window assumption in SPEC 012 §Architecture is not possible
 *   with this model.
 *
 * What this spike measures empirically:
 *   1. Does Basic Pitch detect onsets near the END of its 2-second
 *      input window, or does it need future context within the window?
 *      → Determines minimum achievable end-to-end latency.
 *   2. How does its accuracy degrade when only N ms of post-onset
 *      context is present in the window? (sweep N)
 *   3. How long does evaluateSingleFrame take on this hardware?
 *
 * Method:
 *   - Generate a deterministic test signal: sine bursts at known times.
 *   - For each onset, build "windows" that contain T ms of post-onset
 *     audio (T sweeping from 100ms up to 1900ms).
 *   - Run model on each window, see if the onset is detected.
 *   - Record detection latency (= post-onset audio needed for reliable
 *     detection) and inference time per window.
 */

const tf = require("@tensorflow/tfjs");
const wasm = require("@tensorflow/tfjs-backend-wasm");
const { BasicPitch } = require("@spotify/basic-pitch");

const path = require("node:path");
const fs = require("node:fs");


// ---- Constants from basic-pitch source ----
const SAMPLE_RATE = 22050;
const FFT_HOP = 256;
const ANNOTATIONS_FPS = Math.floor(SAMPLE_RATE / FFT_HOP); // ≈ 86.13 fps
const WINDOW_SAMPLES = SAMPLE_RATE * 2 - FFT_HOP; // 43,844 samples ≈ 1.988s

// ---- Test fixture: sine bursts at known onsets ----
// We'll place a sine burst at t=1.5s into a longer buffer so the model
// has audio BEFORE the onset (silence) and we can sweep how much AFTER
// we include.
const ONSET_SECONDS = 1.5;
const NOTE_FREQ_HZ = 440; // A4 = MIDI 69
const NOTE_PITCH_MIDI = 69;
const NOTE_DURATION_S = 0.6;
const NOTE_AMPLITUDE = 0.3;

function generateFixture(totalDurationS) {
  const n = Math.ceil(totalDurationS * SAMPLE_RATE);
  const buf = new Float32Array(n);
  const onsetSample = Math.floor(ONSET_SECONDS * SAMPLE_RATE);
  const noteSamples = Math.floor(NOTE_DURATION_S * SAMPLE_RATE);
  for (let i = 0; i < noteSamples && onsetSample + i < n; i++) {
    // Quick attack envelope (~5ms) to give the onset detector a clear edge
    const env = i < 110 ? i / 110 : 1.0;
    buf[onsetSample + i] =
      NOTE_AMPLITUDE * env * Math.sin((2 * Math.PI * NOTE_FREQ_HZ * i) / SAMPLE_RATE);
  }
  return buf;
}

// ---- Build a single 2-second window with controllable post-onset audio ----
// `postOnsetMs` controls how much audio AFTER the onset is included in
// the window. The onset sits at sample (WINDOW_SAMPLES - postOnsetSamples).
function windowForPostOnsetMs(fixture, postOnsetMs) {
  const window = new Float32Array(WINDOW_SAMPLES);
  const onsetSampleInFixture = Math.floor(ONSET_SECONDS * SAMPLE_RATE);
  const postOnsetSamples = Math.floor((postOnsetMs / 1000) * SAMPLE_RATE);
  const onsetPositionInWindow = WINDOW_SAMPLES - postOnsetSamples;
  // Copy from fixture: fixture[onset - onsetPositionInWindow .. onset + postOnsetSamples]
  const start = onsetSampleInFixture - onsetPositionInWindow;
  for (let i = 0; i < WINDOW_SAMPLES; i++) {
    const src = start + i;
    if (src >= 0 && src < fixture.length) window[i] = fixture[src];
  }
  return { window, onsetPositionInWindow };
}

// ---- Run model on one window and return detected onsets in the window ----
async function detectInWindow(basicPitch, window) {
  // Reshape to [1, AUDIO_N_SAMPLES, 1]
  const tensor = tf.tensor(window).reshape([1, WINDOW_SAMPLES, 1]);
  const t0 = performance.now();
  const [framesTensor, onsetsTensor, contoursTensor] =
    await basicPitch.evaluateSingleFrame(tensor, 0);
  const inferenceMs = performance.now() - t0;

  const framesArr = await framesTensor.array();
  const onsetsArr = await onsetsTensor.array();
  const contoursArr = await contoursTensor.array();

  tensor.dispose();
  framesTensor.dispose();
  onsetsTensor.dispose();
  contoursTensor.dispose();

  // framesArr / onsetsArr shape: [batch=1, timeFrames, pitch=88]
  return {
    frames: framesArr[0],
    onsets: onsetsArr[0],
    contours: contoursArr[0],
    inferenceMs,
  };
}

// ---- Find first frame at/after onsetPositionInWindow where any pitch's
//      onset confidence exceeds threshold ----
function firstOnsetFrameAfter(onsets, fromFrameIdx, threshold = 0.5) {
  for (let f = fromFrameIdx; f < onsets.length; f++) {
    for (let p = 0; p < onsets[f].length; p++) {
      if (onsets[f][p] >= threshold) return { frameIdx: f, pitchIdx: p, conf: onsets[f][p] };
    }
  }
  return null;
}

function frameIdxToSamples(frameIdx) {
  return frameIdx * FFT_HOP;
}

async function main() {
  console.log("\n=== Spike: Basic Pitch sliding-window latency ===\n");
  // Try WASM backend — closer to production browser perf than CPU JS.
  try {
    // Point wasm backend to the SIMD-enabled .wasm file shipped in node_modules.
    wasm.setWasmPaths(
      path.join(__dirname, "node_modules/@tensorflow/tfjs-backend-wasm/dist/"),
    );
    await tf.setBackend("wasm");
    await tf.ready();
  } catch (err) {
    console.warn("WASM backend unavailable, falling back to CPU:", err.message);
  }
  console.log("Backend:", tf.getBackend());
  console.log(`Sample rate: ${SAMPLE_RATE} Hz`);
  console.log(`Window: ${WINDOW_SAMPLES} samples (${(WINDOW_SAMPLES / SAMPLE_RATE).toFixed(3)}s)`);
  console.log(`ANNOTATIONS_FPS: ${ANNOTATIONS_FPS} (frame every ${(1000 / ANNOTATIONS_FPS).toFixed(2)}ms)`);

  // Load model — tfjs-node uses tf.io.fileSystem for local files.
  // Pass an already-loaded GraphModel to BasicPitch so it doesn't try to fetch().
  const modelPath = path.join(__dirname, "node_modules/@spotify/basic-pitch/model/model.json");
  console.log(`\nLoading model from: ${modelPath}`);
  const t0 = performance.now();
  // Build a custom IOHandler that reads the model files from the local
  // filesystem — tfjs's built-in handlers all assume browser fetch().
  const modelDir = path.dirname(modelPath);
  const modelJSON = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
  const weightsManifest = modelJSON.weightsManifest;
  const weightSpecs = [];
  const weightBuffers = [];
  for (const group of weightsManifest) {
    weightSpecs.push(...group.weights);
    for (const filename of group.paths) {
      weightBuffers.push(fs.readFileSync(path.join(modelDir, filename)));
    }
  }
  const totalBytes = weightBuffers.reduce((s, b) => s + b.byteLength, 0);
  const weightData = new ArrayBuffer(totalBytes);
  const weightView = new Uint8Array(weightData);
  let offset = 0;
  for (const b of weightBuffers) {
    weightView.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), offset);
    offset += b.byteLength;
  }
  const ioHandler = {
    load: async () => ({
      modelTopology: modelJSON.modelTopology,
      format: modelJSON.format,
      generatedBy: modelJSON.generatedBy,
      convertedBy: modelJSON.convertedBy,
      weightSpecs,
      weightData,
      signature: modelJSON.signature,
      userDefinedMetadata: modelJSON.userDefinedMetadata,
    }),
  };
  const graphModel = await tf.loadGraphModel(ioHandler);
  const basicPitch = new BasicPitch(Promise.resolve(graphModel));
  await basicPitch.model;
  console.log(`Model loaded in ${(performance.now() - t0).toFixed(0)}ms`);

  // Warm up: one inference to JIT/compile kernels
  console.log("\nWarming up...");
  const fixture = generateFixture(2.5);
  const { window: warmWindow } = windowForPostOnsetMs(fixture, 500);
  await detectInWindow(basicPitch, warmWindow);

  // ---- Experiment 1: detection vs post-onset audio in window ----
  console.log("\n--- Experiment 1: post-onset audio sweep ---");
  console.log("postOnsetMs | detected | latencyAfterOnsetMs | pitchMidi | onsetConf | inferenceMs");
  console.log("------------+----------+---------------------+-----------+-----------+------------");

  const sweeps = [50, 100, 150, 200, 300, 400, 500, 700, 1000, 1500, 1900];
  const results = [];
  for (const postOnsetMs of sweeps) {
    const { window, onsetPositionInWindow } = windowForPostOnsetMs(fixture, postOnsetMs);
    const onsetFrameInWindow = Math.floor(onsetPositionInWindow / FFT_HOP);
    const out = await detectInWindow(basicPitch, window);
    // Look for onset detection at or AFTER the true onset frame
    const det = firstOnsetFrameAfter(out.onsets, Math.max(0, onsetFrameInWindow - 2));
    const detected = det !== null;
    let latencyAfterOnsetMs = null;
    let pitchMidi = null;
    let conf = null;
    if (detected) {
      const detSampleInWindow = frameIdxToSamples(det.frameIdx);
      const latencySamples = detSampleInWindow - onsetPositionInWindow;
      latencyAfterOnsetMs = (latencySamples / SAMPLE_RATE) * 1000;
      pitchMidi = det.pitchIdx + 21; // basic-pitch outputs 88 pitches starting at MIDI 21
      conf = det.conf;
    }
    results.push({ postOnsetMs, detected, latencyAfterOnsetMs, pitchMidi, conf, inferenceMs: out.inferenceMs });
    console.log(
      `${String(postOnsetMs).padStart(11)} | ${String(detected).padStart(8)} | ${
        latencyAfterOnsetMs !== null ? latencyAfterOnsetMs.toFixed(1).padStart(19) : "       —          "
      } | ${pitchMidi !== null ? String(pitchMidi).padStart(9) : "    —    "} | ${
        conf !== null ? conf.toFixed(3).padStart(9) : "    —    "
      } | ${out.inferenceMs.toFixed(1).padStart(11)}`,
    );
  }

  // ---- Experiment 2: inference time stability ----
  console.log("\n--- Experiment 2: inference time (10 runs at postOnsetMs=500) ---");
  const times = [];
  const { window: stableWindow } = windowForPostOnsetMs(fixture, 500);
  for (let i = 0; i < 10; i++) {
    const t = performance.now();
    await detectInWindow(basicPitch, stableWindow);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const min = times[0];
  const med = times[Math.floor(times.length / 2)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const max = times[times.length - 1];
  console.log(`min ${min.toFixed(1)}ms  median ${med.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms  max ${max.toFixed(1)}ms`);

  // ---- Experiment 3: polyphony — C major triad (C4, E4, G4) ----
  console.log("\n--- Experiment 3: polyphony (C major triad C4 E4 G4 = MIDI 60 64 67) ---");
  const polyFixture = (function () {
    const total = Math.ceil(2.5 * SAMPLE_RATE);
    const buf = new Float32Array(total);
    const onsetSample = Math.floor(ONSET_SECONDS * SAMPLE_RATE);
    const noteSamples = Math.floor(NOTE_DURATION_S * SAMPLE_RATE);
    const freqs = [261.63, 329.63, 392.0]; // C4, E4, G4
    for (let i = 0; i < noteSamples && onsetSample + i < total; i++) {
      const env = i < 110 ? i / 110 : 1.0;
      let sample = 0;
      for (const f of freqs) {
        sample += Math.sin((2 * Math.PI * f * i) / SAMPLE_RATE);
      }
      buf[onsetSample + i] = NOTE_AMPLITUDE * env * (sample / freqs.length);
    }
    return buf;
  })();
  const sweepsPoly = [100, 200, 400, 800];
  for (const postOnsetMs of sweepsPoly) {
    const { window, onsetPositionInWindow } = (function () {
      const w = new Float32Array(WINDOW_SAMPLES);
      const fixtureOnsetSample = Math.floor(ONSET_SECONDS * SAMPLE_RATE);
      const postOnsetSamples = Math.floor((postOnsetMs / 1000) * SAMPLE_RATE);
      const onsetPos = WINDOW_SAMPLES - postOnsetSamples;
      const start = fixtureOnsetSample - onsetPos;
      for (let i = 0; i < WINDOW_SAMPLES; i++) {
        const src = start + i;
        if (src >= 0 && src < polyFixture.length) w[i] = polyFixture[src];
      }
      return { window: w, onsetPositionInWindow: onsetPos };
    })();
    const out = await detectInWindow(basicPitch, window);
    const onsetFrame = Math.floor(onsetPositionInWindow / FFT_HOP);
    // Find all pitches with onset confidence > 0.3 in frames at/after onset
    const found = new Map();
    for (let f = Math.max(0, onsetFrame - 2); f < out.onsets.length; f++) {
      for (let p = 0; p < out.onsets[f].length; p++) {
        if (out.onsets[f][p] >= 0.3) {
          const midi = p + 21;
          if (!found.has(midi) || found.get(midi) < out.onsets[f][p]) {
            found.set(midi, out.onsets[f][p]);
          }
        }
      }
    }
    const expected = [60, 64, 67];
    const recall = expected.filter((m) => found.has(m)).length / expected.length;
    const extras = [...found.keys()].filter((m) => !expected.includes(m));
    console.log(
      `postOnsetMs=${String(postOnsetMs).padStart(4)} | found ${[...found.keys()].sort((a, b) => a - b).join(",")} | recall ${recall.toFixed(2)} | extras=${extras.length}`,
    );
  }

  // ---- Summary ----
  console.log("\n--- Summary ---");
  const detectedRows = results.filter((r) => r.detected);
  const firstReliable = detectedRows.find((r) => r.conf > 0.7);
  if (firstReliable) {
    console.log(`Smallest postOnsetMs with conf > 0.7: ${firstReliable.postOnsetMs}ms`);
  }
  const expectedPitch = NOTE_PITCH_MIDI;
  const pitchCorrect = detectedRows.filter((r) => r.pitchMidi === expectedPitch).length;
  console.log(`Pitch detection accuracy: ${pitchCorrect}/${detectedRows.length} runs identified MIDI ${expectedPitch}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
