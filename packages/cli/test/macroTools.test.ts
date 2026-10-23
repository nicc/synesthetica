import { describe, it, expect, beforeEach } from "vitest";
import {
  productionManifest,
  type CompoundMacroAnnotation,
  type ContinuousMacroAnnotation,
  type DiscreteMacroAnnotation,
  type MacroAnnotation,
  type ToggleMacroAnnotation,
} from "@synesthetica/contracts";
import { setMacroTool, setHueForPitchTool } from "../src/tools/macroTools.js";
import { StubEngineHandle } from "../src/engine/stubEngineHandle.js";

// Ranges, enum values and defaults come from the manifest; these tests
// check the tool's validation and fan-out against whatever it says.
function annotation<T extends MacroAnnotation["type"]>(
  id: string,
  type: T,
): Extract<MacroAnnotation, { type: T }> {
  const ann = productionManifest.macros.find((m) => m.id === id);
  if (!ann) throw new Error(`macro not in manifest: ${id}`);
  if (ann.type !== type) throw new Error(`${id} is ${ann.type}, expected ${type}`);
  return ann as Extract<MacroAnnotation, { type: T }>;
}

const linger: ContinuousMacroAnnotation = annotation("harmony:linger", "continuous");
const quantise: DiscreteMacroAnnotation = annotation("rhythm:quantise-resolution", "discrete");
const overtones: ToggleMacroAnnotation = annotation("rhythm:overtones", "toggle");
const compounds = productionManifest.macros.filter(
  (m): m is CompoundMacroAnnotation => m.type === "compound",
);

function targetsOf(c: CompoundMacroAnnotation): Array<{ id: string; invert: boolean }> {
  return c.targets.map((t) =>
    typeof t === "string" ? { id: t, invert: false } : { id: t.id, invert: t.invert === true },
  );
}

/** Map each target id to what `pick` says it should be, for one toEqual. */
function perTarget(
  c: CompoundMacroAnnotation,
  pick: (t: { id: string; invert: boolean }, range: [number, number]) => unknown,
): Record<string, unknown> {
  return Object.fromEntries(targetsOf(c).map((t) => [t.id, pick(t, rangeOf(t.id))]));
}

function rangeOf(id: string): [number, number] {
  const ann = productionManifest.macros.find((m) => m.id === id);
  if (ann?.type !== "continuous" && ann?.type !== "compound") {
    throw new Error(`${id} has no numeric range`);
  }
  return ann.range;
}

describe("set_macro — continuous", () => {
  let engine: StubEngineHandle;
  beforeEach(() => { engine = new StubEngineHandle(); });
  const [min, max] = linger.range;

  it("accepts a value inside the range", async () => {
    const value = (min + max) / 2;
    const r = await setMacroTool.handle({ name: linger.id, value }, engine);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.macros.intents[linger.id]).toBe(value);
  });

  it("accepts both range endpoints", async () => {
    for (const value of [min, max]) {
      const r = await setMacroTool.handle({ name: linger.id, value }, engine);
      expect(r.ok).toBe(true);
    }
  });

  it("rejects a value below range", async () => {
    const r = await setMacroTool.handle({ name: linger.id, value: min - 0.1 }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MACRO_VALUE_OUT_OF_RANGE");
  });

  it("rejects a value above range", async () => {
    const r = await setMacroTool.handle({ name: linger.id, value: max + 0.1 }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MACRO_VALUE_OUT_OF_RANGE");
  });

  it("rejects wrong type", async () => {
    const r = await setMacroTool.handle({ name: linger.id, value: "loud" }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MACRO_VALUE_WRONG_TYPE");
  });
});

describe("set_macro — discrete", () => {
  const engine = new StubEngineHandle();
  const allowed = quantise.enumValues.map((v) => v.value);

  it("accepts a valid enum value", async () => {
    const value = allowed.find((v) => v !== quantise.default)!;
    const r = await setMacroTool.handle({ name: quantise.id, value }, engine);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.macros.intents[quantise.id]).toBe(value);
  });

  it("rejects an unknown enum value and lists the allowed ones", async () => {
    const r = await setMacroTool.handle({ name: quantise.id, value: "not-a-resolution" }, engine);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("MACRO_VALUE_WRONG_TYPE");
      expect(r.error.details).toEqual({ allowed });
    }
  });
});

describe("set_macro — toggle", () => {
  const engine = new StubEngineHandle();

  it("accepts a boolean", async () => {
    const value = !overtones.default;
    const r = await setMacroTool.handle({ name: overtones.id, value }, engine);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.macros.intents[overtones.id]).toBe(value);
  });

  it("rejects non-boolean values", async () => {
    for (const value of ["on", 1]) {
      const r = await setMacroTool.handle({ name: overtones.id, value }, engine);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("MACRO_VALUE_WRONG_TYPE");
    }
  });
});

describe("set_macro — compound (linear fan-out)", () => {
  it("the manifest has compound macros to exercise", () => {
    expect(compounds.length).toBeGreaterThan(0);
  });

  // At the compound's max, a forward target gets its range max and an
  // inverted target its range min; at the compound's min, the reverse.
  for (const c of compounds) {
    const [cMin, cMax] = c.range;

    it(`${c.id} at max sends forward targets to max, inverted to min`, async () => {
      const r = await setMacroTool.handle({ name: c.id, value: cMax }, new StubEngineHandle());
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const intents = r.state.macros.intents;
      expect(perTarget(c, (t) => intents[t.id])).toEqual(
        perTarget(c, (t, [tMin, tMax]) => (t.invert ? tMin : tMax)),
      );
      expect(r.state.macros.intents[c.id]).toBe(cMax);
    });

    it(`${c.id} at min sends forward targets to min, inverted to max`, async () => {
      const r = await setMacroTool.handle({ name: c.id, value: cMin }, new StubEngineHandle());
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const intents = r.state.macros.intents;
      expect(perTarget(c, (t) => intents[t.id])).toEqual(
        perTarget(c, (t, [tMin, tMax]) => (t.invert ? tMax : tMin)),
      );
    });

    it(`${c.id} maps linearly: the midpoint lands mid-range on every target`, async () => {
      const r = await setMacroTool.handle(
        { name: c.id, value: (cMin + cMax) / 2 },
        new StubEngineHandle(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const intents = r.state.macros.intents;
      expect(perTarget(c, (t) => intents[t.id])).toEqual(
        perTarget(c, (_t, [tMin, tMax]) => expect.closeTo((tMin + tMax) / 2)),
      );
    });

    it(`${c.id} out of range → error`, async () => {
      const r = await setMacroTool.handle(
        { name: c.id, value: cMax + (cMax - cMin) },
        new StubEngineHandle(),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("MACRO_VALUE_OUT_OF_RANGE");
    });
  }

  it("rhythm:difficulty inverts its targets — higher difficulty narrows the view", async () => {
    // The perceptual claim behind the manifest's invert flags: harder
    // means less horizon and less drift tolerance, not more.
    const difficulty = annotation("rhythm:difficulty", "compound");
    const [dMin, dMax] = difficulty.range;
    const easy = await setMacroTool.handle({ name: difficulty.id, value: dMin }, new StubEngineHandle());
    const hard = await setMacroTool.handle({ name: difficulty.id, value: dMax }, new StubEngineHandle());
    if (!easy.ok || !hard.ok) throw new Error("difficulty dispatch failed");
    const narrower = (id: string) =>
      (hard.state.macros.intents[id] as number) < (easy.state.macros.intents[id] as number);
    expect({
      horizon: narrower("rhythm:horizon"),
      tolerance: narrower("rhythm:tightness-tolerance"),
    }).toEqual({ horizon: true, tolerance: true });
  });
});

describe("time-horizon — leaf outputs are unit-invariant across tempo", () => {
  it("compound dispatch produces the same harmony:linger regardless of tempo", async () => {
    // harmony:linger is always seconds; no tempo-aware normalisation.
    // A single compound value should produce the same leaf value in
    // free time and with a prescribed tempo.
    const value = annotation("time-horizon", "compound").range[1];
    const freeTime = new StubEngineHandle();
    await setMacroTool.handle({ name: "time-horizon", value }, freeTime);
    const freeLinger = (await freeTime.getStateSnapshot()).macros.intents[linger.id];

    const withTempo = new StubEngineHandle();
    await withTempo.setTempo(120);
    await withTempo.setMeter(4, 4);
    await setMacroTool.handle({ name: "time-horizon", value }, withTempo);
    const tempoLinger = (await withTempo.getStateSnapshot()).macros.intents[linger.id];

    expect(freeLinger).toBe(tempoLinger);
    expect(freeLinger).toBe(linger.range[1]);
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
  it("computes the anchor hue so the requested pc maps to the requested hue", async () => {
    const engine = new StubEngineHandle();
    // Anchor is C (pc 0). Cw direction, 30°/semitone.
    // hue(pc) = referenceHue + (pc - 0) * 30
    // Asking set_hue_for_pitch(0, 0) → referenceHue = 0 (C stays red, unchanged).
    const rCRed = await setHueForPitchTool.handle({ pc: 0, hue: 0 }, engine);
    expect(rCRed.ok).toBe(true);
    if (rCRed.ok) expect(rCRed.state.macros.intents["system:colour-mapping:reference"]).toBe(0);

    // Asking set_hue_for_pitch(7, 0) → G red. G is 7 semitones above C.
    // Need referenceHue such that referenceHue + 7*30 ≡ 0 (mod 360).
    // referenceHue = -210 ≡ 150 (mod 360).
    const rGRed = await setHueForPitchTool.handle({ pc: 7, hue: 0 }, engine);
    expect(rGRed.ok).toBe(true);
    if (rGRed.ok) expect(rGRed.state.macros.intents["system:colour-mapping:reference"]).toBe(150);
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
