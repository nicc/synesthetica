/**
 * Musical Visual Ruleset
 *
 * Maps MusicalFrame (musical abstractions) to VisualIntentFrame.
 * Implements IVisualRuleset interface from RFC 005.
 *
 * This is a proper ruleset that:
 * - Receives musical abstractions (notes with duration/phase, chords)
 * - Emits visual intents with IDs for grammar correlation
 * - Uses note phase to influence visual parameters (stability)
 */

import type {
  IVisualRuleset,
  MusicalFrame,
  VisualIntentFrame,
  VisualIntent,
  PaletteIntent,
  MotionIntent,
  PitchClass,
  Note,
} from "@synesthetica/contracts";

import { pcToHue } from "@synesthetica/contracts";

/**
 * Configuration for the MusicalVisualRuleset.
 */
export interface MusicalVisualRulesetConfig {
  /**
   * Reference pitch class for hue mapping.
   * @default 9 (A)
   */
  referencePc?: PitchClass;

  /**
   * Reference hue for the reference pitch class.
   * @default 0 (red)
   */
  referenceHue?: number;

  /**
   * Direction of hue rotation.
   * @default "cw"
   */
  hueDirection?: "cw" | "ccw";
}

const DEFAULT_CONFIG: Required<MusicalVisualRulesetConfig> = {
  referencePc: 9, // A
  referenceHue: 0, // Red
  hueDirection: "cw",
};

/**
 * MusicalVisualRuleset: Maps musical state to visual intents.
 *
 * Key mappings:
 * - Pitch class → Hue (via pcToHue invariant)
 * - Velocity → Brightness
 * - Note phase → Stability (attack=dynamic, sustain=stable, release=fading)
 * - Dynamics level → Motion pulse
 */
export class MusicalVisualRuleset implements IVisualRuleset {
  readonly id = "musical-visual";

  private config: Required<MusicalVisualRulesetConfig>;
  private intentCounter = 0;

  constructor(config: MusicalVisualRulesetConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  map(frame: MusicalFrame): VisualIntentFrame {
    const intents: VisualIntent[] = [];

    // Process each note
    for (const note of frame.notes) {
      const noteIntents = this.mapNote(note, frame.t);
      intents.push(...noteIntents);
    }

    // Add a global motion intent based on dynamics
    if (frame.notes.length > 0) {
      const motionIntent = this.createDynamicsMotionIntent(frame);
      intents.push(motionIntent);
    }

    return {
      t: frame.t,
      intents,
      uncertainty: this.calculateUncertainty(frame),
    };
  }

  private mapNote(note: Note, frameTime: number): VisualIntent[] {
    const intents: VisualIntent[] = [];

    // Generate palette intent
    const palette = this.createPaletteIntent(note, frameTime);
    intents.push(palette);

    // Generate motion intent for attack phase only (pulse on note start)
    if (note.phase === "attack") {
      const motion = this.createNoteMotionIntent(note, frameTime);
      intents.push(motion);
    }

    return intents;
  }

  private createPaletteIntent(note: Note, frameTime: number): PaletteIntent {
    const hue = pcToHue(note.pitch.pc, {
      referencePc: this.config.referencePc,
      referenceHue: this.config.referenceHue,
      direction: this.config.hueDirection,
    });

    // Velocity → brightness (0.3 to 1.0 range)
    const brightness = 0.3 + (note.velocity / 127) * 0.7;

    // Phase → stability
    const stability = this.phaseToStability(note.phase);

    // Phase → alpha (release phase fades out)
    const alpha = note.phase === "release" ? this.calculateReleaseAlpha(note) : 1;

    return {
      type: "palette",
      id: this.generateIntentId("palette", note.id),
      t: frameTime,
      base: {
        h: hue,
        s: 0.8,
        v: brightness,
        a: alpha,
      },
      stability,
      confidence: note.confidence,
    };
  }

  private createNoteMotionIntent(note: Note, frameTime: number): MotionIntent {
    return {
      type: "motion",
      id: this.generateIntentId("motion", note.id),
      t: frameTime,
      pulse: note.velocity / 127,
      flow: 0,
      jitter: 0.1,
      confidence: note.confidence,
    };
  }

  private createDynamicsMotionIntent(frame: MusicalFrame): MotionIntent {
    return {
      type: "motion",
      id: this.generateIntentId("dynamics-motion"),
      t: frame.t,
      pulse: frame.dynamics.level,
      flow: frame.dynamics.trend === "rising" ? 0.3 : frame.dynamics.trend === "falling" ? -0.3 : 0,
      jitter: 0.05,
      confidence: 1,
    };
  }

  private phaseToStability(phase: Note["phase"]): number {
    switch (phase) {
      case "attack":
        return 0.3; // Dynamic, reactive
      case "sustain":
        return 0.8; // Stable, held
      case "release":
        return 0.5; // Fading
      default:
        return 0.5;
    }
  }

  private calculateReleaseAlpha(note: Note): number {
    if (note.release === null) return 1;

    // Calculate how far into release we are
    const timeSinceRelease = note.duration - (note.release - note.onset);
    // Assume a 500ms release window (this could be configurable)
    const releaseProgress = Math.min(timeSinceRelease / 500, 1);

    // Fade from 1 to 0
    return 1 - releaseProgress;
  }

  private calculateUncertainty(frame: MusicalFrame): number {
    if (frame.notes.length === 0) return 0;

    // Average confidence of all notes
    const avgConfidence =
      frame.notes.reduce((sum, n) => sum + n.confidence, 0) / frame.notes.length;

    // Uncertainty is inverse of confidence
    return 1 - avgConfidence;
  }

  private generateIntentId(prefix: string, suffix?: string): string {
    const id = suffix
      ? `${prefix}-${suffix}`
      : `${prefix}-${this.intentCounter++}`;
    return id;
  }
}
