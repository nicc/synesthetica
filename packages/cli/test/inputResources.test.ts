import { describe, it, expect } from "vitest";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";
import { buildInputResources } from "../src/inputs/inputResources.js";

describe("inputs:// resource", () => {
  it("registers a single URI: inputs://", () => {
    const engine = new StubEngineHandle();
    const entries = buildInputResources(engine);
    expect(entries).toHaveLength(1);
    expect(entries[0].uri).toBe("inputs://");
    expect(entries[0].subscribable).toBe(false);
  });

  it("returns [] when no inputs are seeded", async () => {
    const engine = new StubEngineHandle();
    const [entry] = buildInputResources(engine);
    const parsed = JSON.parse(await entry.read());
    expect(parsed).toEqual([]);
  });

  it("returns the seeded list as JSON with sourceStrings intact", async () => {
    const engine = new StubEngineHandle();
    engine.setAvailableInputs([
      {
        kind: "midi",
        name: "Yamaha P-125",
        id: "midi-port-1",
        sourceString: "midi:midi-port-1",
      },
      {
        kind: "audio",
        name: "Default microphone (Basic Pitch)",
        id: "default",
        sourceString: "audio",
      },
    ]);
    const [entry] = buildInputResources(engine);
    const parsed = JSON.parse(await entry.read());
    expect(parsed).toHaveLength(2);
    expect(parsed[0].kind).toBe("midi");
    expect(parsed[0].sourceString).toBe("midi:midi-port-1");
    expect(parsed[1].kind).toBe("audio");
    expect(parsed[1].sourceString).toBe("audio");
  });
});
