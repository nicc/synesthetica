/**
 * Golden Tests: TestChordProgressionGrammar
 *
 * Tests the AnnotatedMusicalFrame → SceneFrame boundary for the chord grammar.
 * Verifies that annotated musical frames produce correct scene entities.
 */

import { describe, it, beforeEach, expect } from "vitest";
import {
  loadFixturesFromDir,
  type SequenceFixture,
} from "../harness";
import type {
  AnnotatedMusicalFrame,
  AnnotatedNote,
  AnnotatedChord,
  SceneFrame,
  GrammarContext,
  PitchClass,
} from "@synesthetica/contracts";
import { TestChordProgressionGrammar } from "../../../src/grammars/TestChordProgressionGrammar";

/**
 * Expected output shape for grammar fixtures.
 */
interface ExpectedOutput {
  entityCount: number;
  entityTypes: Record<string, number>;
  hasChordGlow: boolean;
  chordGlowLabel?: string;
  historyCount?: number;
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

  // Check chord glow
  const chordGlow = actual.entities.find(e => e.data?.type === "chord-glow");
  if (expected.hasChordGlow && !chordGlow) {
    throw new Error("Expected chord-glow entity but none found");
  }
  if (!expected.hasChordGlow && chordGlow) {
    throw new Error("Unexpected chord-glow entity found");
  }

  // Check chord label if specified
  if (expected.hasChordGlow && expected.chordGlowLabel !== undefined) {
    if (chordGlow!.data!.label !== expected.chordGlowLabel) {
      throw new Error(
        `Chord glow label mismatch: expected "${expected.chordGlowLabel}", got "${chordGlow!.data!.label}"`
      );
    }
  }

  // Check history count if specified
  if (expected.historyCount !== undefined) {
    const historyEntities = actual.entities.filter(e => e.data?.type === "chord-history");
    if (historyEntities.length !== expected.historyCount) {
      throw new Error(
        `History count mismatch: expected ${expected.historyCount}, got ${historyEntities.length}`
      );
    }
  }
}

describe("TestChordProgressionGrammar golden tests", () => {
  const ctx: GrammarContext = {
    canvasSize: { width: 1920, height: 1080 },
    rngSeed: 12345,
    part: "main",
  };

  // Load all sequence fixtures
  const fixtures = loadFixturesFromDir<GrammarSequenceFixture>(
    "grammar/chord-progression"
  ).filter(f => f.steps !== undefined);

  for (const fixture of fixtures) {
    describe(fixture.name, () => {
      let grammar: TestChordProgressionGrammar;

      beforeEach(() => {
        grammar = new TestChordProgressionGrammar();
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

  // Inline tests for common scenarios
  describe("inline tests", () => {
    let grammar: TestChordProgressionGrammar;

    beforeEach(() => {
      grammar = new TestChordProgressionGrammar();
      grammar.init(ctx);
    });

    it("produces chord glow for active chords", () => {
      const frame = createMinimalFrame(0, {
        chords: [{ root: 0, quality: "maj", phase: "active", label: "Cmaj" }],
        noteCount: 3,
      });

      const scene = grammar.update(frame, null);

      const chordGlow = scene.entities.find(e => e.data?.type === "chord-glow");
      expect(chordGlow).toBeDefined();
      expect(chordGlow!.data!.label).toBe("Cmaj");
      expect(chordGlow!.kind).toBe("field");
    });

    it("produces chord glow for decaying chords", () => {
      const frame = createMinimalFrame(0, {
        chords: [{ root: 9, quality: "min", phase: "decaying", label: "Am" }],
        noteCount: 0,
      });

      const scene = grammar.update(frame, null);

      const chordGlow = scene.entities.find(e => e.data?.type === "chord-glow");
      expect(chordGlow).toBeDefined();
      expect(chordGlow!.data!.label).toBe("Am");
      expect(chordGlow!.data!.phase).toBe("decaying");
    });

    it("renders notes belonging to chords as particles", () => {
      const frame = createMinimalFrame(0, {
        chords: [{ root: 0, quality: "maj", phase: "active", label: "Cmaj", noteIds: ["n1", "n2", "n3"] }],
        noteCount: 3,
        noteIds: ["n1", "n2", "n3"],
      });

      const scene = grammar.update(frame, null);

      const noteParticles = scene.entities.filter(e => e.data?.type === "chord-note");
      expect(noteParticles.length).toBe(3);
      expect(noteParticles[0].kind).toBe("particle");
    });

    it("ignores notes not belonging to any chord", () => {
      const frame = createMinimalFrame(0, {
        chords: [{ root: 0, quality: "maj", phase: "active", label: "Cmaj", noteIds: ["n1"] }],
        noteCount: 3,
        noteIds: ["n1", "n2", "n3"], // Only n1 is in the chord
      });

      const scene = grammar.update(frame, null);

      // Should only render the one note that's in the chord
      const noteParticles = scene.entities.filter(e => e.data?.type === "chord-note");
      expect(noteParticles.length).toBe(1);
    });

    it("ignores rhythm information", () => {
      const frame = createMinimalFrame(0, {
        chords: [{ root: 0, quality: "maj", phase: "active", label: "Cmaj" }],
        noteCount: 0,
        hasPrescribedTempo: true,
      });

      const scene = grammar.update(frame, null);

      const rhythmEntities = scene.entities.filter(e => e.data?.type === "rhythm-pulse" || e.data?.type === "division-indicator");
      expect(rhythmEntities.length).toBe(0);
    });

    it("builds chord history over multiple frames", () => {
      // Frame 1: C major
      const frame1 = createMinimalFrame(0, {
        chords: [{ root: 0, quality: "maj", phase: "active", label: "Cmaj" }],
        noteCount: 0,
      });

      // Frame 2: A minor (C major goes to history)
      const frame2 = createMinimalFrame(1000, {
        chords: [{ root: 9, quality: "min", phase: "active", label: "Am" }],
        noteCount: 0,
      });

      const scene1 = grammar.update(frame1, null);
      const scene2 = grammar.update(frame2, scene1);

      // Scene 2 should have history entry for C major
      const historyEntities = scene2.entities.filter(e => e.data?.type === "chord-history");
      expect(historyEntities.length).toBeGreaterThanOrEqual(1);
    });

    it("respects palette colors from annotations", () => {
      const frame = createMinimalFrame(0, {
        chords: [{ root: 0, quality: "maj", phase: "active", label: "Cmaj", hue: 220 }],
        noteCount: 0,
      });

      const scene = grammar.update(frame, null);

      const chordGlow = scene.entities.find(e => e.data?.type === "chord-glow");
      expect(chordGlow).toBeDefined();
      expect(chordGlow!.style.color!.h).toBeCloseTo(220, 1);
    });

    it("positions chord glow at center", () => {
      const frame = createMinimalFrame(0, {
        chords: [{ root: 0, quality: "maj", phase: "active", label: "Cmaj" }],
        noteCount: 0,
      });

      const scene = grammar.update(frame, null);

      const chordGlow = scene.entities.find(e => e.data?.type === "chord-glow");
      expect(chordGlow).toBeDefined();
      expect(chordGlow!.position!.x).toBeCloseTo(0.5, 2);
      expect(chordGlow!.position!.y).toBeCloseTo(0.5, 2);
    });

    it("handles chord transitions with both active and decaying", () => {
      const frame = createMinimalFrame(0, {
        chords: [
          { root: 0, quality: "maj", phase: "decaying", label: "Cmaj" },
          { root: 9, quality: "min", phase: "active", label: "Am" },
        ],
        noteCount: 0,
      });

      const scene = grammar.update(frame, null);

      const glows = scene.entities.filter(e => e.data?.type === "chord-glow");
      expect(glows.length).toBe(2);

      const activeGlow = glows.find(e => e.data!.phase === "active");
      const decayingGlow = glows.find(e => e.data!.phase === "decaying");

      expect(activeGlow).toBeDefined();
      expect(decayingGlow).toBeDefined();
      expect(activeGlow!.data!.label).toBe("Am");
      expect(decayingGlow!.data!.label).toBe("Cmaj");
    });
  });
});

/**
 * Create a minimal AnnotatedMusicalFrame for testing.
 */
function createMinimalFrame(
  t: number,
  options: {
    chords: Array<{
      root: number;
      quality: "maj" | "min";
      phase: "active" | "decaying";
      label: string;
      noteIds?: string[];
      hue?: number;
    }>;
    noteCount: number;
    noteIds?: string[];
    hasPrescribedTempo?: boolean;
  }
): AnnotatedMusicalFrame {
  const noteIds = options.noteIds ?? Array.from({ length: options.noteCount }, (_, i) => `note-${i}`);

  const notes: AnnotatedNote[] = noteIds.map((id, i) => ({
    note: {
      id,
      pitch: { pc: (i % 12) as PitchClass, octave: 4 },
      velocity: 80,
      onset: t,
      duration: 0,
      release: null,
      phase: "sustain" as const,
      confidence: 1,
      provenance: { source: "test", stream: "test" },
    },
    visual: {
      palette: {
        id: `note-palette-${i}`,
        primary: { h: 30, s: 0.8, v: 0.9, a: 1 },
      },
      texture: { id: "smooth", grain: 0.1, smoothness: 0.9, density: 0.5 },
      motion: { jitter: 0.05, pulse: 0.3, flow: 0.1 },
      uncertainty: 0,
      label: `Note${i}`,
    },
  }));

  const chords: AnnotatedChord[] = options.chords.map((c, i) => ({
    chord: {
      id: `chord-${i}`,
      root: c.root as PitchClass,
      quality: c.quality,
      bass: c.root as PitchClass,
      inversion: 0,
      voicing: [],
      noteIds: c.noteIds ?? [],
      onset: t,
      duration: 0,
      confidence: 0.9,
      phase: c.phase,
      provenance: { source: "test", stream: "test" },
    },
    visual: {
      palette: {
        id: `chord-palette-${i}`,
        primary: { h: c.hue ?? (c.quality === "min" ? 220 : 30), s: 0.7, v: 0.85, a: 1 },
      },
      texture: { id: "smooth", grain: 0.2, smoothness: 0.8, density: 0.5 },
      motion: { jitter: 0.05, pulse: 0.6, flow: 0.2 },
      uncertainty: 0.1,
      label: c.label,
    },
    noteIds: c.noteIds ?? [],
  }));

  return {
    t,
    part: "main",
    notes,
    chords,
    rhythm: {
      analysis: {
        detectedDivision: options.hasPrescribedTempo ? 500 : null,
        detectedDivisionTimes: options.hasPrescribedTempo ? [t] : [],
        recentOnsets: options.hasPrescribedTempo ? [t] : [],
        stability: options.hasPrescribedTempo ? 0.9 : 0,
        confidence: options.hasPrescribedTempo ? 0.9 : 0,
      },
      visual: {
        palette: { id: "rhythm", primary: { h: 0, s: 0, v: 0.7, a: 1 } },
        texture: { id: "rhythm", grain: 0.1, smoothness: 0.9, density: 0.5 },
        motion: { jitter: 0, pulse: 0.6, flow: 0 },
        uncertainty: 0.1,
      },
      prescribedTempo: options.hasPrescribedTempo ? 120 : null,
      prescribedMeter: options.hasPrescribedTempo ? { beatsPerBar: 4, beatUnit: 4 } : null,
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
