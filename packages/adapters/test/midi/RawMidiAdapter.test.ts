import { describe, it, expect, beforeEach } from "vitest";
import { RawMidiAdapter } from "../../src/midi/RawMidiAdapter";
import type {
  MidiSource,
  MidiMessage,
  MidiInputInfo,
} from "../../src/midi/MidiSource";

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

  emit(
    data: [number, number, number],
    timestamp: number,
    inputId = "input-1"
  ): void {
    const msg: MidiMessage = {
      data: new Uint8Array(data),
      timestamp,
      inputId,
    };
    for (const listener of this.listeners) {
      listener(msg);
    }
  }

  noteOn(
    note: number,
    velocity: number,
    timestamp: number,
    channel = 0,
    inputId = "input-1"
  ): void {
    this.emit([0x90 | channel, note, velocity], timestamp, inputId);
  }

  noteOff(
    note: number,
    timestamp: number,
    channel = 0,
    inputId = "input-1"
  ): void {
    this.emit([0x80 | channel, note, 0], timestamp, inputId);
  }

  cc(
    controller: number,
    value: number,
    timestamp: number,
    channel = 0,
    inputId = "input-1"
  ): void {
    this.emit([0xb0 | channel, controller, value], timestamp, inputId);
  }
}

describe("RawMidiAdapter", () => {
  let source: MockMidiSource;
  let adapter: RawMidiAdapter;
  const SESSION_START = 1000;

  beforeEach(() => {
    source = new MockMidiSource();
    adapter = new RawMidiAdapter(source, { sessionStart: SESSION_START });
    adapter.start();
  });

  describe("basic functionality", () => {
    it("returns null when no events", () => {
      expect(adapter.nextFrame()).toBeNull();
    });

    it("converts note_on to MidiNoteOn", () => {
      source.noteOn(60, 100, SESSION_START + 500, 3);

      const frame = adapter.nextFrame();

      expect(frame).not.toBeNull();
      expect(frame!.inputs).toHaveLength(1);

      const input = frame!.inputs[0];
      expect(input.type).toBe("midi_note_on");
      if (input.type === "midi_note_on") {
        expect(input.note).toBe(60);
        expect(input.velocity).toBe(100);
        expect(input.t).toBe(500);
        expect(input.channel).toBe(3);
      }
    });

    it("converts note_off to MidiNoteOff", () => {
      source.noteOff(60, SESSION_START + 500, 2);

      const frame = adapter.nextFrame();

      expect(frame!.inputs).toHaveLength(1);

      const input = frame!.inputs[0];
      expect(input.type).toBe("midi_note_off");
      if (input.type === "midi_note_off") {
        expect(input.note).toBe(60);
        expect(input.t).toBe(500);
        expect(input.channel).toBe(2);
      }
    });

    it("treats note_on with velocity 0 as note_off", () => {
      source.emit([0x90, 60, 0], SESSION_START + 500);

      const frame = adapter.nextFrame();

      expect(frame!.inputs).toHaveLength(1);
      expect(frame!.inputs[0].type).toBe("midi_note_off");
    });

    it("converts CC to MidiCC", () => {
      source.cc(64, 127, SESSION_START + 500, 1); // Sustain pedal on channel 1

      const frame = adapter.nextFrame();

      expect(frame!.inputs).toHaveLength(1);

      const input = frame!.inputs[0];
      expect(input.type).toBe("midi_cc");
      if (input.type === "midi_cc") {
        expect(input.controller).toBe(64);
        expect(input.value).toBe(127);
        expect(input.t).toBe(500);
        expect(input.channel).toBe(1);
      }
    });

    it("drains events on nextFrame", () => {
      source.noteOn(60, 100, SESSION_START + 500);

      expect(adapter.nextFrame()).not.toBeNull();
      expect(adapter.nextFrame()).toBeNull();
    });

    it("accumulates multiple events", () => {
      source.noteOn(60, 100, SESSION_START + 500);
      source.noteOn(64, 90, SESSION_START + 510);
      source.noteOff(60, SESSION_START + 1000);

      const frame = adapter.nextFrame();

      expect(frame!.inputs).toHaveLength(3);
      expect(frame!.inputs[0].type).toBe("midi_note_on");
      expect(frame!.inputs[1].type).toBe("midi_note_on");
      expect(frame!.inputs[2].type).toBe("midi_note_off");
    });
  });

  describe("frame metadata", () => {
    it("includes source and stream identifiers", () => {
      source.noteOn(60, 100, SESSION_START + 500);

      const frame = adapter.nextFrame();

      expect(frame!.source).toBe("midi");
      expect(frame!.stream).toBe("web-midi");
    });

    it("uses custom source and stream when configured", () => {
      adapter = new RawMidiAdapter(source, {
        sessionStart: SESSION_START,
        sourceId: "custom-midi",
        streamId: "usb-keyboard",
      });
      adapter.start();

      source.noteOn(60, 100, SESSION_START + 500);

      const frame = adapter.nextFrame();

      expect(frame!.source).toBe("custom-midi");
      expect(frame!.stream).toBe("usb-keyboard");
    });

    it("uses timestamp of last input for frame time", () => {
      source.noteOn(60, 100, SESSION_START + 500);
      source.noteOn(64, 90, SESSION_START + 750);

      const frame = adapter.nextFrame();

      expect(frame!.t).toBe(750);
    });
  });

  describe("no musical interpretation", () => {
    it("does not include pitch class or octave", () => {
      source.noteOn(60, 100, SESSION_START + 500);

      const frame = adapter.nextFrame();
      const input = frame!.inputs[0];

      // RawInput should not have musical fields
      expect(input).not.toHaveProperty("pc");
      expect(input).not.toHaveProperty("octave");
      expect(input).not.toHaveProperty("part");
    });

    it("does not include provenance on individual events", () => {
      source.noteOn(60, 100, SESSION_START + 500);

      const frame = adapter.nextFrame();
      const input = frame!.inputs[0];

      expect(input).not.toHaveProperty("provenance");
    });
  });

  describe("lifecycle", () => {
    it("does not receive events before start", () => {
      const freshAdapter = new RawMidiAdapter(source, {
        sessionStart: SESSION_START,
      });

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
  });
});
