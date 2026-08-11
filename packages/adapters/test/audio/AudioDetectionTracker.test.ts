import { describe, it, expect } from "vitest";
import {
  processDetectedNotes,
  flushAllActiveNotes,
  emptyTrackingState,
  type DetectedNote,
  type TrackingConfig,
  type TrackingState,
  type TrackerEvent,
} from "../../src/audio/AudioDetectionTracker";

/**
 * Tests for AudioDetectionTracker — the pure kernel that folds
 * Basic Pitch's per-window detections into note events. The four
 * guarantees under test are the ones SPEC 012 §"Model window
 * constraint" commits to. Each guarantee gets one or more scenarios;
 * boundary and polyphony tests follow.
 *
 * Sample rate is 22050 Hz per the model. All *Samples config values
 * below are derived from ms at that rate.
 */

const SAMPLE_RATE = 22050;
const HOP_SAMPLES = Math.round(SAMPLE_RATE * 0.05); // 50 ms hop
const msToSamples = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000);

const DEFAULT_CFG: TrackingConfig = {
  onsetThreshold: 0.5,
  frameThreshold: 0.2,
  restrikeGapSamples: msToSamples(120),
  noteOffTimeoutSamples: msToSamples(160),
  freshOnsetMaxAgeSamples: msToSamples(300),
};

/** Build a fresh DetectedNote for a pitch at absolute-sample coords. */
function detection(
  pitch: number,
  absoluteOnsetSample: number,
  absoluteLastSeenSample: number,
  opts: { amplitude?: number; bends?: readonly number[] } = {},
): DetectedNote {
  const bends = opts.bends;
  return {
    pitch,
    absoluteOnsetSample,
    absoluteLastSeenSample,
    amplitude: opts.amplitude ?? 0.5,
    pitchBends: bends
      ? bends.map((semitones, i) => ({
          sampleIndex: absoluteOnsetSample + i * 256,
          semitones,
        }))
      : undefined,
  };
}

/** Run one pass of the kernel and return events + next state. */
function step(
  state: TrackingState,
  detected: readonly DetectedNote[],
  headAfter: number,
  cfg: TrackingConfig = DEFAULT_CFG,
) {
  return processDetectedNotes(state, detected, headAfter, cfg);
}

/**
 * Simulate a run of `passes` inference ticks. `getDetected(head)` is
 * called with the current head at each tick to build that pass's
 * detections. Returns aggregated events + final state.
 */
function simulate(
  initial: TrackingState,
  startHead: number,
  passes: number,
  getDetected: (head: number, passIdx: number) => readonly DetectedNote[],
  cfg: TrackingConfig = DEFAULT_CFG,
) {
  let state = initial;
  let head = startHead;
  const allEvents: TrackerEvent[] = [];
  for (let i = 0; i < passes; i++) {
    const detected = getDetected(head, i);
    const { events, next } = step(state, detected, head, cfg);
    state = next;
    allEvents.push(...events);
    head += HOP_SAMPLES;
  }
  return { events: allEvents, state, finalHead: head };
}

// ============================================================================
// Guarantee 1: One note_on / note_off per held note.
// ============================================================================

describe("guarantee 1: one note_on / note_off per held note", () => {
  it("held note across many passes produces one note_on and no interim note_off", () => {
    // A 60-pass hold (~3 s). Pitch 60, onset at sample 0. Each pass's
    // reported onset is the true onset (within-window) — Basic Pitch's
    // window-slide isn't modelled in this test; guarantee 4 covers it.
    const onset = 0;
    const initialHead = HOP_SAMPLES * 2; // some audio buffered
    const { events, state } = simulate(
      emptyTrackingState(),
      initialHead,
      60,
      (head) => [detection(60, onset, head)],
    );

    const noteOns = events.filter((e) => e.type === "note_on");
    const noteOffs = events.filter((e) => e.type === "note_off");
    expect(noteOns).toHaveLength(1);
    expect(noteOns[0]).toMatchObject({ pitch: 60, sampleIndex: onset });
    expect(noteOffs).toHaveLength(0);
    expect(state.active.size).toBe(1);
  });

  it("held note emits exactly one note_off after model stops detecting and timeout elapses", () => {
    const onset = 0;
    const initialHead = HOP_SAMPLES * 2;
    const cfg = DEFAULT_CFG;

    // 20 passes of detection, then N passes of nothing to trigger timeout.
    const held = simulate(emptyTrackingState(), initialHead, 20, (head) => [
      detection(60, onset, head),
    ]);

    // Advance far enough past the last-seen for timeout to fire.
    const timeoutPasses = Math.ceil(cfg.noteOffTimeoutSamples / HOP_SAMPLES) + 2;
    const silent = simulate(held.state, held.finalHead, timeoutPasses, () => []);

    const allEvents = [...held.events, ...silent.events];
    const noteOns = allEvents.filter((e) => e.type === "note_on");
    const noteOffs = allEvents.filter((e) => e.type === "note_off");
    expect(noteOns).toHaveLength(1);
    expect(noteOffs).toHaveLength(1);
    expect(silent.state.active.size).toBe(0);
  });
});

// ============================================================================
// Guarantee 2: Re-strikes at same pitch.
// ============================================================================

describe("guarantee 2: re-strikes produce fresh off/on pairs above restrikeGap", () => {
  it("second onset well above restrikeGap and fresh triggers note_off + note_on", () => {
    const onset1 = 0;
    let head = HOP_SAMPLES * 2;

    // Track pitch 60 at onset 0 for a few passes.
    let state = emptyTrackingState();
    for (let i = 0; i < 5; i++) {
      const r = step(state, [detection(60, onset1, head)], head);
      state = r.next;
      head += HOP_SAMPLES;
    }
    expect(state.active.size).toBe(1);

    // New detection at pitch 60 with a fresh onset well above the gap.
    const onset2 = head - HOP_SAMPLES; // fresh (within one hop of head)
    expect(onset2 - onset1).toBeGreaterThan(DEFAULT_CFG.restrikeGapSamples);
    const { events, next } = step(
      state,
      [detection(60, onset2, head)],
      head,
    );

    // Should see: note_off for original, note_on for restrike.
    const restrikeOff = events.find((e) => e.type === "note_off");
    const restrikeOn = events.find((e) => e.type === "note_on");
    expect(restrikeOff).toBeDefined();
    expect(restrikeOn).toBeDefined();
    expect(restrikeOn!.type === "note_on" && restrikeOn.sampleIndex).toBe(onset2);
    expect(next.active.size).toBe(1);
    // New noteId is distinct from the original.
    const origId = [...state.active.keys()][0];
    const newId = [...next.active.keys()][0];
    expect(newId).not.toBe(origId);
  });

  it("second onset within restrikeGap is treated as continuation (no restrike)", () => {
    const onset1 = 0;
    let head = HOP_SAMPLES * 2;
    let state = emptyTrackingState();
    const r1 = step(state, [detection(60, onset1, head)], head);
    state = r1.next;
    head += HOP_SAMPLES;

    // Onset drifts forward by less than restrikeGap — this is the
    // held-note-jitter case that must be classified as continuation.
    const drift = DEFAULT_CFG.restrikeGapSamples - 1000;
    const onset2 = onset1 + drift;
    const { events, next } = step(state, [detection(60, onset2, head)], head);

    expect(events.filter((e) => e.type === "note_off")).toHaveLength(0);
    expect(events.filter((e) => e.type === "note_on")).toHaveLength(0);
    expect(next.active.size).toBe(1);
    // NoteId preserved.
    expect([...next.active.keys()][0]).toBe([...state.active.keys()][0]);
  });
});

// ============================================================================
// Guarantee 3: No retroactive markers.
// ============================================================================

describe("guarantee 3: stale onsets don't produce note_on", () => {
  it("first-detection with onset older than freshness window is dropped", () => {
    const head = HOP_SAMPLES * 100;
    const staleOnset = head - DEFAULT_CFG.freshOnsetMaxAgeSamples - 1000;
    const { events, next } = step(
      emptyTrackingState(),
      [detection(60, staleOnset, head)],
      head,
    );
    expect(events).toHaveLength(0);
    expect(next.active.size).toBe(0);
  });

  it("restrike branch with stale re-strike onset does not open a new note", () => {
    // Track a note, then feed a detection where the reported onset is
    // both meaningfully-later-than-tracked AND stale. The old note
    // would close, but the new one must NOT open (retroactive marker
    // suppression on the restrike-continuation path).
    const onset1 = 0;
    let head = HOP_SAMPLES * 2;
    let state = emptyTrackingState();
    const r1 = step(state, [detection(60, onset1, head)], head);
    state = r1.next;

    // Advance head far enough that a "later" onset can also be stale.
    head += DEFAULT_CFG.freshOnsetMaxAgeSamples + HOP_SAMPLES * 5;
    const laterButStale = onset1 + DEFAULT_CFG.restrikeGapSamples + 1000;
    expect(head - laterButStale).toBeGreaterThan(DEFAULT_CFG.freshOnsetMaxAgeSamples);
    // Also: within-freshness check requires isFreshEnough — so this
    // isn't classified as a restrike at all. Verify: no events fired.
    const { events, next } = step(
      state,
      [detection(60, laterButStale, head)],
      head,
    );
    expect(events.filter((e) => e.type === "note_off")).toHaveLength(0);
    expect(events.filter((e) => e.type === "note_on")).toHaveLength(0);
    // Note is still tracked (continuation).
    expect(next.active.size).toBe(1);
  });
});

// ============================================================================
// Guarantee 4: Brief dropouts don't fragment.
// ============================================================================

describe("guarantee 4: brief model dropouts don't fragment a held note", () => {
  it("gap shorter than note-off timeout is bridged as continuation", () => {
    const onset = 0;
    const initialHead = HOP_SAMPLES * 2;
    const cfg = DEFAULT_CFG;

    // 10 passes of detection.
    const first = simulate(emptyTrackingState(), initialHead, 10, (head) => [
      detection(60, onset, head),
    ]);
    const origId = [...first.state.active.keys()][0];

    // A dropout shorter than the timeout — model reports nothing for
    // dropoutPasses hops, but total silence duration < noteOffTimeout.
    const maxDropoutPasses = Math.floor(
      cfg.noteOffTimeoutSamples / HOP_SAMPLES,
    );
    const dropoutPasses = Math.max(1, maxDropoutPasses - 1);
    const dropout = simulate(first.state, first.finalHead, dropoutPasses, () => []);
    expect(dropout.state.active.size).toBe(1);

    // Model resumes detecting the same pitch; onset is close to the
    // original (this simulates the model re-latching on the same held
    // note, not a fresh strike).
    const resumeHead = dropout.finalHead;
    const resumeOnset = onset; // tracked note's onset is still visible in window
    const { events, next } = step(
      dropout.state,
      [detection(60, resumeOnset, resumeHead)],
      resumeHead,
      cfg,
    );

    // No note_off during dropout or on resume, no new note_on.
    const allEvents = [...first.events, ...dropout.events, ...events];
    expect(allEvents.filter((e) => e.type === "note_on")).toHaveLength(1);
    expect(allEvents.filter((e) => e.type === "note_off")).toHaveLength(0);
    // Same noteId still tracked.
    expect([...next.active.keys()][0]).toBe(origId);
  });

  it("gap longer than note-off timeout produces a note_off during the silent stretch", () => {
    const onset = 0;
    const initialHead = HOP_SAMPLES * 2;
    const cfg = DEFAULT_CFG;

    const first = simulate(emptyTrackingState(), initialHead, 5, (head) => [
      detection(60, onset, head),
    ]);
    const timeoutPasses = Math.ceil(cfg.noteOffTimeoutSamples / HOP_SAMPLES) + 2;
    const silent = simulate(first.state, first.finalHead, timeoutPasses, () => []);

    const offs = silent.events.filter((e) => e.type === "note_off");
    expect(offs).toHaveLength(1);
  });
});

// ============================================================================
// Boundary conditions on the thresholds.
// ============================================================================

describe("threshold boundaries", () => {
  it("restrikeGap: gap exactly at threshold is continuation, gap+1 is restrike", () => {
    // Time must advance monotonically across passes; head starts small
    // so subsequent heads can move forward past the initial one.
    const onset1 = 0;
    const initialHead = HOP_SAMPLES * 2;
    let state = emptyTrackingState();
    state = step(state, [detection(60, onset1, initialHead)], initialHead).next;

    // Fresh onset exactly at gap → continuation.
    const onsetAtGap = onset1 + DEFAULT_CFG.restrikeGapSamples;
    const freshHead = onsetAtGap + HOP_SAMPLES; // fresh and monotonic
    const atGap = step(state, [detection(60, onsetAtGap, freshHead)], freshHead);
    expect(atGap.events.filter((e) => e.type === "note_on")).toHaveLength(0);
    expect(atGap.events.filter((e) => e.type === "note_off")).toHaveLength(0);

    // Fresh onset at gap + 1 → restrike.
    const onsetPastGap = onset1 + DEFAULT_CFG.restrikeGapSamples + 1;
    const freshHead2 = onsetPastGap + HOP_SAMPLES;
    const pastGap = step(
      atGap.next,
      [detection(60, onsetPastGap, freshHead2)],
      freshHead2,
    );
    expect(pastGap.events.filter((e) => e.type === "note_on")).toHaveLength(1);
    expect(pastGap.events.filter((e) => e.type === "note_off")).toHaveLength(1);
  });

  it("freshness: onset exactly at max age is fresh, one sample older is stale", () => {
    const cfg = DEFAULT_CFG;
    const head = HOP_SAMPLES * 100;

    const onsetAtEdge = head - cfg.freshOnsetMaxAgeSamples;
    const rEdge = step(
      emptyTrackingState(),
      [detection(60, onsetAtEdge, head)],
      head,
      cfg,
    );
    expect(rEdge.events.filter((e) => e.type === "note_on")).toHaveLength(1);

    const onsetJustPast = head - cfg.freshOnsetMaxAgeSamples - 1;
    const rPast = step(
      emptyTrackingState(),
      [detection(61, onsetJustPast, head)],
      head,
      cfg,
    );
    expect(rPast.events.filter((e) => e.type === "note_on")).toHaveLength(0);
  });

  it("noteOffTimeout: at threshold is still tracked, past threshold fires note_off", () => {
    const onset = 0;
    const cfg = DEFAULT_CFG;
    let state = emptyTrackingState();
    const head = HOP_SAMPLES * 2;
    // Establish the note.
    state = step(state, [detection(60, onset, head)], head, cfg).next;
    const noteId = [...state.active.keys()][0];
    const lastSeen = state.active.get(noteId)!.lastSeenSampleIndex;

    // A pass where head - lastSeen === noteOffTimeoutSamples exactly.
    const headAtEdge = lastSeen + cfg.noteOffTimeoutSamples;
    const rEdge = step(state, [], headAtEdge, cfg);
    expect(rEdge.events).toHaveLength(0);
    expect(rEdge.next.active.size).toBe(1);

    // One sample past the threshold.
    const headPast = lastSeen + cfg.noteOffTimeoutSamples + 1;
    const rPast = step(state, [], headPast, cfg);
    expect(rPast.events.filter((e) => e.type === "note_off")).toHaveLength(1);
    expect(rPast.next.active.size).toBe(0);
  });
});

// ============================================================================
// Polyphony and immutability sanity.
// ============================================================================

describe("polyphony", () => {
  it("two pitches tracked independently — one restrikes without affecting the other", () => {
    let head = HOP_SAMPLES * 5;
    let state = emptyTrackingState();
    state = step(
      state,
      [detection(60, 0, head), detection(64, 0, head)],
      head,
    ).next;
    expect(state.active.size).toBe(2);

    // Advance; restrike pitch 60, keep 64 as continuation.
    head += HOP_SAMPLES * 10;
    const onset60New = head - HOP_SAMPLES; // fresh, >restrikeGap later
    const { events, next } = step(
      state,
      [detection(60, onset60New, head), detection(64, 0, head)],
      head,
    );

    // Pitch 60 gets off/on; pitch 64 gets neither.
    const offs = events.filter((e) => e.type === "note_off");
    const ons = events.filter((e) => e.type === "note_on");
    expect(offs).toHaveLength(1);
    expect(ons).toHaveLength(1);
    if (offs[0].type === "note_off" && ons[0].type === "note_on") {
      // Both events refer to pitch 60. Note_off carries no pitch;
      // check via the tracked state before the pass.
      expect(ons[0].pitch).toBe(60);
    }
    expect(next.active.size).toBe(2);
  });
});

describe("immutability", () => {
  it("input state Maps are not mutated by processDetectedNotes", () => {
    const initial = emptyTrackingState();
    const initialActive = initial.active;
    const initialByPitch = initial.activeByPitch;
    const head = HOP_SAMPLES * 2;
    const { next } = step(initial, [detection(60, 0, head)], head);

    // Same references, still empty.
    expect(initialActive).toBe(initial.active);
    expect(initialByPitch).toBe(initial.activeByPitch);
    expect(initial.active.size).toBe(0);
    expect(initial.activeByPitch.size).toBe(0);

    // Next has the new note.
    expect(next.active.size).toBe(1);
    expect(next.activeByPitch.get(60)).toBeDefined();
  });

  it("nextNoteSeq advances per minted note and persists across calls", () => {
    let state = emptyTrackingState();
    let head = HOP_SAMPLES * 2;
    state = step(state, [detection(60, 0, head)], head).next;
    expect(state.nextNoteSeq).toBe(1);
    head += HOP_SAMPLES * 100;
    state = step(state, [detection(64, head - HOP_SAMPLES, head)], head).next;
    expect(state.nextNoteSeq).toBe(2);
    // Distinct ids.
    const ids = [...state.active.keys()];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ============================================================================
// Pitch bends.
// ============================================================================

describe("pitch bends", () => {
  it("emits pitch_bend events at note_on and never re-emits on subsequent passes", () => {
    const cfg = DEFAULT_CFG;
    const onset = 0;
    let head = HOP_SAMPLES * 2;
    let state = emptyTrackingState();

    // First pass: detection with bends → note_on + bends.
    const r1 = step(
      state,
      [detection(60, onset, head, { bends: [0, 0.1, 0.2] })],
      head,
      cfg,
    );
    const bends1 = r1.events.filter((e) => e.type === "pitch_bend");
    expect(bends1).toHaveLength(3);
    state = r1.next;
    head += HOP_SAMPLES;

    // Subsequent pass with bends attached again — must NOT re-emit.
    const r2 = step(
      state,
      [detection(60, onset, head, { bends: [0, 0.1, 0.2, 0.3] })],
      head,
      cfg,
    );
    expect(r2.events.filter((e) => e.type === "pitch_bend")).toHaveLength(0);
  });
});

// ============================================================================
// flushAllActiveNotes.
// ============================================================================

describe("flushAllActiveNotes", () => {
  it("emits a note_off for each tracked note at the given sample index", () => {
    const head = HOP_SAMPLES * 5;
    let state = emptyTrackingState();
    state = step(
      state,
      [detection(60, 0, head), detection(64, 0, head), detection(67, 0, head)],
      head,
    ).next;
    expect(state.active.size).toBe(3);

    const flushAt = head + 1000;
    const events = flushAllActiveNotes(state, flushAt);
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.type).toBe("note_off");
      expect(e.type === "note_off" && e.sampleIndex).toBe(flushAt);
    }
  });

  it("returns no events when no notes are active", () => {
    expect(flushAllActiveNotes(emptyTrackingState(), 12345)).toHaveLength(0);
  });
});
