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
