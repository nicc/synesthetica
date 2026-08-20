/**
 * Preset MCP tools per SPEC 013 §Tools.
 *
 *   switch_preset(name)   — load a named preset into the target engine
 *   save_preset(name)     — capture current engine state as a preset
 *
 * The preset store is a per-user filesystem directory (see
 * presetStore.ts). Tools take an optional `instance` param for
 * multi-instance targeting (Phase 3 wires the registry lookup).
 */

import type { StateSnapshot } from "../engine/engineHandle.js";
import type { ToolSpec } from "./sessionTools.js";
import type { PresetStore } from "../presets/presetStore.js";

type ToolResult =
  | { ok: true; state: StateSnapshot }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

function err(code: string, message: string, details?: unknown): ToolResult {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

async function safeCall(fn: () => Promise<StateSnapshot>): Promise<ToolResult> {
  try {
    return { ok: true, state: await fn() };
  } catch (e) {
    return err("ENGINE_ERROR", e instanceof Error ? e.message : String(e));
  }
}

export function buildPresetTools(store: PresetStore): ToolSpec[] {
  return [
    {
      name: "switch_preset",
      description:
        "Load a named preset into the target engine. Preset content replaces current macro values, prescribed context, and input source.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          instance: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
      async handle(args, engine): Promise<ToolResult> {
        const name = args.name;
        if (typeof name !== "string" || name.length === 0) {
          return err("SCHEMA_INVALID", "name must be a non-empty string");
        }
        const content = store.load(name);
        if (!content) {
          return err("PRESET_NOT_FOUND", `no preset named '${name}'`, {
            available: store.list(),
          });
        }
        // Apply preset content: macros first, then session, then input.
        // The engine records each change and publishes state after each.
        try {
          for (const [macroName, value] of Object.entries(content.macros)) {
            await engine.setMacro(macroName, value);
          }
          await engine.setKey(content.session.tonic, content.session.mode);
          await engine.setTempo(content.session.tempo);
          await engine.setMeter(content.session.beatsPerBar, content.session.beatValue);
          await engine.setChordMode(content.session.chordMode);
          await engine.setMetronome(content.session.metronome);
          if (content.input !== null) {
            await engine.setInput(content.input);
          }
          const finalState = await engine.switchPreset(name);
          return { ok: true, state: finalState };
        } catch (e) {
          return err(
            "ENGINE_ERROR",
            e instanceof Error ? e.message : String(e),
          );
        }
      },
    },

    {
      name: "save_preset",
      description:
        "Save the current state of the target engine as a named preset. Overwrites if the name already exists.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          instance: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
      async handle(args, engine): Promise<ToolResult> {
        const name = args.name;
        if (typeof name !== "string" || name.length === 0) {
          return err("SCHEMA_INVALID", "name must be a non-empty string");
        }
        return safeCall(async () => {
          const snapshot = await engine.getStateSnapshot();
          try {
            store.save(name, snapshot);
          } catch (e) {
            throw new Error(
              e instanceof Error ? e.message : String(e),
            );
          }
          return engine.savePreset(name);
        });
      },
    },
  ];
}
