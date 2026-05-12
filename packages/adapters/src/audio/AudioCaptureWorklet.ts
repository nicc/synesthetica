/**
 * AudioCaptureWorklet — runs on the audio thread (SPEC 012).
 *
 * Responsibilities:
 *   1. Receive per-quantum audio from the AudioContext (typically
 *      128 samples per process() call at the context's sample rate).
 *   2. Downmix to mono.
 *   3. Write mono samples into the shared AudioRing.
 *
 * The AudioContext is configured at 22050 Hz on the main thread, so
 * the worklet does NOT need to resample. The browser handles
 * sample-rate conversion when audio flows from MediaStreamSource
 * (native device rate) through the graph to this worklet at 22050.
 *
 * Audio-thread constraints:
 *   - No allocations after the constructor.
 *   - No synchronous postMessage in the hot path (we send a single
 *     terminal "stopped" message on shutdown).
 *   - All state is in pre-allocated typed arrays.
 *
 * The processor is registered as "audio-capture". The main thread
 * instantiates the matching AudioWorkletNode and passes:
 *   processorOptions: { ring: { sab, capacity } }
 */

import { AudioRing, type AudioRingHandles } from "./AudioRing";
import { downmixInPlace } from "./downmix";

interface AudioCaptureProcessorOptions {
  ring: AudioRingHandles;
}

// AudioWorkletProcessor is provided by the worklet global scope and
// isn't part of the standard `tsc --target es2020` lib. Declare a
// minimal shape so this module compiles in the same project as the
// rest of the adapter.
declare const AudioWorkletProcessor: {
  new (options?: { processorOptions?: unknown }): AudioWorkletProcessorBase;
};
interface AudioWorkletProcessorBase {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: new (options?: { processorOptions?: unknown }) => AudioWorkletProcessorBase,
): void;

class AudioCaptureProcessor
  extends AudioWorkletProcessor
  implements AudioWorkletProcessorBase
{
  private ring: AudioRing;
  /** Reusable mono buffer; sized to the worklet's render quantum (128). */
  private monoBuffer: Float32Array;
  /** Set to true on stop message; final process() then returns false. */
  private stopped = false;

  constructor(options?: { processorOptions?: unknown }) {
    super(options);
    const opts = (options?.processorOptions ?? {}) as Partial<AudioCaptureProcessorOptions>;
    if (!opts.ring) {
      throw new Error("AudioCaptureProcessor: processorOptions.ring is required");
    }
    this.ring = new AudioRing(opts.ring);
    // 128 is the standard render quantum. We size for it; if the
    // browser ever changes it, the buffer is resized lazily in
    // process(). (Allocations inside process() are not strictly
    // forbidden — they're discouraged. A one-time resize on first
    // call is acceptable.)
    this.monoBuffer = new Float32Array(128);

    this.port.onmessage = (event: MessageEvent) => {
      if (event.data?.type === "stop") {
        this.stopped = true;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    if (this.stopped) return false;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel0 = input[0];
    if (!channel0 || channel0.length === 0) return true;
    if (this.monoBuffer.length !== channel0.length) {
      this.monoBuffer = new Float32Array(channel0.length);
    }
    downmixInPlace(input, this.monoBuffer);
    this.ring.write(this.monoBuffer);
    return true;
  }
}

registerProcessor("audio-capture", AudioCaptureProcessor);
