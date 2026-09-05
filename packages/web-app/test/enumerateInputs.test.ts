// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enumerateInputs,
  enumerateInputsSync,
  inputsToPanelOptions,
} from "../src/engine/enumerateInputs.js";
import type { WebMidiSource, MidiInputInfo } from "@synesthetica/adapters";

function fakeMidi(inputs: MidiInputInfo[]): WebMidiSource {
  return { getInputs: () => inputs } as unknown as WebMidiSource;
}

// Stub navigator.mediaDevices.enumerateDevices with a controllable
// device list. Reset per-test so each test provides its own scenario.
function stubMediaDevices(
  devices: Array<{ kind: string; deviceId: string; label: string }>,
): void {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: vi.fn(async () => devices),
    },
  });
}

beforeEach(() => {
  // Default: no audio devices detected.
  stubMediaDevices([]);
});

describe("enumerateInputsSync — MIDI + default-audio fallback (no getUserMedia)", () => {
  it("returns only default-audio entry when MIDI source is null", () => {
    const list = enumerateInputsSync(null);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("audio");
    expect(list[0].sourceString).toBe("audio");
  });

  it("returns MIDI + default-audio entry when MIDI source has devices", () => {
    const midi = fakeMidi([
      { id: "port-1", name: "Yamaha P-125", manufacturer: "Yamaha" },
    ]);
    const list = enumerateInputsSync(midi);
    expect(list).toHaveLength(2);
    expect(list[0].kind).toBe("midi");
    expect(list[0].sourceString).toBe("midi:port-1");
    expect(list[1].kind).toBe("audio");
    expect(list[1].sourceString).toBe("audio");
  });
});

describe("enumerateInputs — async MIDI + audio enumeration", () => {
  it("returns default-audio entry when no audio devices detected", async () => {
    const list = await enumerateInputs(null);
    expect(list).toHaveLength(1);
    expect(list[0].sourceString).toBe("audio");
  });

  it("returns default + per-device entries when audio devices are present", async () => {
    stubMediaDevices([
      { kind: "audioinput", deviceId: "mic-1", label: "Built-in Mic" },
      { kind: "audioinput", deviceId: "iface-2", label: "Focusrite 2i2" },
      { kind: "audiooutput", deviceId: "spk-1", label: "Speakers" }, // filtered
    ]);
    const list = await enumerateInputs(null);
    expect(list.map((i) => i.sourceString)).toEqual([
      "audio",
      "audio:mic-1",
      "audio:iface-2",
    ]);
    expect(list[1].name).toBe("Built-in Mic");
    expect(list[2].name).toBe("Focusrite 2i2");
  });

  it("uses placeholder labels when device labels are empty (pre-permission)", async () => {
    stubMediaDevices([
      { kind: "audioinput", deviceId: "mic-a", label: "" },
      { kind: "audioinput", deviceId: "mic-b", label: "" },
    ]);
    const list = await enumerateInputs(null);
    // Default entry + two placeholder entries.
    expect(list).toHaveLength(3);
    expect(list[1].name).toBe("Audio input 1");
    expect(list[2].name).toBe("Audio input 2");
  });

  it("filters the browser's own 'default' pseudo-device and empty deviceIds", async () => {
    stubMediaDevices([
      { kind: "audioinput", deviceId: "default", label: "Default input" },
      { kind: "audioinput", deviceId: "", label: "" },
      { kind: "audioinput", deviceId: "real-mic", label: "Real Mic" },
    ]);
    const list = await enumerateInputs(null);
    // Our own default entry + the real mic only.
    expect(list.map((i) => i.id)).toEqual(["default", "real-mic"]);
  });

  it("merges MIDI + audio", async () => {
    const midi = fakeMidi([
      { id: "port-1", name: "Piano", manufacturer: "Yamaha" },
    ]);
    stubMediaDevices([
      { kind: "audioinput", deviceId: "mic-a", label: "Mic A" },
    ]);
    const list = await enumerateInputs(midi);
    expect(list.map((i) => i.kind)).toEqual(["midi", "audio", "audio"]);
  });

  it("degrades gracefully when enumerateDevices throws", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn(async () => {
          throw new Error("blocked by policy");
        }),
      },
    });
    const list = await enumerateInputs(null);
    // Still returns the default entry.
    expect(list).toHaveLength(1);
    expect(list[0].sourceString).toBe("audio");
  });
});

describe("inputsToPanelOptions — widget option shape", () => {
  it("maps sourceString to value and formats a display label", () => {
    const options = inputsToPanelOptions([
      { kind: "midi", name: "Piano", id: "p", sourceString: "midi:p" },
      { kind: "audio", name: "Default microphone", id: "default", sourceString: "audio" },
      { kind: "audio", name: "Focusrite 2i2", id: "iface-2", sourceString: "audio:iface-2" },
    ]);
    expect(options).toEqual([
      { value: "midi:p", label: "MIDI: Piano" },
      { value: "audio", label: "Audio: Default microphone" },
      { value: "audio:iface-2", label: "Audio: Focusrite 2i2" },
    ]);
  });
});
