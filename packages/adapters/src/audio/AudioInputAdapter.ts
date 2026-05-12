/**
 * AudioInputAdapter — main-thread facade implementing IRawSourceAdapter
 * (SPEC 012).
 *
 * Owns the audio pipeline:
 *   1. getUserMedia for the microphone
 *   2. AudioContext at 22050 Hz (Basic Pitch's required rate)
 *   3. AudioWorkletNode running AudioCaptureWorklet — writes mono
 *      samples into a shared AudioRing
 *   4. Web Worker running InferenceWorker — reads from the ring, runs
 *      Basic Pitch every hopMs, posts note events back here
 *   5. Main-thread event buffer — accumulates RawInput entries
 *      between nextFrame() calls
 *
 * The pipeline upstream is unchanged: it pulls RawInputFrames via
 * nextFrame() exactly as it does with RawMidiAdapter. Timestamps are
 * session-relative Ms; the adapter converts sample indices reported
 * by the worker into Ms using a captured audio-start origin.
 *
 * Mutual exclusion with the MIDI adapter: only one adapter is active
 * per session. Switching tears down via stop() and constructs the
 * other.
 */

import type {
  IRawSourceAdapter,
  RawInputFrame,
  RawInput,
  SourceId,
  StreamId,
  Ms,
} from "@synesthetica/contracts";

import { AudioRing } from "./AudioRing";
import type { MainToWorker, WorkerToMain } from "./workerProtocol";

// ---- Fixed constants from Basic Pitch's model architecture ----
const SAMPLE_RATE = 22050;
const FFT_HOP = 256;
const WINDOW_SAMPLES = SAMPLE_RATE * 2 - FFT_HOP; // 43,844

// Ring is sized generously to hold ~2.5 s. Power of two ≥ 2.5 × 22050 = 55125.
// Next power of two: 65536 (about 3 s). ~256 KB.
const RING_CAPACITY = 65536;

// ---- Tunable defaults ----
const DEFAULT_HOP_MS = 50;
const DEFAULT_ONSET_THRESHOLD = 0.5;
const DEFAULT_FRAME_THRESHOLD = 0.3;
const DEFAULT_MIN_NOTE_LENGTH_FRAMES = 5; // ~58 ms
const DEFAULT_DEDUP_WINDOW_MS = 50;
const DEFAULT_NOTE_OFF_TIMEOUT_MS = 200;

export interface AudioInputAdapterConfig {
  /**
   * Source identifier for provenance.
   * @default "audio"
   */
  sourceId?: SourceId;

  /**
   * Stream identifier for provenance.
   * @default "web-audio"
   */
  streamId?: StreamId;

  /**
   * Session start time (performance.now() at session start). All
   * event timestamps are relative to this.
   */
  sessionStart: number;

  /**
   * URL of the Basic Pitch model JSON (model.json). The InferenceWorker
   * fetches this via tf.loadGraphModel.
   */
  modelUrl: string;

  /**
   * URL of the compiled InferenceWorker script. The consumer (the web
   * app) is responsible for producing a URL that loads the worker —
   * typically via vite's `new URL('./InferenceWorker.ts', import.meta.url)`
   * or equivalent bundler magic.
   */
  workerUrl: string | URL;

  /**
   * URL of the compiled AudioCaptureWorklet module. Loaded into the
   * AudioContext's worklet registry via `audioWorklet.addModule`.
   */
  workletUrl: string | URL;

  /** Inference cadence in ms. @default 50 */
  hopMs?: number;

  /** Onset confidence threshold (0..1). @default 0.5 (per spike) */
  onsetThreshold?: number;

  /** Frame-presence confidence threshold (0..1). @default 0.3 */
  frameThreshold?: number;

  /** Minimum note length in model frames. @default 5 (~58 ms) */
  minNoteLengthFrames?: number;

  /** Onset dedup window in ms. @default 50 */
  dedupWindowMs?: number;

  /** Note-off timeout in ms. @default 200 */
  noteOffTimeoutMs?: number;
}

const DEFAULT_CONFIG = {
  sourceId: "audio" as SourceId,
  streamId: "web-audio" as StreamId,
  hopMs: DEFAULT_HOP_MS,
  onsetThreshold: DEFAULT_ONSET_THRESHOLD,
  frameThreshold: DEFAULT_FRAME_THRESHOLD,
  minNoteLengthFrames: DEFAULT_MIN_NOTE_LENGTH_FRAMES,
  dedupWindowMs: DEFAULT_DEDUP_WINDOW_MS,
  noteOffTimeoutMs: DEFAULT_NOTE_OFF_TIMEOUT_MS,
};

export class AudioInputAdapter implements IRawSourceAdapter {
  readonly source: SourceId;
  readonly stream: StreamId;

  private config: Required<AudioInputAdapterConfig>;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private worker: Worker | null = null;

  /**
   * Session ms corresponding to sample 0 of the ring. Captured once
   * when the audio context resolves to a running state. Used to
   * convert worker-reported sampleIndex → session-relative t.
   */
  private audioOriginSessionMs: Ms = 0;

  /** Events accumulated since last nextFrame() call. */
  private pendingInputs: RawInput[] = [];
  /** Session time of the most recent input, for the frame timestamp. */
  private lastInputTime: Ms = 0;

  constructor(config: AudioInputAdapterConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<AudioInputAdapterConfig>;
    this.source = this.config.sourceId;
    this.stream = this.config.streamId;
  }

  /**
   * Bring up the full audio path. Resolves once the model is loaded
   * and the worker reports "ready". Rejects if any stage fails (mic
   * permission denied, model load fails, etc.).
   */
  async start(): Promise<void> {
    if (this.audioContext) return; // already running

    // 1. Request mic. Native rate is whatever the device provides;
    // AudioContext resamples to its own rate downstream.
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    // 2. AudioContext at the model's required sample rate. The browser
    // resamples the mic stream as it flows through the graph.
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (this.audioContext.sampleRate !== SAMPLE_RATE) {
      // Some browsers refuse a non-native rate and silently pick their
      // own. We bail rather than feed the model garbage.
      throw new Error(
        `AudioContext did not honour sampleRate=${SAMPLE_RATE} (got ${this.audioContext.sampleRate}). Audio adapter unavailable on this platform.`,
      );
    }

    // 3. Worklet module + node. The ring lives in a SAB shared across
    // the audio thread, the worker, and us.
    await this.audioContext.audioWorklet.addModule(
      this.config.workletUrl.toString(),
    );

    const ringHandles = AudioRing.allocate(RING_CAPACITY);
    this.workletNode = new AudioWorkletNode(this.audioContext, "audio-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { ring: ringHandles },
    });

    this.sourceNode = this.audioContext.createMediaStreamSource(
      this.mediaStream,
    );
    this.sourceNode.connect(this.workletNode);

    // 4. Worker. Wait for "ready" before considering start() complete.
    this.worker = new Worker(this.config.workerUrl, { type: "module" });

    const readyPromise = new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerToMain>) => {
        const msg = event.data;
        if (msg.type === "ready") {
          this.worker?.removeEventListener("message", onMessage);
          resolve();
        } else if (msg.type === "error") {
          this.worker?.removeEventListener("message", onMessage);
          reject(new Error(`InferenceWorker failed: ${msg.message}`));
        }
      };
      this.worker!.addEventListener("message", onMessage);
    });

    const initMessage: MainToWorker = {
      type: "init",
      ring: ringHandles,
      sampleRate: SAMPLE_RATE,
      hopMs: this.config.hopMs,
      modelUrl: this.config.modelUrl,
      onsetThreshold: this.config.onsetThreshold,
      frameThreshold: this.config.frameThreshold,
      minNoteLengthFrames: this.config.minNoteLengthFrames,
      windowSamples: WINDOW_SAMPLES,
      dedupWindowSamples: msToSamples(this.config.dedupWindowMs),
      noteOffTimeoutSamples: msToSamples(this.config.noteOffTimeoutMs),
    };
    this.worker.postMessage(initMessage);

    // 5. Stream worker events into the pending input buffer. The
    // ready/error handler above already removed itself; this listener
    // handles per-event traffic going forward.
    this.worker.addEventListener("message", (event) =>
      this.onWorkerEvent(event.data),
    );

    await readyPromise;

    // 6. Capture audio origin: the session-relative ms corresponding
    // to sample 0. Approximate — there's some drift between
    // performance.now() and the actual moment audio begins flowing,
    // but it's small (a few ms) and constant for the session.
    this.audioOriginSessionMs = performance.now() - this.config.sessionStart;
  }

  /**
   * Tear down the audio pipeline.
   */
  async stop(): Promise<void> {
    this.worker?.postMessage({ type: "stop" } satisfies MainToWorker);
    this.worker?.terminate();
    this.worker = null;

    if (this.workletNode) {
      // Worklet drains on the next process() call after seeing "stop".
      this.workletNode.port.postMessage({ type: "stop" });
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    this.sourceNode?.disconnect();
    this.sourceNode = null;

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) track.stop();
      this.mediaStream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  nextFrame(): RawInputFrame | null {
    if (this.pendingInputs.length === 0) return null;
    const frame: RawInputFrame = {
      t: this.lastInputTime,
      source: this.source,
      stream: this.stream,
      inputs: this.pendingInputs,
    };
    this.pendingInputs = [];
    return frame;
  }

  private onWorkerEvent(event: WorkerToMain): void {
    switch (event.type) {
      case "ready":
      case "error":
        return; // handled by start()
      case "audio_note_on": {
        const t = this.sampleIndexToMs(event.sampleIndex);
        this.lastInputTime = t;
        this.pendingInputs.push({
          type: "audio_note_on",
          t,
          noteId: event.noteId,
          pitch: event.pitch,
          velocity: event.velocity,
          confidence: event.confidence,
        });
        return;
      }
      case "audio_note_off": {
        const t = this.sampleIndexToMs(event.sampleIndex);
        this.lastInputTime = t;
        this.pendingInputs.push({
          type: "audio_note_off",
          t,
          noteId: event.noteId,
          confidence: event.confidence,
        });
        return;
      }
      case "audio_pitch_bend": {
        const t = this.sampleIndexToMs(event.sampleIndex);
        this.lastInputTime = t;
        this.pendingInputs.push({
          type: "audio_pitch_bend",
          t,
          noteId: event.noteId,
          semitones: event.semitones,
          confidence: event.confidence,
        });
        return;
      }
    }
  }

  private sampleIndexToMs(sampleIndex: number): Ms {
    return this.audioOriginSessionMs + (sampleIndex * 1000) / SAMPLE_RATE;
  }
}

function msToSamples(ms: number): number {
  return Math.round((ms / 1000) * SAMPLE_RATE);
}
