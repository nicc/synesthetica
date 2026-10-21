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
 * - Dynamics → Motion pulse
 *
 * NOTE: These mappings are provisional. See docs/vocabulary/semantic-mappings-v1.md
 * for analysis and open questions about the complete visual vocabulary.
 */

import type {
  MacroValue,
  IVisualVocabulary,
  MusicalFrame,
  AnnotatedMusicalFrame,
  AnnotatedNote,
  AnnotatedChord,
  AnnotatedDynamics,
  PaletteRef,
  TextureRef,
  MotionAnnotation,
  VelocityAnnotation,
  PhaseAnnotation,
  HarmonicPartial,
  ChordPartial,
  PitchClass,
  Note,
  MusicalChord,
  ChordInterpretationMode,
  DynamicsState,
  Ms,
} from "@synesthetica/contracts";

import {
  EMPTY_HARMONIC_CONTEXT,
  pcToHue,
  octaveToBrightness,
  velocityToSizeMultiplier,
  velocityToAttackMs,
} from "@synesthetica/contracts";

import { buildChordShape } from "./utils";
import type { PartialLevel } from "./harmonicSeries";
import {
  modelPartialLevels,
  partialPitch,
  PARTIAL_ROLLOFF_DEFAULT,
} from "./harmonicSeries";

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

  /**
   * Harmonic series overlay level, 0..1 (RFC 012). 0 annotates no
   * partials. Whether a lens draws them is the lens's own toggle
   * (rhythm:overtones, harmony:overtones).
   * @default 0.2
   */
  harmonicSeriesLevel?: number;

  /**
   * Harmonic series rolloff exponent, 0..3 (RFC 012).
   * @default 1.0
   */
  harmonicSeriesRolloff?: number;

  /**
   * Hue source for partials (RFC 012): "pitch" uses the partial's own
   * pitch-class hue; "fundamental" uses the hue of the note that
   * produced it.
   * @default "pitch"
   */
  partialColourMode?: "pitch" | "fundamental";
}

const DEFAULT_CONFIG: Required<MusicalVisualVocabularyConfig> = {
  referencePc: 0, // C — matches session:tonic's PC=0 convention
  referenceHue: 0, // Red
  hueDirection: "cw",
  harmonicSeriesLevel: 0.2,
  harmonicSeriesRolloff: PARTIAL_ROLLOFF_DEFAULT,
  partialColourMode: "pitch",
};

/**
 * MusicalVisualVocabulary: Annotates musical frames with visual properties.
 *
 * This is a pure function - same input always produces same output.
 * No internal state is maintained across calls.
 */
/** Duration of the linear release fade (SPEC 010 I17: "Release phase
 *  (default 500ms): Linear fade to zero"). */
const RELEASE_FADE_MS = 500;

export class MusicalVisualVocabulary implements IVisualVocabulary {
  readonly id = "musical-visual";

  private config: Required<MusicalVisualVocabularyConfig>;

  constructor(config: MusicalVisualVocabularyConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Apply a manifest macro. Handles `system:colour-mapping:reference`
   *  (a degree on the colour wheel anchored to pitch class 0, C) and the
   *  harmonic series overlay's `system:harmonic-series:level` / `:rolloff`
   *  / `:colour`.
   *  Other macros are ignored. */
  setMacro(name: string, value: MacroValue): void {
    if (name === "system:colour-mapping:reference") {
      const hue = ((Number(value) % 360) + 360) % 360;
      this.config = { ...this.config, referencePc: 0, referenceHue: hue };
    } else if (name === "system:harmonic-series:level") {
      this.config = { ...this.config, harmonicSeriesLevel: Number(value) };
    } else if (name === "system:harmonic-series:rolloff") {
      this.config = { ...this.config, harmonicSeriesRolloff: Number(value) };
    } else if (name === "system:harmonic-series:colour") {
      if (value === "pitch" || value === "fundamental") {
        this.config = { ...this.config, partialColourMode: value };
      }
    }
  }

  /** Anchor a specific pitch class to a specific hue. Derives the
   *  equivalent referenceHue at PC=0 so subsequent readMacros returns
   *  the value set_macro would need to reproduce this anchor. */
  setHueForPitch(pc: number, hue: number): void {
    const step = this.config.hueDirection === "cw" ? 30 : -30;
    const derivedRefHue = (((hue - step * pc) % 360) + 360) % 360;
    this.config = { ...this.config, referencePc: 0, referenceHue: derivedRefHue };
  }

  /** Return current values for every macro this vocab accepts. */
  readMacros(): Record<string, MacroValue> {
    return {
      "system:colour-mapping:reference": this.config.referenceHue,
      "system:harmonic-series:level": this.config.harmonicSeriesLevel,
      "system:harmonic-series:rolloff": this.config.harmonicSeriesRolloff,
      "system:harmonic-series:colour": this.config.partialColourMode,
    };
  }

  annotate(frame: MusicalFrame): AnnotatedMusicalFrame {
    // Default harmonic context when stabilizer not in chain
    const defaultHarmonicContext = { ...EMPTY_HARMONIC_CONTEXT };

    // Partial levels depend only on the overlay macros, not the note,
    // so the stencil is computed once per frame.
    const partialLevels = modelPartialLevels(
      this.config.harmonicSeriesLevel,
      this.config.harmonicSeriesRolloff,
    );

    return {
      t: frame.t,
      part: frame.part,
      notes: frame.notes.map((note) =>
        this.annotateNote(note, frame.t, partialLevels),
      ),
      chords: frame.chords.map((chord) =>
        this.annotateChord(chord, frame.chordInterpretation, partialLevels),
      ),
      progression: frame.progression ?? [],
      prescribedTempo: frame.prescribedTempo,
      prescribedMeter: frame.prescribedMeter,
      prescribedKey: frame.prescribedKey,
      chordInterpretation: frame.chordInterpretation,
      hueInvariant: {
        referencePc: this.config.referencePc,
        referenceHue: this.config.referenceHue,
        direction: this.config.hueDirection,
      },
      harmonicContext: frame.harmonicContext ?? defaultHarmonicContext,
      bars: [], // No bar detection yet
      phrases: [], // No phrase detection yet
      dynamics: this.annotateDynamics(frame.dynamics),
    };
  }

  // ===========================================================================
  // Note Annotation
  // ===========================================================================

  private annotateNote(
    note: Note,
    t: Ms,
    partialLevels: PartialLevel[],
  ): AnnotatedNote {
    const hue = pcToHue(note.pitch.pc, {
      referencePc: this.config.referencePc,
      referenceHue: this.config.referenceHue,
      direction: this.config.hueDirection,
    });

    // Octave → brightness (Invariant I15)
    const brightness = octaveToBrightness(note.pitch.octave);

    // Phase → alpha (release phase fades out)
    const alpha =
      note.phase === "release" ? this.calculateReleaseAlpha(note, t) : 1;

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

    const annotated: AnnotatedNote = {
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
    if (partialLevels.length === 0) return annotated;
    return {
      ...annotated,
      partials: this.annotatePartials(note, partialLevels, brightness),
    };
  }

  /** Attach real pitch and colour to modelled partial levels (RFC 012).
   *  Partials are annotations only — never Notes (proposed I31). */
  private annotatePartials(
    note: Note,
    partialLevels: PartialLevel[],
    brightness: number,
  ): HarmonicPartial[] {
    const hueConfig = {
      referencePc: this.config.referencePc,
      referenceHue: this.config.referenceHue,
      direction: this.config.hueDirection,
    };
    return partialLevels.map(({ n, level }) => {
      const { pc, cents } = partialPitch(note.pitch.pc, n);
      const huePc =
        this.config.partialColourMode === "pitch" ? pc : note.pitch.pc;
      return {
        n,
        pc,
        cents,
        level,
        color: { h: pcToHue(huePc, hueConfig), s: 0.8, v: brightness, a: 1 },
      };
    });
  }

  // ===========================================================================
  // Chord Annotation
  // ===========================================================================

  private annotateChord(
    chord: MusicalChord,
    mode: ChordInterpretationMode,
    partialLevels: PartialLevel[],
  ): AnnotatedChord {
    const interpretation =
      mode === "bass-led" ? chord.bassLed : chord.harmonic;

    // Root hue from pitch class (Invariant I14)
    const rootHue = pcToHue(interpretation.root, {
      referencePc: this.config.referencePc,
      referenceHue: this.config.referenceHue,
      direction: this.config.hueDirection,
    });

    // Uncertainty is higher for chords (detection is harder)
    const uncertainty = 1 - interpretation.confidence;

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
    };

    // Build chord shape geometry (Invariant I18). Pass the bass so the
    // element matching the bass pitch class can be marked for inversion
    // rendering. Only meaningful under harmonic mode — under bass-led,
    // the interpretation's root IS the bass so there's nothing to mark.
    const shape = buildChordShape(
      interpretation,
      chord.voicing,
      {
        referencePc: this.config.referencePc,
        referenceHue: this.config.referenceHue,
        direction: this.config.hueDirection,
      },
      mode === "harmonic" ? chord.bass : null,
    );

    const annotated: AnnotatedChord = {
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
    if (partialLevels.length === 0) return annotated;
    return {
      ...annotated,
      partials: this.annotateChordPartials(
        chord,
        interpretation.root,
        partialLevels,
      ),
    };
  }

  /** Partials of each distinct pitch class in the voicing, placed in the
   *  glyph's angular frame (RFC 012). Octave doubling is ignored, as in
   *  the glyph itself. */
  private annotateChordPartials(
    chord: MusicalChord,
    root: PitchClass,
    partialLevels: PartialLevel[],
  ): ChordPartial[] {
    const hueConfig = {
      referencePc: this.config.referencePc,
      referenceHue: this.config.referenceHue,
      direction: this.config.hueDirection,
    };
    const brightness = octaveToBrightness(
      chord.voicing.length > 0
        ? chord.voicing.reduce((sum, p) => sum + p.octave, 0) / chord.voicing.length
        : 4,
    );
    const tones = [...new Set(chord.voicing.map((p) => p.pc))];
    return tones.flatMap((sourcePc) =>
      partialLevels.map(({ n, level }) => {
        const { pc, cents } = partialPitch(sourcePc, n);
        const huePc =
          this.config.partialColourMode === "pitch" ? pc : sourcePc;
        return {
          n,
          pc,
          cents,
          level,
          color: { h: pcToHue(huePc, hueConfig), s: 0.8, v: brightness, a: 1 },
          sourcePc,
          angle: (((pc - root + 12) % 12) + cents / 100) * 30,
        };
      }),
    );
  }

  // Rhythm annotation removed 2026-08-20 with the removal of BPM
  // inference — RhythmicAnalysis was populated only by inference paths
  // that never had a stabilizer. RhythmLens computes its own
  // drift analysis inline from prescribed tempo, not from an
  // AnnotatedRhythm.

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
        };
      case "sustain":
        return {
          jitter: 0.05,
          pulse: basePulse * 0.3,
        };
      case "release":
        return {
          jitter: 0.15,
          pulse: basePulse * 0.2,
        };
    }
  }

  private calculateReleaseAlpha(note: Note, t: Ms): number {
    if (note.release === null) return 1;

    const timeSinceRelease = t - note.release;
    const releaseProgress = Math.min(timeSinceRelease / RELEASE_FADE_MS, 1);

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
    const qualitySuffix = chord.harmonic.quality === "min" ? "m" : "";
    return `${rootNames[chord.harmonic.root]}${qualitySuffix}`;
  }

}
