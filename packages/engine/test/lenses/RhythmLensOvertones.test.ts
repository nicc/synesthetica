/**
 * RhythmLens overtone strips (harmonic series overlay, RFC 012).
 *
 * Runs the real vocabulary into the real lens so partial levels,
 * positions and the column-energy metric reflect production behaviour.
 * Run with GENERATE_SNAPSHOTS=1 to write SVGs to test/_snapshots/overtones.
 */

import { describe, it, expect } from "vitest";
import { RhythmLens } from "../../src/lenses/RhythmLens";
import { MusicalVisualVocabulary } from "../../src/vocabularies/MusicalVisualVocabulary";
import { maybeWriteSnapshot } from "../_harness/svg-snapshot";
import { createTestMusicalFrame } from "../_harness/frames";
import type {
  Entity,
  LensContext,
  Note,
  PitchClass,
  SceneFrame,
} from "@synesthetica/contracts";

const ctx: LensContext = {
  canvasSize: { width: 800, height: 600 },
  rngSeed: 12345,
  part: "main",
};

const T = 4000;

interface NoteSpec {
  id: string;
  pc: PitchClass;
  onset: number;
  /** Release time; omitted = still held at T */
  release?: number;
}

function toNote(spec: NoteSpec, t: number): Note {
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

function render(
  specs: NoteSpec[],
  opts: { level?: number; colour?: "pitch" | "fundamental"; t?: number } = {},
): SceneFrame {
  const t = opts.t ?? T;
  const vocab = new MusicalVisualVocabulary({
    harmonicSeriesEnabled: true,
    harmonicSeriesLevel: opts.level ?? 1,
    // RFC 012 metrics are stated at rolloff 1.0; pinned so a default
    // change does not move them.
    harmonicSeriesRolloff: 1,
    partialColourMode: opts.colour ?? "pitch",
  });
  const lens = new RhythmLens();
  lens.init(ctx);
  const frame = createTestMusicalFrame(t, "main", {
    notes: specs.map((s) => toNote(s, t)),
  });
  return lens.update(vocab.annotate(frame), null);
}

const overtones = (scene: SceneFrame): Entity[] =>
  scene.entities.filter((e) => e.data?.type === "overtone-strip");

const noteStrips = (scene: SceneFrame): Entity[] =>
  scene.entities.filter((e) => e.data?.type === "note-strip");

/** Summed bottom (at-NOW) opacity of overtone strips per nearest pitch class. */
function columnEnergy(scene: SceneFrame): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of overtones(scene)) {
    const pc = e.data!.pitchClass as number;
    out.set(pc, (out.get(pc) ?? 0) + (e.data!.bottomOpacity as number));
  }
  return out;
}

const held = (pcs: PitchClass[], onset = 2500): NoteSpec[] =>
  pcs.map((pc, i) => ({ id: `n${i}-${pc}`, pc, onset }));

describe("RhythmLens overtone strips", () => {
  it("emits none when the overlay is off", () => {
    expect(overtones(render(held([0, 4, 7]), { level: 0 }))).toHaveLength(0);
  });

  it("emits one overtone strip per modelled partial, before its note strip", () => {
    const scene = render(held([0]));
    const ots = overtones(scene);
    expect(ots.map((e) => e.data!.pitchClass)).toEqual([7, 4, 10, 2]);
    const noteIndex = scene.entities.indexOf(noteStrips(scene)[0]);
    for (const e of ots) expect(scene.entities.indexOf(e)).toBeLessThan(noteIndex);
  });

  it("shares the note strip's time extent and is wider than it", () => {
    const scene = render([{ id: "c", pc: 0, onset: 2000, release: 3000 }]);
    const strip = noteStrips(scene)[0];
    for (const e of overtones(scene)) {
      expect(e.position!.y).toBe(strip.position!.y);
      expect(e.data!.barHeight).toBe(strip.data!.barHeight);
      expect(e.style.size!).toBeGreaterThan(strip.style.size!);
    }
  });

  it("fades with its note strip: opacity is level × note strip opacity", () => {
    const scene = render([{ id: "c", pc: 0, onset: 2000, release: 3000 }], { level: 0.5 });
    const strip = noteStrips(scene)[0];
    const fifth = overtones(scene).find((e) => e.data!.n === 3)!;
    const level = 0.5 * (1 / 3 + 1 / 6);
    expect(fifth.data!.topOpacity).toBeCloseTo(level * (strip.data!.topOpacity as number));
    expect(fifth.data!.bottomOpacity).toBeCloseTo(level * (strip.data!.bottomOpacity as number));
  });

  it("sits at real pitch: the 7th partial is left of the ♭7 column", () => {
    const scene = render(held([0, 10]));
    const bb = noteStrips(scene).find((e) => e.data!.pitchClass === 10)!;
    const seventh = overtones(scene).find(
      (e) => e.data!.n === 7 && e.data!.noteId === "n0-0",
    )!;
    expect(seventh.position!.x).toBeLessThan(bb.position!.x);
  });

  it("places a partial flat of C left of the C column, not at B", () => {
    // D's 7th partial: C −31¢
    const scene = render(held([0, 2]));
    const c = noteStrips(scene).find((e) => e.data!.pitchClass === 0)!;
    const flatC = overtones(scene).find(
      (e) => e.data!.n === 7 && e.data!.noteId === "n1-2",
    )!;
    expect(flatC.data!.pitchClass).toBe(0);
    expect(flatC.position!.x).toBeLessThan(c.position!.x);
  });

  it("culls overtone strips below the opacity floor", () => {
    // Level 0.1: the 9th partial is 0.011, below OVERTONE_CULL_OPACITY
    const ns = overtones(render(held([0]), { level: 0.1 })).map((e) => e.data!.n);
    expect(ns).not.toContain(9);
    expect(ns).toContain(3);
  });
});

describe("RhythmLens overtone metrics (RFC 012 §Development method)", () => {
  it("C major: D and B exceed any single partial", () => {
    const energy = columnEnergy(render(held([0, 4, 7])));
    console.log("C major column energy:", Object.fromEntries(energy));
    expect(energy.get(2)!).toBeCloseTo(0.75, 2);
    expect(energy.get(11)!).toBeCloseTo(0.7, 2);
    expect(energy.get(2)!).toBeGreaterThan(0.5);
    expect(energy.get(11)!).toBeGreaterThan(0.5);
  });

  it("M3 vs m3: column energy does not separate them; coincidence with a played note does", () => {
    const major = render(held([0, 4]));
    const minor = render(held([0, 3]));
    const majorPeak = Math.max(...columnEnergy(major).values());
    const minorPeak = Math.max(...columnEnergy(minor).values());
    expect(minorPeak).toBeGreaterThan(majorPeak);

    // C's partials landing on the upper note's column
    const onUpper = (scene: SceneFrame, pc: number) =>
      overtones(scene).filter(
        (e) => e.data!.noteId === "n0-0" && e.data!.pitchClass === pc,
      );
    expect(onUpper(major, 4)).toHaveLength(1);
    expect(onUpper(major, 4)[0].data!.cents).toBeCloseTo(-13.7, 0);
    expect(onUpper(minor, 3)).toHaveLength(0);
  });

  it("dominant seventh: G alone puts its 7th partial on F, surviving culling at level 0.3", () => {
    const f = overtones(render(held([7]), { level: 0.3 })).find((e) => e.data!.n === 7);
    expect(f).toBeDefined();
    expect(f!.data!.pitchClass).toBe(5);
    expect(f!.data!.cents).toBeCloseTo(-31.2, 0);
  });

  it("dense passage: entity count stays bounded by 4 overtone strips per visible note", () => {
    const specs: NoteSpec[] = [];
    const pcs: PitchClass[] = [0, 4, 7, 11, 2, 5, 9, 1];
    for (let i = 0; i < 24; i++) {
      const onset = 1000 + i * 125; // 8 notes/s for 3 s
      specs.push({ id: `d${i}`, pc: pcs[i % pcs.length], onset, release: onset + 200 });
    }
    const scene = render(specs, { level: 0.5 });
    const notes = noteStrips(scene).length;
    const ots = overtones(scene).length;
    console.log(`Dense passage: ${notes} note strips, ${ots} overtone strips, ${scene.entities.length} entities`);
    expect(ots).toBeLessThanOrEqual(notes * 4);
  });
});

describe("RhythmLens overtone snapshots", () => {
  const level = 0.5;
  const scenarios: Array<[string, NoteSpec[]]> = [
    ["c-then-g-detached", [
      { id: "c", pc: 0, onset: 1500, release: 2300 },
      { id: "g", pc: 7, onset: 2800 },
    ]],
    ["c-then-g-legato", [
      { id: "c", pc: 0, onset: 1500, release: 3500 },
      { id: "g", pc: 7, onset: 2800 },
    ]],
    ["c-major", held([0, 4, 7])],
    ["g7", held([7, 11, 2, 5])],
    ["minor-third-dyad", held([0, 3])],
    ["major-third-dyad", held([0, 4])],
  ];

  for (const [name, specs] of scenarios) {
    for (const colour of ["pitch", "fundamental"] as const) {
      it(`${name} (${colour} hue)`, () => {
        const scene = render(specs, { level, colour });
        maybeWriteSnapshot(`${name}-${colour}`, scene, {}, "overtones");
        expect(overtones(scene).length).toBeGreaterThan(0);
      });
    }
  }

  it("c-major at levels 0.25 and 1.0", () => {
    for (const l of [0.25, 1.0]) {
      const scene = render(held([0, 4, 7]), { level: l });
      maybeWriteSnapshot(`c-major-level-${l}`, scene, {}, "overtones");
      expect(overtones(scene).length).toBeGreaterThan(0);
    }
  });
});
