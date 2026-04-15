/**
 * HarmonyGrammar Tests
 *
 * Tests the harmony grammar with chord shape visualization.
 * Run with GENERATE_SNAPSHOTS=1 to generate SVG files for visual review.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HarmonyGrammar } from "../../src/grammars/HarmonyGrammar";
import { buildChordShape } from "../../src/vocabularies/utils";
import type {
  GrammarContext,
  AnnotatedChord,
  PitchClass,
  MusicalChord,
  PitchHueInvariant,
} from "@synesthetica/contracts";
import { createTestAnnotatedFrame } from "../_harness/frames";
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
) {
  return createTestAnnotatedFrame(t, "main", {
    chords: chord ? [chord] : [],
    harmonicContext: {
      tension,
      keyAware: false,
      currentFunction: null,
      functionalProgression: [],
    },
  });
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

    it("creates chord shape entity in harmony column", () => {
      const chord = createTestChord(0, "maj", [0, 4, 7]);
      const frame = createTestFrame(1000, chord, 0.2);
      const scene = grammar.update(frame, null);

      const chordEntity = scene.entities.find(
        (e) => e.data?.type === "chord-shape"
      );
      expect(chordEntity).toBeDefined();
      // Chord shape is in the right column
      expect(chordEntity?.position?.x).toBeGreaterThan(0.8);
      expect(chordEntity?.data?.quality).toBe("maj");
    });

    it("passes dashed margin through entity data for sus chords", () => {
      const sus2 = createTestChord(0, "sus2", [0, 2, 7]);
      const frame2 = createTestFrame(1000, sus2, 0.2);
      const scene2 = grammar.update(frame2, null);
      const entity2 = scene2.entities.find((e) => e.data?.type === "chord-shape");
      expect(entity2?.data?.margin).toBe("dash-short");

      const sus4 = createTestChord(0, "sus4", [0, 5, 7]);
      const frame4 = createTestFrame(1000, sus4, 0.2);
      const scene4 = grammar.update(frame4, null);
      const entity4 = scene4.entities.find((e) => e.data?.type === "chord-shape");
      expect(entity4?.data?.margin).toBe("dash-long");
    });

    it("handles no chords gracefully", () => {
      const frame = createTestFrame(1000, null, 0);
      const scene = grammar.update(frame, null);

      // No chord shape, no tension bar (disabled by default)
      expect(scene.entities.length).toBe(0);
    });
  });

  describe("progression clock", () => {
    it("produces no entities when no key is prescribed", () => {
      const frame = createTestAnnotatedFrame(1000, "main", {
        harmonicContext: {
          tension: 0,
          keyAware: false,
          currentFunction: null,
          functionalProgression: [
            { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "test:0:Cmaj", onset: 500 },
          ],
        },
        // no prescribedKey
      });
      const scene = grammar.update(frame, null);
      const progEntities = scene.entities.filter((e) => e.data?.type === "roman-numeral");
      expect(progEntities).toHaveLength(0);
    });

    it("produces glyph entities when key is prescribed", () => {
      const frame = createTestAnnotatedFrame(1000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "test:0:Cmaj", onset: 800 },
          functionalProgression: [
            { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "test:0:Cmaj", onset: 0 },
            { degree: 4, roman: "IV", quality: "maj", rootPc: 5 as PitchClass, borrowed: false, chordId: "test:500:Fmaj", onset: 500 },
            { degree: 5, roman: "V", quality: "maj", rootPc: 7 as PitchClass, borrowed: false, chordId: "test:800:Gmaj", onset: 800 },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const progEntities = scene.entities.filter((e) => e.data?.type === "roman-numeral");

      expect(progEntities).toHaveLength(3);
      // Each should have glyph geometry
      for (const e of progEntities) {
        expect(e.data?.segments).toBeDefined();
        expect(e.position?.x).toBeGreaterThan(0.7); // in harmony column
      }
    });

    it("fades older chords", () => {
      const frame = createTestAnnotatedFrame(5000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            // Released 2000ms ago — well into 3000ms fade
            { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "test:0:Cmaj", onset: 0, releaseTime: 3000 },
            // Released 500ms ago — barely faded
            { degree: 5, roman: "V", quality: "maj", rootPc: 7 as PitchClass, borrowed: false, chordId: "test:4000:Gmaj", onset: 4000, releaseTime: 4500 },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const progEntities = scene.entities.filter((e) => e.data?.type === "roman-numeral");

      // I (onset=0, age=5000) is past the 6000ms fade window? No, 5000 < 6000 so still visible
      // V (onset=4000, age=1000) should be brighter
      expect(progEntities).toHaveLength(2);
      const olderOpacity = progEntities[0].style.opacity ?? 1;
      const newerOpacity = progEntities[1].style.opacity ?? 1;
      expect(newerOpacity).toBeGreaterThan(olderOpacity);
    });

    it("omits chords past the fade window", () => {
      const frame = createTestAnnotatedFrame(10000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            // Released at t=1000, age=9000 → past 3000ms fade → omitted
            { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "test:0:Cmaj", onset: 0, releaseTime: 1000 },
            // Released at t=9500, age=500 → still visible
            { degree: 5, roman: "V", quality: "maj", rootPc: 7 as PitchClass, borrowed: false, chordId: "test:9000:Gmaj", onset: 9000, releaseTime: 9500 },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const progEntities = scene.entities.filter((e) => e.data?.type === "roman-numeral");

      expect(progEntities).toHaveLength(1);
    });
  });

  describe("SVG rendering", () => {
    it("renders major triad", () => {
      const chord = createTestChord(0, "maj", [0, 4, 7]);
      const frame = createTestFrame(1000, chord, 0.1);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain('fill-opacity="0.8"');
      expect(svg).toContain("<path");

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

    it("renders sus4 chord with long dash margin", () => {
      const chord = createTestChord(0, "sus4", [0, 5, 7]);
      const frame = createTestFrame(1000, chord, 0.25);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      expect(svg).toContain('stroke-dasharray="6,3"');
      maybeWriteSnapshot("sus4-chord", svg);
    });

    it("renders sus2 chord with short dash margin", () => {
      const chord = createTestChord(0, "sus2", [0, 2, 7]);
      const frame = createTestFrame(1000, chord, 0.2);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      expect(svg).toContain('stroke-dasharray="3,3"');
      maybeWriteSnapshot("sus2-chord", svg);
    });

    it("does not include stroke-dasharray for non-sus chords", () => {
      const chords = [
        createTestChord(0, "maj", [0, 4, 7]),
        createTestChord(0, "min", [0, 3, 7]),
        createTestChord(0, "dim", [0, 3, 6]),
        createTestChord(0, "aug", [0, 4, 8]),
      ];

      for (const chord of chords) {
        const frame = createTestFrame(1000, chord, 0.3);
        const svg = grammar.renderToSVG(frame);
        expect(svg).not.toContain("stroke-dasharray");
      }
    });

    it("renders major 9th with extensions", () => {
      const chord = createTestChord(0, "maj7", [0, 4, 7, 11, 2]);
      const frame = createTestFrame(1000, chord, 0.3);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      maybeWriteSnapshot("major-9th", svg);
    });

    it("renders empty frame (no chord)", () => {
      const frame = createTestFrame(1000, null, 0);
      const svg = grammar.renderToSVG(frame);

      expect(svg).toContain("<svg");
      expect(svg).not.toContain("linearGradient");
      maybeWriteSnapshot("no-chord", svg);
    });
  });

});
