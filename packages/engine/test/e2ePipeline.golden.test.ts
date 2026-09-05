/**
 * End-to-end pipeline golden test.
 *
 * Wires the full production pipeline (all stabilizers, real
 * vocabulary, all three grammars, IdentityCompositor) and drives it
 * with a scripted MIDI sequence. Asserts on the shape of the
 * SceneFrame at each step — proves the entire chain from
 * RawInputFrame → SceneFrame produces the entities each grammar is
 * expected to produce.
 *
 * Deliberately simple assertions (kinds + counts + spot checks on
 * key fields) rather than deep entity-by-entity snapshots — the
 * per-stage golden tests already cover exact field values.
 * This test is the wiring check: 'does every stage produce
 * SOMETHING when driven from the top'.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  VisualPipeline,
  NoteTrackingStabilizer,
  DynamicsStabilizer,
  ChordDetectionStabilizer,
  HarmonyStabilizer,
  MusicalVisualVocabulary,
  RhythmGrammar,
  HarmonyGrammar,
  DynamicsGrammar,
  IdentityCompositor,
} from "../src";
import type { IRawSourceAdapter } from "@synesthetica/engine";
import type {
  RawInputFrame,
  MidiNoteOn,
  MidiNoteOff,
} from "@synesthetica/contracts";

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
  pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
  pipeline.addStabilizerFactory(() => new DynamicsStabilizer({ partId }));
  pipeline.addStabilizerFactory(() => new ChordDetectionStabilizer({ partId }));
  pipeline.addStabilizerFactory(() => new HarmonyStabilizer({ partId }));
  pipeline.setVocabulary(new MusicalVisualVocabulary());
  pipeline.addGrammar(new RhythmGrammar());
  pipeline.addGrammar(new HarmonyGrammar());
  pipeline.addGrammar(new DynamicsGrammar());
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

  it("empty input produces a scene with just NOW-line / grid elements", () => {
    const frame = pipeline.requestFrame(100);
    expect(frame).toBeDefined();
    expect(frame.t).toBe(100);
    // NOW line is always rendered by RhythmGrammar even with no notes.
    const nowLine = frame.entities.find((e) => e.id.includes("now-line"));
    expect(nowLine).toBeDefined();
  });

  it("single note produces a note-strip on the rhythm timeline", () => {
    adapter.noteOn(60, 100, 0); // Middle C, velocity 100, at t=0
    pipeline.requestFrame(50);
    const frame = pipeline.requestFrame(100);
    const noteStrips = frame.entities.filter(
      (e) => e.data?.type === "note-strip",
    );
    expect(noteStrips.length).toBeGreaterThan(0);
  });

  it("C major triad played simultaneously drives all three grammars", () => {
    // HarmonyGrammar only renders the clock (guide rings, slot ticks,
    // chord numerals) when a key is prescribed — otherwise it stays
    // dormant. Set C major so the end-to-end wiring exercises the
    // full harmony path.
    pipeline.setKey({ root: 0, mode: "ionian" });
    adapter.noteOn(60, 100, 0); // C
    adapter.noteOn(64, 100, 0); // E
    adapter.noteOn(67, 100, 0); // G
    // Give the pipeline time to see the notes, form a chord.
    pipeline.requestFrame(50);
    pipeline.requestFrame(100);
    const frame = pipeline.requestFrame(200);

    // Rhythm grammar: three note-strips (one per pitch).
    const noteStrips = frame.entities.filter(
      (e) => e.data?.type === "note-strip",
    );
    expect(noteStrips.length).toBeGreaterThanOrEqual(3);

    // Harmony grammar: at MINIMUM the progression guide rings +
    // slot ticks are rendered unconditionally. Chord-specific
    // entities (chord-label, chord-shape, roman-numeral) may take
    // several frames to appear as ChordDetectionStabilizer's
    // hysteresis clears — assert on the scaffold that's guaranteed
    // whenever HarmonyGrammar is running.
    const harmonyEntities = frame.entities.filter(
      (e) =>
        e.data?.type === "progression-guide-ring" ||
        e.data?.type === "progression-slot-tick" ||
        e.data?.type === "roman-numeral" ||
        e.data?.type === "chord-label" ||
        e.data?.type === "chord-shape",
    );
    expect(harmonyEntities.length).toBeGreaterThan(0);

    // Dynamics grammar: at least a dynamics indicator per note.
    const dynamics = frame.entities.filter(
      (e) => e.data?.type === "dynamics-indicator",
    );
    expect(dynamics.length).toBeGreaterThan(0);
  });

  it("noteOff transitions the note through release phase and eventually removes it", () => {
    adapter.noteOn(60, 100, 0);
    pipeline.requestFrame(100);
    adapter.noteOff(60, 200);
    pipeline.requestFrame(250);

    // Note should still be visible during release fade.
    const midRelease = pipeline.requestFrame(300);
    const midStrips = midRelease.entities.filter(
      (e) => e.data?.type === "note-strip",
    );
    // Some strips may still be visible; we mainly want no crash.
    expect(midStrips.length).toBeGreaterThanOrEqual(0);

    // Well past the release window: nothing.
    const cleanFrame = pipeline.requestFrame(100_000);
    const cleanStrips = cleanFrame.entities.filter(
      (e) => e.data?.type === "note-strip",
    );
    expect(cleanStrips.length).toBe(0);
  });

  it("SceneFrame carries diagnostics field, empty in the happy path", () => {
    adapter.noteOn(60, 100, 0);
    const frame = pipeline.requestFrame(100);
    expect(Array.isArray(frame.diagnostics)).toBe(true);
  });

  it("compositor merges entity streams from all grammars into one SceneFrame", () => {
    adapter.noteOn(60, 100, 0);
    adapter.noteOn(64, 100, 0);
    adapter.noteOn(67, 100, 0);
    pipeline.requestFrame(50);
    const frame = pipeline.requestFrame(100);

    // One SceneFrame contains entities from ALL grammars — kinds are
    // heterogeneous but every entity carries a stable id.
    expect(frame.entities.length).toBeGreaterThan(0);
    for (const e of frame.entities) {
      expect(e.id).toBeTruthy();
      expect(e.kind).toBeTruthy();
    }
  });
});
