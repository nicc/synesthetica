/**
 * Session + input MCP tools per SPEC 013 §Tools.
 *
 *   set_key(root, mode)
 *   set_tempo(bpm)
 *   set_meter(beats_per_bar, beat_value)
 *   set_chord_mode(mode)
 *   set_metronome(enabled)
 *   set_input(source)
 *
 * All take an optional `instance` param (Chunk C is single-instance;
 * Phase 3 wires the multi-instance registry).
 *
 * Every handler returns { ok: true, state } on success or
 * { ok: false, error: { code, message, details? } } on validation
 * or engine failure. Never throws across the MCP boundary
 * (SPEC 013 §Invariants I24, I25).
 */

import type { EngineHandle, StateSnapshot } from "../engine/engineHandle.js";

type ToolInput = Record<string, unknown>;
type ToolResult =
  | { ok: true; state: StateSnapshot }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handle(args: ToolInput, engine: EngineHandle): Promise<ToolResult>;
}

// ============================================================================
// Validation helpers
// ============================================================================

function err(code: string, message: string, details?: unknown): ToolResult {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

async function safeCall(
  fn: () => Promise<StateSnapshot>,
): Promise<ToolResult> {
  try {
    const state = await fn();
    return { ok: true, state };
  } catch (e) {
    return err(
      "ENGINE_ERROR",
      e instanceof Error ? e.message : String(e),
    );
  }
}

// ============================================================================
// Tool specs
// ============================================================================

export const sessionTools: ToolSpec[] = [
  {
    name: "set_key",
    description:
      "Set the prescribed key (tonic + mode). Both null to clear (disables key-aware analysis). Pass an instance name when multiple engines are running.",
    inputSchema: {
      type: "object",
      properties: {
        root: {
          type: ["integer", "null"],
          minimum: 0,
          maximum: 11,
          description: "Tonic pitch class (0 = C, 11 = B). Null to clear.",
        },
        mode: {
          type: ["string", "null"],
          enum: [
            "ionian",
            "dorian",
            "phrygian",
            "lydian",
            "mixolydian",
            "aeolian",
            "locrian",
            null,
          ],
          description: "Mode. Null to clear.",
        },
        instance: { type: "string", description: "Instance label (optional when only one is running)." },
      },
      required: ["root", "mode"],
      additionalProperties: false,
    },
    async handle(args, engine) {
      const root = args.root as number | null | undefined;
      const mode = args.mode as string | null | undefined;
      if (root === undefined || mode === undefined) {
        return err("SCHEMA_INVALID", "set_key requires both root and mode (either or both may be null)");
      }
      // Both null OR both non-null.
      const rootNull = root === null;
      const modeNull = mode === null;
      if (rootNull !== modeNull) {
        return err(
          "KEY_INVALID_PAIR",
          "root and mode must be both null (clear) or both set. To clear the key, pass both as null.",
        );
      }
      if (root !== null) {
        if (!Number.isInteger(root) || root < 0 || root > 11) {
          return err("SCHEMA_INVALID", `root must be an integer in [0, 11], got ${root}`);
        }
      }
      return safeCall(() => engine.setKey(root as number | null, mode as string | null));
    },
  },

  {
    name: "set_tempo",
    description:
      "Set the prescribed tempo in BPM. Null clears (falls back to seconds-based windows). The system does not infer tempo — it must be set explicitly.",
    inputSchema: {
      type: "object",
      properties: {
        bpm: {
          type: ["number", "null"],
          minimum: 30,
          maximum: 240,
        },
        instance: { type: "string" },
      },
      required: ["bpm"],
      additionalProperties: false,
    },
    async handle(args, engine) {
      const bpm = args.bpm as number | null | undefined;
      if (bpm === undefined) return err("SCHEMA_INVALID", "set_tempo requires bpm (may be null)");
      if (bpm !== null && (typeof bpm !== "number" || bpm < 30 || bpm > 240)) {
        return err("TEMPO_OUT_OF_RANGE", `bpm must be in [30, 240] or null, got ${bpm}`);
      }
      return safeCall(() => engine.setTempo(bpm));
    },
  },

  {
    name: "set_meter",
    description:
      "Set the prescribed meter as (beats_per_bar, beat_value). Both null to clear. beat_value must be one of {1, 2, 4, 8, 16}.",
    inputSchema: {
      type: "object",
      properties: {
        beats_per_bar: { type: ["integer", "null"], minimum: 1, maximum: 16 },
        beat_value: { type: ["integer", "null"], enum: [1, 2, 4, 8, 16, null] },
        instance: { type: "string" },
      },
      required: ["beats_per_bar", "beat_value"],
      additionalProperties: false,
    },
    async handle(args, engine) {
      const bpb = args.beats_per_bar as number | null | undefined;
      const bv = args.beat_value as number | null | undefined;
      if (bpb === undefined || bv === undefined) {
        return err("SCHEMA_INVALID", "set_meter requires beats_per_bar and beat_value (either or both may be null)");
      }
      if ((bpb === null) !== (bv === null)) {
        return err(
          "METER_INVALID_PAIR",
          "beats_per_bar and beat_value must be both null (clear) or both set.",
        );
      }
      if (bpb !== null) {
        if (!Number.isInteger(bpb) || bpb < 1 || bpb > 16) {
          return err("SCHEMA_INVALID", `beats_per_bar must be integer in [1, 16], got ${bpb}`);
        }
        if (![1, 2, 4, 8, 16].includes(bv as number)) {
          return err("METER_VALUE_UNSUPPORTED", `beat_value must be one of {1, 2, 4, 8, 16}, got ${bv}`);
        }
      }
      return safeCall(() => engine.setMeter(bpb, bv));
    },
  },

  {
    name: "set_chord_mode",
    description: "Set how chord names are read: 'harmonic' or 'bass-led'.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["harmonic", "bass-led"] },
        instance: { type: "string" },
      },
      required: ["mode"],
      additionalProperties: false,
    },
    async handle(args, engine) {
      const mode = args.mode as string | undefined;
      if (mode !== "harmonic" && mode !== "bass-led") {
        return err("CHORD_MODE_UNKNOWN", `mode must be 'harmonic' or 'bass-led', got ${mode}`);
      }
      return safeCall(() => engine.setChordMode(mode));
    },
  },

  {
    name: "set_metronome",
    description: "Enable or disable metronome audio. Requires a prescribed tempo to click against.",
    inputSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        instance: { type: "string" },
      },
      required: ["enabled"],
      additionalProperties: false,
    },
    async handle(args, engine) {
      const enabled = args.enabled;
      if (typeof enabled !== "boolean") {
        return err("SCHEMA_INVALID", `enabled must be boolean, got ${typeof enabled}`);
      }
      return safeCall(() => engine.setMetronome(enabled));
    },
  },

  {
    name: "set_input",
    description:
      "Select the input source. Format: 'midi:<device-name>' for a specific MIDI device, or 'audio:<device-id>' for a specific audio input. Enumerated inputs available at inputs://available.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description:
            "Input source id (e.g. 'midi:Yamaha P-125', 'audio:built-in-mic').",
        },
        instance: { type: "string" },
      },
      required: ["source"],
      additionalProperties: false,
    },
    async handle(args, engine) {
      const source = args.source;
      if (typeof source !== "string" || source.length === 0) {
        return err("SCHEMA_INVALID", "source must be a non-empty string");
      }
      return safeCall(() => engine.setInput(source));
    },
  },
];
