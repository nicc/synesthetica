import { describe, it, expect, beforeEach } from "vitest";
import { VisualPipeline } from "../src/VisualPipeline";
import { NoteTrackingStabilizer } from "../src/stabilizers/NoteTrackingStabilizer";
import { MusicalVisualRuleset } from "../src/rulesets/MusicalVisualRuleset";
import { VisualParticleGrammar } from "../src/grammars/VisualParticleGrammar";
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
      pipeline.addGrammar(new VisualParticleGrammar());

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
      pipeline.addGrammar(new VisualParticleGrammar());
      pipeline.setCompositor(new IdentityCompositor());
    });

    it("processes note_on through full pipeline", () => {
      adapter.addNoteOn(60, 100, 1000);

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(1);
      expect(frame.entities[0].kind).toBe("particle");
      expect(frame.entities[0].part).toBe("test-part");
    });

    it("creates particle with color from pitch", () => {
      // Note A (midi 69) should map to red (hue=0)
      adapter.addNoteOn(69, 100, 1000);

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities[0].style.color).toBeDefined();
      expect(frame.entities[0].style.color!.h).toBe(0); // Red
    });

    it("maintains particles while note is held", () => {
      adapter.addNoteOn(60, 100, 1000);

      // First frame
      const frame1 = pipeline.requestFrame(1000);
      expect(frame1.entities).toHaveLength(1);

      // Second frame - note still held
      adapter.addEmptyFrame(1500);
      const frame2 = pipeline.requestFrame(1500);
      expect(frame2.entities).toHaveLength(1);
    });

    it("fades particles after note release", () => {
      adapter.addNoteOn(60, 100, 1000);

      // Note on
      pipeline.requestFrame(1000);

      adapter.addNoteOff(60, 1500);

      // Note released - still visible during release window
      const frame2 = pipeline.requestFrame(1500);
      expect(frame2.entities).toHaveLength(1);

      // After release window (stabilizer default 500ms)
      // Intent disappears when note expires from stabilizer
      adapter.addEmptyFrame(2100);
      const frame3 = pipeline.requestFrame(2100);
      // Intent should be gone (note expired from stabilizer)
      // But grammar still shows entity (fading)
      expect(frame3.entities).toHaveLength(1);

      // After grammar fade (default 500ms from intent disappearing)
      adapter.addEmptyFrame(2700);
      const frame4 = pipeline.requestFrame(2700);

      // Note should be gone or very faded
      if (frame4.entities.length > 0) {
        expect(frame4.entities[0].style.opacity).toBeLessThan(0.2);
      }
    });

    it("handles multiple simultaneous notes", () => {
      adapter.addNoteOn(60, 100, 1000); // C
      adapter.addNoteOn(64, 100, 1000); // E
      adapter.addNoteOn(67, 100, 1000); // G

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(3);
    });

    it("handles chord with different velocities", () => {
      adapter.addNoteOn(60, 127, 1000); // Loud
      adapter.addNoteOn(64, 64, 1000); // Medium
      adapter.addNoteOn(67, 32, 1000); // Soft

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(3);

      // Different velocities should produce different sizes
      const sizes = frame.entities.map((e) => e.style.size);
      expect(new Set(sizes).size).toBeGreaterThan(1); // Not all same size
    });
  });

  describe("activity tracking", () => {
    beforeEach(() => {
      pipeline.addAdapter(adapter);
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualRuleset());
      pipeline.addGrammar(new VisualParticleGrammar());
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
      pipeline.addGrammar(new VisualParticleGrammar());

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
      pipeline.addGrammar(new VisualParticleGrammar());

      pipeline.dispose();

      // After dispose, requesting a frame should work but produce no output
      adapter.addNoteOn(60, 100, 2000);
      const frame = pipeline.requestFrame(2000);
      expect(frame.entities).toHaveLength(0);
    });
  });

  describe("note phase visualization", () => {
    beforeEach(() => {
      pipeline.addAdapter(adapter);
      pipeline.setStabilizerFactory(
        () =>
          new NoteTrackingStabilizer({
            partId: "test-part",
            attackDurationMs: 50,
            releaseWindowMs: 500,
          })
      );
      pipeline.setRuleset(new MusicalVisualRuleset());
      pipeline.addGrammar(new VisualParticleGrammar());
    });

    it("entity reflects attack phase with low stability", () => {
      adapter.addNoteOn(60, 100, 1000);

      // Immediately after note-on (attack phase)
      const frame = pipeline.requestFrame(1000);

      // Attack phase should have lower stability in entity data
      expect(frame.entities).toHaveLength(1);
      expect(frame.entities[0].data?.stability).toBe(0.3);
    });

    it("entity reflects sustain phase with high stability", () => {
      adapter.addNoteOn(60, 100, 1000);

      // Process note-on (attack phase)
      pipeline.requestFrame(1000);

      // After attack duration (sustain phase)
      adapter.addEmptyFrame(1100);
      const frame = pipeline.requestFrame(1100);

      expect(frame.entities).toHaveLength(1);
      expect(frame.entities[0].data?.stability).toBe(0.8);
    });

    it("entity reflects release phase with medium stability", () => {
      adapter.addNoteOn(60, 100, 1000);

      // Process note-on
      pipeline.requestFrame(1000);

      adapter.addNoteOff(60, 1200);

      // After note off (release phase)
      const frame = pipeline.requestFrame(1200);

      expect(frame.entities).toHaveLength(1);
      expect(frame.entities[0].data?.stability).toBe(0.5);
    });
  });

  describe("without compositor", () => {
    it("still produces scene frames", () => {
      pipeline.addAdapter(adapter);
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualRuleset());
      pipeline.addGrammar(new VisualParticleGrammar());
      // No compositor set

      adapter.addNoteOn(60, 100, 1000);
      const frame = pipeline.requestFrame(1000);

      // Should still produce entities
      expect(frame.entities.length).toBe(1);
      expect(frame.t).toBe(1000);
    });
  });
});
