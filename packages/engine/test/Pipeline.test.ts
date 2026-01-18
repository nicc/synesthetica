import { describe, it, expect, beforeEach } from "vitest";
import { Pipeline } from "../src/Pipeline";
import {
  PassthroughStabilizer,
  MinimalRuleset,
  IdentityCompositor,
  ParticleGrammar,
} from "../src/stubs";
import type {
  ISourceAdapter,
  CMSFrame,
  NoteOn,
  Provenance,
  PitchClass,
} from "@synesthetica/contracts";

/**
 * Mock adapter that returns pre-configured frames.
 */
class MockAdapter implements ISourceAdapter {
  readonly source = "mock" as const;
  readonly stream = "test";

  private frames: CMSFrame[] = [];
  private index = 0;

  constructor(frames: CMSFrame[] = []) {
    this.frames = frames;
  }

  nextFrame(): CMSFrame | null {
    if (this.index >= this.frames.length) {
      return null;
    }
    return this.frames[this.index++];
  }

  addFrame(frame: CMSFrame): void {
    this.frames.push(frame);
  }

  reset(): void {
    this.index = 0;
  }
}

function createNoteOn(
  note: number,
  velocity: number,
  t: number,
  part = "test-part"
): NoteOn {
  const provenance: Provenance = {
    source: "mock",
    stream: "test",
  };
  return {
    type: "note_on",
    t,
    part,
    note,
    velocity,
    channel: 0,
    pc: (note % 12) as PitchClass,
    octave: Math.floor(note / 12) - 1,
    provenance,
  };
}

describe("Pipeline", () => {
  let pipeline: Pipeline;
  let adapter: MockAdapter;

  beforeEach(() => {
    pipeline = new Pipeline({
      canvasSize: { width: 800, height: 600 },
      rngSeed: 12345,
    });
    adapter = new MockAdapter();
  });

  describe("basic operation", () => {
    it("returns empty frame when no adapters", () => {
      pipeline.setRuleset(new MinimalRuleset());

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(0);
      expect(frame.t).toBe(1000);
    });

    it("returns empty frame when adapter has no data", () => {
      pipeline.addAdapter(adapter);
      pipeline.setRuleset(new MinimalRuleset());
      pipeline.addGrammar(new ParticleGrammar());

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(0);
    });

    it("processes note_on through full pipeline", () => {
      adapter.addFrame({
        t: 1000,
        events: [createNoteOn(60, 100, 1000)],
        controls: [],
      });

      pipeline.addAdapter(adapter);
      pipeline.addStabilizer(new PassthroughStabilizer());
      pipeline.setRuleset(new MinimalRuleset());
      pipeline.addGrammar(new ParticleGrammar());
      pipeline.setCompositor(new IdentityCompositor());

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(1);
      expect(frame.entities[0].kind).toBe("particle");
      expect(frame.entities[0].part).toBe("test-part");
    });
  });

  describe("particle grammar", () => {
    beforeEach(() => {
      pipeline.addAdapter(adapter);
      pipeline.addStabilizer(new PassthroughStabilizer());
      pipeline.setRuleset(new MinimalRuleset());
      pipeline.addGrammar(new ParticleGrammar());
      pipeline.setCompositor(new IdentityCompositor());
    });

    it("creates particle with correct position based on note", () => {
      adapter.addFrame({
        t: 1000,
        events: [createNoteOn(60, 100, 1000)], // Middle C
        controls: [],
      });

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(1);
      const particle = frame.entities[0];

      // Middle C: pc=0, octave=4
      // x should be at left side (pc 0 of 11)
      // y should be in upper-middle area (octave 4 of ~10)
      expect(particle.position).toBeDefined();
      expect(particle.position!.x).toBeCloseTo(80, 0); // 0.1 * 800
    });

    it("creates particle with color from pitch", () => {
      // Note A (pc=9) should map to red (hue=0) per PitchHueInvariant
      adapter.addFrame({
        t: 1000,
        events: [createNoteOn(69, 100, 1000)], // A4
        controls: [],
      });

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities[0].style.color).toBeDefined();
      expect(frame.entities[0].style.color!.h).toBe(0); // Red
    });

    it("creates particle with size based on velocity", () => {
      adapter.addFrame({
        t: 1000,
        events: [createNoteOn(60, 127, 1000)], // Max velocity
        controls: [],
      });

      const frame = pipeline.requestFrame(1000);

      // Max velocity should give larger size
      expect(frame.entities[0].style.size).toBeGreaterThan(15);
    });

    it("fades particles over time", () => {
      adapter.addFrame({
        t: 1000,
        events: [createNoteOn(60, 100, 1000)],
        controls: [],
      });

      // First frame: particle created
      const frame1 = pipeline.requestFrame(1000);
      expect(frame1.entities).toHaveLength(1);
      expect(frame1.entities[0].style.opacity).toBe(1);

      // Second frame: particle aged (no new events)
      const frame2 = pipeline.requestFrame(1500);
      expect(frame2.entities).toHaveLength(1);
      expect(frame2.entities[0].style.opacity).toBeLessThan(1);

      // Third frame: particle expired
      const frame3 = pipeline.requestFrame(2500);
      expect(frame3.entities).toHaveLength(0);
    });

    it("handles multiple simultaneous notes", () => {
      adapter.addFrame({
        t: 1000,
        events: [
          createNoteOn(60, 100, 1000), // C
          createNoteOn(64, 100, 1000), // E
          createNoteOn(67, 100, 1000), // G
        ],
        controls: [],
      });

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(3);
    });
  });

  describe("activity tracking", () => {
    beforeEach(() => {
      pipeline.addAdapter(adapter);
      pipeline.addStabilizer(new PassthroughStabilizer());
      pipeline.setRuleset(new MinimalRuleset());
      pipeline.addGrammar(new ParticleGrammar());
    });

    it("tracks activity per part", () => {
      adapter.addFrame({
        t: 1000,
        events: [createNoteOn(60, 100, 1000, "piano")],
        controls: [],
      });
      pipeline.requestFrame(1000);

      const mostActive = pipeline.getMostActive(5000);
      expect(mostActive).toBe("piano");
    });

    it("returns most active part within window", () => {
      // Add activity for piano
      adapter.addFrame({
        t: 1000,
        events: [createNoteOn(60, 100, 1000, "piano")],
        controls: [],
      });
      pipeline.requestFrame(1000);

      // Add more activity for guitar
      adapter.addFrame({
        t: 2000,
        events: [
          createNoteOn(60, 100, 2000, "guitar"),
          createNoteOn(64, 100, 2000, "guitar"),
        ],
        controls: [],
      });
      pipeline.requestFrame(2000);

      const mostActive = pipeline.getMostActive(5000);
      expect(mostActive).toBe("guitar"); // More events
    });

    it("returns null when no activity in window", () => {
      const mostActive = pipeline.getMostActive(5000);
      expect(mostActive).toBeNull();
    });
  });

  describe("diagnostics", () => {
    it("emits warning when no ruleset configured", () => {
      adapter.addFrame({
        t: 1000,
        events: [createNoteOn(60, 100, 1000)],
        controls: [],
      });
      pipeline.addAdapter(adapter);
      pipeline.addGrammar(new ParticleGrammar());

      const frame = pipeline.requestFrame(1000);

      expect(frame.diagnostics).toHaveLength(1);
      expect(frame.diagnostics[0].id).toContain("pipeline-no-ruleset");
      expect(frame.diagnostics[0].severity).toBe("warning");
    });
  });

  describe("lifecycle", () => {
    it("reset clears all state", () => {
      adapter.addFrame({
        t: 1000,
        events: [createNoteOn(60, 100, 1000, "piano")],
        controls: [],
      });
      pipeline.addAdapter(adapter);
      pipeline.addStabilizer(new PassthroughStabilizer());
      pipeline.setRuleset(new MinimalRuleset());
      pipeline.addGrammar(new ParticleGrammar());

      pipeline.requestFrame(1000);
      expect(pipeline.getMostActive(5000)).toBe("piano");

      pipeline.reset();
      expect(pipeline.getMostActive(5000)).toBeNull();
    });

    it("dispose clears components", () => {
      pipeline.addAdapter(adapter);
      pipeline.addStabilizer(new PassthroughStabilizer());
      pipeline.setRuleset(new MinimalRuleset());
      pipeline.addGrammar(new ParticleGrammar());

      pipeline.dispose();

      // After dispose, requesting a frame should work but produce no output
      adapter.addFrame({
        t: 2000,
        events: [createNoteOn(60, 100, 2000)],
        controls: [],
      });

      const frame = pipeline.requestFrame(2000);
      expect(frame.entities).toHaveLength(0);
    });
  });

  describe("multiple parts", () => {
    it("processes events from different parts separately", () => {
      adapter.addFrame({
        t: 1000,
        events: [
          createNoteOn(60, 100, 1000, "piano"),
          createNoteOn(67, 100, 1000, "guitar"),
        ],
        controls: [],
      });

      pipeline.addAdapter(adapter);
      pipeline.addStabilizer(new PassthroughStabilizer());
      pipeline.setRuleset(new MinimalRuleset());
      pipeline.addGrammar(new ParticleGrammar());
      pipeline.setCompositor(new IdentityCompositor());

      const frame = pipeline.requestFrame(1000);

      expect(frame.entities).toHaveLength(2);

      const pianoPart = frame.entities.find((e) => e.part === "piano");
      const guitarPart = frame.entities.find((e) => e.part === "guitar");

      expect(pianoPart).toBeDefined();
      expect(guitarPart).toBeDefined();
    });
  });
});
