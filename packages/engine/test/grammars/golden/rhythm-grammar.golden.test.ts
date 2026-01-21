/**
 * Golden Tests: TestRhythmGrammar (Three-Tier Visualization)
 *
 * Tests the AnnotatedMusicalFrame → SceneFrame boundary for the rhythm grammar.
 * Verifies that the three-tier visualization produces correct scene entities:
 *
 * Tier 1 (Historic-only): onset-marker, division-tick
 * Tier 2 (Tempo-relative): onset-marker, beat-line, drift-ring
 * Tier 3 (Meter-relative): onset-marker, beat-line, bar-line, drift-ring, downbeat-glow
 */

import { describe, it, beforeEach, expect } from "vitest";
import {
  loadFixturesFromDir,
  type SequenceFixture,
} from "../../_harness/golden";
import type {
  AnnotatedMusicalFrame,
  AnnotatedNote,
  AnnotatedChord,
  SceneFrame,
  GrammarContext,
  PitchClass,
} from "@synesthetica/contracts";
import { TestRhythmGrammar } from "../../../src/grammars/TestRhythmGrammar";

/**
 * Expected output shape for grammar fixtures.
 */
interface ExpectedOutput {
  entityCount?: number;
  entityTypes: Record<string, number>;
  tier: 1 | 2 | 3;
}

type GrammarSequenceFixture = SequenceFixture<AnnotatedMusicalFrame, ExpectedOutput>;

/**
 * Compare actual SceneFrame against expected output.
 */
function compareOutput(actual: SceneFrame, expected: ExpectedOutput): void {
  // Check entity type counts
  const actualTypeCounts: Record<string, number> = {};
  for (const entity of actual.entities) {
    const type = (entity.data?.type as string) || "unknown";
    actualTypeCounts[type] = (actualTypeCounts[type] || 0) + 1;
  }

  for (const [type, expectedCount] of Object.entries(expected.entityTypes)) {
    const actualCount = actualTypeCounts[type] || 0;
    if (actualCount !== expectedCount) {
      throw new Error(
        `Entity type "${type}" count mismatch: expected ${expectedCount}, got ${actualCount}`
      );
    }
  }

  // Check total entity count if specified
  if (expected.entityCount !== undefined && actual.entities.length !== expected.entityCount) {
    throw new Error(
      `Entity count mismatch: expected ${expected.entityCount}, got ${actual.entities.length}\n` +
      `Entities: ${JSON.stringify(actualTypeCounts, null, 2)}`
    );
  }
}

describe("TestRhythmGrammar golden tests", () => {
  const ctx: GrammarContext = {
    canvasSize: { width: 1920, height: 1080 },
    rngSeed: 12345,
    part: "main",
  };

  // Load all sequence fixtures
  const fixtures = loadFixturesFromDir<GrammarSequenceFixture>(
    "grammar/rhythm"
  ).filter(f => f.steps !== undefined);

  for (const fixture of fixtures) {
    describe(fixture.name, () => {
      let grammar: TestRhythmGrammar;

      beforeEach(() => {
        grammar = new TestRhythmGrammar();
        grammar.init(ctx);
      });

      it(fixture.description, () => {
        let previous: SceneFrame | null = null;

        for (const step of fixture.steps) {
          const actual = grammar.update(step.input, previous);

          try {
            compareOutput(actual, step.expected);
          } catch (e) {
            throw new Error(
              `Step t=${step.t} failed: ${e instanceof Error ? e.message : e}`
            );
          }

          previous = actual;
        }
      });
    });
  }

  // ============================================================================
  // Tier 1: Historic-only (no prescribed tempo)
  // ============================================================================

  describe("Tier 1: Historic-only", () => {
    let grammar: TestRhythmGrammar;

    beforeEach(() => {
      grammar = new TestRhythmGrammar();
      grammar.init(ctx);
    });

    it("produces onset markers for notes without tempo", () => {
      const frame = createMinimalFrame(0, {
        tier: 1,
        noteCount: 3,
      });

      const scene = grammar.update(frame, null);

      const markers = scene.entities.filter(e => e.data?.type === "onset-marker");
      expect(markers.length).toBe(3);
      expect(markers[0].kind).toBe("particle");
    });

    it("produces division ticks when division is detected", () => {
      const frame = createMinimalFrame(1000, {
        tier: 1,
        noteCount: 1,
        detectedDivision: 500,
      });

      const scene = grammar.update(frame, null);

      const ticks = scene.entities.filter(e => e.data?.type === "division-tick");
      expect(ticks.length).toBeGreaterThan(0);
    });

    it("positions onset markers by pitch octave (y-axis)", () => {
      const frame = createMinimalFrame(0, {
        tier: 1,
        noteCount: 1,
        noteOctave: 6,
      });

      const scene = grammar.update(frame, null);

      const marker = scene.entities.find(e => e.data?.type === "onset-marker");
      expect(marker).toBeDefined();
      // Higher octave = higher on screen = lower y value
      expect(marker!.position!.y).toBeLessThan(0.5);
    });

    it("respects palette colors from annotations (never overrides)", () => {
      const frame = createMinimalFrame(0, {
        tier: 1,
        noteCount: 1,
        noteHue: 180, // Cyan
      });

      const scene = grammar.update(frame, null);

      const marker = scene.entities.find(e => e.data?.type === "onset-marker");
      expect(marker).toBeDefined();
      expect(marker!.style.color!.h).toBeCloseTo(180, 1);
    });
  });

  // ============================================================================
  // Tier 2: Tempo-relative (prescribed tempo, no meter)
  // ============================================================================

  describe("Tier 2: Tempo-relative", () => {
    let grammar: TestRhythmGrammar;

    beforeEach(() => {
      grammar = new TestRhythmGrammar();
      grammar.init(ctx);
    });

    it("produces beat-line entities at beat intervals", () => {
      const frame = createMinimalFrame(1000, {
        tier: 2,
        noteCount: 0,
        prescribedTempo: 120, // 500ms per beat
              });

      const scene = grammar.update(frame, null);

      const beatLines = scene.entities.filter(e => e.data?.type === "beat-line");
      expect(beatLines.length).toBeGreaterThan(0);
      expect(beatLines[0].kind).toBe("field");
    });

    it("produces drift rings for notes", () => {
      const frame = createMinimalFrame(500, {
        tier: 2,
        noteCount: 1,
        prescribedTempo: 120,
              });

      const scene = grammar.update(frame, null);

      const driftRings = scene.entities.filter(e => e.data?.type === "drift-ring");
      expect(driftRings.length).toBe(1);
      expect(driftRings[0].kind).toBe("field");
    });

    it("drift ring color reflects timing accuracy", () => {
      // Note exactly on beat
      const frameOnBeat = createMinimalFrame(500, {
        tier: 2,
        noteCount: 1,
        prescribedTempo: 120,
                noteOnset: 500, // Exactly on beat
      });

      const sceneOnBeat = grammar.update(frameOnBeat, null);
      const ringOnBeat = sceneOnBeat.entities.find(e => e.data?.type === "drift-ring");
      expect(ringOnBeat!.data!.driftCategory).toBe("good");

      // Reset grammar
      grammar = new TestRhythmGrammar();
      grammar.init(ctx);

      // Note off beat
      const frameOffBeat = createMinimalFrame(650, {
        tier: 2,
        noteCount: 1,
        prescribedTempo: 120,
                noteOnset: 650, // 150ms late = 30% of beat
      });

      const sceneOffBeat = grammar.update(frameOffBeat, null);
      const ringOffBeat = sceneOffBeat.entities.find(e => e.data?.type === "drift-ring");
      expect(ringOffBeat!.data!.driftCategory).toBe("bad");
    });

    it("positions onset markers by drift (y-axis) not pitch", () => {
      const frame = createMinimalFrame(500, {
        tier: 2,
        noteCount: 1,
        prescribedTempo: 120,
                noteOnset: 500, // Exactly on beat
      });

      const scene = grammar.update(frame, null);

      const marker = scene.entities.find(e => e.data?.type === "onset-marker");
      expect(marker).toBeDefined();
      // On beat = centered vertically
      expect(marker!.position!.y).toBeCloseTo(0.5, 1);
    });

    it("does NOT produce bar lines (tier 2 has no meter)", () => {
      const frame = createMinimalFrame(1000, {
        tier: 2,
        noteCount: 0,
        prescribedTempo: 120,
              });

      const scene = grammar.update(frame, null);

      const barLines = scene.entities.filter(e => e.data?.type === "bar-line");
      expect(barLines.length).toBe(0);
    });
  });

  // ============================================================================
  // Tier 3: Meter-relative (prescribed tempo + meter)
  // ============================================================================

  describe("Tier 3: Meter-relative", () => {
    let grammar: TestRhythmGrammar;

    beforeEach(() => {
      grammar = new TestRhythmGrammar();
      grammar.init(ctx);
    });

    it("produces both beat-lines and bar-lines", () => {
      const frame = createMinimalFrame(3000, {
        tier: 3,
        noteCount: 0,
        prescribedTempo: 120,
        prescribedMeter: { beatsPerBar: 4, beatUnit: 4 },
              });

      const scene = grammar.update(frame, null);

      const beatLines = scene.entities.filter(e => e.data?.type === "beat-line");
      const barLines = scene.entities.filter(e => e.data?.type === "bar-line");

      expect(beatLines.length).toBeGreaterThan(0);
      expect(barLines.length).toBeGreaterThan(0);
    });

    it("produces downbeat glow near bar start", () => {
      // At t=100, we're 100ms into a bar (still in glow window)
      const frame = createMinimalFrame(100, {
        tier: 3,
        noteCount: 0,
        prescribedTempo: 120,
        prescribedMeter: { beatsPerBar: 4, beatUnit: 4 },
              });

      const scene = grammar.update(frame, null);

      const downbeatGlow = scene.entities.find(e => e.data?.type === "downbeat-glow");
      expect(downbeatGlow).toBeDefined();
      expect(downbeatGlow!.kind).toBe("field");
    });

    it("no downbeat glow mid-bar", () => {
      // At t=1000 (beat 2), we're past the glow window
      const frame = createMinimalFrame(1000, {
        tier: 3,
        noteCount: 0,
        prescribedTempo: 120,
        prescribedMeter: { beatsPerBar: 4, beatUnit: 4 },
              });

      const scene = grammar.update(frame, null);

      const downbeatGlow = scene.entities.find(e => e.data?.type === "downbeat-glow");
      expect(downbeatGlow).toBeUndefined();
    });

    it("bar lines are more prominent than beat lines", () => {
      const frame = createMinimalFrame(3000, {
        tier: 3,
        noteCount: 0,
        prescribedTempo: 120,
        prescribedMeter: { beatsPerBar: 4, beatUnit: 4 },
              });

      const scene = grammar.update(frame, null);

      const beatLine = scene.entities.find(e => e.data?.type === "beat-line");
      const barLine = scene.entities.find(e => e.data?.type === "bar-line");

      expect(beatLine).toBeDefined();
      expect(barLine).toBeDefined();
      // Bar lines should be larger/more prominent
      expect(barLine!.style.size).toBeGreaterThan(beatLine!.style.size!);
    });
  });

  // ============================================================================
  // Cross-tier behavior
  // ============================================================================

  describe("Cross-tier behavior", () => {
    let grammar: TestRhythmGrammar;

    beforeEach(() => {
      grammar = new TestRhythmGrammar();
      grammar.init(ctx);
    });

    it("ignores chords entirely", () => {
      const frame = createMinimalFrame(0, {
        tier: 1,
        noteCount: 2,
        chordCount: 2,
      });

      const scene = grammar.update(frame, null);

      const chordEntities = scene.entities.filter(
        e => e.data?.type === "chord-glow" || e.data?.type === "chord-history"
      );
      expect(chordEntities.length).toBe(0);
    });

    it("onset markers scroll left over time", () => {
      const frame1 = createMinimalFrame(0, {
        tier: 1,
        noteCount: 1,
        noteOnset: 0,
      });

      const scene1 = grammar.update(frame1, null);
      const marker1 = scene1.entities.find(e => e.data?.type === "onset-marker");
      const x1 = marker1!.position!.x;

      // Same note, 1 second later
      const frame2 = createMinimalFrame(1000, {
        tier: 1,
        noteCount: 1,
        noteOnset: 0,
      });

      const scene2 = grammar.update(frame2, scene1);
      const marker2 = scene2.entities.find(e => e.data?.type === "onset-marker");
      const x2 = marker2!.position!.x;

      // Marker should have moved left
      expect(x2).toBeLessThan(x1);
    });

    it("markers fade over time", () => {
      const frame1 = createMinimalFrame(0, {
        tier: 1,
        noteCount: 1,
        noteOnset: 0,
      });

      const scene1 = grammar.update(frame1, null);
      const marker1 = scene1.entities.find(e => e.data?.type === "onset-marker");
      const opacity1 = marker1!.style.opacity!;

      // Same note, 2 seconds later
      const frame2 = createMinimalFrame(2000, {
        tier: 1,
        noteCount: 1,
        noteOnset: 0,
      });

      const scene2 = grammar.update(frame2, scene1);
      const marker2 = scene2.entities.find(e => e.data?.type === "onset-marker");
      const opacity2 = marker2!.style.opacity!;

      // Marker should have faded
      expect(opacity2).toBeLessThan(opacity1);
    });
  });
});

/**
 * Create a minimal AnnotatedMusicalFrame for testing.
 */
function createMinimalFrame(
  t: number,
  options: {
    tier: 1 | 2 | 3;
    noteCount: number;
    chordCount?: number;
    noteHue?: number;
    noteOctave?: number;
    noteOnset?: number;
    prescribedTempo?: number;
    prescribedMeter?: { beatsPerBar: number; beatUnit: number };
    detectedDivision?: number | null;
    onsetDrifts?: Array<{ t: number; subdivisions: Array<{ label: string; period: number; drift: number; nearest: boolean }> }>;
  }
): AnnotatedMusicalFrame {
  const noteOnset = options.noteOnset ?? t;
  const notes: AnnotatedNote[] = [];
  for (let i = 0; i < options.noteCount; i++) {
    notes.push({
      note: {
        id: `note-${i}`,
        pitch: { pc: (i % 12) as PitchClass, octave: options.noteOctave ?? 4 },
        velocity: 80,
        onset: noteOnset,
        duration: 0,
        release: null,
        phase: "sustain" as const,
        confidence: 1,
        provenance: { source: "test", stream: "test" },
      },
      visual: {
        palette: {
          id: `note-palette-${i}`,
          primary: { h: options.noteHue ?? 30, s: 0.8, v: 0.9, a: 1 },
        },
        texture: { id: "smooth", grain: 0.1, smoothness: 0.9, density: 0.5 },
        motion: { jitter: 0.05, pulse: 0.3, flow: 0.1 },
        uncertainty: 0,
        label: `Note${i}`,
      },
    });
  }

  const chords: AnnotatedChord[] = [];
  for (let i = 0; i < (options.chordCount ?? 0); i++) {
    chords.push({
      chord: {
        id: `chord-${i}`,
        root: 0 as PitchClass,
        bass: 0 as PitchClass,
        quality: "maj" as const,
        inversion: 0,
        voicing: [],
        noteIds: [],
        onset: t,
        duration: 0,
        confidence: 0.9,
        phase: "active" as const,
        provenance: { source: "test", stream: "test" },
      },
      visual: {
        palette: {
          id: `chord-palette-${i}`,
          primary: { h: 30, s: 0.7, v: 0.85, a: 1 },
        },
        texture: { id: "smooth", grain: 0.2, smoothness: 0.8, density: 0.5 },
        motion: { jitter: 0.05, pulse: 0.6, flow: 0.2 },
        uncertainty: 0.1,
        label: "Cmaj",
      },
      noteIds: [],
    });
  }

  // Determine tempo and meter based on tier
  const prescribedTempo = options.tier >= 2 ? (options.prescribedTempo ?? 120) : null;
  const prescribedMeter = options.tier === 3 ? (options.prescribedMeter ?? { beatsPerBar: 4, beatUnit: 4 }) : null;

  // Build onsetDrifts - for Tier 2+ with prescribed tempo, include drift data for note onset
  const detectedDivision = options.detectedDivision ?? (prescribedTempo !== null ? 60000 / prescribedTempo : null);
  let onsetDrifts = options.onsetDrifts ?? [];

  // If no explicit onsetDrifts provided but we have a tempo, generate default drift data
  if (onsetDrifts.length === 0 && prescribedTempo !== null && options.noteCount > 0) {
    const basePeriod = 60000 / prescribedTempo;
    onsetDrifts = [{
      t: noteOnset,
      subdivisions: [
        { label: "quarter", period: basePeriod, drift: (noteOnset % basePeriod), nearest: true },
        { label: "8th", period: basePeriod / 2, drift: (noteOnset % (basePeriod / 2)), nearest: false },
        { label: "16th", period: basePeriod / 4, drift: (noteOnset % (basePeriod / 4)), nearest: false },
        { label: "32nd", period: basePeriod / 8, drift: (noteOnset % (basePeriod / 8)), nearest: false },
      ],
    }];
  } else if (onsetDrifts.length === 0 && detectedDivision !== null && options.noteCount > 0) {
    // Tier 1 with detected division
    onsetDrifts = [{
      t: noteOnset,
      subdivisions: [
        { label: "1x", period: detectedDivision, drift: 0, nearest: true },
        { label: "2x", period: detectedDivision / 2, drift: 0, nearest: false },
        { label: "4x", period: detectedDivision / 4, drift: 0, nearest: false },
        { label: "8x", period: detectedDivision / 8, drift: 0, nearest: false },
      ],
    }];
  }

  return {
    t,
    part: "main",
    notes,
    chords,
    rhythm: {
      analysis: {
        detectedDivision,
        onsetDrifts,
        stability: prescribedTempo !== null ? 0.9 : 0,
        confidence: prescribedTempo !== null ? 0.9 : 0,
      },
      visual: {
        palette: { id: "rhythm", primary: { h: 0, s: 0, v: 0.7, a: 1 } },
        texture: { id: "rhythm", grain: 0.1, smoothness: 0.9, density: 0.5 },
        motion: { jitter: 0, pulse: 0.6, flow: 0 },
        uncertainty: 0.1,
      },
      prescribedTempo,
      prescribedMeter,
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
