import { describe, it, expect } from "vitest";
import { enumerateInputs, inputsToPanelOptions } from "../src/engine/enumerateInputs.js";
import type { WebMidiSource, MidiInputInfo } from "@synesthetica/adapters";

function fakeMidi(inputs: MidiInputInfo[]): WebMidiSource {
  return { getInputs: () => inputs } as unknown as WebMidiSource;
}

describe("enumerateInputs — single source of truth for input discovery", () => {
  it("returns only the audio entry when MIDI source is null", () => {
    const list = enumerateInputs(null);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("audio");
    expect(list[0].sourceString).toBe("audio");
  });

  it("returns MIDI + audio when MIDI source has devices", () => {
    const midi = fakeMidi([
      { id: "port-1", name: "Yamaha P-125", manufacturer: "Yamaha" },
    ]);
    const list = enumerateInputs(midi);
    expect(list).toHaveLength(2);
    expect(list[0].kind).toBe("midi");
    expect(list[0].sourceString).toBe("midi:port-1");
    expect(list[1].kind).toBe("audio");
  });

  it("returns audio-only when MIDI source has zero devices", () => {
    const midi = fakeMidi([]);
    const list = enumerateInputs(midi);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("audio");
  });
});

describe("inputsToPanelOptions — widget option shape", () => {
  it("maps sourceString to value and formats a display label", () => {
    const options = inputsToPanelOptions([
      { kind: "midi", name: "Piano", id: "p", sourceString: "midi:p" },
      { kind: "audio", name: "Default microphone (Basic Pitch)", id: "default", sourceString: "audio" },
    ]);
    expect(options).toEqual([
      { value: "midi:p", label: "MIDI: Piano" },
      { value: "audio", label: "Audio: Default microphone (Basic Pitch)" },
    ]);
  });
});
