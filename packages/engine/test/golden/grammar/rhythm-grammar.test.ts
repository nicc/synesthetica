/**
 * Golden Tests: TestRhythmGrammar
 *
 * Tests the AnnotatedMusicalFrame → SceneFrame boundary for the rhythm grammar.
 * Verifies that annotated musical frames produce correct scene entities.
 */

import { describe, it, beforeEach } from "vitest";
import {
  loadFixturesFromDir,
  type SequenceFixture,
} from "../harness";
import type {
  AnnotatedMusicalFrame,
  SceneFrame,
  GrammarContext,
} from "@synesthetica/contracts";
import { TestRhythmGrammar } from "../../../src/grammars/TestRhythmGrammar";

/**
 * Expected output shape for grammar fixtures.
 * We check entity counts and types rather than exact entity contents,
 * since entity IDs are generated dynamically.
 */
interface ExpectedOutput {
  entityCount: number;
  entityTypes: Record<string, number>; // type -> count
  hasBeatPulse: boolean;
  beatPulseIsDownbeat?: boolean;
}

type GrammarSequenceFixture = SequenceFixture<AnnotatedMusicalFrame, ExpectedOutput>;

/**
 * Compare actual SceneFrame against expected output.
 */
function compareOutput(actual: SceneFrame, expected: ExpectedOutput): void {
  // Check total entity count
  if (actual.entities.length !== expected.entityCount) {
    throw new Error(
      `Entity count mismatch: expected ${expected.entityCount}, got ${actual.entities.length}\n` +
      `Entities: ${JSON.stringify(actual.entities.map(e => e.data?.type), null, 2)}`
    );
  }

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

  // Check beat pulse
  const beatPulse = actual.entities.find(e => e.data?.type === "beat-pulse");
  if (expected.hasBeatPulse && !beatPulse) {
    throw new Error("Expected beat-pulse entity but none found");
  }
  if (!expected.hasBeatPulse && beatPulse) {
    throw new Error("Unexpected beat-pulse entity found");
  }

  // Check downbeat status if specified
  if (expected.hasBeatPulse && expected.beatPulseIsDownbeat !== undefined) {
    if (beatPulse!.data!.isDownbeat !== expected.beatPulseIsDownbeat) {
      throw new Error(
        `Beat pulse isDownbeat mismatch: expected ${expected.beatPulseIsDownbeat}, got ${beatPulse!.data!.isDownbeat}`
      );
    }
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

  // Inline tests for common scenarios (don't require fixture files)
  describe("inline tests", () => {
    let grammar: TestRhythmGrammar;

    beforeEach(() => {
      grammar = new TestRhythmGrammar();
      grammar.init(ctx);
    });

    it("produces beat pulse for frames with beat data", () => {
      const frame: AnnotatedMusicalFrame = createMinimalFrame(0, {
        hasBeat: true,
        isDownbeat: true,
        noteCount: 0,
      });

      const scene = grammar.update(frame, null);

      const beatPulse = scene.entities.find(e => e.data?.type === "beat-pulse");
      expect(beatPulse).toBeDefined();
      expect(beatPulse!.data!.isDownbeat).toBe(true);
      expect(beatPulse!.kind).toBe("field");
    });

    it("produces timing markers for notes", () => {
      const frame: AnnotatedMusicalFrame = createMinimalFrame(0, {
        hasBeat: false,
        isDownbeat: false,
        noteCount: 3,
      });

      const scene = grammar.update(frame, null);

      const markers = scene.entities.filter(e => e.data?.type === "timing-marker");
      expect(markers.length).toBe(3);
      expect(markers[0].kind).toBe("particle");
    });

    it("ignores chords in input", () => {
      const frame: AnnotatedMusicalFrame = createMinimalFrame(0, {
        hasBeat: false,
        isDownbeat: false,
        noteCount: 2,
        chordCount: 2,
      });

      const scene = grammar.update(frame, null);

      // Should have 2 note markers, no chord entities
      const markers = scene.entities.filter(e => e.data?.type === "timing-marker");
      expect(markers.length).toBe(2);

      const chordEntities = scene.entities.filter(
        e => e.data?.type === "chord-glow" || e.data?.type === "chord-history"
      );
      expect(chordEntities.length).toBe(0);
    });

    it("respects palette colors from annotations", () => {
      const frame: AnnotatedMusicalFrame = createMinimalFrame(0, {
        hasBeat: false,
        isDownbeat: false,
        noteCount: 1,
        noteHue: 180, // Cyan
      });

      const scene = grammar.update(frame, null);

      const marker = scene.entities.find(e => e.data?.type === "timing-marker");
      expect(marker).toBeDefined();
      expect(marker!.style.color!.h).toBeCloseTo(180, 1);
    });

    it("positions notes based on timing and pitch", () => {
      const frame: AnnotatedMusicalFrame = createMinimalFrame(0, {
        hasBeat: false,
        isDownbeat: false,
        noteCount: 1,
        noteOctave: 5,
      });

      const scene = grammar.update(frame, null);

      const marker = scene.entities.find(e => e.data?.type === "timing-marker");
      expect(marker).toBeDefined();
      expect(marker!.position).toBeDefined();
      // Higher octave = higher on screen (lower y in normalized coords)
      expect(marker!.position!.y).toBeLessThan(0.5);
    });
  });
});

// Helper to import expect from vitest (needed for inline tests)
import { expect } from "vitest";

/**
 * Create a minimal AnnotatedMusicalFrame for testing.
 */
function createMinimalFrame(
  t: number,
  options: {
    hasBeat: boolean;
    isDownbeat: boolean;
    noteCount: number;
    chordCount?: number;
    noteHue?: number;
    noteOctave?: number;
  }
): AnnotatedMusicalFrame {
  const notes = [];
  for (let i = 0; i < options.noteCount; i++) {
    notes.push({
      note: {
        id: `note-${i}`,
        pitch: { pc: i % 12, octave: options.noteOctave ?? 4 },
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
          primary: { h: options.noteHue ?? 30, s: 0.8, v: 0.9, a: 1 },
        },
        texture: { id: "smooth", grain: 0.1, smoothness: 0.9, density: 0.5 },
        motion: { jitter: 0.05, pulse: 0.3, flow: 0.1 },
        uncertainty: 0,
        label: `Note${i}`,
      },
    });
  }

  const chords = [];
  for (let i = 0; i < (options.chordCount ?? 0); i++) {
    chords.push({
      chord: {
        id: `chord-${i}`,
        root: 0,
        quality: "maj" as const,
        noteIds: [],
        onset: t,
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

  return {
    t,
    part: "main",
    notes,
    chords,
    beat: options.hasBeat
      ? {
          beat: {
            phase: 0,
            tempo: 120,
            confidence: 0.9,
            beatInBar: options.isDownbeat ? 1 : 2,
            beatsPerBar: 4,
            isDownbeat: options.isDownbeat,
          },
          visual: {
            palette: { id: "beat", primary: { h: 0, s: 0, v: 0.7, a: 1 } },
            texture: { id: "beat", grain: 0.1, smoothness: 0.9, density: 0.5 },
            motion: { jitter: 0, pulse: 1, flow: 0 },
            uncertainty: 0.1,
          },
        }
      : null,
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
