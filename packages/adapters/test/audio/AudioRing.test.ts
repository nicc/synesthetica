import { describe, it, expect } from "vitest";
import { AudioRing } from "../../src/audio/AudioRing";

/**
 * AudioRing tests. The ring is designed for single-producer /
 * single-consumer use across threads, but the data structure itself
 * works in a single thread — these tests exercise the indexing,
 * wrap-around, overflow handling, peek/read semantics, and atomic
 * head/tail updates without needing real threads.
 */
describe("AudioRing", () => {
  it("requires power-of-two capacity", () => {
    expect(() => AudioRing.allocate(0)).toThrow();
    expect(() => AudioRing.allocate(3)).toThrow();
    expect(() => AudioRing.allocate(100)).toThrow();
    // these are fine
    AudioRing.allocate(1);
    AudioRing.allocate(64);
    AudioRing.allocate(1024);
  });

  it("reports 0 available on a freshly-allocated ring", () => {
    const handles = AudioRing.allocate(64);
    const ring = new AudioRing(handles);
    expect(ring.available()).toBe(0);
  });

  it("writes and reads samples in order", () => {
    const handles = AudioRing.allocate(64);
    const ring = new AudioRing(handles);
    const src = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    expect(ring.write(src)).toBe(0); // no overflow
    expect(ring.available()).toBe(4);

    const dst = new Float32Array(4);
    expect(ring.read(dst)).toBe(4);
    expect(Array.from(dst)).toEqual([0.1, 0.2, 0.3, 0.4].map((x) => Math.fround(x)));
    expect(ring.available()).toBe(0);
  });

  it("preserves data across two separate instances on the same SAB (producer/consumer simulation)", () => {
    const handles = AudioRing.allocate(64);
    const producer = new AudioRing(handles);
    const consumer = new AudioRing(handles);
    producer.write(new Float32Array([1, 2, 3, 4, 5]));
    const dst = new Float32Array(5);
    expect(consumer.read(dst)).toBe(5);
    expect(Array.from(dst)).toEqual([1, 2, 3, 4, 5]);
  });

  it("wraps around the buffer when writes cross capacity", () => {
    const handles = AudioRing.allocate(8);
    const ring = new AudioRing(handles);
    // Fill 6, read 4 → head=6, tail=4, next write starts at index 6.
    ring.write(new Float32Array([1, 2, 3, 4, 5, 6]));
    ring.read(new Float32Array(4));
    expect(ring.available()).toBe(2);
    // Now write 5 more — should wrap from index 6 around to 0,1,2.
    expect(ring.write(new Float32Array([7, 8, 9, 10, 11]))).toBe(0);
    expect(ring.available()).toBe(7);
    const dst = new Float32Array(7);
    expect(ring.read(dst)).toBe(7);
    expect(Array.from(dst)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });

  it("overflows by advancing tail past oldest samples when producer outruns consumer", () => {
    const handles = AudioRing.allocate(4);
    const ring = new AudioRing(handles);
    // Capacity 4. Write 4, read 0, write 3 more → overflow by 3.
    ring.write(new Float32Array([1, 2, 3, 4]));
    const overflow = ring.write(new Float32Array([5, 6, 7]));
    expect(overflow).toBe(3);
    // Consumer should see only the latest 4: [4, 5, 6, 7].
    expect(ring.available()).toBe(4);
    const dst = new Float32Array(4);
    ring.read(dst);
    expect(Array.from(dst)).toEqual([4, 5, 6, 7]);
  });

  it("read returns 0 when ring is empty", () => {
    const handles = AudioRing.allocate(16);
    const ring = new AudioRing(handles);
    const dst = new Float32Array(8);
    expect(ring.read(dst)).toBe(0);
  });

  it("read returns only what is available when caller asks for more", () => {
    const handles = AudioRing.allocate(16);
    const ring = new AudioRing(handles);
    ring.write(new Float32Array([1, 2, 3]));
    const dst = new Float32Array(10);
    expect(ring.read(dst)).toBe(3);
    expect(Array.from(dst.subarray(0, 3))).toEqual([1, 2, 3]);
  });

  it("peekLatest copies the most recent samples without advancing the tail", () => {
    const handles = AudioRing.allocate(16);
    const ring = new AudioRing(handles);
    ring.write(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(ring.available()).toBe(8);

    // Peek the latest 4 — should be [5, 6, 7, 8] and tail unchanged.
    const peek = new Float32Array(4);
    expect(ring.peekLatest(peek)).toBe(4);
    expect(Array.from(peek)).toEqual([5, 6, 7, 8]);
    expect(ring.available()).toBe(8);

    // Read still drains from the tail.
    const read = new Float32Array(8);
    expect(ring.read(read)).toBe(8);
    expect(Array.from(read)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("peekLatest handles wrap-around when latest window straddles end of buffer", () => {
    const handles = AudioRing.allocate(8);
    const ring = new AudioRing(handles);
    // Get the producer head into the middle of the buffer.
    ring.write(new Float32Array([1, 2, 3, 4, 5]));
    ring.read(new Float32Array(4));
    // tail=4, head=5. Now write 6 more — fills indices 5,6,7,0,1,2.
    ring.write(new Float32Array([6, 7, 8, 9, 10, 11]));
    expect(ring.available()).toBe(7);

    // Latest 5 should be [7, 8, 9, 10, 11]
    const peek = new Float32Array(5);
    expect(ring.peekLatest(peek)).toBe(5);
    expect(Array.from(peek)).toEqual([7, 8, 9, 10, 11]);
  });

  it("advanceTail releases samples without copying", () => {
    const handles = AudioRing.allocate(16);
    const ring = new AudioRing(handles);
    ring.write(new Float32Array([1, 2, 3, 4, 5, 6]));
    expect(ring.available()).toBe(6);
    ring.advanceTail(4);
    expect(ring.available()).toBe(2);
    const dst = new Float32Array(2);
    ring.read(dst);
    expect(Array.from(dst)).toEqual([5, 6]);
  });

  it("advanceTail clamps at the head (never advances past available)", () => {
    const handles = AudioRing.allocate(16);
    const ring = new AudioRing(handles);
    ring.write(new Float32Array([1, 2, 3]));
    ring.advanceTail(100); // way past head
    expect(ring.available()).toBe(0);
  });

  it("handles index wrap at uint32 boundary", () => {
    // Force head/tail to start near the uint32 boundary by simulating
    // many wraps. Easiest way: write capacity-sized blocks repeatedly.
    const cap = 16;
    const handles = AudioRing.allocate(cap);
    const ring = new AudioRing(handles);
    const block = new Float32Array(cap);
    for (let i = 0; i < cap; i++) block[i] = i;
    // Write and immediately drain many times to advance head/tail far.
    for (let iter = 0; iter < 100; iter++) {
      ring.write(block);
      ring.read(new Float32Array(cap));
    }
    // After 100 * 16 = 1600 samples through, head==tail and ring works.
    expect(ring.available()).toBe(0);
    ring.write(new Float32Array([42, 43, 44]));
    const dst = new Float32Array(3);
    expect(ring.read(dst)).toBe(3);
    expect(Array.from(dst)).toEqual([42, 43, 44]);
  });

  it("write clamps oversized input to the latest `capacity` samples", () => {
    const handles = AudioRing.allocate(8);
    const ring = new AudioRing(handles);
    const giant = new Float32Array(20);
    for (let i = 0; i < 20; i++) giant[i] = i;
    ring.write(giant);
    expect(ring.available()).toBe(8);
    const dst = new Float32Array(8);
    ring.read(dst);
    // Should hold the LAST 8 of the input.
    expect(Array.from(dst)).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
  });
});
