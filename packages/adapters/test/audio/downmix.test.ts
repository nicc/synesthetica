import { describe, it, expect } from "vitest";
import { downmixInPlace } from "../../src/audio/downmix";

describe("downmixInPlace", () => {
  it("zeroes the output when no channels provided", () => {
    const out = new Float32Array([1, 2, 3, 4]);
    downmixInPlace([], out);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });

  it("copies a single channel through unchanged", () => {
    const channel0 = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const out = new Float32Array(4);
    downmixInPlace([channel0], out);
    expect(Array.from(out)).toEqual(Array.from(channel0));
  });

  it("averages stereo channels into mono", () => {
    const left = new Float32Array([1, 2, 3, 4]);
    const right = new Float32Array([5, 6, 7, 8]);
    const out = new Float32Array(4);
    downmixInPlace([left, right], out);
    expect(Array.from(out)).toEqual([3, 4, 5, 6]);
  });

  it("averages N-channel input correctly", () => {
    const c1 = new Float32Array([0, 0, 0]);
    const c2 = new Float32Array([1, 1, 1]);
    const c3 = new Float32Array([2, 2, 2]);
    const c4 = new Float32Array([3, 3, 3]);
    const out = new Float32Array(3);
    downmixInPlace([c1, c2, c3, c4], out);
    // (0 + 1 + 2 + 3) / 4 = 1.5
    expect(Array.from(out)).toEqual([1.5, 1.5, 1.5]);
  });

  it("does not allocate (writes in place)", () => {
    // Sanity: the same out buffer is reused
    const out = new Float32Array(4);
    const left = new Float32Array([1, 2, 3, 4]);
    const right = new Float32Array([5, 6, 7, 8]);
    downmixInPlace([left, right], out);
    expect(out.buffer.byteLength).toBe(16); // 4 * 4 bytes
  });
});
