/**
 * RhythmLens Tests
 *
 * Tests the production rhythm lens with various inputs and macro settings.
 * SVG snapshots for visual review live in RhythmLens.snapshot.ts
 * (`npm run snapshots`).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RhythmLens, MIN_NOTE_STRIP_HEIGHT } from "../../src/lenses/RhythmLens";
import { NOW_LINE_Y, TIME_HORIZON_HISTORY_MS } from "../../src/lenses/timeMapping";
import {
  RHYTHM_LEFT,
  RHYTHM_RIGHT,
  STRUCTURAL_TEXT_ALPHA,
} from "../../src/lenses/layout";
import { createRhythmFrame as createTestFrame, lensCtx as ctx } from "../_harness/rhythmFixtures";
import type { Entity, SceneFrame } from "@synesthetica/contracts";

const ofType = (scene: SceneFrame, type: string): Entity[] =>
  scene.entities.filter((e) => e.data?.type === type);

/** Screen y for an event `ageMs` in the past (the lens's past-time scale). */
const yForAge = (ageMs: number) =>
  NOW_LINE_Y - (ageMs / TIME_HORIZON_HISTORY_MS) * NOW_LINE_Y;

/** Drift fixtures below are stated against this tolerance. */
const TIGHTNESS_MS = 30;

// ============================================================================
// Tests
// ============================================================================

describe("RhythmLens", () => {
  let lens: RhythmLens;

  beforeEach(() => {
    lens = new RhythmLens();
    lens.init(ctx);
  });

  describe("basic structure", () => {
    it("draws the NOW line at NOW_LINE_Y for an empty frame", () => {
      const scene = lens.update(createTestFrame(1000, { tempo: 120 }), null);
      const nowLine = ofType(scene, "now-line");
      expect(nowLine).toHaveLength(1);
      expect(nowLine[0].position!.y).toBe(NOW_LINE_Y);
    });

    it("produces beat grid lines at Tier 2", () => {
      const scene = lens.update(createTestFrame(2000, { tempo: 120 }), null);
      expect(ofType(scene, "beat-line").length).toBeGreaterThan(0);
    });

    it("produces bar lines at Tier 3", () => {
      const frame = createTestFrame(4000, {
        tempo: 120,
        meter: { beatsPerBar: 4, beatUnit: 4 },
      });
      expect(ofType(lens.update(frame, null), "bar-line").length).toBeGreaterThan(0);
    });
  });

  describe("free-time mode (no prescribed tempo)", () => {
    it("renders now line + notes but no grid or drift when tempo is null", () => {
      const frame = createTestFrame(2000, {
        notes: [{ id: "n1", pc: 0, onset: 1800 }],
        // no tempo prescribed
      });

      const scene = lens.update(frame, null);

      expect(ofType(scene, "now-line")).toHaveLength(1);
      expect(ofType(scene, "note-strip").length).toBeGreaterThan(0);
      expect(ofType(scene, "beat-line")).toHaveLength(0);
      expect(ofType(scene, "bar-line")).toHaveLength(0);
      expect(ofType(scene, "streak")).toHaveLength(0);
      expect(ofType(scene, "reference-line")).toHaveLength(0);
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

      const notes = ofType(lens.update(frame, null), "note-strip");
      expect(notes.length).toBe(3);

      const cNote = notes.find((n) => n.data?.pitchClass === 0)!;
      const fsNote = notes.find((n) => n.data?.pitchClass === 6)!;
      const bNote = notes.find((n) => n.data?.pitchClass === 11)!;

      // C should be leftmost, B should be rightmost
      expect(cNote.position!.x).toBeLessThan(fsNote.position!.x);
      expect(fsNote.position!.x).toBeLessThan(bNote.position!.x);
    });

    it("spans the rhythm column: C on its left edge, B on its right", () => {
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [
          { id: "c", pc: 0, onset: 1000 },
          { id: "b", pc: 11, onset: 1000 },
        ],
      });
      const notes = ofType(lens.update(frame, null), "note-strip");
      const x = (pc: number) => notes.find((n) => n.data?.pitchClass === pc)!.position!.x;
      expect(x(0)).toBeCloseTo(RHYTHM_LEFT, 9);
      expect(x(11)).toBeCloseTo(RHYTHM_RIGHT, 9);
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

      const notes = ofType(lens.update(frame, null), "note-strip");
      const oldNote = notes.find((n) => n.data?.noteId === "old")!;
      const recentNote = notes.find((n) => n.data?.noteId === "recent")!;
      const nowNote = notes.find((n) => n.data?.noteId === "now")!;

      // Older notes should have smaller y (higher on screen)
      expect(oldNote.position!.y).toBeLessThan(recentNote.position!.y);
      expect(recentNote.position!.y).toBeLessThan(nowNote.position!.y);

      // A note starting now sits on the NOW line
      expect(nowNote.position!.y).toBeCloseTo(NOW_LINE_Y, 9);
    });

    it("tracks the onset from the first frames: a new note grows out of the NOW line", () => {
      const stripAt = (t: number) =>
        lens
          .update(createTestFrame(t, { notes: [{ id: "n", pc: 0, onset: 1000 }] }), null)
          .entities.find((e) => e.data?.type === "note-strip")!;

      const early = stripAt(1020);
      const later = stripAt(1040);
      // Top sits on the onset and moves every frame (no still phase)
      expect(early.position!.y).toBeCloseTo(yForAge(20), 9);
      expect(later.position!.y).toBeLessThan(early.position!.y);
      // Never extends below NOW
      expect(early.position!.y + (early.data!.barHeight as number)).toBeCloseTo(NOW_LINE_Y, 9);
    });

    it("pads a short released note at its bottom, keeping its top on the onset", () => {
      // A note whose real extent is half the minimum strip height
      const durationMs = ((MIN_NOTE_STRIP_HEIGHT / 2) / NOW_LINE_Y) * TIME_HORIZON_HISTORY_MS;
      const frame = createTestFrame(2000, {
        notes: [{ id: "s", pc: 0, onset: 1000, duration: durationMs, phase: "release" }],
      });
      const strip = ofType(lens.update(frame, null), "note-strip")[0];
      expect(strip.position!.y).toBeCloseTo(yForAge(1000), 9);
      expect(strip.data!.barHeight).toBeCloseTo(MIN_NOTE_STRIP_HEIGHT, 9);
    });

    it("draws bar height in proportion to note duration", () => {
      const t = 3000;
      const durations = [500, 1000, 2000];
      const frame = createTestFrame(t, {
        tempo: 120,
        notes: durations.map((d, i) => ({
          id: `d${d}`,
          pc: (i * 3) as 0 | 3 | 6,
          onset: t - 2000,
          duration: d,
        })),
      });
      const strips = ofType(lens.update(frame, null), "note-strip");
      for (const d of durations) {
        const strip = strips.find((s) => s.data?.noteId === `d${d}`)!;
        expect(strip.data!.barHeight).toBeCloseTo((d / TIME_HORIZON_HISTORY_MS) * NOW_LINE_Y, 9);
      }
    });

    it("culls a strip only once its whole bar has scrolled off the top", () => {
      const H = TIME_HORIZON_HISTORY_MS;
      const t = H + 2000;
      const frame = createTestFrame(t, {
        tempo: 120,
        notes: [
          // Ended longer ago than the screen's history span: gone
          { id: "gone", pc: 0, onset: t - H - 500, duration: 200, phase: "release" },
          // Onset off the top, end still on screen: drawn, clipped at the top
          { id: "straddling", pc: 3, onset: t - H - 100, duration: 200, phase: "release" },
          { id: "recent", pc: 7, onset: t - 400 },
        ],
      });
      const strips = ofType(lens.update(frame, null), "note-strip");
      expect(strips.map((s) => s.data!.noteId).sort()).toEqual(["recent", "straddling"]);
      const straddling = strips.find((s) => s.data!.noteId === "straddling")!;
      expect(straddling.position!.y).toBe(0);
    });
  });

  describe("drift visualization", () => {
    beforeEach(() => {
      lens.setMacros({ tightnessTolerance: TIGHTNESS_MS, quantiseResolution: "quarter" });
    });

    it("adds streak lines for notes with drift", () => {
      // 120 BPM: quarter beats every 500ms. Onset at 550 = 50ms late.
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "late", pc: 0, onset: 500 + TIGHTNESS_MS + 20 }],
      });

      const streaks = ofType(lens.update(frame, null), "streak");
      expect(streaks.length).toBeGreaterThan(0);
      expect(streaks[0].data?.noteId).toBe("late");
      expect(streaks[0].data?.driftMs as number).toBeCloseTo(TIGHTNESS_MS + 20, 6);
    });

    it("adds a reference line but no streaks for tight notes", () => {
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "tight", pc: 0, onset: 500 + TIGHTNESS_MS / 3 }],
      });

      const scene = lens.update(frame, null);
      const refLines = ofType(scene, "reference-line");
      expect(refLines.length).toBe(1);
      expect(refLines[0].data?.noteId).toBe("tight");
      expect(ofType(scene, "streak")).toHaveLength(0);
    });

    it("points streaks toward the beat: up for early notes, down for late", () => {
      // Beats at 1500 and 2000. Early: 100ms before 1500. Late: 100ms after.
      const frame = createTestFrame(2500, {
        tempo: 120,
        notes: [
          { id: "early", pc: 2, onset: 1400, duration: 200 },
          { id: "late", pc: 9, onset: 1600, duration: 200 },
          { id: "onbeat", pc: 5, onset: 2000, duration: 300 },
        ],
      });

      const scene = lens.update(frame, null);
      const streaksFor = (id: string) =>
        ofType(scene, "streak").filter((e) => e.data?.noteId === id);

      expect(streaksFor("early").length).toBeGreaterThan(0);
      expect(streaksFor("late").length).toBeGreaterThan(0);
      expect(streaksFor("onbeat")).toHaveLength(0);
      // y grows downward: early streaks reach up (toward the later beat)
      for (const s of streaksFor("early")) expect(s.velocity!.y).toBeLessThan(0);
      for (const s of streaksFor("late")) expect(s.velocity!.y).toBeGreaterThan(0);
      // Every note with drift info shows where its beat was
      expect(ofType(scene, "reference-line").map((e) => e.data!.noteId).sort()).toEqual(
        ["early", "late", "onbeat"],
      );
    });

    it("drops reference marks once the note's onset has scrolled off the top", () => {
      // The straddling note's strip is still on screen (clipped at the
      // top), but its onset, and so the beat it is measured against,
      // is not: no reference line and no streaks.
      const H = TIME_HORIZON_HISTORY_MS;
      const beatMs = 500;
      const t = Math.ceil((H + 2 * beatMs) / beatMs) * beatMs;
      const frame = createTestFrame(t, {
        tempo: 120,
        notes: [
          { id: "straddling", pc: 3, onset: t - H - 100, duration: 200, phase: "release" },
          { id: "visible-late", pc: 9, onset: t - 4 * beatMs + 80, duration: 200 },
          { id: "visible-early", pc: 11, onset: t - 2 * beatMs - 80, duration: 200 },
        ],
      });

      const scene = lens.update(frame, null);
      expect(ofType(scene, "note-strip").map((e) => e.data!.noteId).sort()).toEqual(
        ["straddling", "visible-early", "visible-late"],
      );
      expect(ofType(scene, "reference-line").map((e) => e.data!.noteId).sort()).toEqual(
        ["visible-early", "visible-late"],
      );
      const streakNotes = new Set(ofType(scene, "streak").map((e) => e.data!.noteId));
      expect([...streakNotes].sort()).toEqual(["visible-early", "visible-late"]);
    });
  });

  describe("drift cache (referential transparency)", () => {
    it("freezes drift once computed, even when tempo changes", () => {
      // Frame 1: tempo=120 (500ms beat), onset=550 → drift=50
      const frame1 = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 550 }],
      });
      const note1 = ofType(lens.update(frame1, null), "note-strip")[0];
      expect(note1?.data?.driftMs as number).toBeCloseTo(50, 6);

      // Frame 2: tempo changes to 100 (600ms beat). Recomputing from the
      // new grid would give a different drift; cache keeps drift=50.
      const frame2 = createTestFrame(1100, {
        tempo: 100,
        notes: [{ id: "n1", pc: 0, onset: 550 }],
      });
      const note2 = ofType(lens.update(frame2, null), "note-strip")[0];
      expect(note2?.data?.driftMs as number).toBeCloseTo(50, 6);
    });

    it("preserves drift when tier drops from 2 to 1", () => {
      // Frame 1: tier 2 (has tempo) → drift computed
      const frame1 = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 550 }],
      });
      expect(ofType(lens.update(frame1, null), "streak").length).toBeGreaterThan(0);

      // Frame 2: tempo cleared → tier 1. Without cache, drift would go null
      // and streaks would vanish. Cache preserves the drift value.
      const frame2 = createTestFrame(1100, {
        notes: [{ id: "n1", pc: 0, onset: 550 }],
      });
      expect(ofType(lens.update(frame2, null), "streak").length).toBeGreaterThan(0);
    });

    it("prunes cache when note leaves the frame", () => {
      // Frame 1: note present, drift cached
      lens.update(
        createTestFrame(1000, { tempo: 120, notes: [{ id: "n1", pc: 0, onset: 550 }] }),
        null,
      );

      // Frame 2: note gone (pruned by stabilizer)
      lens.update(createTestFrame(2000, { tempo: 120, notes: [] }), null);

      // Frame 3: same note ID reappears with a different onset and so a
      // different drift. Should compute fresh from the grid, not return
      // the stale cached value.
      const frame3 = createTestFrame(3000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 2470 }], // 30ms early vs 2500
      });
      const note3 = ofType(lens.update(frame3, null), "note-strip")[0];
      expect(note3?.data?.driftMs as number).toBeCloseTo(-30, 6);
    });
  });

  describe("entity ID stability across frames", () => {
    it("produces identical entity IDs for the same note in consecutive frames", () => {
      const notes = [{ id: "n1", pc: 0 as const, onset: 800 }];
      const scene1 = lens.update(createTestFrame(1000, { tempo: 120, notes }), null);
      // Frame 2: same note, slightly later — entity IDs must be identical
      const scene2 = lens.update(createTestFrame(1050, { tempo: 120, notes }), null);

      // Note-related entities only (beat lines shift with time)
      const noteIds = (scene: SceneFrame) =>
        scene.entities
          .filter((e) => ["note-strip", "streak", "reference-line"].includes(e.data?.type as string))
          .map((e) => e.id)
          .sort();

      expect(noteIds(scene1).length).toBeGreaterThan(0);
      expect(noteIds(scene1)).toEqual(noteIds(scene2));
    });

    it("does not include frame-unique counters in entity IDs", () => {
      const frame = createTestFrame(1000, {
        tempo: 120,
        notes: [{ id: "n1", pc: 0, onset: 800 }],
      });

      const scene = lens.update(frame, null);

      // IDs follow "lens-id:descriptive-base", not "…:0", "…:1"
      for (const entity of scene.entities) {
        const parts = entity.id.split(":");
        expect(parts[parts.length - 1]).not.toMatch(/^\d+$/);
      }
    });
  });

  describe("horizon macro", () => {
    it("does not hide note strips: they leave by scrolling off screen", () => {
      const t = 6000;
      const frame = createTestFrame(t, {
        tempo: 120,
        notes: [
          { id: "older", pc: 0, onset: t - TIME_HORIZON_HISTORY_MS / 2, duration: 200, phase: "release" },
          { id: "recent", pc: 3, onset: t - 400 },
        ],
      });
      const stripIds = (horizon: number) => {
        const l = new RhythmLens();
        l.init(ctx);
        l.setMacros({ horizon });
        return ofType(l.update(frame, null), "note-strip").map((e) => e.data!.noteId).sort();
      };
      expect(stripIds(1.0)).toEqual(["older", "recent"]);
      expect(stripIds(0.0)).toEqual(["older", "recent"]);
    });

    it("reduces beat line visibility at min horizon", () => {
      const frame = createTestFrame(4000, { tempo: 120 });

      lens.setMacros({ horizon: 1.0 });
      const beatLinesMax = ofType(lens.update(frame, null), "beat-line");

      lens.setMacros({ horizon: 0.0 });
      lens.init(ctx); // Reset state
      const beatLinesMin = ofType(lens.update(frame, null), "beat-line");

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

      lens.setMacros({ quantiseResolution: "16th" });
      const note16 = ofType(lens.update(frame, null), "note-strip")[0];
      expect(note16?.data?.driftMs).toBe(0);

      lens.setMacros({ quantiseResolution: "quarter" });
      lens.init(ctx);
      const noteQ = ofType(lens.update(frame, null), "note-strip")[0];
      expect(noteQ?.data?.driftMs).toBe(125);
    });
  });
});

describe("RhythmLens note-name legend", () => {
  it("shows one name per column under the NOW line by default, in the NOW line grey", () => {
    const lens = new RhythmLens();
    lens.init(ctx);
    const scene = lens.update(createTestFrame(1000, {}), null);
    const names = ofType(scene, "text-label");
    expect(names.map((e) => e.data!.text)).toEqual(
      ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"],
    );
    const nowLine = ofType(scene, "now-line")[0];
    for (const e of names) {
      expect(e.position!.y).toBeGreaterThan(NOW_LINE_Y);
      expect(e.data!.font).toBe("mono");
    }
    // The NOW line's grey, at the higher structural-text opacity
    const { h, s, v } = nowLine.style.color!;
    expect(names[0].style.color).toMatchObject({ h, s, v, a: STRUCTURAL_TEXT_ALPHA });
    // Centred on the columns: C left of C♯ left of B
    expect(names[0].position!.x).toBeLessThan(names[1].position!.x);
  });

  it("hides the legend when toggled off", () => {
    const lens = new RhythmLens();
    lens.init(ctx);
    lens.setMacros({ noteNames: false });
    const scene = lens.update(createTestFrame(1000, {}), null);
    expect(scene.entities.some((e) => e.data?.type === "text-label")).toBe(false);
  });
});
