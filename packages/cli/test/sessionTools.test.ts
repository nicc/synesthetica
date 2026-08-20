import { describe, it, expect, beforeEach } from "vitest";
import { sessionTools } from "../src/tools/sessionTools.js";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";

function tool(name: string) {
  const t = sessionTools.find((s) => s.name === name);
  if (!t) throw new Error(`no tool: ${name}`);
  return t;
}

describe("session tools — happy paths", () => {
  let engine: StubEngineHandle;
  beforeEach(() => {
    engine = new StubEngineHandle();
  });

  it("set_key sets both root and mode", async () => {
    const res = await tool("set_key").handle({ root: 5, mode: "aeolian" }, engine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.session.tonic).toBe(5);
    expect(res.state.session.mode).toBe("aeolian");
  });

  it("set_key clears when both null", async () => {
    await engine.setKey(0, "ionian");
    const res = await tool("set_key").handle({ root: null, mode: null }, engine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.session.tonic).toBeNull();
    expect(res.state.session.mode).toBeNull();
  });

  it("set_tempo sets bpm", async () => {
    const res = await tool("set_tempo").handle({ bpm: 120 }, engine);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.session.tempo).toBe(120);
  });

  it("set_tempo clears when null", async () => {
    await engine.setTempo(100);
    const res = await tool("set_tempo").handle({ bpm: null }, engine);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.session.tempo).toBeNull();
  });

  it("set_meter sets pair", async () => {
    const res = await tool("set_meter").handle({ beats_per_bar: 3, beat_value: 4 }, engine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.session.beatsPerBar).toBe(3);
    expect(res.state.session.beatValue).toBe(4);
  });

  it("set_chord_mode toggles between harmonic and bass-led", async () => {
    const r1 = await tool("set_chord_mode").handle({ mode: "bass-led" }, engine);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.state.session.chordMode).toBe("bass-led");
    const r2 = await tool("set_chord_mode").handle({ mode: "harmonic" }, engine);
    if (r2.ok) expect(r2.state.session.chordMode).toBe("harmonic");
  });

  it("set_metronome toggles boolean", async () => {
    const r = await tool("set_metronome").handle({ enabled: true }, engine);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.session.metronome).toBe(true);
  });

  it("set_input records source string", async () => {
    const r = await tool("set_input").handle({ source: "midi:Yamaha P-125" }, engine);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.input).toBe("midi:Yamaha P-125");
  });
});

describe("session tools — validation errors", () => {
  const engine = new StubEngineHandle();

  it("set_key rejects mismatched null/non-null", async () => {
    const r = await tool("set_key").handle({ root: 0, mode: null }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KEY_INVALID_PAIR");
  });

  it("set_key rejects out-of-range root", async () => {
    const r = await tool("set_key").handle({ root: 12, mode: "ionian" }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SCHEMA_INVALID");
  });

  it("set_tempo rejects out-of-range bpm", async () => {
    const r = await tool("set_tempo").handle({ bpm: 5 }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TEMPO_OUT_OF_RANGE");
  });

  it("set_meter rejects unsupported beat_value", async () => {
    const r = await tool("set_meter").handle({ beats_per_bar: 4, beat_value: 3 }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("METER_VALUE_UNSUPPORTED");
  });

  it("set_chord_mode rejects unknown mode", async () => {
    const r = await tool("set_chord_mode").handle({ mode: "jazz" }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("CHORD_MODE_UNKNOWN");
  });

  it("set_metronome rejects non-boolean", async () => {
    const r = await tool("set_metronome").handle({ enabled: "yes" }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SCHEMA_INVALID");
  });

  it("set_input rejects empty string", async () => {
    const r = await tool("set_input").handle({ source: "" }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SCHEMA_INVALID");
  });
});

describe("session tools — op log", () => {
  it("records every call in order on the stub", async () => {
    const engine = new StubEngineHandle();
    await tool("set_key").handle({ root: 0, mode: "ionian" }, engine);
    await tool("set_tempo").handle({ bpm: 100 }, engine);
    await tool("set_metronome").handle({ enabled: true }, engine);
    expect(engine.opLog.map((op) => op.method)).toEqual([
      "setKey",
      "setTempo",
      "setMetronome",
    ]);
  });
});
