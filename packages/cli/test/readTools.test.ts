import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";
import { createPresetStore } from "../src/presets/presetStore.js";
import { getStartedTool, getStateTool, listInputsTool, buildReadTools } from "../src/tools/readTools.js";

describe("get_started", () => {
  it("returns the composed primer text and includes every macro id", async () => {
    const engine = new StubEngineHandle();
    const r = await getStartedTool.handle({}, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.data).toBe("string");
    const text = r.data as string;
    // Spot check: authored prose section header must be present.
    expect(text).toContain("Full reference");
    // Every declared macro id appears in the primer body so the LLM
    // sees ranges + directionality without any per-item reads.
    for (const macroId of [
      "harmony:linger",
      "harmony:arpeggio-tolerance",
      "dynamics:linger",
      "rhythm:horizon",
      "system:colour-mapping:reference",
      "rhythm:quantise-resolution",
      "time-horizon",
      "rhythm:emphasis",
    ]) {
      expect(text, `macro id '${macroId}' missing from primer`).toContain(macroId);
    }
  });

  it("returns a defaulted empty state alongside the primer", async () => {
    const engine = new StubEngineHandle();
    const r = await getStartedTool.handle({}, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // get_started deliberately doesn't touch the engine — state is a
    // defaulted shape so LLM knows to call get_state for reality.
    expect(r.state.session.tempo).toBeNull();
    expect(r.state.startedAt).toBeNull();
  });

  it("doesn't call engine.getStateSnapshot", async () => {
    const engine = new StubEngineHandle();
    await getStartedTool.handle({}, engine);
    // No setter / getter should have been logged.
    const seen = engine.opLog.map((e) => e.method);
    expect(seen).not.toContain("getStateSnapshot");
  });
});

describe("get_state", () => {
  it("returns the current engine snapshot as state", async () => {
    const engine = new StubEngineHandle({ label: "default" });
    await engine.setTempo(120);
    await engine.setMacro("harmony:linger", 4);
    const r = await getStateTool.handle({}, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.session.tempo).toBe(120);
    expect(r.state.macros.intents["harmony:linger"]).toBe(4);
    expect(r.data).toBeUndefined();
  });
});

describe("list_inputs", () => {
  it("returns available inputs in data and current state alongside", async () => {
    const engine = new StubEngineHandle({ label: "default" });
    engine.setAvailableInputs([
      { kind: "midi", name: "Yamaha P-125", id: "p125", sourceString: "midi:p125" },
      { kind: "audio", name: "Default microphone", id: "default", sourceString: "audio" },
    ]);
    const r = await listInputsTool.handle({}, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.isArray(r.data)).toBe(true);
    expect((r.data as unknown[]).length).toBe(2);
    expect(r.state.instance).toBe("default");
  });

  it("returns empty array when no inputs are enumerated", async () => {
    const engine = new StubEngineHandle();
    const r = await listInputsTool.handle({}, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual([]);
  });
});

describe("list_presets", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "read-tools-"));
  });

  it("returns preset summaries via the preset store", async () => {
    const store = createPresetStore(dir);
    const engine = new StubEngineHandle();
    // Seed one preset.
    await engine.setTempo(90);
    await engine.setMacro("harmony:linger", 5);
    const snap = await engine.getStateSnapshot();
    store.save("test-preset", snap);
    const listPresetsTool = buildReadTools(store).find((t) => t.name === "list_presets")!;
    const r = await listPresetsTool.handle({}, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data = r.data as Array<{ name: string; session: { tempo: number | null } }>;
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("test-preset");
    expect(data[0].session.tempo).toBe(90);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty array when no presets are saved", async () => {
    const store = createPresetStore(dir);
    const engine = new StubEngineHandle();
    const listPresetsTool = buildReadTools(store).find((t) => t.name === "list_presets")!;
    const r = await listPresetsTool.handle({}, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});
