import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPresetStore } from "../src/presets/presetStore.js";
import type { StateSnapshot } from "../src/engine/engineHandle.js";

function fakeSnapshot(): StateSnapshot {
  const macroValues = { "harmony:linger": 5, "rhythm:quantise-resolution": "16th" };
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
    input: "midi:test-device",
    activePreset: null,
  };
}

describe("preset store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "synesthetica-preset-test-"));
  });

  it("save then load round-trips content", () => {
    const store = createPresetStore(dir);
    store.save("test-1", fakeSnapshot());
    const loaded = store.load("test-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.macros["harmony:linger"]).toBe(5);
    expect(loaded!.session.tempo).toBe(120);
    expect(loaded!.input).toBe("midi:test-device");
    expect(loaded!.version).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("load returns null for unknown name", () => {
    const store = createPresetStore(dir);
    expect(store.load("nonexistent")).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("list enumerates saved presets in sorted order", () => {
    const store = createPresetStore(dir);
    store.save("charlie", fakeSnapshot());
    store.save("alpha", fakeSnapshot());
    store.save("bravo", fakeSnapshot());
    expect(store.list()).toEqual(["alpha", "bravo", "charlie"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects invalid preset names on save", () => {
    const store = createPresetStore(dir);
    expect(() => store.save("has space", fakeSnapshot())).toThrow();
    expect(() => store.save("../escape", fakeSnapshot())).toThrow();
    expect(() => store.save("a".repeat(65), fakeSnapshot())).toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts alphanumeric + hyphens + underscores", () => {
    const store = createPresetStore(dir);
    expect(() => store.save("jazz_piano-v2", fakeSnapshot())).not.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  it("save overwrites existing preset", () => {
    const store = createPresetStore(dir);
    store.save("x", fakeSnapshot());
    const modified = fakeSnapshot();
    modified.macros.intents["harmony:linger"] = 7;
    store.save("x", modified);
    const loaded = store.load("x");
    expect(loaded!.macros["harmony:linger"]).toBe(7);
    rmSync(dir, { recursive: true, force: true });
  });

  it("listWithMeta returns name + savedAt + session + input per preset", () => {
    const store = createPresetStore(dir);
    store.save("a", fakeSnapshot());
    store.save("b", fakeSnapshot());
    const meta = store.listWithMeta();
    expect(meta).toHaveLength(2);
    expect(meta.map((m) => m.name).sort()).toEqual(["a", "b"]);
    expect(meta[0].savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(meta[0].session.tempo).toBe(120);
    expect(meta[0].input).toBe("midi:test-device");
    rmSync(dir, { recursive: true, force: true });
  });

  it("listWithMeta returns [] when no presets", () => {
    const store = createPresetStore(dir);
    expect(store.listWithMeta()).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});
