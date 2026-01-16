import type { PitchClass } from "../cms/music";

export interface ColorHSVA {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
  a?: number; // 0..1
}

/**
 * Configuration for the pitch-class to hue mapping invariant.
 * See SPEC_002 for details.
 */
export interface PitchHueInvariant {
  referencePc: PitchClass;  // default: 9 (A)
  referenceHue: number;     // default: 0 (red)
  direction?: "cw" | "ccw"; // default: "cw" (clockwise)
}

/**
 * Maps a pitch-class to a hue value based on the invariant configuration.
 * Each semitone = 30° hue rotation around the color wheel.
 *
 * Default mapping (A=red, clockwise):
 *   A=0°, A#=30°, B=60°, C=90°, C#=120°, D=150°,
 *   D#=180°, E=210°, F=240°, F#=270°, G=300°, G#=330°
 */
export function pcToHue(pc: PitchClass, inv: PitchHueInvariant): number {
  const dir = inv.direction === "ccw" ? -1 : 1;
  const steps = (pc - inv.referencePc + 12) % 12;
  return (inv.referenceHue + dir * steps * 30 + 360) % 360;
}
