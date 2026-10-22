/**
 * HarmonyLens Tests
 *
 * Tests the harmony lens with chord shape visualization.
 * SVG snapshots live in HarmonyLens.snapshot.ts (`npm run snapshots`).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  HarmonyLens,
  CONNECTOR_ANIMATION_MS,
  STRUCTURE_OPACITY,
} from "../../src/lenses/HarmonyLens";
import { HARMONY_LEFT } from "../../src/lenses/layout";
import { NOW_LINE_Y } from "../../src/lenses/timeMapping";
import type { LensContext, PitchClass } from "@synesthetica/contracts";
import { createTestAnnotatedFrame } from "../_harness/frames";
import { createTestChord, createChordFrame as createTestFrame } from "../_harness/harmonyFixtures";

const ctx: LensContext = {
  canvasSize: { width: 800, height: 600 },
  rngSeed: 12345,
  part: "main",
};

/** Fade fixtures below are stated against this linger (seconds). */
const LINGER_S = 3;
const FADE_MS = LINGER_S * 1000;

// ============================================================================
// Tests
// ============================================================================

describe("HarmonyLens", () => {
  let lens: HarmonyLens;

  beforeEach(() => {
    lens = new HarmonyLens();
    lens.init(ctx);
    lens.setMacros({ linger: LINGER_S });
  });

  describe("update method", () => {
    it("returns scene frame with entities", () => {
      const chord = createTestChord(0, "maj", [0, 4, 7]);
      const frame = createTestFrame(1000, chord, 0.2);
      const scene = lens.update(frame, null);

      expect(scene.t).toBe(1000);
      expect(scene.entities.length).toBeGreaterThan(0);
      expect(scene.diagnostics).toEqual([]);
    });

    it("creates chord shape entity in harmony column", () => {
      const chord = createTestChord(0, "maj", [0, 4, 7]);
      const frame = createTestFrame(1000, chord, 0.2);
      const scene = lens.update(frame, null);

      const chordEntity = scene.entities.find(
        (e) => e.data?.type === "chord-shape"
      );
      expect(chordEntity).toBeDefined();
      expect(chordEntity?.position?.x).toBeGreaterThan(HARMONY_LEFT);
      expect(chordEntity?.data?.quality).toBe("maj");
    });

    it("passes dashed margin through entity data for sus chords", () => {
      const sus2 = createTestChord(0, "sus2", [0, 2, 7]);
      const frame2 = createTestFrame(1000, sus2, 0.2);
      const scene2 = lens.update(frame2, null);
      const entity2 = scene2.entities.find((e) => e.data?.type === "chord-shape");
      expect(entity2?.data?.margin).toBe("dash-short");

      const sus4 = createTestChord(0, "sus4", [0, 5, 7]);
      const frame4 = createTestFrame(1000, sus4, 0.2);
      const scene4 = lens.update(frame4, null);
      const entity4 = scene4.entities.find((e) => e.data?.type === "chord-shape");
      expect(entity4?.data?.margin).toBe("dash-long");
    });

    it("handles no chords gracefully", () => {
      const frame = createTestFrame(1000, null, 0);
      const scene = lens.update(frame, null);

      // Nothing chord-dependent: at most the structural interval-name dial.
      expect(scene.entities.some((e) => e.data?.type === "chord-shape")).toBe(false);
      expect(scene.entities.every((e) => e.id.includes(":interval-name-"))).toBe(true);
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
            { degree: 1, roman: "I", quality: "maj", rootPc: 0, borrowed: false, chordId: "test:0:Cmaj", onset: 500, releaseTime: null },
          ],
        },
        // no prescribedKey
      });
      const scene = lens.update(frame, null);
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
          currentFunction: { degree: 1, roman: "I", quality: "maj", rootPc: 0 as PitchClass, borrowed: false, chordId: "test:0:Cmaj", onset: 800, releaseTime: null },
          functionalProgression: [
            { degree: 1, roman: "I", quality: "maj", rootPc: 0, borrowed: false, chordId: "test:0:Cmaj", onset: 0, releaseTime: null },
            { degree: 4, roman: "IV", quality: "maj", rootPc: 5, borrowed: false, chordId: "test:500:Fmaj", onset: 500, releaseTime: null },
            { degree: 5, roman: "V", quality: "maj", rootPc: 7, borrowed: false, chordId: "test:800:Gmaj", onset: 800, releaseTime: null },
          ],
        },
      });
      const scene = lens.update(frame, null);
      const progEntities = scene.entities.filter(
        (e) => e.data?.type === "roman-numeral" && e.id.includes(":prog:"),
      );

      expect(progEntities).toHaveLength(3);
      // Each should have glyph geometry
      for (const e of progEntities) {
        expect(e.data?.polylines).toBeDefined();
        expect(e.position?.x).toBeGreaterThan(HARMONY_LEFT); // in harmony column
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
            // Released 2/3 of the fade window ago
            { degree: 1, roman: "I", quality: "maj", rootPc: 0, borrowed: false, chordId: "test:0:Cmaj", onset: 0, releaseTime: 5000 - (FADE_MS * 2) / 3 },
            // Released 1/6 of the fade window ago
            { degree: 5, roman: "V", quality: "maj", rootPc: 7, borrowed: false, chordId: "test:4000:Gmaj", onset: 4000, releaseTime: 5000 - FADE_MS / 6 },
          ],
        },
      });
      const scene = lens.update(frame, null);
      const progEntities = scene.entities.filter(
        (e) => e.data?.type === "roman-numeral" && e.id.includes(":prog:"),
      );

      // Both inside the fade window; the more recently released is brighter
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
            { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10, borrowed: true, chordId: "bvii", onset: 500, releaseTime: null },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvii",
              targetDegree: 4,
              targetPc: 5,
              targetDiatonic: true,
              weight: 0.85,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = lens.update(frame, null);
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
      // Arc and strip share one base opacity, so their colours meet at
      // the same intensity where the arc joins the strip's inner edge.
      const arc = scene.entities.find((e) => e.data?.type === "connector-arc")!;
      expect(strip.style.opacity).toBeCloseTo(arc.style.opacity!, 9);
    });

    it("scales connector opacity linearly with edge weight", () => {
      const stripOpacity = (weight: number) => {
        const frame = createTestAnnotatedFrame(1000, "main", {
          prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
          harmonicContext: {
            tension: 0,
            keyAware: true,
            currentFunction: null,
            functionalProgression: [
              { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10, borrowed: true, chordId: "bvii", onset: 500, releaseTime: null },
            ],
            functionalEdges: [
              { sourceChordId: "bvii", targetDegree: 4, targetPc: 5, targetDiatonic: true, weight, type: "subdominant-borrowing" },
            ],
          },
        });
        return lens.update(frame, null).entities.find((e) => e.data?.type === "connector-strip")!
          .style.opacity!;
      };
      const strong = stripOpacity(0.8);
      const weak = stripOpacity(0.4);
      expect(strong).toBeLessThanOrEqual(0.8);
      expect(strong / weak).toBeCloseTo(2, 9);
    });

    it("emits no strip entities when no edges exist", () => {
      const frame = createTestAnnotatedFrame(1000, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 1, roman: "I", quality: "maj", rootPc: 0, borrowed: false, chordId: "i", onset: 500, releaseTime: null },
          ],
          functionalEdges: [],
        },
      });
      const scene = lens.update(frame, null);
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
            { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10, borrowed: true, chordId: "bvii", onset: 500, releaseTime: null },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvii",
              targetDegree: 4,
              targetPc: 5,
              targetDiatonic: true,
              weight: 0.85,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = lens.update(frame, null);
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
            { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10, borrowed: true, chordId: "bvii", onset: 500, releaseTime: null },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvii",
              targetDegree: 4,
              targetPc: 5,
              targetDiatonic: true,
              weight: 0.85,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = lens.update(frame, null);
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

    const bviiToIV = (t: number, onset: number, releaseTime: number | null) =>
      createTestAnnotatedFrame(t, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10, borrowed: true, chordId: "bvii", onset, releaseTime },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvii",
              targetDegree: 4,
              targetPc: 5,
              targetDiatonic: true,
              weight: 0.85,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
    const countOf = (frame: ReturnType<typeof bviiToIV>, type: string) =>
      lens.update(frame, null).entities.filter((e) => e.data?.type === type).length;

    it("strip appears once the connector animation completes", () => {
      const onset = 1000;
      expect(countOf(bviiToIV(onset + CONNECTOR_ANIMATION_MS / 2, onset, null), "connector-strip")).toBe(0);
      expect(countOf(bviiToIV(onset + CONNECTOR_ANIMATION_MS, onset, null), "connector-arc")).toBe(1);
      expect(countOf(bviiToIV(onset + CONNECTOR_ANIMATION_MS, onset, null), "connector-strip")).toBe(1);
    });

    it("released chord snaps connector progress to 1 (strip visible during fade)", () => {
      // Released a quarter of the way into the animation and sampled
      // halfway through it: a held chord would still be drawing its
      // arc (no strip), but the released one has snapped to complete.
      const onset = 1000;
      const t = onset + CONNECTOR_ANIMATION_MS / 2;
      expect(countOf(bviiToIV(t, onset, null), "connector-strip")).toBe(0);
      expect(countOf(bviiToIV(t, onset, onset + CONNECTOR_ANIMATION_MS / 4), "connector-strip")).toBe(1);
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
            { degree: 6, roman: "♭VI", quality: "maj", rootPc: 8, borrowed: true, chordId: "bvi", onset: 500, releaseTime: null },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvi",
              targetDegree: 2,
              targetPc: 2,
              targetDiatonic: true,
              weight: 0.55,
              type: "subdominant-borrowing",
            },
            {
              sourceChordId: "bvi",
              targetDegree: 4,
              targetPc: 5,
              targetDiatonic: true,
              weight: 0.50,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = lens.update(frame, null);
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
            { degree: 2, roman: "♭II", quality: "maj", rootPc: 1, borrowed: true, chordId: "bII", onset: 500, releaseTime: null },
          ],
          functionalEdges: [
            // Higher weight — keeps natural direction.
            {
              sourceChordId: "bII",
              targetDegree: 2,
              targetPc: 2,
              targetDiatonic: true,
              weight: 0.80,
              type: "modal-interchange",
            },
            // Lower weight — should be flipped to the longer arc.
            {
              sourceChordId: "bII",
              targetDegree: 3,
              targetPc: 4,
              targetDiatonic: true,
              weight: 0.50,
              type: "modal-interchange",
            },
          ],
        },
      });
      const scene = lens.update(frame, null);
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
            { degree: 2, roman: "♭II", quality: "maj", rootPc: 1, borrowed: true, chordId: "bII", onset: 500, releaseTime: null },
          ],
          functionalEdges: [
            {
              sourceChordId: "bII",
              targetDegree: 5,
              targetPc: 7,
              targetDiatonic: true,
              weight: 0.80,
              type: "modal-interchange",
            },
            {
              sourceChordId: "bII",
              targetDegree: 5,
              targetPc: 7,
              targetDiatonic: false,
              weight: 0.50,
              type: "modal-interchange",
            },
          ],
        },
      });
      const scene = lens.update(frame, null);
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
            { degree: 6, roman: "♭VI", quality: "maj", rootPc: 8, borrowed: true, chordId: "bvi", onset: 500, releaseTime: null },
          ],
          functionalEdges: [
            {
              sourceChordId: "bvi",
              targetDegree: 2,
              targetPc: 2,
              targetDiatonic: true,
              weight: 0.55,
              type: "subdominant-borrowing",
            },
            {
              sourceChordId: "bvi",
              targetDegree: 4,
              targetPc: 5,
              targetDiatonic: true,
              weight: 0.50,
              type: "subdominant-borrowing",
            },
          ],
        },
      });
      const scene = lens.update(frame, null);
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
            { degree: 2, roman: "V/ii", quality: "maj", rootPc: 9, borrowed: true, chordId: "vofii", onset: 500, releaseTime: null },
          ],
          functionalEdges: [
            {
              sourceChordId: "vofii",
              targetDegree: 2,
              targetPc: 2,
              targetDiatonic: true,
              weight: 0.88,
              type: "secondary-dominant",
            },
            {
              sourceChordId: "vofii",
              targetDegree: 2,
              targetPc: 2,
              targetDiatonic: false,
              weight: 0.70,
              type: "secondary-dominant",
            },
          ],
        },
      });
      const scene = lens.update(frame, null);
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
            // Released just over the fade window ago → omitted
            { degree: 1, roman: "I", quality: "maj", rootPc: 0, borrowed: false, chordId: "test:0:Cmaj", onset: 0, releaseTime: 10000 - FADE_MS - 1 },
            // Released 500ms ago → still visible
            { degree: 5, roman: "V", quality: "maj", rootPc: 7, borrowed: false, chordId: "test:9000:Gmaj", onset: 9000, releaseTime: 9500 },
          ],
        },
      });
      const scene = lens.update(frame, null);
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
            { degree: 1, roman: "I", quality: "maj", rootPc: 0, borrowed: false, chordId: "cid-a", onset: 500, releaseTime: 1500 },
            { degree: 5, roman: "V", quality: "maj", rootPc: 7, borrowed: false, chordId: "cid-b", onset: 1500, releaseTime: null },
          ],
        },
      });
      const scene = lens.update(frame, null);

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
            { degree: 1, roman: "I", quality: "maj", rootPc: 0, borrowed: false, chordId: "cid-old", onset: 0, releaseTime: 500 },
            { degree: 5, roman: "V", quality: "maj", rootPc: 7, borrowed: false, chordId: "cid-now", onset: 1000, releaseTime: null },
          ],
        },
      });
      const scene = lens.update(frame, null);
      const glyphs = scene.entities
        .filter((e) => e.id.includes(":strip-glyph:"))
        .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));

      // Older chord (onset=0) should be higher up the screen (smaller y)
      expect(glyphs[0].id).toContain("cid-old");
      // Newest chord (onset=1000) should be at the now-line
      expect(glyphs[1].id).toContain("cid-now");
      expect(glyphs[1].position?.y).toBeCloseTo(NOW_LINE_Y, 9);
    });
  });

  describe("macros", () => {
    it("setMacros({ linger }) sets the progression fade window in seconds", () => {
      const releasedAgoMs = 4000;
      const t = 5000;
      const frame = createTestAnnotatedFrame(t, "main", {
        prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
        harmonicContext: {
          tension: 0,
          keyAware: true,
          currentFunction: null,
          functionalProgression: [
            { degree: 1, roman: "I", quality: "maj", rootPc: 0, borrowed: false, chordId: "test:0:Cmaj", onset: 0, releaseTime: t - releasedAgoMs },
          ],
        },
      });
      const numerals = () =>
        lens.update(frame, null).entities.filter(
          (e) => e.data?.type === "roman-numeral" && e.id.includes(":prog:"),
        );

      lens.setMacros({ linger: releasedAgoMs / 1000 / 2 }); // window shorter than the age
      expect(numerals()).toHaveLength(0);
      lens.setMacros({ linger: (releasedAgoMs / 1000) * 2 }); // window longer than the age
      expect(numerals()).toHaveLength(1);
    });

    it("getMacros returns current values; setMacros is partial", () => {
      lens.setMacros({ linger: 8 });
      expect(lens.getMacros().linger).toBe(8);
      lens.setMacros({});
      expect(lens.getMacros().linger).toBe(8);
    });
  });

});

describe("HarmonyLens glyph overtones (RFC 012)", () => {
  it("passes chord partials and fade-driven dissipation to the chord-shape entity", () => {
    const lens = new HarmonyLens();
    const c = createTestChord(0, "maj", [0, 4, 7]);
    const partials = [
      { n: 3, pc: 7 as PitchClass, cents: 2, level: 0.3, color: { h: 210, s: 0.8, v: 0.8, a: 1 }, sourcePc: 0 as PitchClass, angle: 210.6 },
    ];
    const withPartials = { ...c, partials };

    const held = lens.update(createTestFrame(1000, withPartials, 0), null)
      .entities.find((e) => e.data?.type === "chord-shape")!;
    expect(held.data!.partials).toEqual(partials);
    expect(held.data!.overtoneDissipation).toBe(0);

    // Chord ends: the glyph fades and its steam dissipates with it
    lens.update(createTestFrame(1016, null, 0), null);
    const fading = lens.update(createTestFrame(1076, null, 0), null)
      .entities.find((e) => e.data?.type === "chord-shape")!;
    expect(fading.data!.overtoneDissipation as number).toBeGreaterThan(0);
    expect(fading.data!.overtoneDissipation as number).toBeCloseTo(1 - (fading.style.opacity ?? 1), 9);
  });

  it("withholds partials when the glyph toggle is off", () => {
    const lens = new HarmonyLens();
    lens.setMacros({ overtones: false });
    const c = createTestChord(0, "maj", [0, 4, 7]);
    const partials = [
      { n: 3, pc: 7 as PitchClass, cents: 2, level: 0.3, color: { h: 210, s: 0.8, v: 0.8, a: 1 }, sourcePc: 0 as PitchClass, angle: 210.6 },
    ];
    const shape = lens.update(createTestFrame(1000, { ...c, partials }, 0), null)
      .entities.find((e) => e.data?.type === "chord-shape")!;
    expect(shape.data!.partials).toBeUndefined();
  });
});

describe("HarmonyLens guide numerals", () => {
  const C_MAJOR = [
    { rootPc: 0, roman: "I" }, { rootPc: 2, roman: "ii" }, { rootPc: 4, roman: "iii" },
    { rootPc: 5, roman: "IV" }, { rootPc: 7, roman: "V" }, { rootPc: 9, roman: "vi" },
    { rootPc: 11, roman: "vii°" },
  ].map((c) => ({ ...c, rootPc: c.rootPc as PitchClass, borrowed: false }));
  const frameWith = (progression: unknown[], key = true) =>
    createTestAnnotatedFrame(1000, "main", {
      prescribedKey: key ? { root: 0 as PitchClass, mode: "ionian" } : null,
      harmonicContext: {
        tension: 0,
        keyAware: key,
        currentFunction: null,
        functionalProgression: progression as never,
        functionalEdges: [],
        diatonicChords: key ? C_MAJOR : [],
      },
    });
  const guides = (scene: { entities: Array<{ id: string; style: { opacity?: number } }> }) =>
    scene.entities.filter((e) => e.id.includes(":guide-numeral-"));

  it("draws the key's diatonic numerals greyed when a key is set", () => {
    const g = guides(new HarmonyLens().update(frameWith([]), null));
    expect(g).toHaveLength(7);
    for (const e of g) expect(e.style.opacity).toBe(STRUCTURE_OPACITY);
  });

  it("draws none without a key (the chord name stands alone)", () => {
    expect(guides(new HarmonyLens().update(frameWith([], false), null))).toHaveLength(0);
  });

  it("fades the guide back in as a released numeral fades out (handover)", () => {
    const lens = new HarmonyLens();
    lens.setMacros({ linger: LINGER_S });
    const at = (released: number) => {
      const ii = { degree: 2, roman: "ii", quality: "min", rootPc: 2 as PitchClass, borrowed: false, chordId: "x", onset: 0, releaseTime: released };
      return guides(lens.update(frameWith([ii]), null)).find((e) => e.id.endsWith("d:2"));
    };
    // The guide returns in proportion to how far the numeral has faded
    for (const fraction of [1 / 12, 5 / 6]) {
      const releasedAt = 1000 - fraction * FADE_MS; // frame t = 1000
      expect(at(releasedAt)!.style.opacity).toBeCloseTo(STRUCTURE_OPACITY * fraction, 9);
    }
  });

  it("hides the guide in a slot a played numeral occupies", () => {
    const ii = { degree: 2, roman: "ii", quality: "min", rootPc: 2 as PitchClass, borrowed: false, chordId: "x", onset: 900, releaseTime: null };
    const g = guides(new HarmonyLens().update(frameWith([ii]), null));
    expect(g).toHaveLength(6);
    expect(g.some((e) => e.id.endsWith("d:2"))).toBe(false);
  });
});

describe("HarmonyLens modal-interchange hints", () => {
  const HINTS = [
    { rootPc: 10, roman: "♭VII" }, { rootPc: 3, roman: "♭III" }, { rootPc: 8, roman: "♭VI" },
    { rootPc: 5, roman: "iv" }, { rootPc: 1, roman: "♭II" },
  ].map((c) => ({ ...c, rootPc: c.rootPc as PitchClass, borrowed: true }));
  const frame = (progression: unknown[]) =>
    createTestAnnotatedFrame(1000, "main", {
      prescribedKey: { root: 0 as PitchClass, mode: "ionian" },
      harmonicContext: {
        tension: 0,
        keyAware: true,
        currentFunction: null,
        functionalProgression: progression as never,
        functionalEdges: [],
        diatonicChords: [],
        modalInterchangeChords: HINTS,
      },
    });
  const hints = (lens: HarmonyLens, progression: unknown[] = []) =>
    lens.update(frame(progression), null).entities.filter((e) => e.id.includes(":hint-numeral-"));

  it("is off by default", () => {
    expect(hints(new HarmonyLens())).toHaveLength(0);
  });

  it("draws the hints greyed on the borrowed ring when on, hiding occupied slots", () => {
    const lens = new HarmonyLens();
    lens.setMacros({ modalInterchangeHints: true });
    expect(hints(lens)).toHaveLength(5);
    const bVII = { degree: 7, roman: "♭VII", quality: "maj", rootPc: 10 as PitchClass, borrowed: true, chordId: "y", onset: 900, releaseTime: null };
    const shown = hints(lens, [bVII]);
    expect(shown).toHaveLength(4);
    expect(shown.some((e) => e.id.endsWith("b:10"))).toBe(false);
  });
});

describe("HarmonyLens interval-name dial", () => {
  const dial = (lens: HarmonyLens) =>
    lens.update(createTestFrame(1000, null, 0), null).entities.filter((e) => e.id.includes(":interval-name-"));

  it("can be turned on and off", () => {
    const lens = new HarmonyLens();
    lens.setMacros({ intervalNames: true });
    expect(dial(lens)).toHaveLength(12);
    lens.setMacros({ intervalNames: false });
    expect(dial(lens)).toHaveLength(0);
  });

  it("labels all twelve angles, R upright at the top and d5 upside down at the bottom", () => {
    const lens = new HarmonyLens();
    lens.setMacros({ intervalNames: true });
    const labels = dial(lens);
    expect(labels.map((e) => e.data!.text)).toEqual(
      ["R", "m2", "M2", "m3", "M3", "P4", "d5", "P5", "m6", "M6", "m7", "M7"],
    );
    const root = labels[0], d5 = labels[6];
    expect(root.data!.rotationDeg).toBe(0);
    expect(d5.data!.rotationDeg).toBe(180);
    expect(root.position!.y).toBeLessThan(d5.position!.y); // top vs bottom
    expect(root.data!.anchor).toBe("baseline");
  });
});

