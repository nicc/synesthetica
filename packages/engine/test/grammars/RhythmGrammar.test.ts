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
  AnnotatedNote,
  PitchClass,
} from "@synesthetica/contracts";
import { createTestAnnotatedFrame } from "../_harness/frames";

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
  }
) {
  const vel = (v: number) => v ?? 80;
  const notes: AnnotatedNote[] = (options.notes ?? []).map((n) => ({
    note: {
      id: n.id,
      pitch: { pc: n.pc, octave: n.octave ?? 4 },
      velocity: vel(n.velocity ?? 80),
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
    velocity: {
      sizeMultiplier: 0.5 + (vel(n.velocity ?? 80) / 127) * 1.5,
      attackMs: 50 - (vel(n.velocity ?? 80) / 127) * 50,
    },
    phaseState: {
      phase: n.phase ?? "sustain",
      intensity: n.phase === "release" ? 0.5 : 1.0,
    },
  }));

  return createTestAnnotatedFrame(t, "main", {
    notes,
    rhythmicAnalysis: {
      detectedDivision: null,
      onsetDrifts: [],
      stability: 0,
      confidence: 0,
    },
    prescribedTempo: options.tempo ?? null,
    prescribedMeter: options.meter ?? null,
  });
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

  describe("free-time mode (no prescribed tempo)", () => {
    it("renders now line + notes but no grid or drift when tempo is null", () => {
      const frame = createTestFrame(2000, {
        notes: [{ id: "n1", pc: 0, onset: 1800 }],
        // no tempo prescribed
      });

      const scene = grammar.update(frame, null);

      const nowLine = scene.entities.find((e) => e.data?.type === "now-line");
      const beatLines = scene.entities.filter((e) => e.data?.type === "beat-line");
      const barLines = scene.entities.filter((e) => e.data?.type === "bar-line");
      const streaks = scene.entities.filter((e) => e.data?.type === "streak");
      const refLines = scene.entities.filter((e) => e.data?.type === "reference-line");
      const notes = scene.entities.filter((e) => e.data?.type === "note-strip");

      expect(nowLine).toBeDefined();
      expect(notes.length).toBeGreaterThan(0);
      expect(beatLines.length).toBe(0);
      expect(barLines.length).toBe(0);
      expect(streaks.length).toBe(0);
      expect(refLines.length).toBe(0);
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
      const notes = scene.entities.filter((e) => e.data?.type === "note-strip");

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
      const notes = scene.entities.filter((e) => e.data?.type === "note-strip");

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
      // Tempo=120 gives 500ms beats. Onset at 550 = 50ms after the 500ms beat line.
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "late", pc: 0, onset: 550 }],
      });

      const scene = grammar.update(frame, null);

      const streaks = scene.entities.filter((e) => e.data?.type === "streak");
      expect(streaks.length).toBeGreaterThan(0);
      expect(streaks[0].data?.noteId).toBe("late");
      expect(streaks[0].data?.driftMs as number).toBeCloseTo(50, 6);
    });

    it("adds reference line for tight notes", () => {
      // Onset at 510 is only 10ms late — within tolerance, tight.
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "tight", pc: 0, onset: 510 }],
      });

      const scene = grammar.update(frame, null);

      const refLines = scene.entities.filter((e) => e.data?.type === "reference-line");
      expect(refLines.length).toBe(1);
      expect(refLines[0].data?.noteId).toBe("tight");
    });

    it("does not add streaks for tight notes", () => {
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "tight", pc: 0, onset: 510 }],
      });

      const scene = grammar.update(frame, null);

      const streaks = scene.entities.filter((e) => e.data?.type === "streak");
      expect(streaks.length).toBe(0);
    });
  });

  describe("drift cache (referential transparency)", () => {
    it("freezes drift once computed, even when tempo changes", () => {
      // Frame 1: tempo=120 (500ms beat), onset=550 → drift=50
      const frame1 = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 550 }],
      });
      const scene1 = grammar.update(frame1, null);
      const note1 = scene1.entities.find((e) => e.data?.type === "note-strip");
      expect(note1?.data?.driftMs as number).toBeCloseTo(50, 6);

      // Frame 2: tempo changes to 100 (600ms beat). Recomputing from the
      // new grid would give a different drift; cache keeps drift=50.
      const frame2 = createTestFrame(1100, {
        tempo: 100,
        notes: [{ id: "n1", pc: 0, onset: 550 }],
      });
      const scene2 = grammar.update(frame2, null);
      const note2 = scene2.entities.find((e) => e.data?.type === "note-strip");
      expect(note2?.data?.driftMs as number).toBeCloseTo(50, 6);
    });

    it("preserves drift when tier drops from 2 to 1", () => {
      // Frame 1: tier 2 (has tempo) → drift computed
      const frame1 = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 550 }],
      });
      const scene1 = grammar.update(frame1, null);
      const streaks1 = scene1.entities.filter((e) => e.data?.type === "streak");
      expect(streaks1.length).toBeGreaterThan(0);

      // Frame 2: tempo cleared → tier 1. Without cache, drift would go null
      // and streaks would vanish. Cache preserves the drift value.
      const frame2 = createTestFrame(1100, {
        notes: [{ id: "n1", pc: 0, onset: 550 }],
      });
      const scene2 = grammar.update(frame2, null);
      const streaks2 = scene2.entities.filter((e) => e.data?.type === "streak");
      expect(streaks2.length).toBeGreaterThan(0);
    });

    it("prunes cache when note leaves the frame", () => {
      // Frame 1: note present, drift cached
      const frame1 = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 550 }],
      });
      grammar.update(frame1, null);

      // Frame 2: note gone (pruned by stabilizer)
      const frame2 = createTestFrame(2000, {
        tempo: 120,
        notes: [],
      });
      grammar.update(frame2, null);

      // Frame 3: same note ID reappears with a different onset and so a
      // different drift. Should compute fresh from the grid, not return
      // the stale cached value.
      const frame3 = createTestFrame(3000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 2470 }], // 30ms early vs 2500
      });
      const scene3 = grammar.update(frame3, null);
      const note3 = scene3.entities.find((e) => e.data?.type === "note-strip");
      expect(note3?.data?.driftMs as number).toBeCloseTo(-30, 6);
    });
  });

  describe("entity ID stability across frames", () => {
    it("produces identical entity IDs for the same note in consecutive frames", () => {
      const frame1 = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 800 }],
      });

      const scene1 = grammar.update(frame1, null);

      // Frame 2: same note, slightly later — entity IDs must be identical
      const frame2 = createTestFrame(1050, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 800 }],
      });

      const scene2 = grammar.update(frame2, null);

      // Every entity present in both frames should have the same ID
      // Filter to note-related entities (beat lines shift with time)
      const noteIds1 = scene1.entities
        .filter((e) => e.data?.type === "note-strip" || e.data?.type === "streak" || e.data?.type === "reference-line")
        .map((e) => e.id)
        .sort();
      const noteIds2 = scene2.entities
        .filter((e) => e.data?.type === "note-strip" || e.data?.type === "streak" || e.data?.type === "reference-line")
        .map((e) => e.id)
        .sort();

      expect(noteIds1.length).toBeGreaterThan(0);
      expect(noteIds1).toEqual(noteIds2);
    });

    it("does not include frame-unique counters in entity IDs", () => {
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 800 }],
      });

      const scene = grammar.update(frame, null);

      // Entity IDs should not end with incrementing counters
      for (const entity of scene.entities) {
        // IDs should follow pattern "grammar-id:descriptive-base"
        // not "grammar-id:descriptive-base:0", "grammar-id:descriptive-base:1", etc.
        const parts = entity.id.split(":");
        const lastPart = parts[parts.length - 1];
        expect(lastPart).not.toMatch(/^\d+$/);
      }
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
      const notes = scene.entities.filter((e) => e.data?.type === "note-strip");

      // Both notes should be visible
      expect(notes.length).toBe(2);
    });

    it("shows limited history at min horizon", () => {
      grammar.setMacros({ horizon: 0.0 });

      // At t=10000 with 8000ms scroll horizon, notes ending before t=2000
      // have scrolled off the top of the screen (endY < 0)
      const frame = createTestFrame(10000, {
        tempo: 120, // 500ms per beat
        notes: [
          { id: "old", pc: 0, onset: 1000, duration: 200, phase: "release" }, // endTime=1200, off-screen
          { id: "recent", pc: 3, onset: 9600 }, // Within ~1 beat
        ],
      });

      const scene = grammar.update(frame, null);
      const notes = scene.entities.filter((e) => e.data?.type === "note-strip");

      // Only recent note should be visible (old note scrolled off top of screen)
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
      });

      // At 16th subdivision (default), drift should be 0
      grammar.setMacros({ subdivisionDepth: "16th" });
      const scene16 = grammar.update(frame, null);
      const note16 = scene16.entities.find((e) => e.data?.type === "note-strip");
      expect(note16?.data?.driftMs).toBe(0);

      // At quarter subdivision, drift should be 125ms
      grammar.setMacros({ subdivisionDepth: "quarter" });
      grammar.init(ctx);
      const sceneQ = grammar.update(frame, null);
      const noteQ = sceneQ.entities.find((e) => e.data?.type === "note-strip");
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
    // Snapshot tests describe drift against the quarter-note grid. The
    // grammar's default subdivisionDepth is "16th"; override for these
    // fixtures so onset offsets of ~100ms are clearly off-beat.
    grammar.setMacros({ subdivisionDepth: "quarter" });
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

    // Notes should span the rhythm column. Column is narrower in the
    // new layout (rhythm 0.44 wide, ending at ~0.51).
    expect(metrics.positions.bounds.minX).toBeLessThan(0.2);
    expect(metrics.positions.bounds.maxX).toBeGreaterThan(0.45);
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

    expect(metrics.byType["note-strip"]).toBe(16);
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

    expect(metrics.byType["note-strip"]).toBe(4);
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
    // At horizon=0.5, note window is ~4.25s but reference window is ~5.5s (1.3x).
    // We set t=5000 with notes from t=1000-2000, so:
    // - Notes at t=1000-2000 are 3000-4000ms old
    // - At horizon=0.5, noteHistoryMs ≈ 4250ms, streakHistoryMs ≈ 5525ms
    // - Notes should be visible but fading; reference elements still visible
    grammar.setMacros({ horizon: 0.5 });

    const frame = createTestFrame(5000, {
      tempo: 120,
      notes: [
        { id: "old-early", pc: 2, onset: 1200, duration: 300 }, // 3800ms old, early
        { id: "old-late", pc: 9, onset: 1800, duration: 300 }, // 3200ms old, late
        { id: "recent", pc: 5, onset: 4500, duration: 300 }, // 500ms old, on-beat
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
    expect(metrics.byType["note-strip"]).toBeGreaterThanOrEqual(2);
    expect(metrics.byType["beat-line"]).toBeGreaterThan(0);
  });

  it("shows reference lines lingering after notes fade", () => {
    // This snapshot clearly demonstrates the linger effect:
    // - Note window at horizon=1.0 is 8000ms
    // - Reference window is 1.3x = 10400ms
    // - Notes >8000ms old are OUTSIDE note window (no bars)
    // - But INSIDE reference window (<10400ms) so reference lines visible
    // - Recent notes show both bars AND reference lines for comparison
    grammar.setMacros({ horizon: 1.0 });

    const frame = createTestFrame(10000, {
      tempo: 120,
      notes: [
        // Faded notes: past the note window but inside the reference
        // window. Bars + reference lines shouldn't render (onsetY < 0).
        { id: "faded-early", pc: 0, onset: 1500, duration: 200, phase: "release" }, // 8500ms old
        { id: "faded-late", pc: 3, onset: 1700, duration: 200, phase: "release" }, // 8300ms old
        { id: "faded-tight", pc: 6, onset: 1900, duration: 200, phase: "release" }, // 8100ms old

        // Visible notes. Off-grid onsets so they produce drift streaks.
        { id: "visible-early", pc: 9, onset: 8580, duration: 200 }, // 80ms late vs beat 8500
        { id: "visible-late", pc: 11, onset: 9420, duration: 200 }, // 80ms early vs beat 9500
      ],
    });

    const scene = grammar.update(frame, null);
    maybeWriteSnapshot("rhythm-linger-effect", scene);
    const metrics = extractMetrics(scene);

    console.log("\nLinger Effect:\n" + formatMetrics(metrics));

    // Only the 2 visible notes have onsetY >= 0 and render bars.
    expect(metrics.byType["note-strip"]).toBe(3);
    // Both visible notes qualify for reference lines.
    expect(metrics.byType["reference-line"]).toBe(2);
    // Both visible notes are off-grid (80ms drift) so produce streaks.
    expect(metrics.byType["streak"]).toBeGreaterThan(0);
  });
});
