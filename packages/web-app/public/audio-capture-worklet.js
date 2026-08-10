/**
 * Audio capture worklet — vanilla ES module, no imports.
 *
 * Vite's `?worker&url` suffix bundles ES modules for Web Workers,
 * but AudioWorkletGlobalScope has a subtly different loading
 * contract; the emitted worker chunk doesn't reliably call
 * registerProcessor. This file is the fallback: hand-written vanilla
 * JS in public/ that Vite serves as-is, loaded via
 * `audioContext.audioWorklet.addModule('/audio-capture-worklet.js')`.
 *
 * The code is a minimal transliteration of two adapter-package files:
 *   - AudioRing (writer side only — worklet only writes samples)
 *   - AudioCaptureProcessor + downmix
 *
 * If either of those changes in the adapter package, update this
 * file to match. Not ideal, but the alternative (getting Vite to
 * bundle a proper audio-worklet module with dependency resolution)
 * is a much bigger undertaking.
 */

// ============================================================================
// AudioRing (writer subset — see packages/adapters/src/audio/AudioRing.ts)
// ============================================================================

const HEAD_INDEX = 0;
const TAIL_INDEX = 1;
const META_COUNT = 2;

class AudioRing {
  constructor(handles) {
    const cap = handles.capacity;
    this.capacity = cap;
    this.mask = cap - 1;
    this.samples = new Float32Array(handles.sab, 0, cap);
    const metaByteOffset = cap * Float32Array.BYTES_PER_ELEMENT;
    this.meta = new Uint32Array(handles.sab, metaByteOffset, META_COUNT);
  }

  write(src) {
    if (src.length === 0) return 0;
    if (src.length > this.capacity) {
      src = src.subarray(src.length - this.capacity);
    }
    const head = Atomics.load(this.meta, HEAD_INDEX);
    const tail = Atomics.load(this.meta, TAIL_INDEX);
    const startIdx = head & this.mask;
    const firstChunkLen = Math.min(src.length, this.capacity - startIdx);
    this.samples.set(src.subarray(0, firstChunkLen), startIdx);
    if (firstChunkLen < src.length) {
      this.samples.set(src.subarray(firstChunkLen), 0);
    }
    const newHead = (head + src.length) >>> 0;
    Atomics.store(this.meta, HEAD_INDEX, newHead);
    const occupancy = (newHead - tail) >>> 0;
    let overflowed = 0;
    if (occupancy > this.capacity) {
      overflowed = occupancy - this.capacity;
      const newTail = (tail + overflowed) >>> 0;
      Atomics.store(this.meta, TAIL_INDEX, newTail);
    }
    return overflowed;
  }
}

// ============================================================================
// Downmix (see packages/adapters/src/audio/downmix.ts)
// ============================================================================

function downmixInPlace(channels, out) {
  const nChannels = channels.length;
  if (nChannels === 0) {
    out.fill(0);
    return;
  }
  const n = out.length;
  if (nChannels === 1) {
    out.set(channels[0]);
    return;
  }
  const inv = 1 / nChannels;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let c = 0; c < nChannels; c++) sum += channels[c][i];
    out[i] = sum * inv;
  }
}

// ============================================================================
// AudioCaptureProcessor (see packages/adapters/src/audio/AudioCaptureWorklet.ts)
// ============================================================================

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    const opts = options?.processorOptions ?? {};
    if (!opts.ring) {
      throw new Error(
        "AudioCaptureProcessor: processorOptions.ring is required",
      );
    }
    this.ring = new AudioRing(opts.ring);
    this.monoBuffer = new Float32Array(128);
    this.stopped = false;

    this.port.onmessage = (event) => {
      if (event.data?.type === "stop") {
        this.stopped = true;
      }
    };
  }

  process(inputs) {
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
