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
  ChordQuality,
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
  quality: ChordQuality,
  intervals: number[],
): AnnotatedChord {
  const voicing = intervals.map((semitones) => ({
    pc: ((root + semitones) % 12) as PitchClass,
    octave: 4,
  }));

  const interp = {
    root,
    quality,
    chordTones: intervals,
    name: "",
    confidence: 1.0 as const,
  };

  const chord: MusicalChord = {
    id: `test:0:${root}${quality}`,
    bass: voicing[0].pc,
    inversion: 0,
    isInverted: voicing[0].pc !== root,
    voicing,
    noteIds: [],
    harmonic: interp,
    bassLed: interp,
    onset: 0,
    duration: 1000,
    phase: "active",
    provenance: { source: "test", stream: "test", version: "1.0" },
  };

  const shape = buildChordShape(chord.harmonic, chord.voicing, defaultInvariant);

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
      // Chord shape is in the right column (harmony column starts at 0.58 in new layout)
      expect(chordEntity?.position?.x).toBeGreaterThan(0.7);
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
      const progEntities = scene.entities.filter(
        (e) => e.data?.type === "roman-numeral" && e.id.includes(":prog:"),
      );
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
      const progEntities = scene.entities.filter(
        (e) => e.data?.type === "roman-numeral" && e.id.includes(":prog:"),
      );

      expect(progEntities).toHaveLength(3);
      // Each should have glyph geometry
      for (const e of progEntities) {
        expect(e.data?.polylines).toBeDefined();
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
      const progEntities = scene.entities.filter(
        (e) => e.data?.type === "roman-numeral" && e.id.includes(":prog:"),
      );

      // I (onset=0, age=5000) is past the 6000ms fade window? No, 5000 < 6000 so still visible
      // V (onset=4000, age=1000) should be brighter
      expect(progEntities).toHaveLength(2);
      const olderOpacity = progEntities[0].style.opacity ?? 1;
      const newerOpacity = progEntities[1].style.opacity ?? 1;
      expect(newerOpacity).toBeGreaterThan(olderOpacity);
    });

    it("produces connector-strip entity per functional edge", () => {
      // ♭VII in C major emits a single edge to IV (subdominant borrowing)
      const frame = createTestAnnotatedFrame(1000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10 as PitchClass, borrowed: true, chordId: "bvii", onset: 500 },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvii",
              targetDegree: 4,
              targetPc: 5 as PitchClass,
              targetDiatonic: true,
              weight: 0.85,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const stripEntities = scene.entities.filter(
        (e) => e.data?.type === "connector-strip",
      );

      expect(stripEntities).toHaveLength(1);
      const strip = stripEntities[0];
      // Carries target-strip geometry and both chord hues (the
      // gradient runs from source hue at the guide-ring side to
      // target hue at the chord-side edge).
      expect(strip.data?.targetAngleDeg).toBeDefined();
      expect(strip.data?.targetMidR).toBeDefined();
      expect(strip.data?.targetChordR).toBeDefined();
      expect(strip.data?.targetArcWidth).toBeDefined();
      expect(strip.data?.sourceHue).toBeDefined();
      expect(strip.data?.targetHue).toBeDefined();
      // Opacity scaled by edge weight × MAX_STRIP_OPACITY × MULTIPLIER
      // (both arc and strip share the same base opacity now, so their
      // colours meet at the same intensity where the arc joins the
      // strip's inner edge).
      expect(strip.style.opacity).toBeCloseTo(0.85 * 1.0 * 0.8, 2);
    });

    it("emits no strip entities when no edges exist", () => {
      const frame = createTestAnnotatedFrame(1000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "i", onset: 500 },
          ],
          functionalEdges: [],
        },
      });
      const scene = grammar.update(frame, null);
      const stripEntities = scene.entities.filter(
        (e) => e.data?.type === "connector-strip",
      );
      expect(stripEntities).toHaveLength(0);
    });

    it("emits a connector arc alongside each edge (mid-animation gates the strip)", () => {
      // Same setup as the earlier strip test, but sampled AT t=onset
      // so progress=0 regardless of CONNECTOR_ANIMATION_MS's value.
      // Expect the arc entity to be emitted (with zero sweep so far),
      // but no strip yet.
      const frame = createTestAnnotatedFrame(500, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10 as PitchClass, borrowed: true, chordId: "bvii", onset: 500 },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvii",
              targetDegree: 4,
              targetPc: 5 as PitchClass,
              targetDiatonic: true,
              weight: 0.85,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const arcs = scene.entities.filter(
        (e) => e.data?.type === "connector-arc",
      );
      const strips = scene.entities.filter(
        (e) => e.data?.type === "connector-strip",
      );

      expect(arcs).toHaveLength(1);
      expect(strips).toHaveLength(0); // gated: progress = 0

      const arc = arcs[0];
      expect(arc.data?.startAngleDeg).toBeDefined();
      expect(arc.data?.sweepDeg).toBeDefined();
      expect(arc.data?.radius).toBeDefined();
      expect(arc.data?.hue).toBeDefined();
    });

    it("extends the arc sweep past the strip's far edge", () => {
      // ♭VII → IV in C major: source at ~283°, target IV at ~154°.
      // Natural short sweep ≈ -128.6° (counter-clockwise).
      // Emitted sweep should be LONGER in magnitude by roughly the
      // strip's angular half-width so the arc runs the strip's full
      // angular extent above it (arc and strip are now radially
      // separated). Sampled at full progress so the emitted sweep
      // equals the extended one (plus a small backward angular
      // adjustment for the arrow base extent).
      const frame = createTestAnnotatedFrame(5000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10 as PitchClass, borrowed: true, chordId: "bvii", onset: 500 },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvii",
              targetDegree: 4,
              targetPc: 5 as PitchClass,
              targetDiatonic: true,
              weight: 0.85,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const arc = scene.entities.find(
        (e) => e.data?.type === "connector-arc",
      )!;
      const emittedSweep = arc.data?.sweepDeg as number;

      // The natural (pre-extension) sweep magnitude is ~128.6°.
      // After extending by ~12° (strip half-width) and adding a small
      // backward arrow adjustment (~1.5°), the arc's absolute sweep
      // should be roughly ~142° — meaningfully more than the natural,
      // still recognisably the same arc direction.
      const NATURAL_ABS_SWEEP = 128.57;
      expect(Math.abs(emittedSweep)).toBeGreaterThan(NATURAL_ABS_SWEEP + 5);
      expect(Math.abs(emittedSweep)).toBeLessThan(NATURAL_ABS_SWEEP + 25);
      expect(Math.sign(emittedSweep)).toBe(-1); // natural direction preserved
    });

    it("strip appears once the connector animation completes", () => {
      // t=1000, onset=500 → age=500 = CONNECTOR_ANIMATION_MS → progress=1.
      const frame = createTestAnnotatedFrame(1000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10 as PitchClass, borrowed: true, chordId: "bvii", onset: 500 },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvii",
              targetDegree: 4,
              targetPc: 5 as PitchClass,
              targetDiatonic: true,
              weight: 0.85,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      expect(scene.entities.filter((e) => e.data?.type === "connector-arc")).toHaveLength(1);
      expect(scene.entities.filter((e) => e.data?.type === "connector-strip")).toHaveLength(1);
    });

    it("released chord snaps connector progress to 1 (strip visible during fade)", () => {
      // Chord onset=1000, released at t=1050 (only 50ms into the 500ms
      // connector animation). Rendered at t=1100 — still within fade
      // window. The connector should have snapped to complete, so the
      // strip should be visible even though only 100ms of real time
      // has elapsed since onset.
      const frame = createTestAnnotatedFrame(1100, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10 as PitchClass, borrowed: true, chordId: "bvii", onset: 1000, releaseTime: 1050 },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvii",
              targetDegree: 4,
              targetPc: 5 as PitchClass,
              targetDiatonic: true,
              weight: 0.85,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      expect(scene.entities.filter((e) => e.data?.type === "connector-strip")).toHaveLength(1);
    });

    it("preserves natural direction when two edges on the same ring don't collide", () => {
      // Real-world case: ♭VI in C major fans to ii AND IV, both on
      // the diatonic (middle) ring. In practice these already go in
      // opposite directions naturally — ii sits ~180° from ♭VI, IV
      // sits -77°. So the fan-out logic should preserve both natural
      // sweeps here, not force a flip. This documents the actual
      // production behaviour of the only real fan-out we currently
      // emit.
      const frame = createTestAnnotatedFrame(1500, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 6, roman: "♭VI", quality: "maj", rootPc: 8 as PitchClass, borrowed: true, chordId: "bvi", onset: 500 },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvi",
              targetDegree: 2,
              targetPc: 2 as PitchClass,
              targetDiatonic: true,
              weight: 0.55,
              type: "subdominant-borrowing",
            },
            {
              sourceChordId: "bvi",
              targetDegree: 4,
              targetPc: 5 as PitchClass,
              targetDiatonic: true,
              weight: 0.50,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const arcs = scene.entities.filter(
        (e) => e.data?.type === "connector-arc",
      );
      expect(arcs).toHaveLength(2);
      const sweeps = arcs.map((a) => a.data?.sweepDeg as number);
      // Natural directions are already opposite — no flip needed.
      expect(Math.sign(sweeps[0])).not.toBe(Math.sign(sweeps[1]));
      // Neither sweep is force-flipped to the truly-longer arc (>~270°).
      expect(Math.abs(sweeps[0])).toBeLessThan(200);
      expect(Math.abs(sweeps[1])).toBeLessThan(200);
    });

    it("flips the lower-weight edge when two same-ring edges collide direction", () => {
      // Synthetic scenario: a source with two edges whose target
      // degrees are both clockwise-adjacent (degrees 2 and 3 in C
      // major). Both natural short-arc sweeps are positive
      // (clockwise), so they'd overlap on the same side of the wheel.
      // The lower-weight edge should get flipped to the longer arc.
      //
      // ♭II is at ≈ 25.7°, ii at ≈ 51.4°, iii at ≈ 102.9°.
      // ♭II → ii natural sweep ≈ +25.7°, ♭II → iii natural sweep
      // ≈ +77.1°. Same sign → collision → flip the lower-weight one.
      const frame = createTestAnnotatedFrame(1500, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 2, roman: "♭II", quality: "maj", rootPc: 1 as PitchClass, borrowed: true, chordId: "bII", onset: 500 },
          ],
          functionalEdges: [
            // Higher weight — keeps natural direction.
            {
              sourceChordId: "bII",
              targetDegree: 2,
              targetPc: 2 as PitchClass,
              targetDiatonic: true,
              weight: 0.80,
              type: "modal-interchange",
            },
            // Lower weight — should be flipped to the longer arc.
            {
              sourceChordId: "bII",
              targetDegree: 3,
              targetPc: 4 as PitchClass,
              targetDiatonic: true,
              weight: 0.50,
              type: "modal-interchange",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const arcs = scene.entities.filter(
        (e) => e.data?.type === "connector-arc",
      );
      expect(arcs).toHaveLength(2);

      const byDegree: Record<string, number> = {};
      for (const a of arcs) {
        if (a.id.endsWith(":2:d")) byDegree.ii = a.data?.sweepDeg as number;
        if (a.id.endsWith(":3:d")) byDegree.iii = a.data?.sweepDeg as number;
      }
      // Higher-weight (ii) kept the short natural arc — positive.
      expect(byDegree.ii).toBeGreaterThan(0);
      expect(Math.abs(byDegree.ii)).toBeLessThan(180);
      // Lower-weight (iii) got flipped — negative sign, longer magnitude.
      expect(byDegree.iii).toBeLessThan(0);
      expect(Math.abs(byDegree.iii)).toBeGreaterThan(180);
    });

    it("emits an arrow indicator at the source end of each connector arc", () => {
      // Two edges from ♭II — one to ii (diatonic, arc rides middle
      // ring INSIDE ♭II's borrowed ring position → arrow points
      // OUTWARD, pointRadial=+1), and one to a hypothetical borrowed
      // target (arc rides outer ring OUTSIDE ♭II → arrow points
      // INWARD, pointRadial=-1). Verifies both entity emission and
      // the radial direction depends on target ring.
      const frame = createTestAnnotatedFrame(5000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 2, roman: "♭II", quality: "maj", rootPc: 1 as PitchClass, borrowed: true, chordId: "bII", onset: 500 },
          ],
          functionalEdges: [
            {
              sourceChordId: "bII",
              targetDegree: 5,
              targetPc: 7 as PitchClass,
              targetDiatonic: true,
              weight: 0.80,
              type: "modal-interchange",
            },
            {
              sourceChordId: "bII",
              targetDegree: 5,
              targetPc: 7 as PitchClass,
              targetDiatonic: false,
              weight: 0.50,
              type: "modal-interchange",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const arrows = scene.entities.filter(
        (e) => e.data?.type === "connector-arrow",
      );
      expect(arrows).toHaveLength(2);

      const diatonicArrow = arrows.find((a) => a.id.endsWith(":d"))!;
      const borrowedArrow = arrows.find((a) => a.id.endsWith(":b"))!;
      expect(diatonicArrow.data?.pointRadial).toBe(1); // outward
      expect(borrowedArrow.data?.pointRadial).toBe(-1); // inward
      expect(diatonicArrow.data?.angleDeg).toBeDefined();
      expect(diatonicArrow.data?.radius).toBeDefined();
      expect(diatonicArrow.data?.heightNormalized).toBeGreaterThan(0);
    });

    it("dedupes arrows for fan-out on the same target ring", () => {
      // ♭VI in C major fans to ii and IV — both diatonic (same
      // target ring). Only ONE arrow should emit; two would stack
      // at the same source position pointing at the same numeral.
      const frame = createTestAnnotatedFrame(5000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 6, roman: "♭VI", quality: "maj", rootPc: 8 as PitchClass, borrowed: true, chordId: "bvi", onset: 500 },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvi",
              targetDegree: 2,
              targetPc: 2 as PitchClass,
              targetDiatonic: true,
              weight: 0.55,
              type: "subdominant-borrowing",
            },
            {
              sourceChordId: "bvi",
              targetDegree: 4,
              targetPc: 5 as PitchClass,
              targetDiatonic: true,
              weight: 0.50,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const arrows = scene.entities.filter(
        (e) => e.data?.type === "connector-arrow",
      );
      // Fan-out to same ring → one arrow (dedup); two arcs still.
      expect(arrows).toHaveLength(1);
      expect(
        scene.entities.filter((e) => e.data?.type === "connector-arc"),
      ).toHaveLength(2);
    });

    it("distinct edge IDs for chain edges at the same target degree", () => {
      // A secondary dominant emits both a diatonic and a chain
      // (borrowed) edge at the same target degree. Their entity IDs
      // must not collide, or the renderer treats them as a single
      // object.
      const frame = createTestAnnotatedFrame(1500, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 2, roman: "V/ii", quality: "maj", rootPc: 9 as PitchClass, borrowed: true, chordId: "vofii", onset: 500 },
          ],
          functionalEdges: [
            {
              sourceChordId: "vofii",
              targetDegree: 2,
              targetPc: 2 as PitchClass,
              targetDiatonic: true,
              weight: 0.88,
              type: "secondary-dominant",
            },
            {
              sourceChordId: "vofii",
              targetDegree: 2,
              targetPc: 2 as PitchClass,
              targetDiatonic: false,
              weight: 0.70,
              type: "secondary-dominant",
            },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const arcIds = scene.entities
        .filter((e) => e.data?.type === "connector-arc")
        .map((e) => e.id);
      expect(arcIds).toHaveLength(2);
      expect(new Set(arcIds).size).toBe(2); // distinct
      const stripIds = scene.entities
        .filter((e) => e.data?.type === "connector-strip")
        .map((e) => e.id);
      expect(stripIds).toHaveLength(2);
      expect(new Set(stripIds).size).toBe(2); // distinct
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
      const progEntities = scene.entities.filter(
        (e) => e.data?.type === "roman-numeral" && e.id.includes(":prog:"),
      );

      expect(progEntities).toHaveLength(1);
    });
  });

  describe("scrolling chord strip", () => {
    it("produces duration-bar and glyph entities for each chord", () => {
      const frame = createTestAnnotatedFrame(2000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "cid-a", onset: 500, releaseTime: 1500 },
            { degree: 5, roman: "V", quality: "maj", rootPc: 7 as PitchClass, borrowed: false, chordId: "cid-b", onset: 1500, releaseTime: null },
          ],
        },
      });
      const scene = grammar.update(frame, null);

      const bars = scene.entities.filter((e) => e.id.includes(":strip-bar:"));
      const glyphs = scene.entities.filter((e) => e.id.includes(":strip-glyph:"));
      expect(bars).toHaveLength(2);
      expect(glyphs).toHaveLength(2);
    });

    it("positions glyphs using the shared timeToY mapping", () => {
      // At t=1000, a chord with onset=1000 should sit at NOW_LINE_Y;
      // an older onset should be above it (smaller y).
      const frame = createTestAnnotatedFrame(1000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "cid-old", onset: 0, releaseTime: 500 },
            { degree: 5, roman: "V", quality: "maj", rootPc: 7 as PitchClass, borrowed: false, chordId: "cid-now", onset: 1000, releaseTime: null },
          ],
        },
      });
      const scene = grammar.update(frame, null);
      const glyphs = scene.entities
        .filter((e) => e.id.includes(":strip-glyph:"))
        .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));

      // Older chord (onset=0) should be higher up the screen (smaller y)
      expect(glyphs[0].id).toContain("cid-old");
      // Newest chord (onset=1000) should be at the now-line (~0.85)
      expect(glyphs[1].id).toContain("cid-now");
      expect(glyphs[1].position?.y).toBeCloseTo(0.85, 1);
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

  describe("macros", () => {
    it("setMacros({ linger }) shortens the progression fade window", () => {
      // Chord released at t=1000, sampled at t=5000 (age = 4000ms).
      // Default linger=3 seconds → fade window = 3000ms → past fade,
      // numeral culled. With linger=6 seconds → fade window = 6000ms →
      // still within fade, numeral rendered.
      const buildFrame = (t: number) =>
        createTestAnnotatedFrame(t, "main", {
          prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
          harmonicContext: {
            tension: 0,
            keyAware: true,
            currentFunction: null,
            functionalProgression: [
              { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "test:0:Cmaj", onset: 0, releaseTime: 1000 },
            ],
          },
        });

      const grammar2 = new HarmonyGrammar();
      grammar2.init(ctx);

      // Default: 3 seconds fade, age 4000 ms → past fade → 0 numerals
      const defaultScene = grammar2.update(buildFrame(5000), null);
      const defaultProg = defaultScene.entities.filter(
        (e) => e.data?.type === "roman-numeral" && e.id.includes(":prog:"),
      );
      expect(defaultProg).toHaveLength(0);

      // Extended: 6 seconds fade → still visible
      grammar2.setMacros({ linger: 6 });
      const longScene = grammar2.update(buildFrame(5000), null);
      const longProg = longScene.entities.filter(
        (e) => e.data?.type === "roman-numeral" && e.id.includes(":prog:"),
      );
      expect(longProg).toHaveLength(1);
    });

    it("getMacros returns current values; setMacros is partial", () => {
      const grammar2 = new HarmonyGrammar();
      const before = grammar2.getMacros();
      grammar2.setMacros({ linger: 8 });
      expect(grammar2.getMacros().linger).toBe(8);
      grammar2.setMacros({});
      expect(grammar2.getMacros().linger).toBe(8);
      // Verify default matched PROGRESSION_FADE_VALUE (3).
      expect(before.linger).toBe(3);
    });
  });

});
