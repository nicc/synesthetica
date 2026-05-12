/**
 * AudioRing — lock-free single-producer / single-consumer ring buffer
 * backed by a SharedArrayBuffer (SPEC 012).
 *
 * The producer (AudioWorkletProcessor on the audio thread) writes
 * incoming Float32 PCM samples; the consumer (Inference Worker)
 * reads them. Head/tail indices live in a small Uint32Array also
 * inside the SAB, accessed with Atomics so updates are visible across
 * threads without locks.
 *
 * Invariants:
 *   - Exactly one producer writes via `write()`. Exactly one consumer
 *     reads via `read()` or `peekLatest()`. Concurrent writers or
 *     concurrent readers are unsupported and will corrupt indices.
 *   - `head` advances when the producer writes; `tail` advances when
 *     the consumer reads. Distance head − tail (mod capacity) is the
 *     number of samples currently available to the consumer.
 *   - When the producer writes faster than the consumer reads, the
 *     ring will overflow. We do NOT block — we drop the oldest
 *     samples (advance tail past them). Audio acquisition is the
 *     authoritative time source; we'd rather drop history than block
 *     the audio thread.
 *
 * `capacity` is the number of Float32 sample slots. Must be a power
 * of two so wrap-around is a cheap bitwise AND.
 */

const HEAD_INDEX = 0;
const TAIL_INDEX = 1;
const META_COUNT = 2; // number of Uint32 slots (head, tail)

export interface AudioRingHandles {
  /** SharedArrayBuffer holding samples and head/tail indices. */
  sab: SharedArrayBuffer;
  /** Capacity in Float32 sample slots. */
  capacity: number;
}

export class AudioRing {
  private readonly capacity: number;
  private readonly mask: number;
  private readonly samples: Float32Array;
  private readonly meta: Uint32Array;

  /**
   * Allocate a new SAB-backed ring. capacity must be a power of two
   * to allow cheap bitwise wrap. capacity is in samples, not bytes.
   */
  static allocate(capacity: number): AudioRingHandles {
    if (capacity <= 0 || (capacity & (capacity - 1)) !== 0) {
      throw new Error(`AudioRing capacity must be a power of two, got ${capacity}`);
    }
    const samplesBytes = capacity * Float32Array.BYTES_PER_ELEMENT;
    const metaBytes = META_COUNT * Uint32Array.BYTES_PER_ELEMENT;
    const sab = new SharedArrayBuffer(samplesBytes + metaBytes);
    return { sab, capacity };
  }

  /**
   * Attach to an existing ring. The producer and consumer each call
   * this with the same handles to get their own view.
   */
  constructor(handles: AudioRingHandles) {
    if ((handles.capacity & (handles.capacity - 1)) !== 0) {
      throw new Error(`AudioRing capacity must be a power of two`);
    }
    this.capacity = handles.capacity;
    this.mask = handles.capacity - 1;
    this.samples = new Float32Array(handles.sab, 0, handles.capacity);
    const metaByteOffset = handles.capacity * Float32Array.BYTES_PER_ELEMENT;
    this.meta = new Uint32Array(handles.sab, metaByteOffset, META_COUNT);
  }

  /** Number of samples currently available to read. */
  available(): number {
    const head = Atomics.load(this.meta, HEAD_INDEX);
    const tail = Atomics.load(this.meta, TAIL_INDEX);
    // head and tail are monotonically increasing (mod 2^32). Using
    // subtraction with Uint32 semantics gives the wrap-aware delta.
    return (head - tail) >>> 0;
  }

  /** Capacity in samples. */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Write samples from src into the ring. Producer side.
   *
   * If `src.length > capacity - available()`, the older samples are
   * overwritten and the tail is advanced past them. The consumer
   * sees this as the ring having "lost" some history — preferable to
   * blocking the audio thread.
   *
   * Returns the number of samples that overflowed (i.e. were
   * effectively dropped from the consumer's view). Zero in the
   * common case.
   */
  write(src: Float32Array): number {
    if (src.length === 0) return 0;
    if (src.length > this.capacity) {
      // Too big to ever fit. Copy only the last `capacity` samples.
      // This is a programming error in practice, but defensive.
      src = src.subarray(src.length - this.capacity);
    }

    const head = Atomics.load(this.meta, HEAD_INDEX);
    const tail = Atomics.load(this.meta, TAIL_INDEX);

    // Copy src into samples[head & mask ..], wrapping if necessary.
    const startIdx = head & this.mask;
    const firstChunkLen = Math.min(src.length, this.capacity - startIdx);
    this.samples.set(src.subarray(0, firstChunkLen), startIdx);
    if (firstChunkLen < src.length) {
      this.samples.set(src.subarray(firstChunkLen), 0);
    }

    // Advance head atomically. Uint32 wrap-around is intentional.
    const newHead = (head + src.length) >>> 0;
    Atomics.store(this.meta, HEAD_INDEX, newHead);

    // Did we overwrite samples the consumer hasn't read yet?
    const occupancy = (newHead - tail) >>> 0;
    let overflowed = 0;
    if (occupancy > this.capacity) {
      overflowed = occupancy - this.capacity;
      const newTail = (tail + overflowed) >>> 0;
      Atomics.store(this.meta, TAIL_INDEX, newTail);
    }
    return overflowed;
  }

  /**
   * Read up to `dst.length` samples into dst. Consumer side.
   *
   * Returns the number of samples actually copied (0 .. dst.length).
   * Advances the tail by that many samples.
   */
  read(dst: Float32Array): number {
    if (dst.length === 0) return 0;
    const head = Atomics.load(this.meta, HEAD_INDEX);
    const tail = Atomics.load(this.meta, TAIL_INDEX);
    const avail = (head - tail) >>> 0;
    const n = Math.min(avail, dst.length);
    if (n === 0) return 0;

    const startIdx = tail & this.mask;
    const firstChunkLen = Math.min(n, this.capacity - startIdx);
    dst.set(this.samples.subarray(startIdx, startIdx + firstChunkLen), 0);
    if (firstChunkLen < n) {
      dst.set(this.samples.subarray(0, n - firstChunkLen), firstChunkLen);
    }

    const newTail = (tail + n) >>> 0;
    Atomics.store(this.meta, TAIL_INDEX, newTail);
    return n;
  }

  /**
   * Copy the latest `dst.length` samples into dst WITHOUT advancing
   * the tail. Used by the inference worker: it wants the most recent
   * 2 seconds of audio but does not want to consume it (overlapping
   * windows reuse much of the same audio across consecutive
   * inferences).
   *
   * Returns the number of samples actually copied. If `dst.length`
   * exceeds the available samples, only the available ones are
   * copied — but in practice the consumer should only call this when
   * `available() >= dst.length`.
   *
   * The tail is NOT advanced. The consumer is responsible for
   * advancing the tail (via `advanceTail`) when it decides those
   * samples will not be needed again.
   */
  peekLatest(dst: Float32Array): number {
    if (dst.length === 0) return 0;
    const head = Atomics.load(this.meta, HEAD_INDEX);
    const tail = Atomics.load(this.meta, TAIL_INDEX);
    const avail = (head - tail) >>> 0;
    const n = Math.min(avail, dst.length);
    if (n === 0) return 0;

    // Latest n samples sit immediately before head.
    const startGlobal = (head - n) >>> 0;
    const startIdx = startGlobal & this.mask;
    const firstChunkLen = Math.min(n, this.capacity - startIdx);
    dst.set(this.samples.subarray(startIdx, startIdx + firstChunkLen), 0);
    if (firstChunkLen < n) {
      dst.set(this.samples.subarray(0, n - firstChunkLen), firstChunkLen);
    }
    return n;
  }

  /**
   * Advance the tail by `n` samples (discarding them from the
   * consumer's view). Used after `peekLatest` to release samples the
   * consumer is no longer interested in.
   *
   * Will clamp at the head — never advances past the producer.
   */
  advanceTail(n: number): void {
    if (n <= 0) return;
    const head = Atomics.load(this.meta, HEAD_INDEX);
    const tail = Atomics.load(this.meta, TAIL_INDEX);
    const avail = (head - tail) >>> 0;
    const advance = Math.min(n, avail);
    const newTail = (tail + advance) >>> 0;
    Atomics.store(this.meta, TAIL_INDEX, newTail);
  }
}
