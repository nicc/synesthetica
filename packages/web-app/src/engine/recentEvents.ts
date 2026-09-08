/**
 * Recent-events ring buffer for state://<label>/recent-events.
 *
 * Subscribes to the pipeline's MusicalFrame stream and derives
 * musical events (note-on, note-off, chord-detected, chord-changed)
 * by diffing consecutive frames. Chosen at the MUSICAL layer, not
 * the scene layer, because the LLM reasons about music, not visuals
 * — see synesthetica-lnc for the trade-off analysis.
 *
 * Ring-buffer sized by --recent-events-buffer (CLI, default 1000).
 * Pull-only per SPEC 013 §I30 — the buffer is queried on demand,
 * never pushed to the LLM.
 */

import type { VisualPipeline } from "@synesthetica/engine";
import type { MusicalFrame, Note, EngineRecentEvent as RecentEvent } from "@synesthetica/contracts";

export interface RecentEventsBufferOptions {
  /** Max events to retain — oldest evicted first. */
  capacity: number;
}

export interface RecentEventsBuffer {
  /** Return events with id > since (default: all), most recent first, capped at limit. */
  get(limit: number, since?: number): RecentEvent[];
  /** Drop all buffered events (session teardown). */
  clear(): void;
  /** Total events ever captured — for debugging. */
  countCaptured(): number;
  /** Detach the pipeline subscription. */
  dispose(): void;
}

/**
 * Attach a recent-events buffer to a pipeline. Returns the buffer +
 * unsubscribe callback.
 *
 * `origin` is the wall-clock ms (Date.now()) at session start —
 * needed so absolute timestamps on the wire can be reconstructed
 * from frame.t (session-relative).
 */
export function attachRecentEventsBuffer(
  pipeline: VisualPipeline,
  opts: RecentEventsBufferOptions,
): RecentEventsBuffer {
  const buffer: RecentEvent[] = [];
  let nextId = 0;
  let countCaptured = 0;

  // Diff state — the previous frame's Note objects (keyed by id) and
  // chord ids. We keep whole Notes rather than just ids so we can:
  //   (1) detect the sustain→release phase transition by comparing
  //       prev.release === null vs current.release !== null,
  //   (2) fill in pitch/velocity on the vanish-fallback note-off,
  //       where the note is no longer in the current frame.
  let prevNotes = new Map<string, Note>();
  let prevChordIds = new Set<string>();
  let lastChordId: string | null = null;

  const push = (event: Omit<RecentEvent, "id">): void => {
    const withId: RecentEvent = { ...event, id: nextId++ };
    buffer.push(withId);
    countCaptured++;
    if (buffer.length > opts.capacity) buffer.shift();
  };

  const unsubscribe = pipeline.onMusicalFrame((frame: MusicalFrame) => {
    const currentNotes = new Map(frame.notes.map((n) => [n.id, n]));

    // Note-on: notes present now, absent before. `t` is the raw event
    // onset (MIDI event timestamp), `frameT` is the frame boundary
    // that captured it. See EngineRecentEvent doc for the bitemporal
    // rationale.
    for (const note of frame.notes) {
      if (!prevNotes.has(note.id)) {
        push({
          t: note.onset,
          frameT: frame.t,
          kind: "note-on",
          part: frame.part,
          noteId: note.id,
          // Pitch has {pc, octave}; MIDI = pc + (octave + 1) * 12.
          pitch: note.pitch.pc + (note.pitch.octave + 1) * 12,
          pitchClass: note.pitch.pc,
          octave: note.pitch.octave,
          velocity: note.velocity,
          confidence: note.confidence,
        });
      }
    }

    // Note-off (phase-transition path): a previously-tracked note
    // whose release timestamp has just been set. This is the normal
    // path — NoteTrackingStabilizer sets `release` on the frame after
    // the MIDI note-off arrives, and the note keeps rendering (for
    // its release tail) inside the `activeNotes` map until pruning.
    // Emitting here (not at prune time) means the LLM's note-off
    // timestamp reflects the actual key-up, not the ~10s prune.
    for (const note of frame.notes) {
      const prev = prevNotes.get(note.id);
      if (prev && prev.release === null && note.release !== null) {
        push({
          t: note.release,
          frameT: frame.t,
          kind: "note-off",
          part: frame.part,
          noteId: note.id,
          pitch: note.pitch.pc + (note.pitch.octave + 1) * 12,
          pitchClass: note.pitch.pc,
          octave: note.pitch.octave,
          velocity: note.velocity,
        });
      }
    }

    // Note-off (vanish fallback): a previously-tracked note that
    // vanished from the frame without ever transitioning to release
    // phase. Shouldn't happen in normal operation — belt-and-
    // suspenders for pathological adapter/stabiliser bugs where a
    // note disappears with `release === null`. Uses `frame.t` for
    // both timestamps because we've lost the event clock entirely.
    for (const [prevId, prev] of prevNotes) {
      if (!currentNotes.has(prevId) && prev.release === null) {
        push({
          t: frame.t,
          frameT: frame.t,
          kind: "note-off",
          part: frame.part,
          noteId: prevId,
          pitch: prev.pitch.pc + (prev.pitch.octave + 1) * 12,
          pitchClass: prev.pitch.pc,
          octave: prev.pitch.octave,
          velocity: prev.velocity,
        });
      }
    }

    // Chord-detected: any chord id we haven't seen before is a new
    // detection. Chord-changed: fires when a NEW chord id becomes
    // current AND we previously had a different current chord.
    for (const chord of frame.chords) {
      if (!prevChordIds.has(chord.id)) {
        const kind: RecentEvent["kind"] =
          lastChordId !== null && lastChordId !== chord.id
            ? "chord-changed"
            : "chord-detected";
        push({
          t: chord.onset,
          frameT: frame.t,
          kind,
          part: frame.part,
          chordId: chord.id,
          voicing: chord.voicing.map((p) => p.pc + (p.octave + 1) * 12),
          pitchClasses: chord.voicing.map((p) => p.pc),
          bass: chord.bass,
          harmonic: {
            root: chord.harmonic.root,
            quality: chord.harmonic.quality,
          },
          bassLed: {
            root: chord.bassLed.root,
            quality: chord.bassLed.quality,
          },
          isInverted: chord.isInverted,
          inversion: chord.inversion,
          previousChordId: kind === "chord-changed" ? lastChordId : undefined,
        });
        lastChordId = chord.id;
      }
    }

    prevNotes = currentNotes;
    prevChordIds = new Set(frame.chords.map((c) => c.id));
  });

  return {
    get(limit, since) {
      let slice = buffer;
      if (since !== undefined) slice = slice.filter((e) => e.id > since);
      return slice.slice(-limit);
    },
    clear() {
      buffer.length = 0;
      prevNotes = new Map();
      prevChordIds = new Set();
      lastChordId = null;
    },
    countCaptured() {
      return countCaptured;
    },
    dispose() {
      unsubscribe();
      buffer.length = 0;
    },
  };
}
