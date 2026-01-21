/**
 * RFC 008: Per-Onset Subdivision Drift - Diagnostic Simulation
 *
 * Principle 8: Experiential Feedback Through Simulation
 *
 * This simulation exercises the subdivision drift system with realistic input patterns
 * and produces verbose output to observe behavior. The goal is to see how drift
 * categorization works across different musical scenarios:
 *
 * 1. On-beat notes (should have low drift, nearest=quarter/1x)
 * 2. Eighth-note timing (should be nearest=8th/2x)
 * 3. Swing timing (between straight and triplet feel)
 * 4. Late/rushed notes (should show appropriate drift values)
 * 5. Rubato playing (expressive timing variations)
 *
 * Run with: npm test -- --grep "Subdivision Drift Diagnostic" --reporter=verbose
 */

import { describe, it, beforeEach } from "vitest";
import { BeatDetectionStabilizer } from "../../src/stabilizers/BeatDetectionStabilizer";
import type { RawInputFrame, MidiNoteOn, MusicalFrame, OnsetDrift } from "@synesthetica/contracts";

// ============================================================================
// Test Helpers
// ============================================================================

function makeFrame(t: number, inputs: MidiNoteOn[]): RawInputFrame {
  return {
    t,
    source: "midi",
    stream: "diagnostic",
    inputs,
  };
}

function noteOn(note: number, velocity: number, t: number, channel = 0): MidiNoteOn {
  return { type: "midi_note_on", note, velocity, t, channel };
}

function makeUpstreamFrame(t: number, prescribedTempo: number | null = null): MusicalFrame {
  return {
    t,
    part: "diagnostic-part",
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

/**
 * Format onset drift data for console output.
 */
function formatOnsetDrift(od: OnsetDrift): string {
  if (od.subdivisions.length === 0) {
    return `t=${od.t}ms: [no division detected]`;
  }

  const nearest = od.subdivisions.find(s => s.nearest);
  const lines = [
    `t=${od.t}ms: nearest=${nearest?.label} (drift=${nearest?.drift.toFixed(1)}ms)`,
  ];

  for (const sub of od.subdivisions) {
    const marker = sub.nearest ? "→" : " ";
    const driftPct = ((sub.drift / sub.period) * 100).toFixed(1);
    lines.push(`  ${marker} ${sub.label.padEnd(8)} period=${sub.period.toFixed(0).padStart(4)}ms  drift=${sub.drift.toFixed(1).padStart(7)}ms (${driftPct.padStart(6)}%)`);
  }

  return lines.join("\n");
}

/**
 * Classify drift quality based on the nearest subdivision.
 */
function classifyDrift(od: OnsetDrift): "good" | "warning" | "bad" | "unknown" {
  const nearest = od.subdivisions.find(s => s.nearest);
  if (!nearest) return "unknown";

  const normalizedDrift = Math.abs(nearest.drift / nearest.period);
  if (normalizedDrift <= 0.1) return "good";      // Within 10% of period
  if (normalizedDrift <= 0.25) return "warning";  // Within 25% of period
  return "bad";
}

// ============================================================================
// Diagnostic Simulations
// ============================================================================

describe("Subdivision Drift Diagnostic (RFC 008)", () => {
  let stabilizer: BeatDetectionStabilizer;

  beforeEach(() => {
    stabilizer = new BeatDetectionStabilizer({
      partId: "diagnostic-part",
      windowMs: 5000,
      minOnsets: 4,
    });
    stabilizer.init();
  });

  describe("Tier 1: Detected Division Only (no prescribed tempo)", () => {
    it("on-beat quarter notes at consistent tempo", () => {
      console.log("\n=== Tier 1: On-beat quarter notes (500ms IOI) ===\n");

      const upstream = makeUpstreamFrame(0);

      // Play notes exactly on 500ms intervals
      const onsets = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500];

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Detected division: ${result.rhythmicAnalysis.detectedDivision}ms`);
      console.log(`Stability: ${result.rhythmicAnalysis.stability.toFixed(2)}`);
      console.log(`Confidence: ${result.rhythmicAnalysis.confidence.toFixed(2)}`);
      console.log(`\nPer-onset drift analysis (labels: 1x, 2x, 4x, 8x):\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });

    it("eighth notes - should detect smaller division", () => {
      console.log("\n=== Tier 1: Eighth notes (250ms IOI) ===\n");

      const upstream = makeUpstreamFrame(0);

      // Play notes at 250ms intervals
      const onsets: number[] = [];
      for (let i = 0; i < 12; i++) {
        onsets.push(i * 250);
      }

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Detected division: ${result.rhythmicAnalysis.detectedDivision}ms`);
      console.log(`Stability: ${result.rhythmicAnalysis.stability.toFixed(2)}`);
      console.log(`Confidence: ${result.rhythmicAnalysis.confidence.toFixed(2)}`);
      console.log(`\nSample onset drifts:\n`);

      // Show first 4 and last 2
      const sample = [...result.rhythmicAnalysis.onsetDrifts.slice(0, 4),
                      ...result.rhythmicAnalysis.onsetDrifts.slice(-2)];
      for (const od of sample) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });
  });

  describe("Tier 2: Prescribed Tempo (musical labels)", () => {
    it("on-beat notes at 120 BPM", () => {
      console.log("\n=== Tier 2: On-beat at 120 BPM (500ms quarter) ===\n");

      const upstream = makeUpstreamFrame(0, 120); // 120 BPM = 500ms quarter

      // Play notes exactly on beats
      const onsets = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500];

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 120 BPM (quarter=500ms)`);
      console.log(`Detected division: ${result.rhythmicAnalysis.detectedDivision}ms`);
      console.log(`\nPer-onset drift analysis (labels: quarter, 8th, 16th, 32nd):\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });

    it("eighth notes at 120 BPM", () => {
      console.log("\n=== Tier 2: Eighth notes at 120 BPM ===\n");

      const upstream = makeUpstreamFrame(0, 120);

      // Play notes on every eighth note (250ms)
      const onsets: number[] = [];
      for (let i = 0; i < 16; i++) {
        onsets.push(i * 250);
      }

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 120 BPM`);
      console.log(`Note intervals: 250ms (eighth notes)`);
      console.log(`\nSample onset drifts:\n`);

      // Show alternating pattern
      for (let i = 0; i < 8; i++) {
        const od = result.rhythmicAnalysis.onsetDrifts[i];
        if (od) {
          const nearest = od.subdivisions.find(s => s.nearest);
          console.log(`t=${od.t}ms: nearest=${nearest?.label}, drift=${nearest?.drift.toFixed(1)}ms → ${classifyDrift(od)}`);
        }
      }
    });

    it("consistently late notes (50ms behind)", () => {
      console.log("\n=== Tier 2: Consistently Late (50ms behind beat) ===\n");

      const upstream = makeUpstreamFrame(0, 120);

      // Notes are 50ms late on each beat
      const onsets = [50, 550, 1050, 1550, 2050, 2550, 3050, 3550];

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 120 BPM (quarter=500ms)`);
      console.log(`Notes played: 50ms late on each beat`);
      console.log(`\nPer-onset drift analysis:\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });

    it("consistently early notes (50ms ahead)", () => {
      console.log("\n=== Tier 2: Consistently Early (50ms ahead of beat) ===\n");

      const upstream = makeUpstreamFrame(0, 120);

      // Notes are 50ms early (note: first note can't be early if we start at 0)
      // So we start the pattern at beat 1 being early
      const onsets = [0, 450, 950, 1450, 1950, 2450, 2950, 3450];

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 120 BPM (quarter=500ms)`);
      console.log(`Notes played: 50ms early on each beat (except first)`);
      console.log(`\nPer-onset drift analysis:\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });

    it("notes between subdivisions (swing feel)", () => {
      console.log("\n=== Tier 2: Swing Feel (between straight and triplet) ===\n");

      const upstream = makeUpstreamFrame(0, 120);

      // Swing: long-short pattern. At 120 BPM (500ms beat):
      // Straight eighths: 250-250
      // Triplet swing: 333-167
      // Light swing: ~290-210
      // We'll play: 0, 290, 500, 790, 1000, 1290...
      const onsets: number[] = [];
      for (let beat = 0; beat < 4; beat++) {
        onsets.push(beat * 500);         // Downbeat
        onsets.push(beat * 500 + 290);   // Swung upbeat
      }

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 120 BPM (quarter=500ms)`);
      console.log(`Pattern: downbeat + swung upbeat (290ms after, not 250ms)`);
      console.log(`\nPer-onset drift analysis:\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });

    it("16th note pattern at 120 BPM", () => {
      console.log("\n=== Tier 2: 16th notes at 120 BPM ===\n");

      const upstream = makeUpstreamFrame(0, 120);

      // 16th notes at 120 BPM = 125ms intervals
      const onsets: number[] = [];
      for (let i = 0; i < 16; i++) {
        onsets.push(i * 125);
      }

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 120 BPM`);
      console.log(`Note intervals: 125ms (16th notes)`);
      console.log(`\nSample onset drifts:\n`);

      // Show first 8
      for (let i = 0; i < 8; i++) {
        const od = result.rhythmicAnalysis.onsetDrifts[i];
        if (od) {
          const nearest = od.subdivisions.find(s => s.nearest);
          console.log(`t=${od.t}ms: nearest=${nearest?.label}, drift=${nearest?.drift.toFixed(1)}ms → ${classifyDrift(od)}`);
        }
      }
    });

    it("mixed subdivision pattern (melody with varied rhythms)", () => {
      console.log("\n=== Tier 2: Mixed Subdivisions (realistic melody) ===\n");

      const upstream = makeUpstreamFrame(0, 120);

      // A musical pattern: quarter, eighth, eighth, quarter, sixteenth-sixteenth-eighth
      // At 120 BPM: 0, 500, 750, 1000, 1500, 1625, 1750, 2000
      const onsets = [
        0,     // quarter (beat 1)
        500,   // quarter (beat 2)
        750,   // eighth (beat 2.5)
        1000,  // quarter (beat 3)
        1500,  // quarter (beat 4)
        1625,  // 16th
        1750,  // 16th
        2000,  // quarter (beat 5)
      ];

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 120 BPM`);
      console.log(`Pattern: quarter, quarter, eighth, quarter, quarter, 16th, 16th, quarter`);
      console.log(`\nPer-onset drift analysis:\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });
  });

  describe("Edge Cases and Unusual Timing", () => {
    it("notes exactly between subdivisions (worst case)", () => {
      console.log("\n=== Edge: Notes Between Subdivisions ===\n");

      const upstream = makeUpstreamFrame(0, 120);

      // At 120 BPM: quarter=500ms, 8th=250ms, 16th=125ms, 32nd=62.5ms
      // Place notes at positions that maximize drift from all subdivisions
      // Between quarter and 8th: ~125ms or ~375ms from beat
      const onsets = [0, 125, 375, 625, 875, 1125, 1375, 1625];

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 120 BPM`);
      console.log(`Notes placed to maximize distance from quarter and 8th subdivisions`);
      console.log(`\nPer-onset drift analysis:\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });

    it("rubato: expressive timing variations", () => {
      console.log("\n=== Edge: Rubato (Expressive Timing) ===\n");

      const upstream = makeUpstreamFrame(0, 120);

      // Expressive timing: rushing and dragging around the beat
      // Pattern: on-beat, slightly early, slightly late, way late, back on-beat, etc.
      const onsets = [
        0,      // on beat
        480,    // 20ms early
        1030,   // 30ms late
        1600,   // 100ms late (dramatic rubato)
        2000,   // back on beat
        2460,   // 40ms early
        3020,   // 20ms late
        3500,   // on beat
      ];

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 120 BPM`);
      console.log(`Expressive timing: mix of early, late, and on-beat notes`);
      console.log(`\nPer-onset drift analysis:\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });

    it("fast tempo (200 BPM): subdivisions become very fine", () => {
      console.log("\n=== Edge: Fast Tempo (200 BPM) ===\n");

      const upstream = makeUpstreamFrame(0, 200); // 200 BPM = 300ms quarter

      // Quarter notes at 200 BPM
      const onsets: number[] = [];
      for (let i = 0; i < 8; i++) {
        onsets.push(i * 300);
      }

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 200 BPM`);
      console.log(`Quarter: 300ms, 8th: 150ms, 16th: 75ms, 32nd: 37.5ms`);
      console.log(`\nPer-onset drift analysis:\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts.slice(0, 4)) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });

    it("slow tempo (60 BPM): large subdivision windows", () => {
      console.log("\n=== Edge: Slow Tempo (60 BPM) ===\n");

      const upstream = makeUpstreamFrame(0, 60); // 60 BPM = 1000ms quarter

      // Quarter notes at 60 BPM
      const onsets: number[] = [];
      for (let i = 0; i < 6; i++) {
        onsets.push(i * 1000);
      }

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(t, [noteOn(60, 80, t)]), upstream);
      }

      console.log(`Prescribed tempo: 60 BPM`);
      console.log(`Quarter: 1000ms, 8th: 500ms, 16th: 250ms, 32nd: 125ms`);
      console.log(`\nPer-onset drift analysis:\n`);

      for (const od of result.rhythmicAnalysis.onsetDrifts.slice(0, 4)) {
        console.log(formatOnsetDrift(od));
        console.log(`  Classification: ${classifyDrift(od)}\n`);
      }
    });
  });

  describe("Summary Statistics", () => {
    it("distribution of drift categories across a performance", () => {
      console.log("\n=== Summary: Drift Category Distribution ===\n");

      const upstream = makeUpstreamFrame(0, 120);

      // Simulate a realistic performance with mixed timing
      // 60% on-beat, 25% slight variation, 15% noticeable variation
      const baseOnsets = Array.from({ length: 16 }, (_, i) => i * 500);
      const onsets = baseOnsets.map((base, i) => {
        if (i % 4 === 0) return base; // On beat (every 4th)
        if (i % 2 === 0) return base + (Math.random() - 0.5) * 30; // Slight variation
        return base + (Math.random() - 0.5) * 80; // More variation
      });

      let result: MusicalFrame = upstream;
      for (const t of onsets) {
        result = stabilizer.apply(makeFrame(Math.round(t), [noteOn(60, 80, Math.round(t))]), upstream);
      }

      // Tally categories
      const categories = { good: 0, warning: 0, bad: 0, unknown: 0 };
      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        categories[classifyDrift(od)]++;
      }

      const total = result.rhythmicAnalysis.onsetDrifts.length;
      console.log(`Total onsets: ${total}`);
      console.log(`Good (≤10%):    ${categories.good} (${((categories.good / total) * 100).toFixed(0)}%)`);
      console.log(`Warning (≤25%): ${categories.warning} (${((categories.warning / total) * 100).toFixed(0)}%)`);
      console.log(`Bad (>25%):     ${categories.bad} (${((categories.bad / total) * 100).toFixed(0)}%)`);

      // Show which subdivision was most commonly identified as nearest
      const subdivisionCounts = new Map<string, number>();
      for (const od of result.rhythmicAnalysis.onsetDrifts) {
        const nearest = od.subdivisions.find(s => s.nearest);
        if (nearest) {
          subdivisionCounts.set(nearest.label, (subdivisionCounts.get(nearest.label) || 0) + 1);
        }
      }

      console.log(`\nNearest subdivision distribution:`);
      for (const [label, count] of subdivisionCounts.entries()) {
        console.log(`  ${label}: ${count} (${((count / total) * 100).toFixed(0)}%)`);
      }
    });
  });
});
