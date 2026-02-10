import { describe, it, expect, beforeEach } from "vitest";
import { NoteTrackingStabilizer } from "../../src/stabilizers/NoteTrackingStabilizer";
import type { RawInputFrame, MidiNoteOn, MidiNoteOff } from "@synesthetica/contracts";

function makeFrame(t: number, inputs: (MidiNoteOn | MidiNoteOff)[]): RawInputFrame {
  return {
    t,
    source: "midi",
    stream: "test",
    inputs,
  };
}

function noteOn(note: number, velocity: number, t: number, channel = 0): MidiNoteOn {
  return { type: "midi_note_on", note, velocity, t, channel };
}

function noteOff(note: number, t: number, channel = 0): MidiNoteOff {
  return { type: "midi_note_off", note, t, channel };
}

describe("NoteTrackingStabilizer", () => {
  let stabilizer: NoteTrackingStabilizer;

  beforeEach(() => {
    stabilizer = new NoteTrackingStabilizer({
      partId: "test-part",
      attackDurationMs: 50,
      releaseWindowMs: 500,
    });
    stabilizer.init();
  });

  describe("basic note tracking", () => {
    it("returns empty notes for empty input", () => {
      const frame = makeFrame(0, []);
      const result = stabilizer.apply(frame, null);

      expect(result.notes).toHaveLength(0);
      expect(result.part).toBe("test-part");
    });

    it("creates a note from note_on", () => {
      const frame = makeFrame(100, [noteOn(60, 100, 100)]);
      const result = stabilizer.apply(frame, null);

      expect(result.notes).toHaveLength(1);
      const note = result.notes[0];
      expect(note.pitch.pc).toBe(0); // C
      expect(note.pitch.octave).toBe(4); // C4
      expect(note.velocity).toBe(100);
      expect(note.onset).toBe(100);
      expect(note.phase).toBe("attack");
    });

    it("calculates duration correctly", () => {
      // First frame: note on at t=100
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);

      // Second frame: t=200 (100ms later)
      const result = stabilizer.apply(makeFrame(200, []), null);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].duration).toBe(100);
    });

    it("freezes duration at release time", () => {
      // Note on at t=100
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);

      // Note off at t=500 (duration should freeze at 400)
      stabilizer.apply(makeFrame(500, [noteOff(60, 500)]), null);

      // Later frame at t=800 - duration should still be 400, not 700
      const result = stabilizer.apply(makeFrame(800, []), null);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].duration).toBe(400);
      expect(result.notes[0].release).toBe(500);
    });

    it("tracks release time on note_off", () => {
      // Note on
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);

      // Note off
      const result = stabilizer.apply(makeFrame(500, [noteOff(60, 500)]), null);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].release).toBe(500);
      expect(result.notes[0].phase).toBe("release");
    });
  });

  describe("note phases", () => {
    it("starts in attack phase", () => {
      const frame = makeFrame(100, [noteOn(60, 100, 100)]);
      const result = stabilizer.apply(frame, null);

      expect(result.notes[0].phase).toBe("attack");
    });

    it("transitions to sustain after attack duration", () => {
      // Note on at t=100, attack duration is 50ms
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);

      // At t=160, should be in sustain (60ms > 50ms attack)
      const result = stabilizer.apply(makeFrame(160, []), null);

      expect(result.notes[0].phase).toBe("sustain");
    });

    it("transitions to release on note_off", () => {
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);
      const result = stabilizer.apply(makeFrame(500, [noteOff(60, 500)]), null);

      expect(result.notes[0].phase).toBe("release");
    });
  });

  describe("note expiration", () => {
    it("keeps notes during release window", () => {
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);
      stabilizer.apply(makeFrame(500, [noteOff(60, 500)]), null);

      // 400ms after release, still within 500ms window
      const result = stabilizer.apply(makeFrame(900, []), null);

      expect(result.notes).toHaveLength(1);
    });

    it("removes notes after release window expires", () => {
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);
      stabilizer.apply(makeFrame(500, [noteOff(60, 500)]), null);

      // 600ms after release, beyond 500ms window
      const result = stabilizer.apply(makeFrame(1100, []), null);

      expect(result.notes).toHaveLength(0);
    });
  });

  describe("multiple notes", () => {
    it("tracks multiple simultaneous notes", () => {
      const frame = makeFrame(100, [
        noteOn(60, 100, 100), // C4
        noteOn(64, 90, 100),  // E4
        noteOn(67, 80, 100),  // G4
      ]);
      const result = stabilizer.apply(frame, null);

      expect(result.notes).toHaveLength(3);
      expect(result.notes.map(n => n.pitch.pc).sort()).toEqual([0, 4, 7]);
    });

    it("releases notes independently", () => {
      // Three notes on
      stabilizer.apply(makeFrame(100, [
        noteOn(60, 100, 100),
        noteOn(64, 90, 100),
        noteOn(67, 80, 100),
      ]), null);

      // One note off
      stabilizer.apply(makeFrame(500, [noteOff(64, 500)]), null);

      const result = stabilizer.apply(makeFrame(600, []), null);

      expect(result.notes).toHaveLength(3);
      const released = result.notes.find(n => n.pitch.pc === 4);
      const sustained = result.notes.filter(n => n.pitch.pc !== 4);

      expect(released?.phase).toBe("release");
      expect(sustained.every(n => n.phase === "sustain")).toBe(true);
    });
  });

  describe("note re-triggering", () => {
    it("handles re-triggering same note without note_off", () => {
      // First C4
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);

      // Re-trigger C4 without note_off
      const result = stabilizer.apply(makeFrame(200, [noteOn(60, 80, 200)]), null);

      // Should have 2 notes: one in release, one in attack
      expect(result.notes).toHaveLength(2);
      const phases = result.notes.map(n => n.phase).sort();
      expect(phases).toEqual(["attack", "release"]);
    });

    it("preserves original releaseTime when replaying a released note", () => {
      // Play C4 at t=100
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);

      // Release C4 at t=300 (duration freezes at 200)
      stabilizer.apply(makeFrame(300, [noteOff(60, 300)]), null);

      // Play C4 again at t=500 — old note still in system (within 500ms window)
      stabilizer.apply(makeFrame(500, [noteOn(60, 90, 500)]), null);

      // At t=550: both notes exist (old note 250ms since release, within 500ms window)
      const result = stabilizer.apply(makeFrame(550, []), null);

      expect(result.notes).toHaveLength(2);

      // Old note: duration should still be 200 (releaseTime=300, not overwritten to 500)
      const oldNote = result.notes.find(n => n.onset === 100);
      expect(oldNote).toBeDefined();
      expect(oldNote!.duration).toBe(200);
      expect(oldNote!.release).toBe(300);

      // New note: actively playing
      const newNote = result.notes.find(n => n.onset === 500);
      expect(newNote).toBeDefined();
      expect(newNote!.duration).toBe(50);
      expect(newNote!.phase).toBe("sustain");
    });
  });

  describe("pitch class calculation", () => {
    it("calculates pitch class correctly", () => {
      const testCases = [
        { note: 60, expectedPc: 0 },  // C
        { note: 61, expectedPc: 1 },  // C#
        { note: 62, expectedPc: 2 },  // D
        { note: 69, expectedPc: 9 },  // A
        { note: 72, expectedPc: 0 },  // C (octave up)
      ];

      for (const { note, expectedPc } of testCases) {
        stabilizer.reset();
        const result = stabilizer.apply(makeFrame(100, [noteOn(note, 100, 100)]), null);
        expect(result.notes[0].pitch.pc).toBe(expectedPc);
      }
    });
  });

  describe("octave calculation", () => {
    it("calculates octave correctly", () => {
      const testCases = [
        { note: 0, expectedOctave: -1 },
        { note: 12, expectedOctave: 0 },
        { note: 24, expectedOctave: 1 },
        { note: 60, expectedOctave: 4 },  // Middle C
        { note: 127, expectedOctave: 9 },
      ];

      for (const { note, expectedOctave } of testCases) {
        stabilizer.reset();
        const result = stabilizer.apply(makeFrame(100, [noteOn(note, 100, 100)]), null);
        expect(result.notes[0].pitch.octave).toBe(expectedOctave);
      }
    });
  });

  describe("dynamics", () => {
    it("calculates dynamics level from velocity", () => {
      const result = stabilizer.apply(makeFrame(100, [noteOn(60, 127, 100)]), null);
      expect(result.dynamics.level).toBeCloseTo(1.0, 1);
    });

    it("returns 0 dynamics when no notes", () => {
      const result = stabilizer.apply(makeFrame(100, []), null);
      expect(result.dynamics.level).toBe(0);
    });

    it("averages velocity for multiple notes", () => {
      const result = stabilizer.apply(makeFrame(100, [
        noteOn(60, 100, 100),
        noteOn(64, 50, 100),
      ]), null);

      // Average velocity 75, normalized: 75/127 ≈ 0.59
      expect(result.dynamics.level).toBeCloseTo(0.59, 1);
    });

    it("attenuates dynamics for release-only notes", () => {
      stabilizer.apply(makeFrame(100, [noteOn(60, 127, 100)]), null);
      stabilizer.apply(makeFrame(200, [noteOff(60, 200)]), null);

      const result = stabilizer.apply(makeFrame(300, []), null);

      // Should be attenuated (max * 0.3)
      expect(result.dynamics.level).toBeCloseTo(0.3, 1);
    });
  });

  describe("note ID generation", () => {
    it("generates deterministic note IDs", () => {
      const result = stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);

      // ID format: "{partId}:{onset}:{noteName}"
      expect(result.notes[0].id).toBe("test-part:100:C4");
    });

    it("generates unique IDs for different notes", () => {
      const result = stabilizer.apply(makeFrame(100, [
        noteOn(60, 100, 100),
        noteOn(64, 90, 100),
      ]), null);

      const ids = result.notes.map(n => n.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe("lifecycle", () => {
    it("clears state on reset", () => {
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);
      stabilizer.reset();

      const result = stabilizer.apply(makeFrame(200, []), null);
      expect(result.notes).toHaveLength(0);
    });

    it("clears state on dispose", () => {
      stabilizer.apply(makeFrame(100, [noteOn(60, 100, 100)]), null);
      stabilizer.dispose();

      // Re-init
      stabilizer.init();
      const result = stabilizer.apply(makeFrame(200, []), null);
      expect(result.notes).toHaveLength(0);
    });
  });

  describe("channel handling", () => {
    it("tracks notes on different channels independently", () => {
      const result = stabilizer.apply(makeFrame(100, [
        noteOn(60, 100, 100, 0),  // C4 on channel 0
        noteOn(60, 80, 100, 1),   // C4 on channel 1
      ]), null);

      expect(result.notes).toHaveLength(2);
    });

    it("releases correct note by channel", () => {
      stabilizer.apply(makeFrame(100, [
        noteOn(60, 100, 100, 0),
        noteOn(60, 80, 100, 1),
      ]), null);

      // Release only channel 0
      const result = stabilizer.apply(makeFrame(500, [noteOff(60, 500, 0)]), null);

      const ch0Note = result.notes.find(n => n.velocity === 100);
      const ch1Note = result.notes.find(n => n.velocity === 80);

      expect(ch0Note?.phase).toBe("release");
      expect(ch1Note?.phase).toBe("sustain");
    });
  });
});
