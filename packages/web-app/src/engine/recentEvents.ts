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
import type { MusicalFrame, EngineRecentEvent as RecentEvent } from "@synesthetica/contracts";

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

  // Diff state — the previous frame's note ids + chord ids. Diff on
  // each new frame to derive events.
  let prevNoteIds = new Set<string>();
  let prevChordIds = new Set<string>();
  let lastChordId: string | null = null;

  const push = (event: Omit<RecentEvent, "id">): void => {
    const withId: RecentEvent = { ...event, id: nextId++ };
    buffer.push(withId);
    countCaptured++;
    if (buffer.length > opts.capacity) buffer.shift();
  };

  const unsubscribe = pipeline.onMusicalFrame((frame: MusicalFrame) => {
    const currentNoteIds = new Set(frame.notes.map((n) => n.id));

    // Note-on: notes present now, absent before.
    for (const note of frame.notes) {
      if (!prevNoteIds.has(note.id)) {
        push({
          t: frame.t,
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

    // Note-off: notes present before, absent now (or transitioned
    // into 'release' phase — the sustain→release transition marks
    // the actual key release).
    for (const prevId of prevNoteIds) {
      if (!currentNoteIds.has(prevId)) {
        // Note vanished — release completed / cleaned up. Best-effort
        // note-off; we don't have the original pitch handy at this
        // instant (frame no longer carries it).
        push({
          t: frame.t,
          kind: "note-off",
          part: frame.part,
          noteId: prevId,
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

    prevNoteIds = currentNoteIds;
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
      prevNoteIds = new Set();
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
