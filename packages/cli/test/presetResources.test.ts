import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPresetStore } from "../src/presets/presetStore.js";
import { buildPresetResources } from "../src/presets/presetResources.js";
import type { StateSnapshot } from "../src/engine/engineHandle.js";

function fakeSnapshot(): StateSnapshot {
  const macroValues = { "harmony:linger": 5 };
  return {
    instance: "default",
    macros: { intents: { ...macroValues }, effective: { ...macroValues } },
    session: {
      tonic: 0,
      mode: "ionian",
      tempo: 120,
      beatsPerBar: 4,
      beatValue: 4,
      chordMode: "harmonic",
      metronome: false,
    },
    input: "midi:test",
    activePreset: null,
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "presets-res-"));
});

describe("presets:// resource — index", () => {
  it("registers a single index entry with URI presets://", () => {
    const store = createPresetStore(dir);
    const res = buildPresetResources(store);
    expect(res.entries.map((e) => e.uri)).toEqual(["presets://"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("index read returns JSON list of preset summaries", async () => {
    const store = createPresetStore(dir);
    store.save("alpha", fakeSnapshot());
    store.save("beta", fakeSnapshot());
    const res = buildPresetResources(store);
    const text = await res.entries[0].read();
    const parsed = JSON.parse(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("alpha");
    expect(parsed[0].savedAt).toBeTruthy();
    expect(parsed[0].session.tempo).toBe(120);
    rmSync(dir, { recursive: true, force: true });
  });

  it("index read returns [] when store is empty", async () => {
    const store = createPresetStore(dir);
    const res = buildPresetResources(store);
    const text = await res.entries[0].read();
    expect(JSON.parse(text)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("presets://<name> resource — item routing", () => {
  it("matchesItemUri true for presets://name, false for presets:// and other schemes", () => {
    const store = createPresetStore(dir);
    const res = buildPresetResources(store);
    expect(res.matchesItemUri("presets://myname")).toBe(true);
    expect(res.matchesItemUri("presets://")).toBe(false);
    expect(res.matchesItemUri("state://default/current")).toBe(false);
    expect(res.matchesItemUri("presets")).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("readItemUri returns full preset content", async () => {
    const store = createPresetStore(dir);
    store.save("hello", fakeSnapshot());
    const res = buildPresetResources(store);
    const out = await res.readItemUri("presets://hello");
    expect(out.mimeType).toBe("application/json");
    const parsed = JSON.parse(out.text);
    expect(parsed.macros["harmony:linger"]).toBe(5);
    expect(parsed.session.tempo).toBe(120);
    rmSync(dir, { recursive: true, force: true });
  });

  it("readItemUri throws with the available preset list on unknown name", async () => {
    const store = createPresetStore(dir);
    store.save("known", fakeSnapshot());
    const res = buildPresetResources(store);
    await expect(res.readItemUri("presets://unknown")).rejects.toThrow(/Available: known/);
    rmSync(dir, { recursive: true, force: true });
  });
});
