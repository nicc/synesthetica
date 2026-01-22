/**
 * RhythmGrammar Tests
 *
 * Tests the production rhythm grammar with various inputs and macro settings.
 * Run with GENERATE_SNAPSHOTS=1 to generate SVG files for visual review.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RhythmGrammar } from "../../src/grammars/RhythmGrammar";
import {
  maybeWriteSnapshot,
  extractMetrics,
  formatMetrics,
} from "../_harness/svg-snapshot";
import type {
  GrammarContext,
  AnnotatedMusicalFrame,
  AnnotatedNote,
  PitchClass,
} from "@synesthetica/contracts";

// ============================================================================
// Test Fixtures
// ============================================================================

const ctx: GrammarContext = {
  canvasSize: { width: 800, height: 600 },
  rngSeed: 12345,
  part: "main",
};

/**
 * Create a test frame with specified notes and rhythm settings.
 */
function createTestFrame(
  t: number,
  options: {
    notes?: Array<{
      id: string;
      pc: PitchClass;
      octave?: number;
      velocity?: number;
      onset: number;
      duration?: number;
      phase?: "attack" | "sustain" | "release";
    }>;
    tempo?: number;
    meter?: { beatsPerBar: number; beatUnit: number };
    onsetDrifts?: Array<{
      t: number;
      subdivisions: Array<{
        label: string;
        period: number;
        drift: number;
        nearest: boolean;
      }>;
    }>;
  }
): AnnotatedMusicalFrame {
  const notes: AnnotatedNote[] = (options.notes ?? []).map((n) => ({
    note: {
      id: n.id,
      pitch: { pc: n.pc, octave: n.octave ?? 4 },
      velocity: n.velocity ?? 80,
      onset: n.onset,
      duration: n.duration ?? (t - n.onset), // Default: still held until frame time
      release: null,
      phase: n.phase ?? "sustain",
      confidence: 1,
      provenance: { source: "test", stream: "test" },
    },
    visual: {
      palette: {
        id: `note-${n.id}`,
        // Color based on pitch class for variety
        primary: { h: (n.pc * 30) % 360, s: 0.7, v: 0.9, a: 1 },
      },
      texture: { id: "smooth", grain: 0.1, smoothness: 0.9, density: 0.5 },
      motion: { jitter: 0.05, pulse: 0.3, flow: 0.1 },
      uncertainty: 0,
      label: `Note-${n.pc}`,
    },
  }));

  return {
    t,
    part: "main",
    notes,
    chords: [],
    rhythm: {
      analysis: {
        detectedDivision: options.tempo ? 60000 / options.tempo : null,
        onsetDrifts: options.onsetDrifts ?? [],
        stability: 0.9,
        confidence: 0.9,
      },
      visual: {
        palette: { id: "rhythm", primary: { h: 200, s: 0.3, v: 0.7, a: 1 } },
        texture: { id: "rhythm", grain: 0.1, smoothness: 0.9, density: 0.5 },
        motion: { jitter: 0, pulse: 0.6, flow: 0 },
        uncertainty: 0.1,
      },
      prescribedTempo: options.tempo ?? null,
      prescribedMeter: options.meter ?? null,
    },
    bars: [],
    phrases: [],
    dynamics: {
      dynamics: { level: 0.7, trend: "stable" },
      visual: {
        palette: { id: "dynamics", primary: { h: 0, s: 0, v: 0.7, a: 1 } },
        texture: { id: "dynamics", grain: 0.1, smoothness: 0.8, density: 0.7 },
        motion: { jitter: 0.05, pulse: 0.7, flow: 0 },
        uncertainty: 0.1,
      },
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("RhythmGrammar", () => {
  let grammar: RhythmGrammar;

  beforeEach(() => {
    grammar = new RhythmGrammar();
    grammar.init(ctx);
  });

  describe("basic structure", () => {
    it("produces entities for empty frame", () => {
      const frame = createTestFrame(1000, { tempo: 120 });
      const scene = grammar.update(frame, null);

      // Should have at least the NOW line
      expect(scene.entities.length).toBeGreaterThan(0);
      const nowLine = scene.entities.find((e) => e.data?.type === "now-line");
      expect(nowLine).toBeDefined();
    });

    it("produces beat grid lines at Tier 2", () => {
      const frame = createTestFrame(2000, { tempo: 120 });
      const scene = grammar.update(frame, null);

      const beatLines = scene.entities.filter((e) => e.data?.type === "beat-line");
      expect(beatLines.length).toBeGreaterThan(0);

      // At 120 BPM, beat every 500ms. Window should show several beats.
      console.log(`Beat lines: ${beatLines.length}`);
    });

    it("produces bar lines at Tier 3", () => {
      const frame = createTestFrame(4000, {
        tempo: 120,
        meter: { beatsPerBar: 4, beatUnit: 4 },
      });
      const scene = grammar.update(frame, null);

      const barLines = scene.entities.filter((e) => e.data?.type === "bar-line");
      expect(barLines.length).toBeGreaterThan(0);
    });
  });

  describe("note positioning", () => {
    it("positions notes by pitch class on x-axis", () => {
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [
          { id: "c", pc: 0, onset: 1000 }, // C - should be left
          { id: "f#", pc: 6, onset: 1000 }, // F# - should be middle
          { id: "b", pc: 11, onset: 1000 }, // B - should be right
        ],
      });

      const scene = grammar.update(frame, null);
      const notes = scene.entities.filter((e) => e.data?.type === "note-bar");

      expect(notes.length).toBe(3);

      // Find notes by pitch class
      const cNote = notes.find((n) => n.data?.pitchClass === 0);
      const fsNote = notes.find((n) => n.data?.pitchClass === 6);
      const bNote = notes.find((n) => n.data?.pitchClass === 11);

      expect(cNote).toBeDefined();
      expect(fsNote).toBeDefined();
      expect(bNote).toBeDefined();

      // C should be leftmost, B should be rightmost
      expect(cNote!.position!.x).toBeLessThan(fsNote!.position!.x);
      expect(fsNote!.position!.x).toBeLessThan(bNote!.position!.x);
    });

    it("positions notes by time on y-axis", () => {
      const frame = createTestFrame(2000, {
        tempo: 120,
        notes: [
          { id: "old", pc: 0, onset: 500 }, // Old note - should be high (past)
          { id: "recent", pc: 0, onset: 1800 }, // Recent note - closer to NOW
          { id: "now", pc: 0, onset: 2000 }, // Current note - at NOW line
        ],
      });

      const scene = grammar.update(frame, null);
      const notes = scene.entities.filter((e) => e.data?.type === "note-bar");

      const oldNote = notes.find((n) => n.data?.noteId === "old");
      const recentNote = notes.find((n) => n.data?.noteId === "recent");
      const nowNote = notes.find((n) => n.data?.noteId === "now");

      expect(oldNote).toBeDefined();
      expect(recentNote).toBeDefined();
      expect(nowNote).toBeDefined();

      // Older notes should have smaller y (higher on screen)
      expect(oldNote!.position!.y).toBeLessThan(recentNote!.position!.y);
      expect(recentNote!.position!.y).toBeLessThan(nowNote!.position!.y);

      // Now note should be near NOW_LINE_Y (0.85)
      expect(nowNote!.position!.y).toBeCloseTo(0.85, 1);
    });
  });

  describe("drift visualization", () => {
    it("adds streak lines for notes with drift", () => {
      // 120 BPM = 500ms per beat
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [
          { id: "late", pc: 0, onset: 550 }, // 50ms late
        ],
        onsetDrifts: [
          {
            t: 550,
            subdivisions: [
              { label: "quarter", period: 500, drift: 50, nearest: true },
            ],
          },
        ],
      });

      const scene = grammar.update(frame, null);

      // Should have streak entities for the late note
      const streaks = scene.entities.filter((e) => e.data?.type === "streak");
      expect(streaks.length).toBeGreaterThan(0);

      // Streaks should reference the note
      expect(streaks[0].data?.noteId).toBe("late");
      expect(streaks[0].data?.driftMs).toBe(50);
    });

    it("adds reference line for tight notes", () => {
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [
          { id: "tight", pc: 0, onset: 510 }, // Only 10ms late - within tolerance
        ],
        onsetDrifts: [
          {
            t: 510,
            subdivisions: [
              { label: "quarter", period: 500, drift: 10, nearest: true },
            ],
          },
        ],
      });

      const scene = grammar.update(frame, null);

      // Should have reference line for tight note
      const refLines = scene.entities.filter((e) => e.data?.type === "reference-line");
      expect(refLines.length).toBe(1);
      expect(refLines[0].data?.noteId).toBe("tight");
    });

    it("does not add streaks for tight notes", () => {
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [
          { id: "tight", pc: 0, onset: 510 },
        ],
        onsetDrifts: [
          {
            t: 510,
            subdivisions: [
              { label: "quarter", period: 500, drift: 10, nearest: true },
            ],
          },
        ],
      });

      const scene = grammar.update(frame, null);

      const streaks = scene.entities.filter((e) => e.data?.type === "streak");
      expect(streaks.length).toBe(0);
    });
  });

  describe("horizon macro", () => {
    it("shows full history at max horizon", () => {
      grammar.setMacros({ horizon: 1.0 });

      const frame = createTestFrame(8000, {
        tempo: 120,
        notes: [
          { id: "old", pc: 0, onset: 1000 }, // 7 seconds ago
          { id: "recent", pc: 3, onset: 7500 },
        ],
      });

      const scene = grammar.update(frame, null);
      const notes = scene.entities.filter((e) => e.data?.type === "note-bar");

      // Both notes should be visible
      expect(notes.length).toBe(2);
    });

    it("shows limited history at min horizon", () => {
      grammar.setMacros({ horizon: 0.0 });

      const frame = createTestFrame(8000, {
        tempo: 120, // 500ms per beat
        notes: [
          { id: "old", pc: 0, onset: 1000 }, // Way too old
          { id: "recent", pc: 3, onset: 7600 }, // Within ~1 beat
        ],
      });

      const scene = grammar.update(frame, null);
      const notes = scene.entities.filter((e) => e.data?.type === "note-bar");

      // Only recent note should be visible
      expect(notes.length).toBe(1);
      expect(notes[0].data?.noteId).toBe("recent");
    });

    it("reduces beat line visibility at min horizon", () => {
      const frame = createTestFrame(4000, { tempo: 120 });

      grammar.setMacros({ horizon: 1.0 });
      const sceneMax = grammar.update(frame, null);
      const beatLinesMax = sceneMax.entities.filter((e) => e.data?.type === "beat-line");

      grammar.setMacros({ horizon: 0.0 });
      grammar.init(ctx); // Reset state
      const sceneMin = grammar.update(frame, null);
      const beatLinesMin = sceneMin.entities.filter((e) => e.data?.type === "beat-line");

      // Should have fewer beat lines at min horizon
      expect(beatLinesMin.length).toBeLessThan(beatLinesMax.length);
    });
  });

  describe("subdivision depth macro", () => {
    it("calculates drift relative to selected subdivision", () => {
      // 120 BPM: quarter=500ms, 8th=250ms, 16th=125ms
      // Note at 125ms - exactly on 16th note, but 125ms from quarter
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "n", pc: 0, onset: 125 }],
        onsetDrifts: [
          {
            t: 125,
            subdivisions: [
              { label: "quarter", period: 500, drift: 125, nearest: false },
              { label: "8th", period: 250, drift: 125, nearest: false },
              { label: "16th", period: 125, drift: 0, nearest: true },
            ],
          },
        ],
      });

      // At 16th subdivision (default), drift should be 0
      grammar.setMacros({ subdivisionDepth: "16th" });
      const scene16 = grammar.update(frame, null);
      const note16 = scene16.entities.find((e) => e.data?.type === "note-bar");
      expect(note16?.data?.driftMs).toBe(0);

      // At quarter subdivision, drift should be 125ms
      grammar.setMacros({ subdivisionDepth: "quarter" });
      grammar.init(ctx);
      const sceneQ = grammar.update(frame, null);
      const noteQ = sceneQ.entities.find((e) => e.data?.type === "note-bar");
      expect(noteQ?.data?.driftMs).toBe(125);
    });
  });
});

// ============================================================================
// Visual Snapshot Tests
// ============================================================================

describe("RhythmGrammar snapshots", () => {
  let grammar: RhythmGrammar;

  beforeEach(() => {
    grammar = new RhythmGrammar();
    grammar.init(ctx);
  });

  it("renders basic beat grid (Tier 2)", () => {
    const frame = createTestFrame(2000, { tempo: 120 });
    const scene = grammar.update(frame, null);

    const svg = maybeWriteSnapshot("rhythm-basic-grid", scene);
    const metrics = extractMetrics(scene);

    console.log("\nBasic Grid:\n" + formatMetrics(metrics));

    expect(svg).toContain("beat-line");
    expect(svg).toContain("now-line");
  });

  it("renders notes across pitch classes", () => {
    const frame = createTestFrame(1000, {
      tempo: 120,
      notes: [
        { id: "c", pc: 0, onset: 1000, velocity: 100 },
        { id: "e", pc: 4, onset: 900, velocity: 80 },
        { id: "g", pc: 7, onset: 800, velocity: 60 },
        { id: "b", pc: 11, onset: 700, velocity: 90 },
      ],
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-pitch-spread", scene);
    const metrics = extractMetrics(scene);

    console.log("\nPitch Spread:\n" + formatMetrics(metrics));

    // Notes should span x-axis
    expect(metrics.positions.bounds.minX).toBeLessThan(0.2);
    expect(metrics.positions.bounds.maxX).toBeGreaterThan(0.8);
  });

  it("renders notes with drift streaks", () => {
    // 120 BPM = 500ms per beat
    const frame = createTestFrame(2000, {
      tempo: 120,
      notes: [
        { id: "early", pc: 2, onset: 1400 }, // 100ms early
        { id: "tight", pc: 5, onset: 1505 }, // 5ms late (tight)
        { id: "late", pc: 9, onset: 1600 }, // 100ms late
      ],
      onsetDrifts: [
        {
          t: 1400,
          subdivisions: [{ label: "quarter", period: 500, drift: -100, nearest: true }],
        },
        {
          t: 1505,
          subdivisions: [{ label: "quarter", period: 500, drift: 5, nearest: true }],
        },
        {
          t: 1600,
          subdivisions: [{ label: "quarter", period: 500, drift: 100, nearest: true }],
        },
      ],
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-drift-streaks", scene);
    const metrics = extractMetrics(scene);

    console.log("\nDrift Streaks:\n" + formatMetrics(metrics));

    // Should have streaks for early and late, but not tight
    expect(metrics.byType["streak"]).toBeGreaterThan(0);
    // All notes with drift info get reference lines
    expect(metrics.byType["reference-line"]).toBe(3);
  });

  it("renders with bar lines (Tier 3)", () => {
    const frame = createTestFrame(4000, {
      tempo: 120,
      meter: { beatsPerBar: 4, beatUnit: 4 },
      notes: [
        { id: "n1", pc: 0, onset: 2000 },
        { id: "n2", pc: 4, onset: 2500 },
        { id: "n3", pc: 7, onset: 3000 },
        { id: "n4", pc: 11, onset: 3500 },
      ],
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-tier3-bars", scene);
    const metrics = extractMetrics(scene);

    console.log("\nTier 3 with Bars:\n" + formatMetrics(metrics));

    expect(metrics.byType["bar-line"]).toBeGreaterThan(0);
  });

  it("renders at minimum horizon", () => {
    grammar.setMacros({ horizon: 0.0 });

    const frame = createTestFrame(4000, {
      tempo: 120,
      notes: [
        { id: "old", pc: 0, onset: 1000 }, // Should not be visible
        { id: "recent", pc: 7, onset: 3700 }, // Should be visible
      ],
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-min-horizon", scene);
    const metrics = extractMetrics(scene);

    console.log("\nMin Horizon:\n" + formatMetrics(metrics));

    // Should have very few beat lines
    expect(metrics.byType["beat-line"] || 0).toBeLessThan(5);
  });

  it("renders dense note sequence", () => {
    // Simulate fast playing - many notes in quick succession
    const notes = [];
    for (let i = 0; i < 16; i++) {
      notes.push({
        id: `n${i}`,
        pc: ((i * 7) % 12) as PitchClass, // Cycle through fifths
        onset: 1000 + i * 125, // 16th notes at 120 BPM
        velocity: 60 + (i % 4) * 20,
      });
    }

    const frame = createTestFrame(3000, {
      tempo: 120,
      notes,
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-dense-notes", scene);
    const metrics = extractMetrics(scene);

    console.log("\nDense Notes:\n" + formatMetrics(metrics));

    expect(metrics.byType["note-bar"]).toBe(16);
  });

  it("renders sustained notes as bars", () => {
    // Notes with varying durations to show bar length
    const frame = createTestFrame(3000, {
      tempo: 120,
      notes: [
        { id: "short", pc: 0, onset: 2000, duration: 100, velocity: 80 }, // Short staccato
        { id: "quarter", pc: 3, onset: 2000, duration: 500, velocity: 90 }, // Quarter note
        { id: "half", pc: 7, onset: 1500, duration: 1000, velocity: 100 }, // Half note
        { id: "held", pc: 10, onset: 1000, duration: 2000, velocity: 70 }, // Still being held
      ],
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-sustained-notes", scene);
    const metrics = extractMetrics(scene);

    console.log("\nSustained Notes:\n" + formatMetrics(metrics));

    expect(metrics.byType["note-bar"]).toBe(4);
  });

  it("renders early and late notes with streak direction", () => {
    // Clear demonstration of streak direction for drift
    // 120 BPM = 500ms per beat, beats at 0, 500, 1000, 1500, 2000...
    const frame = createTestFrame(2500, {
      tempo: 120,
      notes: [
        // Early note: played at 1400 but beat is at 1500 - streaks point UP (toward future beat)
        { id: "early", pc: 2, onset: 1400, duration: 200 },
        // Late note: played at 1600 but beat was at 1500 - streaks point DOWN (toward past beat)
        { id: "late", pc: 9, onset: 1600, duration: 200 },
        // On-beat note: played exactly at 2000 - reference line only
        { id: "onbeat", pc: 5, onset: 2000, duration: 300 },
      ],
      onsetDrifts: [
        {
          t: 1400,
          subdivisions: [{ label: "quarter", period: 500, drift: -100, nearest: true }],
        },
        {
          t: 1600,
          subdivisions: [{ label: "quarter", period: 500, drift: 100, nearest: true }],
        },
        {
          t: 2000,
          subdivisions: [{ label: "quarter", period: 500, drift: 0, nearest: true }],
        },
      ],
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-streak-direction", scene);
    const metrics = extractMetrics(scene);

    console.log("\nStreak Direction:\n" + formatMetrics(metrics));

    // Early and late notes should have streaks (3 each = 6 total)
    expect(metrics.byType["streak"]).toBe(6);
    // All notes get reference lines showing where the beat was
    expect(metrics.byType["reference-line"]).toBe(3);
  });

  it("renders lingering reference window (streaks outlive notes)", () => {
    // This test shows the reference window (streaks + reference lines)
    // lingering after note bars have faded.
    //
    // At horizon=0.5, note window is ~4s but reference window is ~4.8s (1.2x).
    // We set t=5000 with notes from t=1000-2000, so:
    // - Notes at t=1000-2000 are 3000-4000ms old
    // - At horizon=0.5, noteHistoryMs ≈ 4250ms, streakHistoryMs ≈ 5100ms
    // - Notes should be visible but fading; reference elements still visible
    grammar.setMacros({ horizon: 0.5 });

    const frame = createTestFrame(5000, {
      tempo: 120,
      notes: [
        { id: "old-early", pc: 2, onset: 1200, duration: 300 }, // 3800ms old, early
        { id: "old-late", pc: 9, onset: 1800, duration: 300 }, // 3200ms old, late
        { id: "recent", pc: 5, onset: 4500, duration: 300 }, // 500ms old, on-beat
      ],
      onsetDrifts: [
        {
          t: 1200,
          subdivisions: [{ label: "quarter", period: 500, drift: -80, nearest: true }],
        },
        {
          t: 1800,
          subdivisions: [{ label: "quarter", period: 500, drift: 80, nearest: true }],
        },
        {
          t: 4500,
          subdivisions: [{ label: "quarter", period: 500, drift: 0, nearest: true }],
        },
      ],
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-reference-window", scene);
    const metrics = extractMetrics(scene);

    console.log("\nReference Window (lingering):\n" + formatMetrics(metrics));

    // Should have reference lines for old notes (in reference window)
    // and the recent note
    expect(metrics.byType["reference-line"]).toBeGreaterThanOrEqual(2);
    // Old notes with drift should still have streaks (in reference window)
    expect(metrics.byType["streak"]).toBeGreaterThan(0);
  });

  it("renders at middle horizon (0.5)", () => {
    grammar.setMacros({ horizon: 0.5 });

    const frame = createTestFrame(4000, {
      tempo: 120,
      meter: { beatsPerBar: 4, beatUnit: 4 },
      notes: [
        { id: "n1", pc: 0, onset: 1000, duration: 500 }, // 3s old
        { id: "n2", pc: 4, onset: 2000, duration: 500 }, // 2s old
        { id: "n3", pc: 7, onset: 3000, duration: 500 }, // 1s old
        { id: "n4", pc: 11, onset: 3800, duration: 200 }, // 200ms old
      ],
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-mid-horizon", scene);
    const metrics = extractMetrics(scene);

    console.log("\nMid Horizon (0.5):\n" + formatMetrics(metrics));

    // Should have fewer elements than max horizon but more than min
    expect(metrics.byType["note-bar"]).toBeGreaterThanOrEqual(2);
    expect(metrics.byType["beat-line"]).toBeGreaterThan(0);
  });
});
