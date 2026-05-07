/**
 * Shared time → screen-Y mapping used by grammars that scroll along
 * the rhythm timeline. Keeping this in one place means the rhythm
 * grammar's note strips and the harmony grammar's scrolling Roman
 * numerals stay phase-locked to the same now-line and horizon.
 */

/** NOW line vertical position (0 = top, 1 = bottom). 0.85 = 15% from bottom. */
export const NOW_LINE_Y = 0.85;

/** Time range (ms) that maps to the visible past area above NOW. */
export const TIME_HORIZON_HISTORY_MS = 8000;

/** Time range (ms) that maps to the visible future area below NOW. */
export const TIME_HORIZON_FUTURE_MS = 2000;

/**
 * Map an event timestamp to a normalized Y coordinate.
 * NOW is at NOW_LINE_Y; past (age > 0) is above; future (age < 0) below.
 * Values < 0 or > 1 indicate the event has scrolled off screen.
 *
 * Past and future use different rates: past covers TIME_HORIZON_HISTORY_MS
 * over NOW_LINE_Y of screen, future covers TIME_HORIZON_FUTURE_MS over
 * the remaining 1 - NOW_LINE_Y. So future events scroll more slowly
 * per millisecond below NOW than past events do above. Used for note
 * strips, where the slower future zone reads as a "preview" build-up.
 */
export function timeToY(eventTime: number, now: number): number {
  const age = now - eventTime;
  if (age >= 0) {
    const normalizedAge = age / TIME_HORIZON_HISTORY_MS;
    return NOW_LINE_Y - normalizedAge * NOW_LINE_Y;
  }
  const normalizedFuture = Math.min(-age / TIME_HORIZON_FUTURE_MS, 1);
  return NOW_LINE_Y + normalizedFuture * (1 - NOW_LINE_Y);
}

/**
 * Map an event timestamp to a normalized Y coordinate using a single
 * uniform scroll rate (the past rate) for both past and future. Future
 * events scroll at the same speed as past events, which means they sit
 * lower on screen earlier — the visible future window is correspondingly
 * shorter. Used for grid lines (beats and bars) where consistent
 * scrolling reads as a metronomic timeline rather than a tempo-changing
 * one.
 */
export function timeToYUniform(eventTime: number, now: number): number {
  const age = now - eventTime;
  return NOW_LINE_Y - (age / TIME_HORIZON_HISTORY_MS) * NOW_LINE_Y;
}
