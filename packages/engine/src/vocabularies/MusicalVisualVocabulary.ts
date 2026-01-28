/**
 * Musical Visual Vocabulary (RFC 006)
 *
 * Annotates MusicalFrame with visual properties to produce AnnotatedMusicalFrame.
 * Implements IVisualVocabulary interface.
 *
 * This vocabulary:
 * - Assigns palettes based on pitch class (hue) and velocity (brightness)
 * - Assigns textures based on note phase
 * - Assigns motion properties based on dynamics and note phase
 * - Maintains visual consistency: same musical concepts get same visual treatment
 *
 * Key mappings:
 * - Pitch class → Hue (via pcToHue invariant)
 * - Velocity → Brightness
 * - Chord quality → Warm (major) / Cool (minor) palettes
 * - Note phase → Motion jitter and texture smoothness
 * - Dynamics → Motion pulse and flow
 *
 * NOTE: These mappings are provisional. See docs/vocabulary/semantic-mappings-v1.md
 * for analysis and open questions about the complete visual vocabulary.
 */

import type {
  IVisualVocabulary,
  MusicalFrame,
  AnnotatedMusicalFrame,
  AnnotatedNote,
  AnnotatedChord,
  AnnotatedRhythm,
  AnnotatedDynamics,
  PaletteRef,
  TextureRef,
  MotionAnnotation,
  VelocityAnnotation,
  PhaseAnnotation,
  PitchClass,
  Note,
  MusicalChord,
  RhythmicAnalysis,
  DynamicsState,
  HarmonicContext,
} from "@synesthetica/contracts";

import {
  pcToHue,
  octaveToBrightness,
  velocityToSizeMultiplier,
  velocityToAttackMs,
} from "@synesthetica/contracts";

import { buildChordShape } from "./utils";

/**
 * Configuration for the MusicalVisualVocabulary.
 */
export interface MusicalVisualVocabularyConfig {
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

const DEFAULT_CONFIG: Required<MusicalVisualVocabularyConfig> = {
  referencePc: 9, // A
  referenceHue: 0, // Red
  hueDirection: "cw",
};

/**
 * MusicalVisualVocabulary: Annotates musical frames with visual properties.
 *
 * This is a pure function - same input always produces same output.
 * No internal state is maintained across calls.
 */
export class MusicalVisualVocabulary implements IVisualVocabulary {
  readonly id = "musical-visual";

  private config: Required<MusicalVisualVocabularyConfig>;

  constructor(config: MusicalVisualVocabularyConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  annotate(frame: MusicalFrame): AnnotatedMusicalFrame {
    // Default harmonic context when stabilizer not in chain
    const defaultHarmonicContext: HarmonicContext = {
      tension: 0,
      keyAware: false,
      detectedKey: null,
    };

    return {
      t: frame.t,
      part: frame.part,
      notes: frame.notes.map((note) => this.annotateNote(note)),
      chords: frame.chords.map((chord) => this.annotateChord(chord)),
      progression: frame.progression ?? [],
      harmonicContext: frame.harmonicContext ?? defaultHarmonicContext,
      rhythm: this.annotateRhythm(
        frame.rhythmicAnalysis,
        frame.prescribedTempo,
        frame.prescribedMeter
      ),
      bars: [], // No bar detection yet
      phrases: [], // No phrase detection yet
      dynamics: this.annotateDynamics(frame.dynamics),
    };
  }

  // ===========================================================================
  // Note Annotation
  // ===========================================================================

  private annotateNote(note: Note): AnnotatedNote {
    const hue = pcToHue(note.pitch.pc, {
      referencePc: this.config.referencePc,
      referenceHue: this.config.referenceHue,
      direction: this.config.hueDirection,
    });

    // Octave → brightness (Invariant I15)
    const brightness = octaveToBrightness(note.pitch.octave);

    // Phase → alpha (release phase fades out)
    const alpha =
      note.phase === "release" ? this.calculateReleaseAlpha(note) : 1;

    const palette: PaletteRef = {
      id: `note-${note.id}`,
      primary: { h: hue, s: 0.8, v: brightness, a: alpha },
      secondary: { h: (hue + 30) % 360, s: 0.6, v: brightness * 0.8, a: alpha },
    };

    const texture = this.phaseToTexture(note.phase);
    const motion = this.phaseToMotion(note.phase, note.velocity);

    // Velocity annotation (Invariant I16)
    const velocity: VelocityAnnotation = {
      sizeMultiplier: velocityToSizeMultiplier(note.velocity),
      attackMs: velocityToAttackMs(note.velocity),
    };

    // Phase annotation (Invariant I17)
    const phaseState: PhaseAnnotation = {
      phase: note.phase,
      intensity: alpha,
    };

    return {
      note,
      visual: {
        palette,
        texture,
        motion,
        uncertainty: 1 - note.confidence,
        label: this.pitchLabel(note.pitch.pc, note.pitch.octave),
      },
      velocity,
      phaseState,
    };
  }

  // ===========================================================================
  // Chord Annotation
  // ===========================================================================

  private annotateChord(chord: MusicalChord): AnnotatedChord {
    // Root hue from pitch class (Invariant I14)
    const rootHue = pcToHue(chord.root, {
      referencePc: this.config.referencePc,
      referenceHue: this.config.referenceHue,
      direction: this.config.hueDirection,
    });

    // Uncertainty is higher for chords (detection is harder)
    const uncertainty = 1 - chord.confidence;

    const palette: PaletteRef = {
      id: `chord-${chord.id}`,
      primary: { h: rootHue, s: 0.7, v: 0.85, a: 1 },
      secondary: { h: (rootHue + 30) % 360, s: 0.5, v: 0.7, a: 1 },
      accent: { h: (rootHue + 180) % 360, s: 0.8, v: 0.9, a: 1 },
    };

    const texture: TextureRef = {
      id: chord.phase === "active" ? "chord-active" : "chord-decay",
      grain: chord.phase === "active" ? 0.2 : 0.4,
      smoothness: chord.phase === "active" ? 0.8 : 0.5,
      density: Math.min(chord.noteIds.length / 4, 1),
    };

    const motion: MotionAnnotation = {
      jitter: chord.phase === "active" ? 0.05 : 0.15,
      pulse: chord.phase === "active" ? 0.6 : 0.2,
      flow: chord.phase === "active" ? 0.2 : -0.2,
    };

    // Build chord shape geometry (Invariant I18)
    const shape = buildChordShape(chord, {
      referencePc: this.config.referencePc,
      referenceHue: this.config.referenceHue,
      direction: this.config.hueDirection,
    });

    return {
      chord,
      visual: {
        palette,
        texture,
        motion,
        uncertainty,
        label: this.chordLabel(chord),
      },
      noteIds: chord.noteIds,
      shape,
    };
  }

  // ===========================================================================
  // Rhythm Annotation
  // ===========================================================================

  private annotateRhythm(
    analysis: RhythmicAnalysis,
    prescribedTempo: number | null,
    prescribedMeter: MusicalFrame["prescribedMeter"]
  ): AnnotatedRhythm {
    // Rhythm visualization uses neutral gray palette
    // Brightness based on stability (more stable = brighter)
    const brightness = 0.5 + analysis.stability * 0.4;

    const palette: PaletteRef = {
      id: "rhythm",
      primary: { h: 0, s: 0, v: brightness, a: 1 },
    };

    const texture: TextureRef = {
      id: "rhythm",
      grain: 0.1 + (1 - analysis.stability) * 0.2, // More grain when unstable
      smoothness: 0.5 + analysis.stability * 0.4, // Smoother when stable
      density: 0.5,
    };

    // Motion based on analysis - pulse follows detected division
    const motion: MotionAnnotation = {
      jitter: (1 - analysis.stability) * 0.1, // More jitter when unstable
      pulse: analysis.confidence * 0.6, // Pulse based on confidence
      flow: 0,
    };

    return {
      analysis,
      visual: {
        palette,
        texture,
        motion,
        uncertainty: 1 - analysis.confidence,
      },
      prescribedTempo,
      prescribedMeter,
    };
  }

  // ===========================================================================
  // Dynamics Annotation
  // ===========================================================================

  private annotateDynamics(dynamics: DynamicsState): AnnotatedDynamics {
    const palette: PaletteRef = {
      id: "dynamics",
      primary: { h: 0, s: 0, v: dynamics.level, a: 1 },
    };

    const texture: TextureRef = {
      id: "dynamics",
      grain: 0.1,
      smoothness: 0.8,
      density: dynamics.level,
    };

    const motion: MotionAnnotation = {
      jitter: 0.05,
      pulse: dynamics.level,
      flow:
        dynamics.trend === "rising"
          ? 0.3
          : dynamics.trend === "falling"
            ? -0.3
            : 0,
    };

    return {
      dynamics,
      visual: {
        palette,
        texture,
        motion,
        uncertainty: 0.1, // Dynamics are fairly certain
      },
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private phaseToTexture(phase: Note["phase"]): TextureRef {
    switch (phase) {
      case "attack":
        return {
          id: "attack",
          grain: 0.3,
          smoothness: 0.5,
          density: 0.8,
        };
      case "sustain":
        return {
          id: "sustain",
          grain: 0.1,
          smoothness: 0.9,
          density: 0.6,
        };
      case "release":
        return {
          id: "release",
          grain: 0.2,
          smoothness: 0.7,
          density: 0.4,
        };
    }
  }

  private phaseToMotion(phase: Note["phase"], velocity: number): MotionAnnotation {
    const basePulse = velocity / 127;

    switch (phase) {
      case "attack":
        return {
          jitter: 0.1,
          pulse: basePulse,
          flow: 0.3,
        };
      case "sustain":
        return {
          jitter: 0.05,
          pulse: basePulse * 0.3,
          flow: 0.1,
        };
      case "release":
        return {
          jitter: 0.15,
          pulse: basePulse * 0.2,
          flow: -0.2,
        };
    }
  }

  private calculateReleaseAlpha(note: Note): number {
    if (note.release === null) return 1;

    // Calculate how far into release we are
    const timeSinceRelease = note.duration - (note.release - note.onset);
    // Assume a 500ms release window
    const releaseProgress = Math.min(timeSinceRelease / 500, 1);

    // Fade from 1 to 0
    return 1 - releaseProgress;
  }

  private pitchLabel(pc: PitchClass, octave: number): string {
    const names = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    return `${names[pc]}${octave}`;
  }

  private chordLabel(chord: MusicalChord): string {
    const rootNames = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const qualitySuffix = chord.quality === "min" ? "m" : "";
    return `${rootNames[chord.root]}${qualitySuffix}`;
  }

}
