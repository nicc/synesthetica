/**
 * Downmix N stereo (or N-channel) buffers into a mono Float32Array.
 *
 * Lives in its own module so it can be unit-tested without an
 * AudioWorklet context. The audio worklet uses this to flatten
 * its `input[0]` (an array of Float32Arrays — one per channel)
 * into the single-channel signal the inference pipeline expects.
 *
 * `out` must already exist with length === channels[0].length.
 * The function writes into `out` in-place. No allocations.
 */
export function downmixInPlace(
  channels: readonly Float32Array[],
  out: Float32Array,
): void {
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
    for (let c = 0; c < nChannels; c++) {
      sum += channels[c][i];
    }
    out[i] = sum * inv;
  }
}
