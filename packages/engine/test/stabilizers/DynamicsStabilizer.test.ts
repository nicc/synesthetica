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
      smoothingAlpha: 0.3,
      silenceDecayRate: 500,
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

  describe("EMA smoothing", () => {
    it("seeds EMA with first note intensity", () => {
      const result = applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));

      // First note seeds the EMA directly (no smoothing from zero)
      expect(result.dynamics.level).toBeCloseTo(1.0, 2);
    });

    it("smooths across subsequent notes", () => {
      applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      // level = 1.0 (seeded)
      const result = applyBoth(makeFrame(200, [noteOn(64, 64, 200)]));
      // level = 0.3 * (64/127) + 0.7 * 1.0 ≈ 0.3 * 0.504 + 0.7 = 0.851
      expect(result.dynamics.level).toBeCloseTo(0.851, 2);
    });
  });

  describe("contour", () => {
    it("adds a contour point per onset", () => {
      applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));
      const result = applyBoth(makeFrame(200, [noteOn(64, 50, 200)]));

      expect(result.dynamics.contour.length).toBeGreaterThanOrEqual(2);
      expect(result.dynamics.contour[0].t).toBe(100);
      expect(result.dynamics.contour[1].t).toBe(200);
    });

    it("contour levels reflect EMA smoothing", () => {
      const r1 = applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      expect(r1.dynamics.contour[0].level).toBeCloseTo(1.0, 2); // seeded

      const r2 = applyBoth(makeFrame(200, [noteOn(64, 64, 200)]));
      // 0.3 * (64/127) + 0.7 * 1.0 ≈ 0.851
      expect(r2.dynamics.contour[1].level).toBeCloseTo(0.851, 2);
    });
  });

  describe("silence decay", () => {
    it("decays level during silence", () => {
      applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      // level = 1.0 (seeded)

      // 500ms later (one half-life)
      const result = applyBoth(makeFrame(600, []));
      expect(result.dynamics.level).toBeCloseTo(0.5, 2);
    });

    it("decays to near zero after several half-lives", () => {
      applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));

      // 3000ms = 6 half-lives → level ≈ 1.0 * 0.5^6 ≈ 0.016
      const result = applyBoth(makeFrame(3100, []));
      expect(result.dynamics.level).toBeLessThan(0.02);
    });
  });

  describe("trend detection", () => {
    it("reports stable when insufficient data", () => {
      const result = applyBoth(makeFrame(100, [noteOn(60, 100, 100)]));
      expect(result.dynamics.trend).toBe("stable");
    });

    it("detects rising dynamics", () => {
      // Play increasingly louder notes
      applyBoth(makeFrame(100, [noteOn(60, 30, 100)]));
      applyBoth(makeFrame(300, [noteOn(62, 60, 300)]));
      applyBoth(makeFrame(500, [noteOn(64, 90, 500)]));
      const result = applyBoth(makeFrame(700, [noteOn(65, 127, 700)]));

      expect(result.dynamics.trend).toBe("rising");
    });

    it("detects falling dynamics", () => {
      // Play increasingly softer notes
      applyBoth(makeFrame(100, [noteOn(60, 127, 100)]));
      applyBoth(makeFrame(300, [noteOn(62, 90, 300)]));
      applyBoth(makeFrame(500, [noteOn(64, 50, 500)]));
      const result = applyBoth(makeFrame(700, [noteOn(65, 20, 700)]));

      expect(result.dynamics.trend).toBe("falling");
    });

    it("reports stable for consistent dynamics", () => {
      // Play notes at same velocity
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

      // Variance should be > 0 since intensities differ
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

      // 9000ms later — past 8000ms window
      const result = applyBoth(makeFrame(9100, [noteOn(64, 80, 9100)]));

      // Old event should be pruned; only the new one remains
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
