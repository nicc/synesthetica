import { describe, it, expect, beforeEach } from "vitest";
import { BeatDetectionStabilizer } from "../../src/stabilizers/BeatDetectionStabilizer";
import type { RawInputFrame, MidiNoteOn, MusicalFrame } from "@synesthetica/contracts";

function makeFrame(t: number, inputs: MidiNoteOn[]): RawInputFrame {
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

/**
 * Create a minimal upstream MusicalFrame for testing.
 */
function makeUpstreamFrame(t: number): MusicalFrame {
  return {
    t,
    part: "test-part",
    notes: [],
    chords: [],
    beat: null,
    dynamics: { level: 0, trend: "stable" },
  };
}

describe("BeatDetectionStabilizer", () => {
  let stabilizer: BeatDetectionStabilizer;

  beforeEach(() => {
    stabilizer = new BeatDetectionStabilizer({
      partId: "test-part",
      windowMs: 5000,
      minOnsets: 4,
      tempoRange: [40, 200],
      beatsPerBar: 4,
      minConfidence: 0.3,
    });
    stabilizer.init();
  });

  describe("initialization", () => {
    it("returns null beat with no input", () => {
      const frame = makeFrame(0, []);
      const upstream = makeUpstreamFrame(0);
      const result = stabilizer.apply(frame, upstream);

      expect(result.beat).toBeNull();
    });

    it("returns null beat with insufficient onsets", () => {
      // Only 3 onsets, need 4 minimum
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      const result = stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);

      expect(result.beat).toBeNull();
    });

    it("preserves upstream frame data", () => {
      const frame = makeFrame(100, []);
      const upstream: MusicalFrame = {
        t: 100,
        part: "test-part",
        notes: [
          {
            id: "test-note",
            pitch: { pc: 0, octave: 4 },
            velocity: 100,
            onset: 50,
            duration: 50,
            release: null,
            phase: "sustain",
            confidence: 1.0,
            provenance: { source: "test", stream: "test", version: "1.0" },
          },
        ],
        chords: [],
        beat: null,
        dynamics: { level: 0.8, trend: "rising" },
      };

      const result = stabilizer.apply(frame, upstream);

      expect(result.notes).toEqual(upstream.notes);
      expect(result.dynamics).toEqual(upstream.dynamics);
      expect(result.part).toBe("test-part");
    });
  });

  describe("tempo detection", () => {
    it("detects tempo from regular onsets", () => {
      // Play notes at 120 BPM (500ms intervals)
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      expect(result.beat).not.toBeNull();
      expect(result.beat!.tempo).toBeCloseTo(120, 0); // 60000 / 500 = 120 BPM
    });

    it("detects slower tempo", () => {
      // Play notes at 60 BPM (1000ms intervals)
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(64, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(2000, [noteOn(67, 100, 2000)]), upstream);
      stabilizer.apply(makeFrame(3000, [noteOn(72, 100, 3000)]), upstream);
      const result = stabilizer.apply(makeFrame(4000, [noteOn(60, 100, 4000)]), upstream);

      expect(result.beat).not.toBeNull();
      expect(result.beat!.tempo).toBeCloseTo(60, 0);
    });

    it("detects faster tempo", () => {
      // Play notes at 180 BPM (333ms intervals)
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(333, [noteOn(64, 100, 333)]), upstream);
      stabilizer.apply(makeFrame(666, [noteOn(67, 100, 666)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(72, 100, 1000)]), upstream);
      const result = stabilizer.apply(makeFrame(1333, [noteOn(60, 100, 1333)]), upstream);

      expect(result.beat).not.toBeNull();
      expect(result.beat!.tempo).toBeCloseTo(180, 0); // Within 1 BPM
    });

    it("rejects tempos outside valid range", () => {
      // Stabilizer configured for 40-200 BPM
      // Play notes at 300 BPM (200ms intervals) - too fast
      const fastStabilizer = new BeatDetectionStabilizer({
        partId: "test-part",
        tempoRange: [40, 200],
        minOnsets: 4,
        minConfidence: 0.1,
      });
      fastStabilizer.init();

      const upstream = makeUpstreamFrame(0);
      fastStabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      fastStabilizer.apply(makeFrame(200, [noteOn(64, 100, 200)]), upstream);
      fastStabilizer.apply(makeFrame(400, [noteOn(67, 100, 400)]), upstream);
      fastStabilizer.apply(makeFrame(600, [noteOn(72, 100, 600)]), upstream);
      const result = fastStabilizer.apply(makeFrame(800, [noteOn(60, 100, 800)]), upstream);

      // Should not detect tempo since 300 BPM > 200 BPM max
      expect(result.beat).toBeNull();
    });
  });

  describe("beat phase", () => {
    it("calculates phase within beat", () => {
      // Establish tempo at 120 BPM (500ms per beat)
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      // Check phase at different points within a beat
      const resultAtBeatStart = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);
      expect(resultAtBeatStart.beat!.phase).toBeCloseTo(0, 1);

      // 250ms later = 50% through the beat
      const resultMidBeat = stabilizer.apply(makeFrame(2250, []), upstream);
      expect(resultMidBeat.beat!.phase).toBeCloseTo(0.5, 1);
    });

    it("phase stays between 0 and 1", () => {
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      // Check multiple frames
      for (let t = 2000; t < 4000; t += 100) {
        const result = stabilizer.apply(makeFrame(t, []), upstream);
        expect(result.beat!.phase).toBeGreaterThanOrEqual(0);
        expect(result.beat!.phase).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("bar tracking", () => {
    it("tracks beat position within bar", () => {
      // Configure for 4/4 time
      const upstream = makeUpstreamFrame(0);

      // Establish tempo
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      // First beat should be beat 1
      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);
      expect(result.beat!.beatInBar).toBeGreaterThanOrEqual(1);
      expect(result.beat!.beatInBar).toBeLessThanOrEqual(4);
    });

    it("identifies downbeats", () => {
      const upstream = makeUpstreamFrame(0);

      // Establish tempo
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      // isDownbeat should match beatInBar === 1
      expect(result.beat!.isDownbeat).toBe(result.beat!.beatInBar === 1);
    });

    it("includes beatsPerBar from config", () => {
      const upstream = makeUpstreamFrame(0);

      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      expect(result.beat!.beatsPerBar).toBe(4);
    });

    it("respects custom beatsPerBar config", () => {
      const waltzStabilizer = new BeatDetectionStabilizer({
        partId: "test-part",
        beatsPerBar: 3, // 3/4 time
        minOnsets: 4,
        minConfidence: 0.1,
      });
      waltzStabilizer.init();

      const upstream = makeUpstreamFrame(0);
      waltzStabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      waltzStabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      waltzStabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      waltzStabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      const result = waltzStabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      expect(result.beat!.beatsPerBar).toBe(3);
    });
  });

  describe("confidence", () => {
    it("reports higher confidence for consistent timing", () => {
      const upstream = makeUpstreamFrame(0);

      // Very regular timing
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      expect(result.beat!.confidence).toBeGreaterThan(0.7);
    });

    it("reports lower confidence for irregular timing", () => {
      const irregularStabilizer = new BeatDetectionStabilizer({
        partId: "test-part",
        minOnsets: 4,
        minConfidence: 0.1, // Lower threshold to allow detection
      });
      irregularStabilizer.init();

      const upstream = makeUpstreamFrame(0);

      // Irregular timing
      irregularStabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      irregularStabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      irregularStabilizer.apply(makeFrame(800, [noteOn(67, 100, 800)]), upstream); // Early
      irregularStabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream); // Late
      const result = irregularStabilizer.apply(makeFrame(1900, [noteOn(60, 100, 1900)]), upstream);

      if (result.beat) {
        expect(result.beat.confidence).toBeLessThan(0.8);
      }
    });
  });

  describe("silence handling", () => {
    it("maintains tempo during silence", () => {
      const upstream = makeUpstreamFrame(0);

      // Establish tempo
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);
      stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      // Silence for a while
      const silenceResult = stabilizer.apply(makeFrame(3000, []), upstream);

      // Should still have beat state
      expect(silenceResult.beat).not.toBeNull();
      expect(silenceResult.beat!.tempo).toBeCloseTo(120, 5);
    });
  });

  describe("lifecycle", () => {
    it("clears state on reset", () => {
      const upstream = makeUpstreamFrame(0);

      // Establish tempo
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      stabilizer.reset();

      const result = stabilizer.apply(makeFrame(2000, []), upstream);
      expect(result.beat).toBeNull();
    });

    it("clears state on dispose", () => {
      const upstream = makeUpstreamFrame(0);

      // Establish tempo
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      stabilizer.dispose();
      stabilizer.init();

      const result = stabilizer.apply(makeFrame(2000, []), upstream);
      expect(result.beat).toBeNull();
    });
  });

  describe("stabilizer id", () => {
    it("has correct id", () => {
      expect(stabilizer.id).toBe("beat-detection");
    });
  });
});
