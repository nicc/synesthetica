/**
 * AudioDetectionTracker — pure kernel that folds repeated model
 * detections into a stable stream of note events, per SPEC 012
 * §"Model window constraint".
 *
 * Basic Pitch's 2-second window means every held note is re-detected
 * on every inference pass (~50 ms hop, 95%+ window overlap). This
 * kernel takes the notes reported in one pass and the current
 * tracked state, and returns the events to emit plus the next state.
 *
 * Externally immutable: the input `TrackingState` is not mutated;
 * a fresh `TrackingState` is returned. Internally the function
 * copies the input Maps and mutates the copies for clarity — that
 * mutation never escapes.
 *
 * The kernel is transport-agnostic. `TrackerEvent` is a plain
 * discriminated union; the worker converts to `WorkerToMain`
 * messages when posting to the main thread.
 *
 * The guarantees this kernel provides (see SPEC 012):
 *   1. One `note_on` and one `note_off` per held note, regardless
 *      of how long it is held.
 *   2. Re-strikes at the same pitch produce a fresh off/on pair
 *      when separated by more than `restrikeGapSamples`.
 *   3. No retroactive markers — `note_on` never emitted with an
 *      onset older than `freshOnsetMaxAgeSamples`.
 *   4. Brief dropouts (gap < `noteOffTimeoutSamples`) don't
 *      fragment a held note.
 */

// ============================================================================
// Types
// ============================================================================

export interface ActiveNote {
  readonly noteId: string;
  readonly pitch: number;
  readonly onsetSampleIndex: number;
  /** Last sample index at which this note was confirmed re-detected. */
  readonly lastSeenSampleIndex: number;
  /** Highest pitch-bend frame index already emitted for this note. */
  readonly lastEmittedBendFrameIdx: number;
}

export interface TrackingState {
  readonly active: ReadonlyMap<string, ActiveNote>;
  readonly activeByPitch: ReadonlyMap<number, string>;
  /** Monotonic counter used to mint unique noteIds. */
  readonly nextNoteSeq: number;
}

export interface TrackingConfig {
  readonly onsetThreshold: number;
  readonly frameThreshold: number;
  readonly restrikeGapSamples: number;
  readonly noteOffTimeoutSamples: number;
  readonly freshOnsetMaxAgeSamples: number;
}

/**
 * One note the model reported in a single inference pass, with all
 * sample indices already resolved to absolute (global) coordinates
 * by the caller.
 */
export interface DetectedNote {
  readonly pitch: number;
  readonly absoluteOnsetSample: number;
  readonly absoluteLastSeenSample: number;
  /** Model's note-strength estimate, mapped to velocity (0..1). */
  readonly amplitude: number;
  /**
   * Pitch-bend samples for this detection, each with an absolute
   * sample index. The kernel emits these once at note-on and never
   * again for the same note; keeping them here lets the caller
   * decide how to precompute timestamps without the kernel knowing
   * about the model's frame hop.
   */
  readonly pitchBends?: readonly PitchBendSample[];
}

export interface PitchBendSample {
  readonly sampleIndex: number;
  readonly semitones: number;
}

export type TrackerEvent =
  | {
      readonly type: "note_on";
      readonly sampleIndex: number;
      readonly noteId: string;
      readonly pitch: number;
      readonly velocity: number;
      readonly confidence: number;
    }
  | {
      readonly type: "note_off";
      readonly sampleIndex: number;
      readonly noteId: string;
      readonly confidence: number;
    }
  | {
      readonly type: "pitch_bend";
      readonly sampleIndex: number;
      readonly noteId: string;
      readonly semitones: number;
      readonly confidence: number;
    };

export interface TrackingResult {
  readonly events: readonly TrackerEvent[];
  readonly next: TrackingState;
}

// ============================================================================
// Construction
// ============================================================================

export function emptyTrackingState(): TrackingState {
  return {
    active: new Map(),
    activeByPitch: new Map(),
    nextNoteSeq: 0,
  };
}

// ============================================================================
// Kernel
// ============================================================================

/**
 * Fold one pass of model detections into note events.
 *
 * @param state    Tracked state from the previous pass. Not mutated.
 * @param detected Notes reported by the model in this pass, with
 *                 absolute sample indices already resolved.
 * @param headAfter Current audio "now" as an absolute sample index.
 *                  Used for freshness / timeout comparisons.
 * @param cfg      Threshold configuration.
 */
export function processDetectedNotes(
  state: TrackingState,
  detected: readonly DetectedNote[],
  headAfter: number,
  cfg: TrackingConfig,
): TrackingResult {
  const events: TrackerEvent[] = [];
  const active = new Map(state.active);
  const activeByPitch = new Map(state.activeByPitch);
  let nextNoteSeq = state.nextNoteSeq;

  for (const note of detected) {
    const { pitch, absoluteOnsetSample, absoluteLastSeenSample, amplitude } =
      note;

    const existingId = activeByPitch.get(pitch);
    let existing = existingId ? active.get(existingId) : undefined;

    // Re-strike classification. A new detection at a tracked pitch is
    // a re-strike only if BOTH its onset sits meaningfully later than
    // the tracked note's onset AND that onset is fresh. See SPEC 012
    // §"Model window constraint" — the freshness gate is what stops
    // the sliding reported-onset of a note held past 2 s from being
    // misread as a re-strike.
    if (existing) {
      const onsetGap = (absoluteOnsetSample - existing.onsetSampleIndex) | 0;
      const onsetAgeSamples = (headAfter - absoluteOnsetSample) >>> 0;
      const isLaterThanTracked = onsetGap > cfg.restrikeGapSamples;
      const isFreshEnough = onsetAgeSamples <= cfg.freshOnsetMaxAgeSamples;
      const isRestrike = isLaterThanTracked && isFreshEnough;

      if (!isRestrike) {
        // Continuation — extend lastSeen (monotonic, so late passes
        // can't regress it).
        if (absoluteLastSeenSample > existing.lastSeenSampleIndex) {
          active.set(existing.noteId, {
            ...existing,
            lastSeenSampleIndex: absoluteLastSeenSample,
          });
        }
        continue;
      }

      // Real re-strike: close the old note at its last-seen position.
      events.push({
        type: "note_off",
        sampleIndex: existing.lastSeenSampleIndex,
        noteId: existing.noteId,
        confidence: 0.7,
      });
      active.delete(existing.noteId);
      activeByPitch.delete(pitch);
      existing = undefined;
      // Fall through to the new-note path below.
    }

    // New note (either first detection at this pitch, or the
    // re-strike branch above). Drop if the onset is too far in the
    // past — the 2-second window returns notes with onsets anywhere
    // in it, and backfilling a note-on with a stale timestamp puts
    // a retroactive marker on the note strip.
    const onsetAgeSamples = (headAfter - absoluteOnsetSample) >>> 0;
    if (onsetAgeSamples > cfg.freshOnsetMaxAgeSamples) {
      continue;
    }

    const newNoteId = `audio-${nextNoteSeq++}`;
    events.push({
      type: "note_on",
      sampleIndex: absoluteOnsetSample,
      noteId: newNoteId,
      pitch,
      velocity: Math.max(0, Math.min(1, amplitude)),
      confidence: cfg.onsetThreshold,
    });

    let lastEmittedBendFrameIdx = -1;
    if (note.pitchBends && note.pitchBends.length > 0) {
      for (let i = 0; i < note.pitchBends.length; i++) {
        const bend = note.pitchBends[i];
        events.push({
          type: "pitch_bend",
          sampleIndex: bend.sampleIndex,
          noteId: newNoteId,
          semitones: bend.semitones,
          confidence: cfg.frameThreshold,
        });
      }
      lastEmittedBendFrameIdx = note.pitchBends.length - 1;
    }

    const newActive: ActiveNote = {
      noteId: newNoteId,
      pitch,
      onsetSampleIndex: absoluteOnsetSample,
      lastSeenSampleIndex: absoluteLastSeenSample,
      lastEmittedBendFrameIdx,
    };
    active.set(newNoteId, newActive);
    activeByPitch.set(pitch, newNoteId);
  }

  // Note-off timeout scan: close any tracked note whose lastSeen
  // is older than the timeout. Handles both real note ends and
  // model dropouts too long to bridge.
  for (const [noteId, note] of active) {
    if (
      ((headAfter - note.lastSeenSampleIndex) >>> 0) > cfg.noteOffTimeoutSamples
    ) {
      events.push({
        type: "note_off",
        sampleIndex: note.lastSeenSampleIndex,
        noteId,
        confidence: 0.7,
      });
      active.delete(noteId);
      activeByPitch.delete(note.pitch);
    }
  }

  return {
    events,
    next: { active, activeByPitch, nextNoteSeq },
  };
}

/**
 * Produce note-off events for every currently-tracked note. Used
 * when the worker stops so downstream stabilizers can wrap up any
 * still-active notes cleanly.
 */
export function flushAllActiveNotes(
  state: TrackingState,
  sampleIndex: number,
): readonly TrackerEvent[] {
  const events: TrackerEvent[] = [];
  for (const note of state.active.values()) {
    events.push({
      type: "note_off",
      sampleIndex,
      noteId: note.noteId,
      confidence: 0.5,
    });
  }
  return events;
}
