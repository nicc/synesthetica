import { describe, it, expect, beforeEach } from "vitest";
import { VisualPipeline } from "../src/VisualPipeline";
import { NoteTrackingStabilizer } from "../src/stabilizers/NoteTrackingStabilizer";
import { MusicalVisualVocabulary } from "../src/vocabularies/MusicalVisualVocabulary";
import { RhythmGrammar } from "../src/grammars/RhythmGrammar";
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
      pipeline.setRuleset(new MusicalVisualVocabulary());

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(0);
      expect(frame.t).toBe(1000);
    });

    it("returns frame with only structural elements when adapter has no data", () => {
      pipeline.addAdapter(adapter);
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualVocabulary());
      pipeline.addGrammar(new RhythmGrammar());

      const frame = pipeline.requestFrame(1000);

      // RhythmGrammar always produces a NOW line even with no notes
      const noteEntities = frame.entities.filter(
        (e) => e.data?.type === "note-strip"
      );
      expect(noteEntities).toHaveLength(0);
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
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualVocabulary());
      pipeline.addGrammar(new RhythmGrammar());
      pipeline.setCompositor(new IdentityCompositor());
    });

    it("processes note_on through full pipeline", () => {
      adapter.addNoteOn(60, 100, 1000);

      const frame = pipeline.requestFrame(1000);

      // RhythmGrammar creates note-strip entities for notes
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
      adapter.addNoteOn(60, 127, 1000); // C4, loud
      adapter.addNoteOn(64, 64, 1000); // E4, medium
      adapter.addNoteOn(67, 32, 1000); // G4, soft

      const frame = pipeline.requestFrame(1000);

      // The pipeline processes all three notes through the stabilizer
      // and into distinct note-strip entities. Velocity does not
      // currently modulate visual output in RhythmGrammar (strips are
      // uniform-width by design); pitch class differentiates the three
      // via hue (see Invariant I15 in SPEC 004 for the hue vs
      // brightness roles).
      const noteStrips = frame.entities.filter(
        (e) => e.data?.type === "note-strip",
      );
      expect(noteStrips).toHaveLength(3);

      // Each strip carries a distinct pitch class in its data payload.
      const pitchClasses = noteStrips.map((e) => e.data?.pitchClass);
      expect(new Set(pitchClasses).size).toBe(3);
    });
  });

  describe("activity tracking", () => {
    beforeEach(() => {
      pipeline.addAdapter(adapter);
      pipeline.setStabilizerFactory(
        () => new NoteTrackingStabilizer({ partId: "test-part" })
      );
      pipeline.setRuleset(new MusicalVisualVocabulary());
      pipeline.addGrammar(new RhythmGrammar());
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
      pipeline.setRuleset(new MusicalVisualVocabulary());
      pipeline.addGrammar(new RhythmGrammar());

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
      pipeline.setRuleset(new MusicalVisualVocabulary());
      pipeline.addGrammar(new RhythmGrammar());

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
      pipeline.setRuleset(new MusicalVisualVocabulary());
      pipeline.addGrammar(new RhythmGrammar());
      // No compositor set

      adapter.addNoteOn(60, 100, 1000);
      const frame = pipeline.requestFrame(1000);

      // Should still produce entities
      expect(frame.entities.length).toBeGreaterThan(0);
      expect(frame.t).toBe(1000);
    });
  });

  describe("setMacro routing", () => {
    it("routes rhythm:* macros to the RhythmGrammar via setMacros", () => {
      const rhythm = new RhythmGrammar();
      pipeline.addGrammar(rhythm);
      pipeline.setMacro("rhythm:horizon", 0.4);
      expect(rhythm.getMacros().horizon).toBe(0.4);
    });

    it("kebab-case → camelCase param mapping", () => {
      const rhythm = new RhythmGrammar();
      pipeline.addGrammar(rhythm);
      pipeline.setMacro("rhythm:pulse-intensity", 0.8);
      expect(rhythm.getMacros().pulseIntensity).toBe(0.8);
      pipeline.setMacro("rhythm:reference-linger", 2.1);
      expect(rhythm.getMacros().referenceLinger).toBe(2.1);
      pipeline.setMacro("rhythm:tightness-tolerance", 50);
      expect(rhythm.getMacros().tightnessTolerance).toBe(50);
    });

    it("silently drops unscoped names — no crash", () => {
      pipeline.addGrammar(new RhythmGrammar());
      expect(() => pipeline.setMacro("time-horizon", 0.5)).not.toThrow();
    });

    it("silently drops names whose scope matches no grammar", () => {
      pipeline.addGrammar(new RhythmGrammar());
      expect(() => pipeline.setMacro("system:colour-mapping:reference", 90)).not.toThrow();
    });

    it("does not deliver a rhythm:* name to a non-rhythm grammar", () => {
      const rhythm = new RhythmGrammar();
      pipeline.addGrammar(rhythm);
      // Confirms only the scope-matching grammar receives the write.
      const before = { ...rhythm.getMacros() };
      pipeline.setMacro("harmony:linger", 4);
      expect(rhythm.getMacros()).toEqual(before);
    });

    it("routes harmony:* stabilizer macros to ChordDetectionStabilizer.setConfig", async () => {
      // Import + wire the stabilizer via addStabilizerFactory so the
      // pipeline instantiates it into a partState we can then hit
      // with setMacro.
      const { ChordDetectionStabilizer } = await import(
        "../src/stabilizers/ChordDetectionStabilizer"
      );
      pipeline.addAdapter(adapter);
      pipeline.addStabilizerFactory(
        () => new ChordDetectionStabilizer({ partId: "test-part" }),
      );
      // Force part-state creation by requesting a frame.
      pipeline.requestFrame(0);

      pipeline.setMacro("harmony:arpeggio-tolerance", 1200);
      pipeline.setMacro("harmony:note-threshold", 4);
      pipeline.setMacro("harmony:detection-stability", 150);

      // Reach into the pipeline's part state to inspect the
      // stabilizer's config directly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const partStates = (pipeline as any).partStates as Map<string, { stabilizers: Array<{ id: string; getConfig?: () => Record<string, unknown> }> }>;
      const state = partStates.get("test-part");
      const chord = state?.stabilizers.find((s) => s.id === "chord-detection");
      const cfg = chord?.getConfig?.() as {
        pitchDecayMs: number;
        minPitchClasses: number;
        hysteresisMs: number;
      };
      expect(cfg.pitchDecayMs).toBe(1200);
      expect(cfg.minPitchClasses).toBe(4);
      expect(cfg.hysteresisMs).toBe(150);
    });
  });
});
