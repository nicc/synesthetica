/**
 * HarmonyGrammar Tests
 *
 * Tests the harmony grammar with chord shape visualization and tension bar.
 * Run with GENERATE_SNAPSHOTS=1 to generate SVG files for visual review.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HarmonyGrammar } from "../../src/grammars/HarmonyGrammar";
import { buildChordShape } from "../../src/vocabularies/utils";
import type {
  GrammarContext,
  AnnotatedMusicalFrame,
  AnnotatedChord,
  PitchClass,
  MusicalChord,
  PitchHueInvariant,
} from "@synesthetica/contracts";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

// ============================================================================
// Test Fixtures
// ============================================================================

const ctx: GrammarContext = {
  canvasSize: { width: 800, height: 600 },
  rngSeed: 12345,
  part: "main",
};

const defaultInvariant: PitchHueInvariant = {
  referencePc: 9, // A
  referenceHue: 0, // Red
  direction: "cw",
};

/**
 * Create a test chord with proper shape geometry.
 */
function createTestChord(
  root: PitchClass,
  quality: MusicalChord["quality"],
  intervals: number[]
): AnnotatedChord {
  const voicing = intervals.map((semitones) => ({
    pc: ((root + semitones) % 12) as PitchClass,
    octave: 4,
  }));

  const chord: MusicalChord = {
    id: `test:0:${root}${quality}`,
    root,
    quality,
    bass: voicing[0].pc,
    inversion: 0,
    voicing,
    noteIds: [],
    onset: 0,
    duration: 1000,
    phase: "active",
    confidence: 1.0,
    provenance: { source: "test", stream: "test", version: "1.0" },
  };

  const shape = buildChordShape(chord, defaultInvariant);

  return {
    chord,
    visual: {
      palette: {
        id: `chord-${chord.id}`,
        primary: { h: 0, s: 0.7, v: 0.85, a: 1 },
      },
      texture: { id: "chord", grain: 0.2, smoothness: 0.8, density: 0.5 },
      motion: { jitter: 0.05, pulse: 0.6, flow: 0.2 },
      uncertainty: 0,
    },
    noteIds: chord.noteIds,
    shape,
  };
}

/**
 * Create a test frame with specified chord and tension.
 */
function createTestFrame(
  t: number,
  chord: AnnotatedChord | null,
  tension: number
): AnnotatedMusicalFrame {
  return {
    t,
    part: "main",
    notes: [],
    chords: chord ? [chord] : [],
    progression: [],
    harmonicContext: {
      tension,
      keyAware: false,
      detectedKey: null,
    },
    rhythm: {
      analysis: {
        detectedDivision: null,
        onsetDrifts: [],
        stability: 0.9,
        confidence: 0.9,
      },
      visual: {
        palette: { id: "rhythm", primary: { h: 200, s: 0.3, v: 0.7, a: 1 } },
        texture: { id: "rhythm", grain: 0.1, smoothness: 0.9, density: 0.5 },
        motion: { jitter: 0, pulse: 0.6, flow: 0 },
        uncertainty: 0.1,
      },
      prescribedTempo: null,
      prescribedMeter: null,
    },
    bars: [],
    phrases: [],
    dynamics: {
      dynamics: { level: 0.5, trend: "stable" },
      visual: {
        palette: { id: "dynamics", primary: { h: 0, s: 0, v: 0.5, a: 1 } },
        texture: { id: "dynamics", grain: 0.1, smoothness: 0.8, density: 0.5 },
        motion: { jitter: 0.05, pulse: 0.5, flow: 0 },
        uncertainty: 0.1,
      },
    },
  };
}

// ============================================================================
// Snapshot Helper
// ============================================================================

const SNAPSHOTS_DIR = resolve(__dirname, "../_snapshots/harmony");

function maybeWriteSnapshot(name: string, svg: string): void {
  if (process.env.GENERATE_SNAPSHOTS === "1") {
    if (!existsSync(SNAPSHOTS_DIR)) {
      mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
    const path = resolve(SNAPSHOTS_DIR, `${name}.svg`);
    writeFileSync(path, svg, "utf-8");
    console.log(`Wrote snapshot: harmony/${name}.svg`);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("HarmonyGrammar", () => {
  let grammar: HarmonyGrammar;

  beforeEach(() => {
    grammar = new HarmonyGrammar();
    grammar.init(ctx);
  });

  describe("interface compliance", () => {
    it("has correct id", () => {
      expect(grammar.id).toBe("harmony-grammar");
    });

    it("implements init and dispose", () => {
      const g = new HarmonyGrammar();
      g.init(ctx);
      g.dispose();
      // Should not throw
    });
  });

  describe("update method", () => {
    it("returns scene frame with entities", () => {
      const chord = createTestChord(0, "maj", [0, 4, 7]);
      const frame = createTestFrame(1000, chord, 0.2);
      const scene = grammar.update(frame, null);

      expect(scene.t).toBe(1000);
      expect(scene.entities.length).toBeGreaterThan(0);
      expect(scene.diagnostics).toEqual([]);
    });

    it("creates chord shape entity", () => {
      const chord = createTestChord(0, "maj", [0, 4, 7]);
      const frame = createTestFrame(1000, chord, 0.2);
      const scene = grammar.update(frame, null);

      const chordEntity = scene.entities.find(
        (e) => e.data?.type === "chord-shape"
      );
      expect(chordEntity).toBeDefined();
      expect(chordEntity?.position).toEqual({ x: 0.5, y: 0.5 });
      expect(chordEntity?.data?.quality).toBe("maj");
    });

    it("creates tension bar entity", () => {
      const chord = createTestChord(0, "maj", [0, 4, 7]);
      const frame = createTestFrame(1000, chord, 0.5);
      const scene = grammar.update(frame, null);

      const tensionEntity = scene.entities.find(
        (e) => e.data?.type === "tension-bar"
      );
      expect(tensionEntity).toBeDefined();
      expect(tensionEntity?.position?.x).toBe(0.9);
      expect(tensionEntity?.data?.tension).toBe(0.5);
    });

    it("handles no chords gracefully", () => {
      const frame = createTestFrame(1000, null, 0);
      const scene = grammar.update(frame, null);

      // Should still have tension bar, but no chord shape
      expect(scene.entities.length).toBe(1);
      expect(scene.entities[0].data?.type).toBe("tension-bar");
    });
  });

  describe("SVG rendering", () => {
    it("renders major triad", () => {
      const chord = createTestChord(0, "maj", [0, 4, 7]);
      const frame = createTestFrame(1000, chord, 0.1);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain("linearGradient");
      expect(svg).toContain("wedge-grad-");

      maybeWriteSnapshot("major-triad", svg);
    });

    it("renders minor triad with wavy margin", () => {
      const chord = createTestChord(0, "min", [0, 3, 7]);
      const frame = createTestFrame(1000, chord, 0.15);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      maybeWriteSnapshot("minor-triad", svg);
    });

    it("renders dominant 7th with medium tension", () => {
      const chord = createTestChord(7, "dom7", [0, 4, 7, 10]);
      const frame = createTestFrame(1000, chord, 0.45);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      maybeWriteSnapshot("dominant-7th", svg);
    });

    it("renders diminished 7th with high tension", () => {
      const chord = createTestChord(0, "dim7", [0, 3, 6, 9]);
      const frame = createTestFrame(1000, chord, 0.75);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      maybeWriteSnapshot("diminished-7th", svg);
    });

    it("renders augmented triad", () => {
      const chord = createTestChord(0, "aug", [0, 4, 8]);
      const frame = createTestFrame(1000, chord, 0.35);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      maybeWriteSnapshot("augmented-triad", svg);
    });

    it("renders sus4 chord", () => {
      const chord = createTestChord(0, "sus4", [0, 5, 7]);
      const frame = createTestFrame(1000, chord, 0.25);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      expect(svg).toContain("stroke-dasharray");
      maybeWriteSnapshot("sus4-chord", svg);
    });

    it("renders major 9th with extensions", () => {
      const chord = createTestChord(0, "maj7", [0, 4, 7, 11, 2]);
      const frame = createTestFrame(1000, chord, 0.3);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      maybeWriteSnapshot("major-9th", svg);
    });

    it("renders tension bar at different levels", () => {
      const chord = createTestChord(0, "maj", [0, 4, 7]);

      // Low tension
      const lowFrame = createTestFrame(1000, chord, 0.1);
      const lowSvg = grammar.renderToSVG(lowFrame);
      maybeWriteSnapshot("tension-low", lowSvg);

      // Medium tension
      const midFrame = createTestFrame(1000, chord, 0.5);
      const midSvg = grammar.renderToSVG(midFrame);
      maybeWriteSnapshot("tension-medium", midSvg);

      // High tension
      const highFrame = createTestFrame(1000, chord, 0.9);
      const highSvg = grammar.renderToSVG(highFrame);
      maybeWriteSnapshot("tension-high", highSvg);
    });

    it("renders empty frame (no chord)", () => {
      const frame = createTestFrame(1000, null, 0);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      expect(svg).not.toContain("linearGradient");
      maybeWriteSnapshot("no-chord", svg);
    });
  });

  describe("tension bar visibility", () => {
    it("can hide tension bar", () => {
      const g = new HarmonyGrammar({ showTensionBar: false });
      g.init(ctx);

      const chord = createTestChord(0, "maj", [0, 4, 7]);
      const frame = createTestFrame(1000, chord, 0.5);

      const scene = g.update(frame, null);
      const tensionEntity = scene.entities.find(
        (e) => e.data?.type === "tension-bar"
      );
      expect(tensionEntity).toBeUndefined();

      const svg = g.renderToSVG(frame);
      expect(svg).not.toContain("Tension");
    });
  });
});
