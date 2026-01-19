import { describe, it, expect, beforeEach } from "vitest";
import { VisualPipeline } from "../src/VisualPipeline";
import { NoteTrackingStabilizer } from "../src/stabilizers/NoteTrackingStabilizer";
import { MusicalVisualRuleset } from "../src/rulesets/MusicalVisualRuleset";
import { TestRhythmGrammar } from "../src/grammars/TestRhythmGrammar";
import { IdentityCompositor } from "../src/stubs/IdentityCompositor";
import type {
  IRawSourceAdapter,
  RawInputFrame,
  MidiNoteOn,
  MidiNoteOff,
} from "@synesthetica/contracts";

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
      pipeline.setRuleset(new MusicalVisualRuleset());

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(0);
      expect(frame.t).toBe(1000);
    });

    it("returns empty frame when adapter has no data", () => {
      pipeline.addAdapter(adapter);
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualRuleset());
      pipeline.addGrammar(new TestRhythmGrammar());

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(0);
    });

    it("emits warning when no ruleset configured", () => {
      pipeline.addAdapter(adapter);

      const frame = pipeline.requestFrame(1000);

      expect(frame.diagnostics).toHaveLength(1);
      expect(frame.diagnostics[0].id).toContain("pipeline-no-ruleset");
      expect(frame.diagnostics[0].severity).toBe("warning");
    });
  });

  describe("full pipeline flow", () => {
    beforeEach(() => {
      pipeline.addAdapter(adapter);
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualRuleset());
      pipeline.addGrammar(new TestRhythmGrammar());
      pipeline.setCompositor(new IdentityCompositor());
    });

    it("processes note_on through full pipeline", () => {
      adapter.addNoteOn(60, 100, 1000);

      const frame = pipeline.requestFrame(1000);

      // TestRhythmGrammar creates timing markers for notes
      expect(frame.entities.length).toBeGreaterThan(0);
      expect(frame.entities[0].part).toBe("test-part");
    });

    it("creates entity with color from pitch", () => {
      // Note A (midi 69) should map to red (hue=0)
      adapter.addNoteOn(69, 100, 1000);

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities[0].style.color).toBeDefined();
      expect(frame.entities[0].style.color!.h).toBe(0); // Red
    });

    it("maintains entities while note is held", () => {
      adapter.addNoteOn(60, 100, 1000);

      // First frame
      const frame1 = pipeline.requestFrame(1000);
      const initialCount = frame1.entities.length;
      expect(initialCount).toBeGreaterThan(0);

      // Second frame - note still held
      adapter.addEmptyFrame(1500);
      const frame2 = pipeline.requestFrame(1500);
      expect(frame2.entities.length).toBeGreaterThan(0);
    });

    it("handles multiple simultaneous notes", () => {
      adapter.addNoteOn(60, 100, 1000); // C
      adapter.addNoteOn(64, 100, 1000); // E
      adapter.addNoteOn(67, 100, 1000); // G

      const frame = pipeline.requestFrame(1000);

      // Should have at least 3 entities (one per note)
      expect(frame.entities.length).toBeGreaterThanOrEqual(3);
    });

    it("handles chord with different velocities", () => {
      adapter.addNoteOn(60, 127, 1000); // Loud
      adapter.addNoteOn(64, 64, 1000); // Medium
      adapter.addNoteOn(67, 32, 1000); // Soft

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities.length).toBeGreaterThanOrEqual(3);

      // Different velocities should produce different sizes
      const sizes = frame.entities
        .filter((e) => e.data?.type === "timing-marker")
        .map((e) => e.style.size);
      if (sizes.length > 1) {
        expect(new Set(sizes).size).toBeGreaterThan(1); // Not all same size
      }
    });
  });

  describe("activity tracking", () => {
    beforeEach(() => {
      pipeline.addAdapter(adapter);
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualRuleset());
      pipeline.addGrammar(new TestRhythmGrammar());
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
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualRuleset());
      pipeline.addGrammar(new TestRhythmGrammar());

      adapter.addNoteOn(60, 100, 1000);
      pipeline.requestFrame(1000);
      expect(pipeline.getMostActive(5000)).toBe("test-part");

      pipeline.reset();
      expect(pipeline.getMostActive(5000)).toBeNull();
    });

    it("dispose clears components", () => {
      pipeline.addAdapter(adapter);
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualRuleset());
      pipeline.addGrammar(new TestRhythmGrammar());

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
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualRuleset());
      pipeline.addGrammar(new TestRhythmGrammar());
      // No compositor set

      adapter.addNoteOn(60, 100, 1000);
      const frame = pipeline.requestFrame(1000);

      // Should still produce entities
      expect(frame.entities.length).toBeGreaterThan(0);
      expect(frame.t).toBe(1000);
    });
  });
});
