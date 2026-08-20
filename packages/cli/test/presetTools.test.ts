import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPresetStore } from "../src/presets/presetStore.js";
import { buildPresetTools } from "../src/tools/presetTools.js";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "synesthetica-preset-tools-test-"));
});

function cleanup(): void {
  rmSync(dir, { recursive: true, force: true });
}

describe("save_preset", () => {
  it("captures current engine state to the store", async () => {
    const store = createPresetStore(dir);
    const [, save] = buildPresetTools(store);
    const engine = new StubEngineHandle();
    await engine.setTempo(140);
    await engine.setMacro("harmony:linger", 6);

    const result = await save.handle({ name: "test" }, engine);
    expect(result.ok).toBe(true);

    const loaded = store.load("test");
    expect(loaded!.session.tempo).toBe(140);
    expect(loaded!.macros["harmony:linger"]).toBe(6);
    cleanup();
  });

  it("errors with SCHEMA_INVALID on empty name", async () => {
    const [, save] = buildPresetTools(createPresetStore(dir));
    const result = await save.handle({ name: "" }, new StubEngineHandle());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA_INVALID");
    cleanup();
  });

  it("returns ENGINE_ERROR on invalid preset name (rejected by store)", async () => {
    const [, save] = buildPresetTools(createPresetStore(dir));
    const result = await save.handle({ name: "has space" }, new StubEngineHandle());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ENGINE_ERROR");
    cleanup();
  });
});

describe("switch_preset", () => {
  it("loads preset state into the engine", async () => {
    const store = createPresetStore(dir);
    const [switchP, save] = buildPresetTools(store);

    // Save a preset from one engine state
    const engineA = new StubEngineHandle();
    await engineA.setTempo(85);
    await engineA.setMacro("harmony:linger", 4);
    await save.handle({ name: "chill" }, engineA);

    // Load into a fresh engine
    const engineB = new StubEngineHandle();
    const result = await switchP.handle({ name: "chill" }, engineB);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.session.tempo).toBe(85);
      expect(result.state.macros["harmony:linger"]).toBe(4);
      expect(result.state.activePreset).toBe("chill");
    }
    cleanup();
  });

  it("errors with PRESET_NOT_FOUND when preset missing", async () => {
    const store = createPresetStore(dir);
    const [switchP] = buildPresetTools(store);
    const result = await switchP.handle({ name: "nonexistent" }, new StubEngineHandle());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PRESET_NOT_FOUND");
      expect(result.error.details).toEqual({ available: [] });
    }
    cleanup();
  });

  it("PRESET_NOT_FOUND details lists available presets", async () => {
    const store = createPresetStore(dir);
    const [switchP, save] = buildPresetTools(store);
    await save.handle({ name: "alpha" }, new StubEngineHandle());
    await save.handle({ name: "beta" }, new StubEngineHandle());

    const result = await switchP.handle({ name: "gamma" }, new StubEngineHandle());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details).toEqual({ available: ["alpha", "beta"] });
    }
    cleanup();
  });

  it("round-trips save_preset → switch_preset", async () => {
    const store = createPresetStore(dir);
    const [switchP, save] = buildPresetTools(store);

    const source = new StubEngineHandle({ label: "s" });
    await source.setKey(2, "dorian");
    await source.setTempo(120);
    await source.setMeter(6, 8);
    await source.setChordMode("bass-led");
    await source.setMetronome(true);
    await source.setMacro("harmony:linger", 8);
    await save.handle({ name: "round-trip" }, source);

    const target = new StubEngineHandle({ label: "t" });
    const result = await switchP.handle({ name: "round-trip" }, target);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.session).toMatchObject({
        tonic: 2,
        mode: "dorian",
        tempo: 120,
        beatsPerBar: 6,
        beatValue: 8,
        chordMode: "bass-led",
        metronome: true,
      });
      expect(result.state.macros["harmony:linger"]).toBe(8);
    }
    cleanup();
  });
});
