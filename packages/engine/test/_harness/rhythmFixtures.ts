/**
 * Frame fixtures for RhythmLens tests and snapshots.
 */

import { RhythmLens } from "../../src/lenses/RhythmLens";
import { MusicalVisualVocabulary } from "../../src/vocabularies/MusicalVisualVocabulary";
import { createTestAnnotatedFrame, createTestMusicalFrame } from "./frames";
import type {
  AnnotatedNote,
  Entity,
  LensContext,
  Note,
  PitchClass,
  SceneFrame,
} from "@synesthetica/contracts";

export const lensCtx: LensContext = {
  canvasSize: { width: 800, height: 600 },
  rngSeed: 12345,
  part: "main",
};

export interface RhythmNoteSpec {
  id: string;
  pc: PitchClass;
  octave?: number;
  velocity?: number;
  onset: number;
  /** Default: still held until frame time */
  duration?: number;
  phase?: "attack" | "sustain" | "release";
}

/**
 * An annotated frame with hand-built notes (no vocabulary) and an
 * optional prescribed tempo and meter.
 */
export function createRhythmFrame(
  t: number,
  options: {
    notes?: RhythmNoteSpec[];
    tempo?: number;
    meter?: { beatsPerBar: number; beatUnit: number };
  },
) {
  const notes: AnnotatedNote[] = (options.notes ?? []).map((n) => {
    const velocity = n.velocity ?? 80;
    return {
      note: {
        id: n.id,
        pitch: { pc: n.pc, octave: n.octave ?? 4 },
        velocity,
        onset: n.onset,
        duration: n.duration ?? t - n.onset,
        release: null,
        phase: n.phase ?? "sustain",
        confidence: 1,
        provenance: { source: "test", stream: "test" },
      },
      visual: {
        palette: {
          id: `note-${n.id}`,
          primary: { h: (n.pc * 30) % 360, s: 0.7, v: 0.9, a: 1 },
        },
        texture: { id: "smooth", grain: 0.1, smoothness: 0.9, density: 0.5 },
        motion: { jitter: 0.05, pulse: 0.3 },
        uncertainty: 0,
        label: `Note-${n.pc}`,
      },
      velocity: {
        sizeMultiplier: 0.5 + (velocity / 127) * 1.5,
        attackMs: 50 - (velocity / 127) * 50,
      },
      phaseState: {
        phase: n.phase ?? "sustain",
        intensity: n.phase === "release" ? 0.5 : 1.0,
      },
    };
  });

  return createTestAnnotatedFrame(t, "main", {
    notes,
    prescribedTempo: options.tempo ?? null,
    prescribedMeter: options.meter ?? null,
  });
}

// ============================================================================
// Overtone strips (RFC 012): real vocabulary into the real lens
// ============================================================================

/** Frame time for overtone scenes. */
export const OVERTONE_T = 4000;

export interface OvertoneNoteSpec {
  id: string;
  pc: PitchClass;
  onset: number;
  /** Release time; omitted = still held at frame time */
  release?: number;
}

function toNote(spec: OvertoneNoteSpec, t: number): Note {
  const released = spec.release !== undefined && spec.release <= t;
  return {
    id: spec.id,
    pitch: { pc: spec.pc, octave: 4 },
    velocity: 80,
    onset: spec.onset,
    duration: (released ? spec.release! : t) - spec.onset,
    release: released ? spec.release! : null,
    phase: released ? "release" : "sustain",
    confidence: 1,
    provenance: { source: "test", stream: "test" },
  };
}

export function renderOvertoneScene(
  specs: OvertoneNoteSpec[],
  opts: { level?: number; colour?: "pitch" | "fundamental"; t?: number; lensToggle?: boolean } = {},
): SceneFrame {
  const t = opts.t ?? OVERTONE_T;
  const vocab = new MusicalVisualVocabulary({
    harmonicSeriesLevel: opts.level ?? 1,
    // RFC 012 metrics are stated at rolloff 1.0; pinned so a default
    // change does not move them.
    harmonicSeriesRolloff: 1,
    partialColourMode: opts.colour ?? "pitch",
  });
  const lens = new RhythmLens();
  lens.init(lensCtx);
  lens.setMacros({ overtones: opts.lensToggle ?? true });
  const frame = createTestMusicalFrame(t, "main", {
    notes: specs.map((s) => toNote(s, t)),
  });
  return lens.update(vocab.annotate(frame), null);
}

/** Notes held from `onset` to frame time, one per pitch class. */
export const held = (pcs: PitchClass[], onset = 2500): OvertoneNoteSpec[] =>
  pcs.map((pc, i) => ({ id: `n${i}-${pc}`, pc, onset }));

export const overtoneStrips = (scene: SceneFrame): Entity[] =>
  scene.entities.filter((e) => e.data?.type === "overtone-strip");

export const noteStrips = (scene: SceneFrame): Entity[] =>
  scene.entities.filter((e) => e.data?.type === "note-strip");
