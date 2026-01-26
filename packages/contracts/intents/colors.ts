import type { PitchClass, Velocity } from "../primitives/primitives";

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

// ============================================================================
// Visual Vocabulary Helper Functions (SPEC_010)
// ============================================================================

/**
 * Configuration for octave-to-brightness mapping.
 * See SPEC_010 for details.
 */
export interface OctaveBrightnessConfig {
  /** Minimum brightness (default: 0.3) */
  minBrightness?: number;
  /** Maximum brightness (default: 0.95) */
  maxBrightness?: number;
  /** Lowest octave in range (default: 1) */
  minOctave?: number;
  /** Highest octave in range (default: 8) */
  maxOctave?: number;
}

const DEFAULT_OCTAVE_CONFIG: Required<OctaveBrightnessConfig> = {
  minBrightness: 0.3,
  maxBrightness: 0.95,
  minOctave: 1,
  maxOctave: 8,
};

/**
 * Maps octave to brightness (HSV V component).
 * Lower octaves are darker, higher octaves are brighter.
 *
 * Invariant I15: Octave to brightness is mandatory.
 *
 * @param octave - The octave number (typically 0-9)
 * @param config - Optional configuration for brightness range
 * @returns Brightness value in range [minBrightness, maxBrightness]
 */
export function octaveToBrightness(
  octave: number,
  config?: OctaveBrightnessConfig
): number {
  const cfg = { ...DEFAULT_OCTAVE_CONFIG, ...config };
  const normalized =
    (octave - cfg.minOctave) / (cfg.maxOctave - cfg.minOctave);
  const clamped = Math.max(0, Math.min(1, normalized));
  return cfg.minBrightness + clamped * (cfg.maxBrightness - cfg.minBrightness);
}

/**
 * Configuration for velocity-to-size mapping.
 * See SPEC_010 for details.
 */
export interface VelocitySizeConfig {
  /** Size multiplier at velocity 0 (default: 0.5) */
  minMultiplier?: number;
  /** Size multiplier at velocity 127 (default: 2.0) */
  maxMultiplier?: number;
}

const DEFAULT_VELOCITY_SIZE_CONFIG: Required<VelocitySizeConfig> = {
  minMultiplier: 0.5,
  maxMultiplier: 2.0,
};

/**
 * Maps velocity to a size multiplier.
 * Louder notes (higher velocity) produce larger multipliers.
 *
 * Invariant I16: Velocity affects visual prominence.
 *
 * @param velocity - MIDI velocity (0-127)
 * @param config - Optional configuration for multiplier range
 * @returns Size multiplier in range [minMultiplier, maxMultiplier]
 */
export function velocityToSizeMultiplier(
  velocity: Velocity,
  config?: VelocitySizeConfig
): number {
  const cfg = { ...DEFAULT_VELOCITY_SIZE_CONFIG, ...config };
  const normalized = velocity / 127;
  return cfg.minMultiplier + normalized * (cfg.maxMultiplier - cfg.minMultiplier);
}

/**
 * Configuration for velocity-to-attack mapping.
 * See SPEC_010 for details.
 */
export interface VelocityAttackConfig {
  /** Attack duration at velocity 127 (default: 0ms - instant) */
  minAttackMs?: number;
  /** Attack duration at velocity 0 (default: 50ms - fade in) */
  maxAttackMs?: number;
}

const DEFAULT_VELOCITY_ATTACK_CONFIG: Required<VelocityAttackConfig> = {
  minAttackMs: 0,
  maxAttackMs: 50,
};

/**
 * Maps velocity to attack duration in milliseconds.
 * Higher velocity = shorter attack (sharper onset).
 * Lower velocity = longer attack (fade in).
 *
 * Invariant I16: Velocity affects visual prominence.
 *
 * @param velocity - MIDI velocity (0-127)
 * @param config - Optional configuration for attack range
 * @returns Attack duration in milliseconds
 */
export function velocityToAttackMs(
  velocity: Velocity,
  config?: VelocityAttackConfig
): number {
  const cfg = { ...DEFAULT_VELOCITY_ATTACK_CONFIG, ...config };
  const normalized = velocity / 127;
  // Inverse relationship: higher velocity = shorter attack
  return cfg.maxAttackMs - normalized * (cfg.maxAttackMs - cfg.minAttackMs);
}

// ============================================================================
// Chord Shape Constants (SPEC 010)
// ============================================================================

/**
 * Radius multipliers per tier (golden ratio based).
 * Invariant I18: Chord quality determines shape geometry.
 *
 * - Triadic tones (root, 3rd, 5th) are most prominent
 * - Seventh is subordinate but visible
 * - Extensions (9th, 11th, 13th) are smallest
 */
export const RADIUS_BY_TIER = {
  triadic: 1.0,
  seventh: 0.618,
  extension: 0.382,
} as const;

/**
 * Angular position (degrees) for each interval.
 * Root is at 0° (12 o'clock), each semitone is 30°.
 * Invariant I18: Chord quality determines shape geometry.
 */
export const INTERVAL_ANGLES: Record<number, number> = {
  0: 0, // Root (1)
  1: 30, // ♭2/♭9
  2: 60, // 2/9
  3: 90, // ♭3
  4: 120, // 3
  5: 150, // 4/11
  6: 180, // ♯4/♭5
  7: 210, // 5
  8: 240, // ♯5/♭6
  9: 270, // 6/13
  10: 300, // ♭7
  11: 330, // 7
} as const;

/**
 * Human-readable interval labels for each semitone offset.
 * Used for debugging/display in ChordShapeElement.interval.
 */
export const INTERVAL_LABELS: Record<number, string> = {
  0: "1",
  1: "♭2",
  2: "2",
  3: "♭3",
  4: "3",
  5: "4",
  6: "♭5",
  7: "5",
  8: "♯5",
  9: "6",
  10: "♭7",
  11: "7",
} as const;
