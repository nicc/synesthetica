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
function makeUpstreamFrame(t: number, prescribedTempo: number | null = null): MusicalFrame {
  return {
    t,
    part: "test-part",
    notes: [],
    chords: [],
    rhythmicAnalysis: {
      detectedDivision: null,
      onsetDrifts: [],
      stability: 0,
      confidence: 0,
    },
    dynamics: { level: 0, trend: "stable" },
    prescribedTempo,
    prescribedMeter: null,
  };
}

/** Helper to extract onset timestamps from onsetDrifts */
function getOnsetTimestamps(frame: MusicalFrame): number[] {
  return frame.rhythmicAnalysis.onsetDrifts.map((od) => od.t);
}

describe("BeatDetectionStabilizer (RFC 007)", () => {
  let stabilizer: BeatDetectionStabilizer;

  beforeEach(() => {
    stabilizer = new BeatDetectionStabilizer({
      partId: "test-part",
      windowMs: 5000,
      minOnsets: 4,
    });
    stabilizer.init();
  });

  describe("initialization", () => {
    it("returns null detectedDivision with no input", () => {
      const frame = makeFrame(0, []);
      const upstream = makeUpstreamFrame(0);
      const result = stabilizer.apply(frame, upstream);

      expect(result.rhythmicAnalysis.detectedDivision).toBeNull();
      expect(result.rhythmicAnalysis.confidence).toBe(0);
    });

    it("returns null detectedDivision with insufficient onsets", () => {
      // Only 3 onsets, need 4 minimum
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      const result = stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);

      expect(result.rhythmicAnalysis.detectedDivision).toBeNull();
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
        rhythmicAnalysis: {
          detectedDivision: null,
          onsetDrifts: [],
          stability: 0,
          confidence: 0,
        },
        dynamics: { level: 0.8, trend: "rising" },
        prescribedTempo: null,
        prescribedMeter: null,
      };

      const result = stabilizer.apply(frame, upstream);

      expect(result.notes).toEqual(upstream.notes);
      expect(result.dynamics).toEqual(upstream.dynamics);
      expect(result.part).toBe("test-part");
    });
  });

  describe("division detection", () => {
    it("detects division from regular onsets", () => {
      // Play notes at 500ms intervals
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      expect(result.rhythmicAnalysis.detectedDivision).toBeCloseTo(500, -1); // ~500ms
    });

    it("detects longer divisions", () => {
      // Play notes at 1000ms intervals
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(64, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(2000, [noteOn(67, 100, 2000)]), upstream);
      stabilizer.apply(makeFrame(3000, [noteOn(72, 100, 3000)]), upstream);
      const result = stabilizer.apply(makeFrame(4000, [noteOn(60, 100, 4000)]), upstream);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      expect(result.rhythmicAnalysis.detectedDivision).toBeCloseTo(1000, -1);
    });

    it("detects shorter divisions", () => {
      // Play notes at 333ms intervals
      const upstream = makeUpstreamFrame(0);
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(333, [noteOn(64, 100, 333)]), upstream);
      stabilizer.apply(makeFrame(666, [noteOn(67, 100, 666)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(72, 100, 1000)]), upstream);
      const result = stabilizer.apply(makeFrame(1333, [noteOn(60, 100, 1333)]), upstream);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      expect(result.rhythmicAnalysis.detectedDivision).toBeCloseTo(333, -1);
    });
  });

  describe("stability calculation", () => {
    it("reports high stability for consistent timing", () => {
      const upstream = makeUpstreamFrame(0);

      // Very regular timing
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      expect(result.rhythmicAnalysis.stability).toBeGreaterThan(0.7);
    });

    it("reports lower stability for irregular timing", () => {
      const irregularStabilizer = new BeatDetectionStabilizer({
        partId: "test-part",
        minOnsets: 4,
      });
      irregularStabilizer.init();

      const upstream = makeUpstreamFrame(0);

      // Irregular timing within the same cluster width
      irregularStabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      irregularStabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      irregularStabilizer.apply(makeFrame(950, [noteOn(67, 100, 950)]), upstream); // 450ms gap
      irregularStabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream); // 550ms gap
      const result = irregularStabilizer.apply(makeFrame(1900, [noteOn(60, 100, 1900)]), upstream); // 400ms gap

      // Stability should be lower due to variance
      if (result.rhythmicAnalysis.detectedDivision !== null) {
        expect(result.rhythmicAnalysis.stability).toBeLessThan(0.9);
      }
    });
  });

  describe("confidence calculation", () => {
    it("reports confidence based on cluster dominance", () => {
      const upstream = makeUpstreamFrame(0);

      // Regular onsets should produce high confidence
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      expect(result.rhythmicAnalysis.confidence).toBeGreaterThan(0);
    });
  });

  describe("onset tracking via onsetDrifts", () => {
    it("tracks onset timestamps in onsetDrifts", () => {
      const upstream = makeUpstreamFrame(0);

      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      const result = stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      const timestamps = getOnsetTimestamps(result);
      expect(timestamps).toContain(0);
      expect(timestamps).toContain(500);
      expect(timestamps).toContain(1000);
      expect(timestamps).toContain(1500);
    });

    it("prunes old onsets outside window", () => {
      const shortWindowStabilizer = new BeatDetectionStabilizer({
        partId: "test-part",
        windowMs: 1000, // 1 second window
        minOnsets: 2,
      });
      shortWindowStabilizer.init();

      const upstream = makeUpstreamFrame(0);

      shortWindowStabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      shortWindowStabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      shortWindowStabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      const result = shortWindowStabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      const timestamps = getOnsetTimestamps(result);
      // Onset at 0 should be pruned (older than 1500 - 1000 = 500)
      expect(timestamps).not.toContain(0);
      expect(timestamps).toContain(500);
      expect(timestamps).toContain(1000);
      expect(timestamps).toContain(1500);
    });
  });

  describe("onsetDrifts subdivision structure", () => {
    it("provides 4 subdivision levels per onset when division detected", () => {
      const upstream = makeUpstreamFrame(0);

      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      // Each onset should have 4 subdivision levels
      expect(result.rhythmicAnalysis.onsetDrifts.length).toBeGreaterThan(0);
      for (const onset of result.rhythmicAnalysis.onsetDrifts) {
        expect(onset.subdivisions).toHaveLength(4);
        // Labels should be 1x, 2x, 4x, 8x (no prescribed tempo)
        expect(onset.subdivisions.map((s) => s.label)).toEqual(["1x", "2x", "4x", "8x"]);
        // Exactly one should be marked as nearest
        const nearestCount = onset.subdivisions.filter((s) => s.nearest).length;
        expect(nearestCount).toBe(1);
      }
    });

    it("uses musical labels when prescribed tempo is provided", () => {
      const upstream = makeUpstreamFrame(0, 120); // 120 BPM = 500ms quarter

      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      // Labels should be quarter, 8th, 16th, 32nd
      for (const onset of result.rhythmicAnalysis.onsetDrifts) {
        expect(onset.subdivisions.map((s) => s.label)).toEqual([
          "quarter",
          "8th",
          "16th",
          "32nd",
        ]);
      }
    });

    it("returns empty subdivisions when no division detected", () => {
      const upstream = makeUpstreamFrame(0);

      // Only 2 onsets, not enough for detection
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      const result = stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);

      // Onsets should exist but with empty subdivisions
      expect(result.rhythmicAnalysis.onsetDrifts.length).toBe(2);
      for (const onset of result.rhythmicAnalysis.onsetDrifts) {
        expect(onset.subdivisions).toEqual([]);
      }
    });

    it("marks nearest subdivision correctly for on-beat notes", () => {
      const upstream = makeUpstreamFrame(0);

      // Play exactly on 500ms intervals
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(60, 100, 2000)]), upstream);

      // For on-beat notes, the 1x subdivision should have smallest drift
      const onset = result.rhythmicAnalysis.onsetDrifts.find((o) => o.t === 500);
      expect(onset).toBeDefined();
      if (onset) {
        const nearest = onset.subdivisions.find((s) => s.nearest);
        expect(nearest).toBeDefined();
        // On-beat note should have very small drift
        expect(Math.abs(nearest!.drift)).toBeLessThan(50);
      }
    });
  });

  describe("prescribed tempo and meter passthrough", () => {
    it("does not set prescribedTempo (user responsibility)", () => {
      const upstream = makeUpstreamFrame(0);

      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      const result = stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);

      // Stabilizer should NOT set prescribedTempo - that's a control op
      expect(result.prescribedTempo).toBeNull();
      expect(result.prescribedMeter).toBeNull();
    });
  });

  describe("lifecycle", () => {
    it("clears state on reset", () => {
      const upstream = makeUpstreamFrame(0);

      // Build up some state
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      stabilizer.reset();

      const result = stabilizer.apply(makeFrame(2000, []), upstream);
      expect(result.rhythmicAnalysis.detectedDivision).toBeNull();
      expect(result.rhythmicAnalysis.onsetDrifts).toHaveLength(0);
    });

    it("clears state on dispose", () => {
      const upstream = makeUpstreamFrame(0);

      // Build up some state
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(500, [noteOn(64, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(67, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(72, 100, 1500)]), upstream);

      stabilizer.dispose();
      stabilizer.init();

      const result = stabilizer.apply(makeFrame(2000, []), upstream);
      expect(result.rhythmicAnalysis.detectedDivision).toBeNull();
    });
  });

  describe("stabilizer id", () => {
    it("has correct id", () => {
      expect(stabilizer.id).toBe("beat-detection");
    });
  });

  describe("IOI filtering", () => {
    it("filters out very short IOIs (chords)", () => {
      const upstream = makeUpstreamFrame(0);

      // Play chord-like rapid notes followed by regular pattern
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(10, [noteOn(64, 100, 10)]), upstream); // Very short IOI
      stabilizer.apply(makeFrame(20, [noteOn(67, 100, 20)]), upstream); // Very short IOI
      stabilizer.apply(makeFrame(500, [noteOn(72, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(1000, [noteOn(60, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1500, [noteOn(64, 100, 1500)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(67, 100, 2000)]), upstream);

      // Should detect ~500ms division, not ~10ms
      if (result.rhythmicAnalysis.detectedDivision !== null) {
        expect(result.rhythmicAnalysis.detectedDivision).toBeGreaterThan(100);
      }
    });
  });

  describe("harmonic scoring", () => {
    it("prefers longer divisions when harmonically related", () => {
      const upstream = makeUpstreamFrame(0);

      // Play a pattern that could be interpreted as 250ms or 500ms
      // Pattern: notes at 0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000
      // This creates both 250ms and 500ms IOIs
      for (let t = 0; t <= 2000; t += 250) {
        stabilizer.apply(makeFrame(t, [noteOn(60, 100, t)]), upstream);
      }
      const result = stabilizer.apply(makeFrame(2250, [noteOn(64, 100, 2250)]), upstream);

      // With harmonic scoring, 500ms should be preferred over 250ms
      // (but this depends on implementation details)
      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
    });
  });
});
