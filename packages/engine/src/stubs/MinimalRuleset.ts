import type {
  IRuleset,
  CMSFrame,
  IntentFrame,
  PaletteIntent,
  MotionIntent,
  PitchClass,
} from "@synesthetica/contracts";
import { pcToHue } from "@synesthetica/contracts";

/**
 * Minimal ruleset: pitch→hue, velocity→brightness
 *
 * This is the simplest possible ruleset for Phase 0.
 * It maps note events directly to palette and motion intents.
 */
export class MinimalRuleset implements IRuleset {
  readonly id = "minimal";

  private pitchHueInvariant = {
    referencePc: 9 as PitchClass, // A
    referenceHue: 0, // Red
    direction: "cw" as const,
  };

  map(frame: CMSFrame): IntentFrame {
    const intents: (PaletteIntent | MotionIntent)[] = [];

    // Process note_on events to generate palette intents
    for (const event of frame.events) {
      if (event.type === "note_on") {
        // Pitch → Hue
        const hue = pcToHue(event.pc, this.pitchHueInvariant);

        // Velocity → Brightness (value in HSV)
        const brightness = 0.3 + (event.velocity / 127) * 0.7; // 0.3 to 1.0

        const palette: PaletteIntent = {
          type: "palette",
          t: event.t,
          base: {
            h: hue,
            s: 0.8,
            v: brightness,
            a: 1,
          },
          stability: 0.5,
          confidence: 1,
        };
        intents.push(palette);

        // Also generate a motion intent based on velocity
        const motion: MotionIntent = {
          type: "motion",
          t: event.t,
          pulse: event.velocity / 127,
          flow: 0,
          jitter: 0.1,
          confidence: 1,
        };
        intents.push(motion);
      }
    }

    return {
      t: frame.t,
      intents,
      events: frame.events,
      uncertainty: 0,
    };
  }
}
