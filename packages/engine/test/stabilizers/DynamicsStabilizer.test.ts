import { describe, it, expect, beforeEach } from "vitest";
import { DynamicsStabilizer } from "../../src/stabilizers/DynamicsStabilizer";
import { NoteTrackingStabilizer } from "../../src/stabilizers/NoteTrackingStabilizer";
import type { RawInputFrame, MidiNoteOn, MidiNoteOff, MusicalFrame } from "@synesthetica/contracts";

function makeFrame(t: number, inputs: (MidiNoteOn | MidiNoteOff)[]): RawInputFrame {
  return {
    t,
    source: "midi",
    stream: "test",
    inputs,
  };
}

function noteOn(note: number, velocity: number, t: number, channel = 0): MidiNoteOn {
  return { type: "midi_note_on", note, velocity, t, channel };
}

function _noteOff(note: number, t: number, channel = 0): MidiNoteOff {
  return { type: "midi_note_off", note, t, channel };
}

describe("DynamicsStabilizer", () => {
  let noteTracker: NoteTrackingStabilizer;
  let dynamics: DynamicsStabilizer;

  beforeEach(() => {
    noteTracker = new NoteTrackingStabilizer({
      partId: "test-part",
      attackDurationMs: 50,
      releaseWindowMs: 500,
    });
    noteTracker.init();

    dynamics = new DynamicsStabilizer({
      partId: "test-part",
      windowMs: 8000,
      trendWindowMs: 1000,
      trendDeadZone: 0.1,
    });
    dynamics.init();
  });

  /** Helper: pipe raw frame through note tracker then dynamics stabilizer */
  function applyBoth(raw: RawInputFrame): MusicalFrame {
    const upstream = noteTracker.apply(raw, null);
    return dynamics.apply(raw, upstream);
  }

  describe("basic event tracking", () => {
    it("records a single note onset as a dynamics event", () => {
      const result = applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));

      expect(result.dynamics.events).toHaveLength(1);
      expect(result.dynamics.events[0].t).toBe(100);
      expect(result.dynamics.events[0].intensity).toBeCloseTo(100 / 127, 4);
    });

    it("returns empty events when no notes", () => {
      const result = applyBoth(makeFrame(100, []));

      expect(result.dynamics.events).toHaveLength(0);
      expect(result.dynamics.level).toBe(0);
    });

    it("tracks multiple note onsets", () => {
      const result = applyBoth(makeFrame(100, [
        noteOn(60, 100, 100),
        noteOn(64, 50, 100),
      ]));

      expect(result.dynamics.events).toHaveLength(2);
    });

    it("does not duplicate events for sustained notes", () => {
      applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));
      // Note is now in sustain phase — should not create new event
      const result = applyBoth(makeFrame(200, []));

      expect(result.dynamics.events).toHaveLength(1);
    });
  });

  describe("level (max intensity, no smoothing)", () => {
    it("level equals intensity of single note", () => {
      const result = applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      expect(result.dynamics.level).toBeCloseTo(1.0, 2);
    });

    it("level jumps immediately to new note intensity", () => {
      applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      const result = applyBoth(makeFrame(200, [noteOn(64, 64, 200)]));
      // No smoothing — level is exactly the new note's intensity
      expect(result.dynamics.level).toBeCloseTo(64 / 127, 2);
    });

    it("level is max intensity of simultaneous notes (chord)", () => {
      const result = applyBoth(makeFrame(100, [
        noteOn(60, 40, 100),
        noteOn(64, 100, 100),
        noteOn(67, 80, 100),
      ]));
      expect(result.dynamics.level).toBeCloseTo(100 / 127, 2);
    });

    it("holds level steady during silence (no decay)", () => {
      applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      const result = applyBoth(makeFrame(5000, []));
      expect(result.dynamics.level).toBeCloseTo(1.0, 2);
    });
  });

  describe("contour", () => {
    it("adds one contour point per distinct onset time", () => {
      applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));
      const result = applyBoth(makeFrame(200, [noteOn(64, 50, 200)]));

      expect(result.dynamics.contour).toHaveLength(2);
      expect(result.dynamics.contour[0].t).toBe(100);
      expect(result.dynamics.contour[1].t).toBe(200);
    });

    it("contour level is raw max intensity (no smoothing)", () => {
      applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      const result = applyBoth(makeFrame(200, [noteOn(64, 64, 200)]));

      expect(result.dynamics.contour[0].level).toBeCloseTo(1.0, 2);
      expect(result.dynamics.contour[1].level).toBeCloseTo(64 / 127, 2);
    });

    it("does not add contour points during silence", () => {
      applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      const result = applyBoth(makeFrame(5000, []));

      expect(result.dynamics.contour).toHaveLength(1);
    });

    it("groups simultaneous notes into one contour point", () => {
      const result = applyBoth(makeFrame(100, [
        noteOn(60, 40, 100),
        noteOn(64, 100, 100),
        noteOn(67, 80, 100),
      ]));

      // One contour point for the chord, not three
      expect(result.dynamics.contour).toHaveLength(1);
      expect(result.dynamics.contour[0].level).toBeCloseTo(100 / 127, 2);
    });

    it("includes min for chords with velocity spread", () => {
      const result = applyBoth(makeFrame(100, [
        noteOn(60, 40, 100),
        noteOn(64, 100, 100),
      ]));

      expect(result.dynamics.contour[0].min).toBeCloseTo(40 / 127, 2);
    });

    it("omits min for single notes", () => {
      const result = applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));

      expect(result.dynamics.contour[0].min).toBeUndefined();
    });

    it("omits min when all notes have same velocity", () => {
      const result = applyBoth(makeFrame(100, [
        noteOn(60, 80, 100),
        noteOn(64, 80, 100),
      ]));

      expect(result.dynamics.contour[0].min).toBeUndefined();
    });
  });

  describe("trend detection", () => {
    it("reports stable when insufficient data", () => {
      const result = applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));
      expect(result.dynamics.trend).toBe("stable");
    });

    it("detects rising dynamics", () => {
      applyBoth(makeFrame(100, [noteOn(60, 30, 100)]));
      applyBoth(makeFrame(300, [noteOn(62, 60, 300)]));
      applyBoth(makeFrame(500, [noteOn(64, 90, 500)]));
      const result = applyBoth(makeFrame(700, [noteOn(65, 127, 700)]));

      expect(result.dynamics.trend).toBe("rising");
    });

    it("detects falling dynamics", () => {
      applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      applyBoth(makeFrame(300, [noteOn(62, 90, 300)]));
      applyBoth(makeFrame(500, [noteOn(64, 50, 500)]));
      const result = applyBoth(makeFrame(700, [noteOn(65, 20, 700)]));

      expect(result.dynamics.trend).toBe("falling");
    });

    it("reports stable for consistent dynamics", () => {
      applyBoth(makeFrame(100, [noteOn(60, 80, 100)]));
      applyBoth(makeFrame(300, [noteOn(62, 80, 300)]));
      applyBoth(makeFrame(500, [noteOn(64, 80, 500)]));
      const result = applyBoth(makeFrame(700, [noteOn(65, 80, 700)]));

      expect(result.dynamics.trend).toBe("stable");
    });
  });

  describe("dynamic range", () => {
    it("computes min and max from event intensities", () => {
      applyBoth(makeFrame(100, [noteOn(60, 50, 100)]));
      const result = applyBoth(makeFrame(200, [noteOn(64, 100, 200)]));

      expect(result.dynamics.range.min).toBeCloseTo(50 / 127, 4);
      expect(result.dynamics.range.max).toBeCloseTo(100 / 127, 4);
    });

    it("computes variance relative to full range", () => {
      applyBoth(makeFrame(100, [noteOn(60, 50, 100)]));
      const result = applyBoth(makeFrame(200, [noteOn(64, 100, 200)]));

      expect(result.dynamics.range.variance).toBeGreaterThan(0);
      expect(result.dynamics.range.variance).toBeLessThanOrEqual(1);
    });

    it("returns zero variance for single event", () => {
      const result = applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));
      expect(result.dynamics.range.variance).toBe(0);
    });

    it("returns zero range when no events", () => {
      const result = applyBoth(makeFrame(100, []));
      expect(result.dynamics.range).toEqual({ min: 0, max: 0, variance: 0 });
    });
  });

  describe("window pruning", () => {
    it("prunes events older than window", () => {
      applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));

      const result = applyBoth(makeFrame(9100, [noteOn(64, 80, 9100)]));

      expect(result.dynamics.events).toHaveLength(1);
      expect(result.dynamics.events[0].t).toBe(9100);
    });
  });

  describe("invariant: event-note correspondence", () => {
    it("every attack-phase note has a corresponding dynamics event", () => {
      const raw = makeFrame(100, [
        noteOn(60, 100, 100),
        noteOn(64, 80, 100),
        noteOn(67, 60, 100),
      ]);
      const upstream = noteTracker.apply(raw, null);
      const result = dynamics.apply(raw, upstream);

      const attackNotes = result.notes.filter(n => n.phase === "attack");
      expect(result.dynamics.events).toHaveLength(attackNotes.length);

      for (const note of attackNotes) {
        const event = result.dynamics.events.find(
          e => e.t === note.onset && Math.abs(e.intensity - note.velocity / 127) < 0.001
        );
        expect(event).toBeDefined();
      }
    });
  });

  describe("upstream propagation", () => {
    it("preserves upstream notes and chords", () => {
      const result = applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].pitch.pc).toBe(0); // C
    });
  });

  describe("reset", () => {
    it("clears all state on reset", () => {
      applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));
      dynamics.reset();

      const result = applyBoth(makeFrame(200, []));
      expect(result.dynamics.events).toHaveLength(0);
      expect(result.dynamics.level).toBe(0);
      expect(result.dynamics.contour).toHaveLength(0);
    });
  });
});
