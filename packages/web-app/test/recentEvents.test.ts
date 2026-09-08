// Node-friendly unit test: exercises the pipeline + buffer diff
// logic. Doesn't need jsdom.
import { describe, it, expect } from "vitest";
import {
  VisualPipeline,
  NoteTrackingStabilizer,
} from "@synesthetica/engine";
import { attachRecentEventsBuffer } from "../src/engine/recentEvents.js";
import type { IRawSourceAdapter } from "@synesthetica/engine";
import type { RawInputFrame, RawInput } from "@synesthetica/contracts";

/** Minimal fake adapter that emits pre-queued raw frames on nextFrame(). */
class FakeAdapter implements IRawSourceAdapter {
  private queue: RawInputFrame[] = [];
  constructor(private source: string, private stream: string) {}
  nextFrame(): RawInputFrame | null {
    return this.queue.shift() ?? null;
  }
  private push(t: number, input: RawInput): void {
    this.queue.push({
      t,
      source: this.source,
      stream: this.stream,
      inputs: [input],
    });
  }
  emitNoteOn(midi: number, velocity: number, t: number): void {
    this.push(t, { type: "midi_note_on", t, note: midi, velocity, channel: 0 });
  }
  emitNoteOff(midi: number, t: number): void {
    this.push(t, { type: "midi_note_off", t, note: midi, channel: 0 });
  }
  /** Queue a single raw frame carrying multiple inputs. Used to exercise
   *  within-frame ordering: the pipeline collects one raw frame per
   *  requestFrame(), so multiple emitNoteOn/Off calls queue *separate*
   *  frames — this helper is the way to put two events in the same
   *  batch as far as the buffer is concerned. */
  emitFrame(t: number, inputs: RawInput[]): void {
    this.queue.push({
      t,
      source: this.source,
      stream: this.stream,
      inputs,
    });
  }
}

function buildPipeline(): { pipeline: VisualPipeline; adapter: FakeAdapter } {
  const partId = "main";
  const pipeline = new VisualPipeline({
    canvasSize: { width: 100, height: 100 },
    rngSeed: 42,
    partId,
  });
  const adapter = new FakeAdapter("fake-source", "fake-stream");
  pipeline.addAdapter(adapter);
  pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
  pipeline.reset();
  return { pipeline, adapter };
}

describe("recent-events buffer — note-on capture", () => {
  it("emits a note-on when a fresh note appears in the musical frame", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });

    adapter.emitNoteOn(60, 100, 0);
    pipeline.requestFrame(10);

    const events = buf.get(100);
    const noteOns = events.filter((e) => e.kind === "note-on");
    expect(noteOns).toHaveLength(1);
    expect(noteOns[0].pitch).toBe(60);
    expect(noteOns[0].pitchClass).toBe(0);
    expect(noteOns[0].velocity).toBe(100);
    expect(noteOns[0].kind).toBe("note-on");
  });

  it("does NOT emit a duplicate note-on for a note that persists across frames", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });

    adapter.emitNoteOn(60, 100, 0);
    pipeline.requestFrame(10);
    pipeline.requestFrame(20);
    pipeline.requestFrame(30);

    const noteOns = buf.get(100).filter((e) => e.kind === "note-on");
    expect(noteOns).toHaveLength(1);
  });

  it("stamps note-on with event time (t = onset) and frame time (frameT)", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });

    // Note-on event happens at t=3 (event clock), frame boundary at t=10.
    adapter.emitNoteOn(60, 100, 3);
    pipeline.requestFrame(10);

    const [event] = buf.get(100).filter((e) => e.kind === "note-on");
    expect(event.t).toBe(3);
    expect(event.frameT).toBe(10);
  });
});

describe("recent-events buffer — note-off capture", () => {
  it("emits note-off on the sustain→release phase transition (not on prune)", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });

    adapter.emitNoteOn(60, 100, 0);
    pipeline.requestFrame(10);
    adapter.emitNoteOff(60, 500);
    pipeline.requestFrame(510);

    const noteOffs = buf.get(100).filter((e) => e.kind === "note-off");
    expect(noteOffs).toHaveLength(1);
    // Event clock = release time, NOT prune time (would be 10500ms).
    expect(noteOffs[0].t).toBe(500);
    // Frame clock = the frame boundary at which the buffer noticed.
    expect(noteOffs[0].frameT).toBe(510);
  });

  it("note-off carries pitch, pitchClass, octave, velocity for standalone reads", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });

    adapter.emitNoteOn(64, 90, 0); // E4
    pipeline.requestFrame(10);
    adapter.emitNoteOff(64, 400);
    pipeline.requestFrame(410);

    const [off] = buf.get(100).filter((e) => e.kind === "note-off");
    expect(off.pitch).toBe(64);
    expect(off.pitchClass).toBe(4);
    expect(off.octave).toBe(4);
    expect(off.velocity).toBe(90);
    expect(off.noteId).toBeTypeOf("string");
  });

  it("within a single frame batch, events are sorted by t before ids are assigned", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });

    // Two note-ons in the same raw frame — order them back-to-front
    // relative to their event clocks. The buffer must reorder them
    // so ids agree with t.
    adapter.emitFrame(30, [
      { type: "midi_note_on", t: 20, note: 60, velocity: 100, channel: 0 },
      { type: "midi_note_on", t: 5, note: 64, velocity: 100, channel: 0 },
    ]);
    pipeline.requestFrame(30);

    const events = buf.get(100).filter((e) => e.kind === "note-on");
    expect(events).toHaveLength(2);
    // Ids monotonic — always.
    expect(events[1].id).toBeGreaterThan(events[0].id);
    // Within-batch, id order agrees with t order.
    expect(events[0].t).toBe(5);
    expect(events[1].t).toBe(20);
  });

  it("does NOT emit a duplicate note-off when the released note lingers across frames", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });

    adapter.emitNoteOn(60, 100, 0);
    pipeline.requestFrame(10);
    adapter.emitNoteOff(60, 500);
    pipeline.requestFrame(510);
    // Note stays in the frame during its release tail — must not
    // re-emit note-off on subsequent frames.
    pipeline.requestFrame(600);
    pipeline.requestFrame(700);

    const noteOffs = buf.get(100).filter((e) => e.kind === "note-off");
    expect(noteOffs).toHaveLength(1);
  });
});

describe("recent-events buffer — ring capacity + queries", () => {
  it("evicts oldest events when capacity is exceeded", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 3 });

    for (let i = 0; i < 5; i++) {
      adapter.emitNoteOn(60 + i, 100, i * 10);
      pipeline.requestFrame(i * 10 + 5);
    }

    const events = buf.get(100);
    // Only the last 3 fit.
    expect(events).toHaveLength(3);
    expect(buf.countCaptured()).toBe(5);
  });

  it("since filter returns only events after the given id", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });

    for (let i = 0; i < 5; i++) {
      adapter.emitNoteOn(60 + i, 100, i * 10);
      pipeline.requestFrame(i * 10 + 5);
    }

    const afterFirstThree = buf.get(100, 2);
    expect(afterFirstThree.every((e) => e.id > 2)).toBe(true);
    expect(afterFirstThree).toHaveLength(2);
  });

  it("clear() drops the buffer + resets diff state", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });

    adapter.emitNoteOn(60, 100, 0);
    pipeline.requestFrame(10);
    buf.clear();
    expect(buf.get(100)).toEqual([]);

    // After clear, the SAME note id would look "fresh" — the diff
    // state reset means it emits a new note-on. That's fine; buffer
    // is cleared on session teardown when a new session starts anyway.
  });

  it("dispose() detaches the pipeline subscription", () => {
    const { pipeline, adapter } = buildPipeline();
    const buf = attachRecentEventsBuffer(pipeline, { capacity: 100 });
    buf.dispose();

    // Post-dispose activity should not accumulate.
    adapter.emitNoteOn(60, 100, 0);
    pipeline.requestFrame(10);
    expect(buf.get(100)).toEqual([]);
  });
});
