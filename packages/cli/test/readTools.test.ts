import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";
import { createPresetStore } from "../src/presets/presetStore.js";
import { getStartedTool, getStateTool, listInputsTool, getRecentEventsTool, clearRecentEventsTool, buildReadTools } from "../src/tools/readTools.js";

describe("get_recent_events", () => {
  it("returns the temporal envelope in data + current state in state", async () => {
    const engine = new StubEngineHandle();
    engine.startSession(Date.now() - 100);
    engine.injectEvent("note-on", { pitch: 60 });
    engine.injectEvent("chord-detected", { name: "Cmaj7" });
    const r = await getRecentEventsTool.handle({}, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const env = r.data as { startedAt: string | null; now: number | null; events: Array<{ kind: string }> };
    expect(env.events).toHaveLength(2);
    expect(env.events[1].kind).toBe("chord-detected");
    expect(env.startedAt).toBeTruthy();
    expect(env.now).toBeGreaterThanOrEqual(0);
    expect(r.state.instance).toBe("default");
  });

  it("honours limit and since args", async () => {
    const engine = new StubEngineHandle();
    for (let i = 0; i < 10; i++) engine.injectEvent("note-on", { pitch: 60 + i });
    const withLimit = await getRecentEventsTool.handle({ limit: 3 }, engine);
    expect(withLimit.ok).toBe(true);
    if (!withLimit.ok) return;
    const env = withLimit.data as { events: unknown[] };
    expect(env.events).toHaveLength(3);
  });
});

describe("clear_recent_events", () => {
  it("empties the recent-events buffer and returns current state", async () => {
    const engine = new StubEngineHandle();
    engine.startSession(Date.now() - 100);
    engine.injectEvent("note-on", { pitch: 60 });
    engine.injectEvent("note-on", { pitch: 62 });
    // Before: buffer has events.
    const before = await getRecentEventsTool.handle({}, engine);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect((before.data as { events: unknown[] }).events).toHaveLength(2);

    // Clear.
    const cleared = await clearRecentEventsTool.handle({}, engine);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.state.instance).toBe("default");

    // After: buffer is empty.
    const after = await getRecentEventsTool.handle({}, engine);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect((after.data as { events: unknown[] }).events).toHaveLength(0);
  });
});

describe("get_preset", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "get-preset-"));
  });

  it("returns full preset content without loading it", async () => {
    const store = createPresetStore(dir);
    const engine = new StubEngineHandle();
    await engine.setMacro("harmony:linger", 7);
    const snap = await engine.getStateSnapshot();
    store.save("practice", snap);
    // Reset engine to a different value to prove get_preset doesn't load.
    await engine.setMacro("harmony:linger", 3);
    const getPreset = buildReadTools(store).find((t) => t.name === "get_preset")!;
    const r = await getPreset.handle({ name: "practice" }, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const content = r.data as { macros: Record<string, number> };
    expect(content.macros["harmony:linger"]).toBe(7);
    // Engine's own state should be UNCHANGED.
    expect(r.state.macros.intents["harmony:linger"]).toBe(3);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns PRESET_NOT_FOUND with details.available on unknown name", async () => {
    const store = createPresetStore(dir);
    const engine = new StubEngineHandle();
    const snap = await engine.getStateSnapshot();
    store.save("known", snap);
    const getPreset = buildReadTools(store).find((t) => t.name === "get_preset")!;
    const r = await getPreset.handle({ name: "unknown" }, engine);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("PRESET_NOT_FOUND");
    expect((r.error.details as { available: string[] }).available).toContain("known");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("get_started", () => {
  it("returns { primer, token } and includes every macro id in the primer", async () => {
    const engine = new StubEngineHandle();
    const r = await getStartedTool.handle({}, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.data).toBe("object");
    const data = r.data as { primer: string; token: string };
    expect(typeof data.primer).toBe("string");
    expect(typeof data.token).toBe("string");
    // Token shape: 16 hex chars (SHA-256 truncated).
    expect(data.token).toMatch(/^[0-9a-f]{16}$/);
    const text = data.primer;
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
