import { describe, it, expect, beforeEach, vi } from "vitest";
import { productionManifest } from "@synesthetica/contracts";
import { sessionTools } from "../src/tools/sessionTools.js";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";

function tool(name: string) {
  const t = sessionTools.find((s) => s.name === name);
  if (!t) throw new Error(`no tool: ${name}`);
  return t;
}

function sessionControl(id: string) {
  const c = productionManifest.sessionControls.find((s) => s.id === id);
  if (!c) throw new Error(`session control not in manifest: ${id}`);
  return c;
}

// What the tool layer owns: translating MCP arguments into one engine
// call, wrapping the engine's snapshot in the result envelope, and
// rejecting bad input before the engine is touched. The stub's own
// state bookkeeping is not under test here.

describe("session tools — argument translation", () => {
  const cases: Array<{ tool: string; args: Record<string, unknown>; method: string; engineArgs: unknown[] }> = [
    { tool: "set_key", args: { root: 5, mode: "aeolian" }, method: "setKey", engineArgs: [5, "aeolian"] },
    { tool: "set_key", args: { root: null, mode: null }, method: "setKey", engineArgs: [null, null] },
    { tool: "set_tempo", args: { bpm: 120 }, method: "setTempo", engineArgs: [120] },
    { tool: "set_tempo", args: { bpm: null }, method: "setTempo", engineArgs: [null] },
    { tool: "set_meter", args: { beats_per_bar: 3, beat_value: 8 }, method: "setMeter", engineArgs: [3, 8] },
    { tool: "set_meter", args: { beats_per_bar: null, beat_value: null }, method: "setMeter", engineArgs: [null, null] },
    { tool: "set_chord_mode", args: { mode: "bass-led" }, method: "setChordMode", engineArgs: ["bass-led"] },
    { tool: "set_metronome", args: { enabled: true }, method: "setMetronome", engineArgs: [true] },
    { tool: "set_input", args: { source: "midi:Yamaha P-125" }, method: "setInput", engineArgs: ["midi:Yamaha P-125"] },
  ];

  for (const c of cases) {
    it(`${c.tool}(${JSON.stringify(c.args)}) → engine.${c.method}(${c.engineArgs.map((a) => JSON.stringify(a)).join(", ")})`, async () => {
      const engine = new StubEngineHandle();
      const res = await tool(c.tool).handle(c.args, engine);
      expect(res.ok).toBe(true);
      expect(engine.opLog).toEqual([{ method: c.method, args: c.engineArgs }]);
    });
  }
});

describe("session tools — result envelope", () => {
  let engine: StubEngineHandle;
  beforeEach(() => {
    engine = new StubEngineHandle();
  });

  it("returns the engine's snapshot as state, unmodified", async () => {
    const snapshot = await engine.getStateSnapshot();
    const sentinel = { ...snapshot, instance: "sentinel" };
    vi.spyOn(engine, "setTempo").mockResolvedValue(sentinel);
    const res = await tool("set_tempo").handle({ bpm: 120 }, engine);
    expect(res).toEqual({ ok: true, state: sentinel });
  });

  it("turns an engine exception into ENGINE_ERROR instead of throwing", async () => {
    // SPEC 013 I24/I25: tools never throw across the MCP boundary.
    vi.spyOn(engine, "setChordMode").mockRejectedValue(new Error("tab went away"));
    const res = await tool("set_chord_mode").handle({ mode: "harmonic" }, engine);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("ENGINE_ERROR");
      expect(res.error.message).toMatch(/tab went away/);
    }
  });
});

describe("session tools — validation errors never reach the engine", () => {
  let engine: StubEngineHandle;
  beforeEach(() => {
    engine = new StubEngineHandle();
  });

  async function expectRejected(name: string, args: Record<string, unknown>, code: string) {
    const r = await tool(name).handle(args, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(code);
    expect(engine.opLog).toEqual([]);
  }

  it("set_key rejects mismatched null/non-null", () => expectRejected("set_key", { root: 0, mode: null }, "KEY_INVALID_PAIR"));
  it("set_key rejects out-of-range root", () => expectRejected("set_key", { root: 12, mode: "ionian" }, "SCHEMA_INVALID"));
  it("set_key rejects a non-integer root", () => expectRejected("set_key", { root: 1.5, mode: "ionian" }, "SCHEMA_INVALID"));
  it("set_key requires both arguments", () => expectRejected("set_key", { root: 0 }, "SCHEMA_INVALID"));
  it("set_tempo requires bpm", () => expectRejected("set_tempo", {}, "SCHEMA_INVALID"));
  it("set_meter rejects mismatched null/non-null", () =>
    expectRejected("set_meter", { beats_per_bar: 4, beat_value: null }, "METER_INVALID_PAIR"));
  it("set_meter rejects unsupported beat_value", () =>
    expectRejected("set_meter", { beats_per_bar: 4, beat_value: 3 }, "METER_VALUE_UNSUPPORTED"));
  it("set_chord_mode rejects unknown mode", () => expectRejected("set_chord_mode", { mode: "jazz" }, "CHORD_MODE_UNKNOWN"));
  it("set_metronome rejects non-boolean", () => expectRejected("set_metronome", { enabled: "yes" }, "SCHEMA_INVALID"));
  it("set_input rejects empty string", () => expectRejected("set_input", { source: "" }, "SCHEMA_INVALID"));
});

describe("session tools — bounds agree with the manifest's session controls", () => {
  // The tools validate with their own literals; the panel and the LLM
  // prompt read the manifest. These check the two can't drift apart.

  it("set_tempo accepts exactly session:tempo's range", async () => {
    const tempo = sessionControl("session:tempo");
    if (tempo.type !== "number") throw new Error("session:tempo should be a number control");
    const [min, max] = tempo.range;
    const engine = new StubEngineHandle();
    const ok = async (bpm: number) => (await tool("set_tempo").handle({ bpm }, engine)).ok;
    expect({ min: await ok(min), max: await ok(max), below: await ok(min - 1), above: await ok(max + 1) })
      .toEqual({ min: true, max: true, below: false, above: false });
  });

  it("set_meter accepts exactly session:beats-per-bar's range and session:beat-value's values", async () => {
    const bpb = sessionControl("session:beats-per-bar");
    const bv = sessionControl("session:beat-value");
    if (bpb.type !== "number" || bv.type !== "enum") throw new Error("unexpected meter control types");
    const [min, max] = bpb.range;
    const values = bv.enumValues.map((v) => v.value as number);
    const engine = new StubEngineHandle();
    const ok = async (beats_per_bar: number, beat_value: number) =>
      (await tool("set_meter").handle({ beats_per_bar, beat_value }, engine)).ok;

    for (const v of values) expect(await ok(min, v)).toBe(true);
    expect(await ok(max, values[0])).toBe(true);
    expect(await ok(min - 1, values[0])).toBe(false);
    expect(await ok(max + 1, values[0])).toBe(false);
    expect(await ok(min, Math.max(...values) * 2)).toBe(false);
  });
});
