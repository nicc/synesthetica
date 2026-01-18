import { describe, it, expect, beforeEach } from "vitest";
import { MidiAdapter } from "../../src/midi/MidiAdapter";
import type { MidiSource, MidiMessage, MidiInputInfo } from "../../src/midi/MidiSource";

/**
 * Mock MIDI source for testing.
 */
class MockMidiSource implements MidiSource {
  private listeners: Array<(msg: MidiMessage) => void> = [];
  private inputs: MidiInputInfo[] = [
    { id: "input-1", name: "Test Keyboard", manufacturer: "Test" },
  ];

  getInputs(): MidiInputInfo[] {
    return this.inputs;
  }

  onMessage(callback: (msg: MidiMessage) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  // Test helper: simulate a MIDI message
  emit(data: [number, number, number], timestamp: number, inputId = "input-1"): void {
    const msg: MidiMessage = {
      data: new Uint8Array(data),
      timestamp,
      inputId,
    };
    for (const listener of this.listeners) {
      listener(msg);
    }
  }

  // Test helper: emit note on
  noteOn(note: number, velocity: number, timestamp: number, channel = 0, inputId = "input-1"): void {
    this.emit([0x90 | channel, note, velocity], timestamp, inputId);
  }

  // Test helper: emit note off
  noteOff(note: number, timestamp: number, channel = 0, inputId = "input-1"): void {
    this.emit([0x80 | channel, note, 0], timestamp, inputId);
  }
}

describe("MidiAdapter", () => {
  let source: MockMidiSource;
  let adapter: MidiAdapter;
  const SESSION_START = 1000; // Arbitrary session start time

  beforeEach(() => {
    source = new MockMidiSource();
    adapter = new MidiAdapter(source, { sessionStart: SESSION_START });
    adapter.start();
  });

  describe("basic functionality", () => {
    it("returns null when no events", () => {
      expect(adapter.nextFrame()).toBeNull();
    });

    it("converts note_on to NoteOn event", () => {
      source.noteOn(60, 100, SESSION_START + 500); // Middle C, velocity 100, at 500ms

      const frame = adapter.nextFrame();

      expect(frame).not.toBeNull();
      expect(frame!.events).toHaveLength(1);

      const event = frame!.events[0];
      expect(event.type).toBe("note_on");
      if (event.type === "note_on") {
        expect(event.note).toBe(60);
        expect(event.velocity).toBe(100);
        expect(event.t).toBe(500); // Relative to session start
        expect(event.pc).toBe(0); // C = 0
        expect(event.octave).toBe(4); // Middle C is C4
      }
    });

    it("converts note_off to NoteOff event", () => {
      source.noteOn(60, 100, SESSION_START + 500);
      source.noteOff(60, SESSION_START + 1000);

      const frame = adapter.nextFrame();

      expect(frame!.events).toHaveLength(2);
      expect(frame!.events[0].type).toBe("note_on");
      expect(frame!.events[1].type).toBe("note_off");

      const noteOff = frame!.events[1];
      if (noteOff.type === "note_off") {
        expect(noteOff.note).toBe(60);
        expect(noteOff.t).toBe(1000);
      }
    });

    it("treats note_on with velocity 0 as note_off", () => {
      source.noteOn(60, 100, SESSION_START + 500);
      source.emit([0x90, 60, 0], SESSION_START + 1000); // Note on with velocity 0

      const frame = adapter.nextFrame();

      expect(frame!.events).toHaveLength(2);
      expect(frame!.events[1].type).toBe("note_off");
    });

    it("drains events on nextFrame", () => {
      source.noteOn(60, 100, SESSION_START + 500);

      expect(adapter.nextFrame()).not.toBeNull();
      expect(adapter.nextFrame()).toBeNull(); // Should be empty now
    });
  });

  describe("pitch class calculation", () => {
    it("calculates pitch class correctly for all notes", () => {
      const testCases = [
        { note: 60, expectedPc: 0 },  // C
        { note: 61, expectedPc: 1 },  // C#
        { note: 62, expectedPc: 2 },  // D
        { note: 69, expectedPc: 9 },  // A
        { note: 72, expectedPc: 0 },  // C (octave up)
      ];

      for (const { note, expectedPc } of testCases) {
        adapter.reset();
        source.noteOn(note, 100, SESSION_START + 100);

        const frame = adapter.nextFrame();
        const event = frame!.events[0];
        if (event.type === "note_on") {
          expect(event.pc).toBe(expectedPc);
        }
      }
    });
  });

  describe("octave calculation", () => {
    it("calculates octave correctly", () => {
      const testCases = [
        { note: 0, expectedOctave: -1 },   // C-1
        { note: 12, expectedOctave: 0 },   // C0
        { note: 24, expectedOctave: 1 },   // C1
        { note: 60, expectedOctave: 4 },   // C4 (middle C)
        { note: 127, expectedOctave: 9 },  // G9
      ];

      for (const { note, expectedOctave } of testCases) {
        adapter.reset();
        source.noteOn(note, 100, SESSION_START + 100);

        const frame = adapter.nextFrame();
        const event = frame!.events[0];
        if (event.type === "note_on") {
          expect(event.octave).toBe(expectedOctave);
        }
      }
    });
  });

  describe("active notes tracking", () => {
    it("tracks active notes", () => {
      source.noteOn(60, 100, SESSION_START + 500);
      adapter.nextFrame(); // Consume the event

      expect(adapter.getActiveNotes().size).toBe(1);
    });

    it("removes notes on note_off", () => {
      source.noteOn(60, 100, SESSION_START + 500);
      source.noteOff(60, SESSION_START + 1000);
      adapter.nextFrame();

      expect(adapter.getActiveNotes().size).toBe(0);
    });

    it("tracks multiple simultaneous notes", () => {
      source.noteOn(60, 100, SESSION_START + 500);
      source.noteOn(64, 100, SESSION_START + 500);
      source.noteOn(67, 100, SESSION_START + 500);
      adapter.nextFrame();

      expect(adapter.getActiveNotes().size).toBe(3);
    });
  });

  describe("part strategy", () => {
    it("uses input-based partId by default", () => {
      source.noteOn(60, 100, SESSION_START + 500, 0, "keyboard-1");

      const frame = adapter.nextFrame();
      const event = frame!.events[0];
      expect(event.part).toBe("midi-keyboard-1");
    });

    it("uses channel-based partId when configured", () => {
      adapter = new MidiAdapter(source, {
        sessionStart: SESSION_START,
        partStrategy: "channel",
      });
      adapter.start();

      source.noteOn(60, 100, SESSION_START + 500, 5); // Channel 5 (0-indexed)

      const frame = adapter.nextFrame();
      const event = frame!.events[0];
      expect(event.part).toBe("midi-ch6"); // 1-indexed for display
    });

    it("uses single partId when configured", () => {
      adapter = new MidiAdapter(source, {
        sessionStart: SESSION_START,
        partStrategy: "single",
        singlePartId: "my-keyboard",
      });
      adapter.start();

      source.noteOn(60, 100, SESSION_START + 500);

      const frame = adapter.nextFrame();
      const event = frame!.events[0];
      expect(event.part).toBe("my-keyboard");
    });
  });

  describe("provenance", () => {
    it("includes provenance on events", () => {
      source.noteOn(60, 100, SESSION_START + 500);

      const frame = adapter.nextFrame();
      const event = frame!.events[0];

      expect(event.provenance).toEqual({
        source: "midi",
        stream: "web-midi",
        version: "0.1.0",
      });
    });
  });

  describe("lifecycle", () => {
    it("does not receive events before start", () => {
      const freshAdapter = new MidiAdapter(source, { sessionStart: SESSION_START });
      // Don't call start()

      source.noteOn(60, 100, SESSION_START + 500);

      expect(freshAdapter.nextFrame()).toBeNull();
    });

    it("does not receive events after stop", () => {
      adapter.stop();
      source.noteOn(60, 100, SESSION_START + 500);

      expect(adapter.nextFrame()).toBeNull();
    });

    it("can restart after stop", () => {
      adapter.stop();
      adapter.start();

      source.noteOn(60, 100, SESSION_START + 500);

      expect(adapter.nextFrame()).not.toBeNull();
    });
  });

  describe("reset", () => {
    it("clears pending events", () => {
      source.noteOn(60, 100, SESSION_START + 500);
      adapter.reset();

      expect(adapter.nextFrame()).toBeNull();
    });

    it("clears active notes", () => {
      source.noteOn(60, 100, SESSION_START + 500);
      adapter.nextFrame();
      adapter.reset();

      expect(adapter.getActiveNotes().size).toBe(0);
    });
  });
});
