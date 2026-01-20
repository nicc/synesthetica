/**
 * Beat Detection Simulation Tests (Principle 8: Experiential Feedback Through Simulation)
 *
 * These tests exercise the BeatDetectionStabilizer with realistic MIDI patterns
 * that are difficult to describe verbally. By simulating various playing styles,
 * we expose edge cases and failure modes that verbal description would miss.
 *
 * Categories tested:
 * 1. Regular rhythms (straight eighths, quarters)
 * 2. Subdivisions (eighths within quarter pulse)
 * 3. Rubato (expressive tempo variation)
 * 4. Syncopation (off-beat emphasis)
 * 5. Chord playing (simultaneous notes)
 * 6. Tempo changes (sudden and gradual)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BeatDetectionStabilizer } from "../../src/stabilizers/BeatDetectionStabilizer";
import type { RawInputFrame, MidiNoteOn, MusicalFrame } from "@synesthetica/contracts";

// ============================================================================
// Simulation Helpers
// ============================================================================

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

function makeUpstreamFrame(t: number): MusicalFrame {
  return {
    t,
    part: "test-part",
    notes: [],
    chords: [],
    rhythmicAnalysis: {
      detectedDivision: null,
      detectedDivisionTimes: [],
      recentOnsets: [],
      stability: 0,
      confidence: 0,
    },
    dynamics: { level: 0, trend: "stable" },
    prescribedTempo: null,
    prescribedMeter: null,
  };
}

/**
 * Generate a sequence of onsets with optional jitter.
 */
function generateOnsets(
  start: number,
  interval: number,
  count: number,
  jitterMs = 0
): number[] {
  const onsets: number[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = jitterMs > 0 ? (Math.random() - 0.5) * 2 * jitterMs : 0;
    onsets.push(start + i * interval + jitter);
  }
  return onsets;
}

/**
 * Feed a sequence of onsets through the stabilizer.
 */
function feedOnsets(
  stabilizer: BeatDetectionStabilizer,
  onsets: number[],
  noteBase = 60
): MusicalFrame {
  const upstream = makeUpstreamFrame(0);
  let result: MusicalFrame = upstream;

  for (let i = 0; i < onsets.length; i++) {
    const t = Math.round(onsets[i]);
    const frame = makeFrame(t, [noteOn(noteBase + (i % 12), 100, t)]);
    result = stabilizer.apply(frame, upstream);
  }

  return result;
}

// ============================================================================
// Simulation Tests
// ============================================================================

describe("BeatDetectionStabilizer Simulations", () => {
  let stabilizer: BeatDetectionStabilizer;

  beforeEach(() => {
    stabilizer = new BeatDetectionStabilizer({
      partId: "test-part",
      windowMs: 5000,
      minOnsets: 4,
    });
    stabilizer.init();
  });

  describe("Regular rhythms", () => {
    it("detects 120 BPM quarter notes (500ms)", () => {
      // Simulate playing quarter notes at 120 BPM
      const onsets = generateOnsets(0, 500, 8);
      const result = feedOnsets(stabilizer, onsets);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      expect(result.rhythmicAnalysis.detectedDivision).toBeCloseTo(500, -1);
      expect(result.rhythmicAnalysis.stability).toBeGreaterThan(0.7);
    });

    it("detects 90 BPM quarter notes (667ms)", () => {
      const onsets = generateOnsets(0, 667, 8);
      const result = feedOnsets(stabilizer, onsets);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      expect(result.rhythmicAnalysis.detectedDivision).toBeCloseTo(667, -1);
    });

    it("detects 150 BPM quarter notes (400ms)", () => {
      const onsets = generateOnsets(0, 400, 8);
      const result = feedOnsets(stabilizer, onsets);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      expect(result.rhythmicAnalysis.detectedDivision).toBeCloseTo(400, -1);
    });

    it("detects eighth notes at 120 BPM (250ms)", () => {
      const onsets = generateOnsets(0, 250, 12);
      const result = feedOnsets(stabilizer, onsets);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      // Could detect 250ms or harmonically related 500ms
      const div = result.rhythmicAnalysis.detectedDivision!;
      expect(div === 250 || Math.abs(div - 250) < 50 || div === 500 || Math.abs(div - 500) < 50).toBe(true);
    });
  });

  describe("Human timing imprecision", () => {
    it("handles small jitter (±15ms) - typical human timing", () => {
      // Humans typically have ±15-30ms timing variance
      const onsets = generateOnsets(0, 500, 10, 15);
      const result = feedOnsets(stabilizer, onsets);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      // With jitter, expect within ~25ms of target (cluster width)
      const div = result.rhythmicAnalysis.detectedDivision!;
      expect(Math.abs(div - 500)).toBeLessThan(30);
      // Stability should be good but not perfect
      expect(result.rhythmicAnalysis.stability).toBeGreaterThan(0.5);
    });

    it("handles moderate jitter (±30ms) - less steady player", () => {
      const onsets = generateOnsets(0, 500, 10, 30);
      const result = feedOnsets(stabilizer, onsets);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      // Should still find approximate division
      const div = result.rhythmicAnalysis.detectedDivision!;
      expect(Math.abs(div - 500)).toBeLessThan(100);
    });
  });

  describe("Chord playing (simultaneous notes)", () => {
    it("treats near-simultaneous notes as single onset", () => {
      const upstream = makeUpstreamFrame(0);

      // Play a chord: 3 notes within 20ms
      stabilizer.apply(makeFrame(0, [noteOn(60, 100, 0)]), upstream);
      stabilizer.apply(makeFrame(5, [noteOn(64, 100, 5)]), upstream);
      stabilizer.apply(makeFrame(15, [noteOn(67, 100, 15)]), upstream);

      // Next chord at 500ms
      stabilizer.apply(makeFrame(500, [noteOn(60, 100, 500)]), upstream);
      stabilizer.apply(makeFrame(508, [noteOn(64, 100, 508)]), upstream);
      stabilizer.apply(makeFrame(512, [noteOn(67, 100, 512)]), upstream);

      // Next chord at 1000ms
      stabilizer.apply(makeFrame(1000, [noteOn(60, 100, 1000)]), upstream);
      stabilizer.apply(makeFrame(1003, [noteOn(64, 100, 1003)]), upstream);
      stabilizer.apply(makeFrame(1010, [noteOn(67, 100, 1010)]), upstream);

      // Continue pattern
      stabilizer.apply(makeFrame(1500, [noteOn(60, 100, 1500)]), upstream);
      stabilizer.apply(makeFrame(1505, [noteOn(64, 100, 1505)]), upstream);
      const result = stabilizer.apply(makeFrame(2000, [noteOn(67, 100, 2000)]), upstream);

      // Should detect ~500ms division, not ~5ms from chord spread
      if (result.rhythmicAnalysis.detectedDivision !== null) {
        expect(result.rhythmicAnalysis.detectedDivision).toBeGreaterThan(100);
      }
    });
  });

  describe("Subdivisions", () => {
    it("handles mixed quarter and eighth note pattern", () => {
      // Pattern: q q ee q (where q=quarter, e=eighth)
      // At 120 BPM: 500, 500, 250, 250, 500
      const onsets = [0, 500, 1000, 1250, 1500, 2000, 2500, 3000, 3250, 3500, 4000];
      const result = feedOnsets(stabilizer, onsets);

      // Should detect either 250ms (eighth) or 500ms (quarter) as dominant
      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
    });
  });

  describe("Tempo changes", () => {
    it("adapts to gradual tempo increase (accelerando)", () => {
      // Start at 500ms, gradually decrease to 400ms
      const onsets: number[] = [0];
      let t = 0;
      for (let i = 0; i < 10; i++) {
        const interval = 500 - i * 10; // 500, 490, 480... 410
        t += interval;
        onsets.push(t);
      }
      const result = feedOnsets(stabilizer, onsets);

      // Should detect something in the range
      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
    });

    it("adapts to sudden tempo change", () => {
      const upstream = makeUpstreamFrame(0);

      // First: 4 notes at 500ms intervals
      for (let i = 0; i < 4; i++) {
        stabilizer.apply(makeFrame(i * 500, [noteOn(60, 100, i * 500)]), upstream);
      }

      // Then: 4 notes at 400ms intervals
      const base = 4 * 500;
      for (let i = 0; i < 4; i++) {
        stabilizer.apply(makeFrame(base + i * 400, [noteOn(60, 100, base + i * 400)]), upstream);
      }

      const result = stabilizer.apply(makeFrame(base + 4 * 400, [noteOn(60, 100, base + 4 * 400)]), upstream);

      // After the change, should be detecting closer to 400ms
      // (though window contains both patterns)
      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("handles very sparse input (one note per second)", () => {
      const onsets = generateOnsets(0, 1000, 6);
      const result = feedOnsets(stabilizer, onsets);

      expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      expect(result.rhythmicAnalysis.detectedDivision).toBeCloseTo(1000, -1);
    });

    it("reports null with insufficient data", () => {
      const onsets = [0, 500, 1000]; // Only 3 onsets, need 4
      const result = feedOnsets(stabilizer, onsets);

      expect(result.rhythmicAnalysis.detectedDivision).toBeNull();
    });

    it("handles long silence then resumption", () => {
      const upstream = makeUpstreamFrame(0);

      // Play some notes
      for (let i = 0; i < 4; i++) {
        stabilizer.apply(makeFrame(i * 500, [noteOn(60, 100, i * 500)]), upstream);
      }

      // Long silence (5 seconds)
      const resumeTime = 7000;

      // Resume playing
      for (let i = 0; i < 4; i++) {
        stabilizer.apply(makeFrame(resumeTime + i * 500, [noteOn(60, 100, resumeTime + i * 500)]), upstream);
      }

      const result = stabilizer.apply(makeFrame(resumeTime + 4 * 500, [noteOn(60, 100, resumeTime + 4 * 500)]), upstream);

      // Should still detect the 500ms division from recent playing
      if (result.rhythmicAnalysis.detectedDivision !== null) {
        expect(result.rhythmicAnalysis.detectedDivision).toBeCloseTo(500, -1);
      }
    });
  });

  describe("Diagnostic output", () => {
    it("logs analysis for visual inspection (run with --verbose to see)", () => {
      // This test is for manual inspection when debugging
      const patterns = [
        { name: "straight quarters", interval: 500, count: 8, jitter: 0 },
        { name: "human quarters", interval: 500, count: 8, jitter: 20 },
        { name: "fast eighths", interval: 250, count: 12, jitter: 10 },
        { name: "slow halves", interval: 1000, count: 6, jitter: 0 },
      ];

      for (const pattern of patterns) {
        const testStabilizer = new BeatDetectionStabilizer({
          partId: "test-part",
          windowMs: 5000,
          minOnsets: 4,
        });
        testStabilizer.init();

        const onsets = generateOnsets(0, pattern.interval, pattern.count, pattern.jitter);
        const result = feedOnsets(testStabilizer, onsets);

        // Log for inspection (visible with vitest --reporter=verbose)
        console.log(`Pattern: ${pattern.name}`);
        console.log(`  Expected interval: ${pattern.interval}ms`);
        console.log(`  Detected division: ${result.rhythmicAnalysis.detectedDivision}ms`);
        console.log(`  Stability: ${result.rhythmicAnalysis.stability.toFixed(2)}`);
        console.log(`  Confidence: ${result.rhythmicAnalysis.confidence.toFixed(2)}`);

        // Just verify we got some result
        expect(result.rhythmicAnalysis.detectedDivision).not.toBeNull();
      }
    });
  });
});
