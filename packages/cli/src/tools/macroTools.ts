/**
 * Macro + hue-helper MCP tools per SPEC 013 §Tools.
 *
 *   set_macro(name, value)
 *   set_hue_for_pitch(pc, hue)
 *
 * set_macro validates the value against the macro's annotation:
 *   - continuous: number in [min, max]
 *   - discrete: value must be one of enumValues
 *   - compound: number in [min, max]; dispatcher fans to targets
 *
 * Compound fan-out uses a linear default curve — placeholder until
 * Phase 2 tunes each compound by feel. Fan-out is implemented
 * server-side (dispatcher writes each target via engine.setMacro).
 * Last-write-wins per SPEC 013 §Resolution.
 *
 * set_hue_for_pitch is a server-side helper: rotates the colour wheel
 * so the given pitch class maps to the given hue by adjusting
 * system:colour-mapping:reference (and direction if needed).
 */

import type { EngineHandle, StateSnapshot } from "../engine/engineHandle.js";
import type {
  MacroAnnotation,
  ContinuousMacroAnnotation,
  DiscreteMacroAnnotation,
  CompoundMacroAnnotation,
} from "@synesthetica/contracts";
import { productionManifest as manifest } from "@synesthetica/contracts";
import type { ToolSpec } from "./sessionTools.js";

type ToolInput = Record<string, unknown>;
type ToolResult =
  | { ok: true; state: StateSnapshot }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

function err(code: string, message: string, details?: unknown): ToolResult {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

// Build a fast lookup from macro id → annotation, at module load.
const macroById: Map<string, MacroAnnotation> = new Map(
  manifest.macros.map((m) => [m.id, m]),
);

// ============================================================================
// Compound-macro dispatchers (linear default curves; Phase 2 tunes)
// ============================================================================

/**
 * Linear map from a compound value in [0..1] to a target's range.
 * Assumes each target has a corresponding leaf macro in the manifest
 * (fall back to identity if not).
 */
function linearMapTo(
  compoundValue: number,
  compoundRange: [number, number],
  targetId: string,
): number | string {
  const target = macroById.get(targetId);
  if (!target) {
    // Target may be an internal param ref not yet exposed as a
    // macro (see docs/tunables.md for the parameter that backs it).
    // Fall through to identity — the engine will need to route it.
    return compoundValue;
  }
  const [inMin, inMax] = compoundRange;
  const t = inMax === inMin ? 0 : (compoundValue - inMin) / (inMax - inMin);
  if (target.type === "continuous" || target.type === "compound") {
    const [outMin, outMax] = target.range;
    return outMin + t * (outMax - outMin);
  }
  if (target.type === "discrete") {
    // Discrete target — pick from enumValues by t position.
    const values = target.enumValues.map((v) => v.value);
    const idx = Math.min(
      values.length - 1,
      Math.max(0, Math.round(t * (values.length - 1))),
    );
    return values[idx];
  }
  return compoundValue;
}

async function dispatchCompound(
  compound: CompoundMacroAnnotation,
  value: number,
  engine: EngineHandle,
): Promise<StateSnapshot> {
  // Fan out to each target with a linear map. Last write wins per
  // SPEC 013 §Resolution — no accumulation, no priority. Per-target
  // `invert` flips the compound axis so the target's range runs in the
  // opposite direction (used when a compound's semantics are the
  // reverse of a leaf's natural range — e.g. rhythm:difficulty HIGH
  // → rhythm:tightness-tolerance LOW).
  for (const rawTarget of compound.targets) {
    const target = typeof rawTarget === "string"
      ? { id: rawTarget, invert: false }
      : { id: rawTarget.id, invert: rawTarget.invert === true };
    const compoundValue = target.invert
      ? compound.range[1] + compound.range[0] - value
      : value;
    const targetValue = linearMapTo(compoundValue, compound.range, target.id);
    await engine.setMacro(target.id, targetValue);
  }
  // Record the compound's own value last so state://current reflects
  // "the user set time-horizon to 0.5" even though the underlying
  // params were what actually got written. This trailing write is the
  // state-of-record for what the LLM most-recently asked for.
  return engine.setMacro(compound.id, value);
}

// ============================================================================
// set_macro
// ============================================================================

async function safeCall(fn: () => Promise<StateSnapshot>): Promise<ToolResult> {
  try {
    return { ok: true, state: await fn() };
  } catch (e) {
    return err("ENGINE_ERROR", e instanceof Error ? e.message : String(e));
  }
}

function validateContinuous(
  ann: ContinuousMacroAnnotation,
  value: unknown,
): ToolResult | number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return err("MACRO_VALUE_WRONG_TYPE", `${ann.id} is continuous; value must be a number`);
  }
  const [min, max] = ann.range;
  if (value < min || value > max) {
    return err(
      "MACRO_VALUE_OUT_OF_RANGE",
      `${ann.id} requires a value in [${min}, ${max}], got ${value}`,
    );
  }
  return value;
}

function validateDiscrete(
  ann: DiscreteMacroAnnotation,
  value: unknown,
): ToolResult | string | number {
  const allowed = ann.enumValues.map((v) => v.value);
  if (!allowed.includes(value as string | number)) {
    return err(
      "MACRO_VALUE_WRONG_TYPE",
      `${ann.id} is discrete; value must be one of ${JSON.stringify(allowed)}`,
      { allowed },
    );
  }
  return value as string | number;
}

function validateCompound(
  ann: CompoundMacroAnnotation,
  value: unknown,
): ToolResult | number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return err("MACRO_VALUE_WRONG_TYPE", `${ann.id} is compound; value must be a number`);
  }
  const [min, max] = ann.range;
  if (value < min || value > max) {
    return err(
      "MACRO_VALUE_OUT_OF_RANGE",
      `${ann.id} requires a value in [${min}, ${max}], got ${value}`,
    );
  }
  return value;
}

export const setMacroTool: ToolSpec = {
  name: "set_macro",
  description:
    "Set an aesthetic macro (any system:*, cross-cutting, or <scope>:* name). Value shape depends on the macro's type: number for continuous / compound, string or number for discrete. See annotations://macros/{id} for each macro's shape and default.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Macro id from the annotation manifest.",
      },
      value: {
        description: "Number for continuous/compound, enum value for discrete.",
      },
      instance: { type: "string" },
    },
    required: ["name", "value"],
    additionalProperties: false,
  },
  async handle(args: ToolInput, engine: EngineHandle): Promise<ToolResult> {
    const name = args.name;
    if (typeof name !== "string") {
      return err("SCHEMA_INVALID", "name must be a string");
    }
    const ann = macroById.get(name);
    if (!ann) {
      return err("MACRO_UNKNOWN", `no macro named '${name}'`, {
        knownMacros: [...macroById.keys()],
      });
    }
    const rawValue = args.value;
    if (ann.type === "continuous") {
      const validated = validateContinuous(ann, rawValue);
      if (typeof validated !== "number") return validated;
      return safeCall(() => engine.setMacro(ann.id, validated));
    }
    if (ann.type === "discrete") {
      const validated = validateDiscrete(ann, rawValue);
      if (typeof validated === "object") return validated;
      return safeCall(() => engine.setMacro(ann.id, validated));
    }
    if (ann.type === "compound") {
      const validated = validateCompound(ann, rawValue);
      if (typeof validated !== "number") return validated;
      return safeCall(() => dispatchCompound(ann, validated, engine));
    }
    return err("MACRO_UNKNOWN", `unreachable: macro '${name}' has unknown type`);
  },
};

// ============================================================================
// set_hue_for_pitch
// ============================================================================

const HUE_ANCHOR_PC = 9; // A, per SPEC 004 pitch-hue-mapping

export const setHueForPitchTool: ToolSpec = {
  name: "set_hue_for_pitch",
  description:
    "Helper: rotate the colour wheel so a given pitch class maps to a given hue. Adjusts system:colour-mapping:reference (and direction if needed) server-side so the LLM doesn't compute wheel-rotation math for 'make C red'-type requests.",
  inputSchema: {
    type: "object",
    properties: {
      pc: {
        type: "integer",
        minimum: 0,
        maximum: 11,
        description: "Pitch class (0 = C, 11 = B).",
      },
      hue: {
        type: "number",
        minimum: 0,
        maximum: 360,
        description: "Target hue in degrees.",
      },
      instance: { type: "string" },
    },
    required: ["pc", "hue"],
    additionalProperties: false,
  },
  async handle(args, engine) {
    const pc = args.pc;
    const hue = args.hue;
    if (!Number.isInteger(pc) || (pc as number) < 0 || (pc as number) > 11) {
      return err("SCHEMA_INVALID", "pc must be an integer in [0, 11]");
    }
    if (typeof hue !== "number" || hue < 0 || hue > 360) {
      return err("SCHEMA_INVALID", "hue must be a number in [0, 360]");
    }
    // Compute the anchor hue such that pc maps to the requested hue.
    // The anchor is A (pc 9); the direction defaults to "cw" so
    // each semitone rotates hue by +30° from A.
    // hue(pc) = referenceHue + (pc - 9) * 30 (mod 360) in cw direction.
    // Solve: referenceHue = hue - (pc - 9) * 30 (mod 360)
    const rawAnchor = (hue as number) - ((pc as number) - HUE_ANCHOR_PC) * 30;
    const anchor = ((rawAnchor % 360) + 360) % 360;
    return safeCall(() =>
      engine.setHueForPitch(pc as number, hue as number).then(() =>
        engine.setMacro("system:colour-mapping:reference", anchor),
      ),
    );
  },
};

// ============================================================================
// Aggregated export
// ============================================================================

export const macroTools: ToolSpec[] = [setMacroTool, setHueForPitchTool];
