/**
 * End-to-end pipeline golden test.
 *
 * Wires the full production pipeline (all stabilizers, real
 * vocabulary, all three lenses, IdentityCompositor) and drives it
 * with a scripted MIDI sequence. Asserts on the shape of the
 * SceneFrame at each step — proves the entire chain from
 * RawInputFrame → SceneFrame produces the entities each lens is
 * expected to produce.
 *
 * Assertions filter to the entities each behaviour produces (note
 * strips, per-note dynamics indicators, chord shapes). The now-line,
 * note-name labels, dynamics outline and harmony clock scaffold are
 * always present, so counts over all entities would prove nothing.
 * Per-stage tests cover exact field values; this is the wiring check.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  VisualPipeline,
  NoteTrackingStabilizer,
  DynamicsStabilizer,
  ChordDetectionStabilizer,
  HarmonyStabilizer,
  MusicalVisualVocabulary,
  RhythmLens,
  HarmonyLens,
  DynamicsLens,
  IdentityCompositor,
} from "../src";
import type {
  IRawSourceAdapter,
  RawInputFrame,
  MidiNoteOn,
  MidiNoteOff,
  SceneFrame,
} from "@synesthetica/contracts";

/** Timing-relevant config, set explicitly so the timings below derive
 *  from it rather than from production defaults (CLAUDE.md rules 3–4). */
const CHORD_HYSTERESIS_MS = 50;
const NOTE_RELEASE_WINDOW_MS = 10_000;

const rhythmLensId = new RhythmLens().id;
const harmonyLensId = new HarmonyLens().id;
const dynamicsLensId = new DynamicsLens().id;

const ofType = (frame: SceneFrame, type: string) =>
  frame.entities.filter((e) => e.data?.type === type);

const stripPitchClasses = (frame: SceneFrame) =>
  ofType(frame, "note-strip")
    .map((e) => e.data?.pitchClass as number)
    .sort((a, b) => a - b);

/** Per-note dynamics indicators (the outline and ruler ticks are
 *  always drawn and share the same data.type). */
const dynamicsIndicators = (frame: SceneFrame) =>
  frame.entities.filter((e) => e.id.startsWith(`${dynamicsLensId}:ind:`));

/** Minimal scripted MIDI adapter — queues frames on construction. */
class ScriptedMidiAdapter implements IRawSourceAdapter {
  readonly source = "e2e-test";
  readonly stream = "midi";
  private frames: RawInputFrame[] = [];
  private idx = 0;

  nextFrame(): RawInputFrame | null {
    return this.idx >= this.frames.length ? null : this.frames[this.idx++];
  }

  noteOn(midi: number, velocity: number, t: number): this {
    this.push(t, { type: "midi_note_on", t, note: midi, velocity, channel: 0 });
    return this;
  }

  noteOff(midi: number, t: number): this {
    this.push(t, { type: "midi_note_off", t, note: midi, channel: 0 });
    return this;
  }

  private push(t: number, input: MidiNoteOn | MidiNoteOff): void {
    this.frames.push({
      t,
      source: this.source,
      stream: this.stream,
      inputs: [input],
    });
  }
}

function buildProductionPipeline(): {
  pipeline: VisualPipeline;
  adapter: ScriptedMidiAdapter;
} {
  const partId = "main";
  const pipeline = new VisualPipeline({
    canvasSize: { width: 800, height: 600 },
    rngSeed: 42,
    partId,
  });
  const adapter = new ScriptedMidiAdapter();
  pipeline.addAdapter(adapter);
  pipeline.addStabilizerFactory(
    () => new NoteTrackingStabilizer({ partId, releaseWindowMs: NOTE_RELEASE_WINDOW_MS }),
  );
  pipeline.addStabilizerFactory(() => new DynamicsStabilizer({ partId }));
  pipeline.addStabilizerFactory(
    () => new ChordDetectionStabilizer({ partId, hysteresisMs: CHORD_HYSTERESIS_MS }),
  );
  pipeline.addStabilizerFactory(() => new HarmonyStabilizer({ partId }));
  pipeline.setVocabulary(new MusicalVisualVocabulary());
  pipeline.addLens(new RhythmLens());
  pipeline.addLens(new HarmonyLens());
  pipeline.addLens(new DynamicsLens());
  pipeline.setCompositor(new IdentityCompositor());
  pipeline.reset();
  return { pipeline, adapter };
}

describe("end-to-end pipeline — RawInputFrame → SceneFrame", () => {
  let pipeline: VisualPipeline;
  let adapter: ScriptedMidiAdapter;

  beforeEach(() => {
    ({ pipeline, adapter } = buildProductionPipeline());
  });

  it("empty input produces the scaffold but no note-driven entities", () => {
    const frame = pipeline.requestFrame(100);
    expect(frame.t).toBe(100);
    // NOW line is always rendered by RhythmLens even with no notes.
    expect(ofType(frame, "now-line")).toHaveLength(1);
    expect(ofType(frame, "note-strip")).toHaveLength(0);
    expect(dynamicsIndicators(frame)).toHaveLength(0);
  });

  it("single note produces one note-strip on the rhythm timeline", () => {
    adapter.noteOn(60, 100, 0); // Middle C, velocity 100, at t=0
    pipeline.requestFrame(50);
    const frame = pipeline.requestFrame(100);
    expect(stripPitchClasses(frame)).toEqual([0]);
  });

  it("C major triad played simultaneously drives all three lenses", () => {
    // HarmonyLens only renders the clock and chord shapes when a key is
    // prescribed. Set C major so the wiring exercises the full harmony path.
    pipeline.setKey({ root: 0, mode: "ionian" });
    adapter.noteOn(60, 100, 0); // C
    adapter.noteOn(64, 100, 0); // E
    adapter.noteOn(67, 100, 0); // G
    // The scripted adapter delivers one note per frame; the triad is
    // complete at lastNoteFrame and displays once hysteresis clears.
    pipeline.requestFrame(50);
    pipeline.requestFrame(100);
    const lastNoteFrame = 200;
    pipeline.requestFrame(lastNoteFrame);
    const frame = pipeline.requestFrame(lastNoteFrame + CHORD_HYSTERESIS_MS + 1);

    // Rhythm lens: one note-strip per pitch.
    expect(stripPitchClasses(frame)).toEqual([0, 4, 7]);
    // Harmony lens: the detected chord is drawn.
    expect(ofType(frame, "chord-shape")).toHaveLength(1);
    // Dynamics lens: one indicator per note onset.
    expect(dynamicsIndicators(frame)).toHaveLength(3);
  });

  it("noteOff transitions the note through release phase and eventually removes it", () => {
    adapter.noteOn(60, 100, 0);
    pipeline.requestFrame(100);
    const noteOffAt = 200;
    adapter.noteOff(60, noteOffAt);
    pipeline.requestFrame(250);

    // Still visible, in release, during the fade.
    const midRelease = ofType(pipeline.requestFrame(300), "note-strip");
    expect(midRelease).toHaveLength(1);
    expect(midRelease[0].data?.phase).toBe("release");

    // Past the release window the stabilizer has dropped the note.
    const cleanFrame = pipeline.requestFrame(noteOffAt + NOTE_RELEASE_WINDOW_MS + 1);
    expect(ofType(cleanFrame, "note-strip")).toHaveLength(0);
  });

  it("SceneFrame diagnostics are empty in the happy path", () => {
    adapter.noteOn(60, 100, 0);
    const frame = pipeline.requestFrame(100);
    expect(frame.diagnostics).toEqual([]);
  });

  it("compositor merges entity streams from all lenses into one SceneFrame", () => {
    adapter.noteOn(60, 100, 0);
    adapter.noteOn(64, 100, 0);
    adapter.noteOn(67, 100, 0);
    pipeline.requestFrame(50);
    const frame = pipeline.requestFrame(100);

    // Every lens contributes to the one frame...
    const lensIds = new Set(frame.entities.map((e) => e.id.split(":")[0]));
    expect(lensIds).toEqual(new Set([rhythmLensId, harmonyLensId, dynamicsLensId]));
    // ...and ids stay unique across lenses, since the renderer matches
    // objects to entities by id.
    const ids = frame.entities.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
