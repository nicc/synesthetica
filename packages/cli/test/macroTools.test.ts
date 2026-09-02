import { describe, it, expect, beforeEach } from "vitest";
import { setMacroTool, setHueForPitchTool } from "../src/tools/macroTools.js";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";

describe("set_macro — continuous", () => {
  let engine: StubEngineHandle;
  beforeEach(() => { engine = new StubEngineHandle(); });

  it("accepts a value inside the range", async () => {
    const r = await setMacroTool.handle({ name: "harmony:linger", value: 5 }, engine);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.macros["harmony:linger"]).toBe(5);
  });

  it("rejects a value below range", async () => {
    const r = await setMacroTool.handle({ name: "harmony:linger", value: 0.1 }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MACRO_VALUE_OUT_OF_RANGE");
  });

  it("rejects a value above range", async () => {
    const r = await setMacroTool.handle({ name: "harmony:linger", value: 100 }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MACRO_VALUE_OUT_OF_RANGE");
  });

  it("rejects wrong type", async () => {
    const r = await setMacroTool.handle({ name: "harmony:linger", value: "loud" }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MACRO_VALUE_WRONG_TYPE");
  });
});

describe("set_macro — discrete", () => {
  const engine = new StubEngineHandle();

  it("accepts a valid enum value", async () => {
    const r = await setMacroTool.handle(
      { name: "rhythm:quantise-resolution", value: "32nd" },
      engine,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.macros["rhythm:quantise-resolution"]).toBe("32nd");
  });

  it("rejects an unknown enum value", async () => {
    const r = await setMacroTool.handle(
      { name: "rhythm:quantise-resolution", value: "64th" },
      engine,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("MACRO_VALUE_WRONG_TYPE");
      expect(r.error.details).toEqual({ allowed: ["quarter", "8th", "16th", "32nd"] });
    }
  });
});

describe("set_macro — compound (linear fan-out)", () => {
  it("time-horizon fans to leaf macros with linear map", async () => {
    const engine = new StubEngineHandle();
    // time-horizon range is [0, 1]; targets are rhythm:horizon,
    // harmony:linger, dynamics:linger.
    const r = await setMacroTool.handle({ name: "time-horizon", value: 1.0 }, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // At value=1.0, each target gets its range's max under the
    // linear default curve.
    expect(r.state.macros["rhythm:horizon"]).toBe(1); // [0, 1] max
    expect(r.state.macros["harmony:linger"]).toBe(8); // [0.5, 8] max
    expect(r.state.macros["dynamics:linger"]).toBe(8000); // [500, 8000] max
    expect(r.state.macros["time-horizon"]).toBe(1);
  });

  it("time-horizon at min value maps to each target's min", async () => {
    const engine = new StubEngineHandle();
    const r = await setMacroTool.handle({ name: "time-horizon", value: 0 }, engine);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.macros["rhythm:horizon"]).toBe(0);
    expect(r.state.macros["harmony:linger"]).toBe(0.5);
    expect(r.state.macros["dynamics:linger"]).toBe(500);
  });

  it("compound value out of range → error", async () => {
    const r = await setMacroTool.handle(
      { name: "time-horizon", value: 2 },
      new StubEngineHandle(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MACRO_VALUE_OUT_OF_RANGE");
  });

  it("rhythm:difficulty inverts targets — HIGH difficulty → LOW leaf values", async () => {
    const engine = new StubEngineHandle();
    // Max difficulty = 1.0 (strict). Both targets are marked invert:true,
    // so each leaf gets its RANGE MINIMUM (tight view, tight tolerance).
    const r = await setMacroTool.handle(
      { name: "rhythm:difficulty", value: 1.0 },
      engine,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.macros["rhythm:horizon"]).toBe(0); // [0, 1] inverted → 0
    expect(r.state.macros["rhythm:tight-tolerance"]).toBe(10); // [10, 100] inverted → 10
    expect(r.state.macros["rhythm:difficulty"]).toBe(1);
  });

  it("rhythm:difficulty at 0 gives leaves their max (loose/wide)", async () => {
    const engine = new StubEngineHandle();
    const r = await setMacroTool.handle(
      { name: "rhythm:difficulty", value: 0 },
      engine,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.macros["rhythm:horizon"]).toBe(1);
    expect(r.state.macros["rhythm:tight-tolerance"]).toBe(100);
  });

  it("rhythm:emphasis fans forward to pulse-intensity + reference-linger", async () => {
    const engine = new StubEngineHandle();
    const r = await setMacroTool.handle(
      { name: "rhythm:emphasis", value: 1.0 },
      engine,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Non-inverted targets: max compound → max leaf.
    expect(r.state.macros["rhythm:pulse-intensity"]).toBe(1); // [0, 1] max
    expect(r.state.macros["rhythm:reference-linger"]).toBe(3); // [1.0, 3.0] max
  });
});

describe("set_macro — errors", () => {
  it("unknown macro name → MACRO_UNKNOWN", async () => {
    const r = await setMacroTool.handle({ name: "not:a:macro", value: 0 }, new StubEngineHandle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MACRO_UNKNOWN");
  });

  it("missing name → SCHEMA_INVALID", async () => {
    const r = await setMacroTool.handle({ value: 5 }, new StubEngineHandle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SCHEMA_INVALID");
  });
});

describe("set_hue_for_pitch", () => {
  it("computes the anchor hue so C maps to the requested hue", async () => {
    const engine = new StubEngineHandle();
    // C is pc 0. Anchor is A (pc 9). Cw direction, 30°/semitone.
    // hue(C) = hue(A) + (0 - 9) * 30 = hue(A) - 270
    // To get hue(C) = 0 (red), need hue(A) = 270 (mod 360)
    const r = await setHueForPitchTool.handle({ pc: 0, hue: 0 }, engine);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.macros["system:colour-mapping:reference"]).toBe(270);
  });

  it("rejects out-of-range pc", async () => {
    const r = await setHueForPitchTool.handle({ pc: 12, hue: 0 }, new StubEngineHandle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SCHEMA_INVALID");
  });

  it("rejects out-of-range hue", async () => {
    const r = await setHueForPitchTool.handle({ pc: 0, hue: 400 }, new StubEngineHandle());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SCHEMA_INVALID");
  });
});
