import { describe, it, expect, beforeEach } from "vitest";
import { VisualPipeline } from "../src/VisualPipeline";
import { NoteTrackingStabilizer } from "../src/stabilizers/NoteTrackingStabilizer";
import { MusicalVisualVocabulary } from "../src/vocabularies/MusicalVisualVocabulary";
import { RhythmLens } from "../src/lenses/RhythmLens";
import { IdentityCompositor } from "../src/stubs/IdentityCompositor";
import type {
  IRawSourceAdapter,
  RawInputFrame,
  MidiNoteOn,
  MidiNoteOff,
  SceneFrame,
} from "@synesthetica/contracts";
import { pcToHue } from "@synesthetica/contracts";
import { createTestMusicalFrame } from "./_harness/frames";

/** Note-strip entities only. The now-line and note-name labels are
 *  always present, so counts over all entities prove nothing. */
function noteStrips(frame: SceneFrame) {
  return frame.entities.filter((e) => e.data?.type === "note-strip");
}

function stripPitchClasses(frame: SceneFrame): number[] {
  return noteStrips(frame)
    .map((e) => e.data?.pitchClass as number)
    .sort((a, b) => a - b);
}

/**
 * Mock adapter that returns pre-configured frames.
 */
class MockRawAdapter implements IRawSourceAdapter {
  readonly source = "mock";
  readonly stream = "test";

  private frames: RawInputFrame[] = [];
  private index = 0;

  nextFrame(): RawInputFrame | null {
    if (this.index >= this.frames.length) {
      return null;
    }
    return this.frames[this.index++];
  }

  addNoteOn(
    note: number,
    velocity: number,
    t: number,
    channel = 0
  ): void {
    const input: MidiNoteOn = {
      type: "midi_note_on",
      t,
      note,
      velocity,
      channel,
    };
    this.addInput(t, input);
  }

  addNoteOff(note: number, t: number, channel = 0): void {
    const input: MidiNoteOff = {
      type: "midi_note_off",
      t,
      note,
      channel,
    };
    this.addInput(t, input);
  }

  private addInput(t: number, input: MidiNoteOn | MidiNoteOff): void {
    // Find or create frame at this time
    let frame = this.frames.find((f) => f.t === t);
    if (!frame) {
      frame = {
        t,
        source: "mock",
        stream: "test",
        inputs: [],
      };
      this.frames.push(frame);
      // Keep frames sorted by time
      this.frames.sort((a, b) => a.t - b.t);
    }
    frame.inputs.push(input);
  }

  addEmptyFrame(t: number): void {
    this.frames.push({
      t,
      source: "mock",
      stream: "test",
      inputs: [],
    });
  }

  reset(): void {
    this.index = 0;
  }
}

describe("VisualPipeline", () => {
  let pipeline: VisualPipeline;
  let adapter: MockRawAdapter;

  beforeEach(() => {
    pipeline = new VisualPipeline({
      canvasSize: { width: 800, height: 600 },
      rngSeed: 12345,
      partId: "test-part",
    });
    adapter = new MockRawAdapter();
  });

  describe("basic operation", () => {
    it("returns empty frame when no adapters", () => {
      pipeline.setVocabulary(new MusicalVisualVocabulary());

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(0);
      expect(frame.t).toBe(1000);
    });

    it("returns frame with only structural elements when adapter has no data", () => {
      pipeline.addAdapter(adapter);
      pipeline.addStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setVocabulary(new MusicalVisualVocabulary());
      pipeline.addLens(new RhythmLens());

      const frame = pipeline.requestFrame(1000);

      // RhythmLens always produces a NOW line even with no notes
      const noteEntities = frame.entities.filter(
        (e) => e.data?.type === "note-strip"
      );
      expect(noteEntities).toHaveLength(0);
    });

    it("removeAdapter stops the removed adapter's input without touching consumers", () => {
      const adapter2 = new MockRawAdapter();
      pipeline.addAdapter(adapter);
      pipeline.addAdapter(adapter2);
      pipeline.addStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setVocabulary(new MusicalVisualVocabulary());
      pipeline.addLens(new RhythmLens());

      adapter.addNoteOn(60, 100, 0); // C, via the adapter we will remove
      adapter2.addNoteOn(64, 100, 0); // E
      adapter.addNoteOn(62, 100, 100); // D — must never arrive
      adapter2.addNoteOn(65, 100, 100); // F

      expect(stripPitchClasses(pipeline.requestFrame(0))).toEqual([0, 4]);

      pipeline.removeAdapter(adapter);

      // D from the removed adapter is absent; F from the survivor
      // arrives; the held C survives because stabilizer state does.
      expect(stripPitchClasses(pipeline.requestFrame(100))).toEqual([0, 4, 5]);
    });

    it("emits warning when no vocabulary configured", () => {
      pipeline.addAdapter(adapter);

      const frame = pipeline.requestFrame(1000);

      expect(frame.diagnostics).toHaveLength(1);
      expect(frame.diagnostics[0].id).toContain("pipeline-no-vocabulary");
      expect(frame.diagnostics[0].severity).toBe("warning");
    });
  });

  describe("full pipeline flow", () => {
    beforeEach(() => {
      pipeline.addAdapter(adapter);
      pipeline.addStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setVocabulary(new MusicalVisualVocabulary());
      pipeline.addLens(new RhythmLens());
      pipeline.setCompositor(new IdentityCompositor());
    });

    it("processes note_on through full pipeline", () => {
      adapter.addNoteOn(60, 100, 1000);

      const frame = pipeline.requestFrame(1000);

      const strips = noteStrips(frame);
      expect(strips).toHaveLength(1);
      expect(strips[0].part).toBe("test-part");
      expect(strips[0].data?.pitchClass).toBe(0);
    });

    it("colours a note strip by its pitch class through the vocabulary's hue invariant", () => {
      // The invariant comes from the vocabulary itself, so retuning the
      // colour anchor cannot break this test.
      const { hueInvariant } = new MusicalVisualVocabulary().annotate(
        createTestMusicalFrame(0, "test-part"),
      );
      adapter.addNoteOn(69, 100, 1000); // A, pitch class 9

      const strips = noteStrips(pipeline.requestFrame(1000));

      expect(strips).toHaveLength(1);
      expect(strips[0].style.color?.h).toBe(pcToHue(9, hueInvariant));
    });

    it("keeps the same note strip while the note is held", () => {
      adapter.addNoteOn(60, 100, 1000);

      const frame1 = pipeline.requestFrame(1000);
      adapter.addEmptyFrame(1500);
      const frame2 = pipeline.requestFrame(1500);

      expect(noteStrips(frame1)).toHaveLength(1);
      expect(noteStrips(frame2)).toHaveLength(1);
      expect(noteStrips(frame2)[0].id).toBe(noteStrips(frame1)[0].id);
    });

    it("produces one note strip per simultaneous note, whatever the velocity", () => {
      // Velocity does not modulate RhythmLens strips (uniform width by
      // design); pitch class differentiates them via hue (SPEC 004 I15).
      adapter.addNoteOn(60, 127, 1000); // C, loud
      adapter.addNoteOn(64, 64, 1000); // E, medium
      adapter.addNoteOn(67, 32, 1000); // G, soft

      expect(stripPitchClasses(pipeline.requestFrame(1000))).toEqual([0, 4, 7]);
    });
  });

  describe("activity tracking", () => {
    beforeEach(() => {
      pipeline.addAdapter(adapter);
      pipeline.addStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setVocabulary(new MusicalVisualVocabulary());
      pipeline.addLens(new RhythmLens());
    });

    it("tracks activity when notes are played", () => {
      adapter.addNoteOn(60, 100, 1000);
      pipeline.requestFrame(1000);

      const mostActive = pipeline.getMostActive(5000);
      expect(mostActive).toBe("test-part");
    });

    it("returns null when no activity in window", () => {
      const mostActive = pipeline.getMostActive(5000);
      expect(mostActive).toBeNull();
    });
  });

  describe("lifecycle", () => {
    it("reset clears all state", () => {
      pipeline.addAdapter(adapter);
      pipeline.addStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setVocabulary(new MusicalVisualVocabulary());
      pipeline.addLens(new RhythmLens());

      adapter.addNoteOn(60, 100, 1000);
      pipeline.requestFrame(1000);
      expect(pipeline.getMostActive(5000)).toBe("test-part");

      pipeline.reset();
      expect(pipeline.getMostActive(5000)).toBeNull();
    });

    it("dispose clears components", () => {
      pipeline.addAdapter(adapter);
      pipeline.addStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setVocabulary(new MusicalVisualVocabulary());
      pipeline.addLens(new RhythmLens());

      pipeline.dispose();

      // After dispose, requesting a frame should work but produce no output
      adapter.addNoteOn(60, 100, 2000);
      const frame = pipeline.requestFrame(2000);
      expect(frame.entities).toHaveLength(0);
    });
  });

  describe("without compositor", () => {
    it("still produces scene frames", () => {
      pipeline.addAdapter(adapter);
      pipeline.addStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setVocabulary(new MusicalVisualVocabulary());
      pipeline.addLens(new RhythmLens());
      // No compositor set

      adapter.addNoteOn(60, 100, 1000);
      const frame = pipeline.requestFrame(1000);

      expect(stripPitchClasses(frame)).toEqual([0]);
      expect(frame.t).toBe(1000);
    });
  });

  // Positive routing (every manifest macro reaches its consumer) lives
  // in wiringCoverage.test.ts. These cover names that must NOT land.
  describe("setMacro routing", () => {
    it("drops unscoped names without touching the lens", () => {
      const rhythm = new RhythmLens();
      pipeline.addLens(rhythm);
      const before = { ...rhythm.getMacros() };
      pipeline.setMacro("time-horizon", 0.5);
      expect(rhythm.getMacros()).toEqual(before);
    });

    it("drops names whose scope matches no lens", () => {
      const rhythm = new RhythmLens();
      pipeline.addLens(rhythm);
      const before = { ...rhythm.getMacros() };
      pipeline.setMacro("system:colour-mapping:reference", 90);
      expect(rhythm.getMacros()).toEqual(before);
    });

    it("does not deliver a harmony:* name to the rhythm lens", () => {
      const rhythm = new RhythmLens();
      pipeline.addLens(rhythm);
      const before = { ...rhythm.getMacros() };
      pipeline.setMacro("harmony:linger", 4);
      expect(rhythm.getMacros()).toEqual(before);
    });
  });
});
