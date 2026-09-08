/**
 * Read-surface MCP tools per SPEC 013 §Tools (extension for
 * Claude-Desktop-shaped clients that don't proxy resources).
 *
 *   get_state       — mirror of state://<label>/current
 *   list_inputs     — mirror of inputs://
 *   list_presets    — mirror of presets://  (index only; presets://<name>
 *                     still reachable via the resource surface for
 *                     debugging attach)
 *
 * The MCP protocol treats resources and tools as parallel primitives,
 * but Claude Desktop only surfaces tools to the LLM as callable —
 * resources land in the LLM's context only when the user manually
 * attaches them via the + menu. That makes every read resource we
 * ship (state://, inputs://, presets://) invisible for autonomous
 * LLM use. These read tools close that gap by wrapping the same
 * handlers behind a callable-tool surface.
 *
 * The resource surface remains, so debugging attach still works and
 * clients that do proxy resources (a future extension) get both.
 * These tools return { ok, state, data? } — `state` is always the
 * current engine snapshot; `data` carries the read payload for the
 * two enumerator tools.
 */

import type { EngineHandle, StateSnapshot } from "../engine/engineHandle.js";
import type { PresetStore } from "../presets/presetStore.js";
import type { ToolSpec } from "./sessionTools.js";
import { composeSystemOverview } from "../resources/promptResources.js";

function err(code: string, message: string, details?: unknown) {
  return { ok: false as const, error: { code, message, ...(details ? { details } : {}) } };
}

/**
 * get_started — returns the full Synesthetica primer as text. Advertised
 * on connect via a strong `initialize.instructions` hint; the LLM should
 * call this once per conversation before acting on other tools.
 *
 * Content is composed from the same authoritative annotation manifest
 * that renders per-item annotations://* resources — no duplication.
 * The primer includes ranges + types + enumValues for every macro,
 * since annotations://macros/{id} per-item reads aren't reachable by
 * the LLM in Claude Desktop.
 */
export const getStartedTool: ToolSpec = {
  name: "get_started",
  requiresSession: false,
  description:
    "Return the full Synesthetica primer: pipeline narrative + every macro (with range, default, directionality), session controls, system concepts, grammars, tools with aliases/notes/examples, resources, session-time semantics, and preset workflow. Call this once per conversation before acting on other Synesthetica tools — everything the LLM needs to interpret the user's musical requests is in this response.",
  inputSchema: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Instance label (optional when only one is running)." },
    },
    additionalProperties: false,
  },
  async handle(_args, _engine: EngineHandle) {
    // No engine call required — the primer is content, not state.
    try {
      const text = composeSystemOverview();
      return { ok: true as const, state: emptyStateShaped(), data: text };
    } catch (e) {
      return err("ENGINE_ERROR", e instanceof Error ? e.message : String(e));
    }
  },
};

/**
 * get_started doesn't touch engine state, but the ToolResult shape
 * requires `state` on success. Rather than round-tripping to the
 * engine (which may not be started yet — get_started is the FIRST
 * tool the LLM calls), return a defaulted empty snapshot. The LLM
 * should call get_state separately when it needs current state.
 */
function emptyStateShaped(): StateSnapshot {
  return {
    instance: "default",
    macros: { intents: {}, effective: {} },
    session: {
      tonic: null,
      mode: null,
      tempo: null,
      beatsPerBar: null,
      beatValue: null,
      chordMode: "harmonic",
      harmonyLingerUnit: "seconds",
      harmonyLingerClipMax: null,
      metronome: false,
    },
    input: null,
    activePreset: null,
    startedAt: null,
    now: null,
  };
}

export const getStateTool: ToolSpec = {
  name: "get_state",
  description:
    "Return the current engine state — macros (intents + effective), prescribed session context (key, tempo, meter, chord mode, metronome), input source, active preset, and session-time anchors. Same content as state://<label>/current; use this when your MCP client doesn't proxy resource reads to you.",
  inputSchema: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Instance label (optional when only one is running)." },
    },
    additionalProperties: false,
  },
  async handle(_args, engine: EngineHandle) {
    try {
      const state = await engine.getStateSnapshot();
      return { ok: true as const, state };
    } catch (e) {
      return err("ENGINE_ERROR", e instanceof Error ? e.message : String(e));
    }
  },
};

export const listInputsTool: ToolSpec = {
  name: "list_inputs",
  description:
    "List connected MIDI + audio input devices. Each entry carries a sourceString ready to pass to set_input(source). Same content as inputs://; use this when your MCP client doesn't proxy resource reads. Read on demand — hot-plug notifications aren't wired yet.",
  inputSchema: {
    type: "object",
    properties: {
      instance: { type: "string" },
    },
    additionalProperties: false,
  },
  async handle(_args, engine: EngineHandle) {
    try {
      const [state, inputs] = await Promise.all([
        engine.getStateSnapshot(),
        engine.getAvailableInputs(),
      ]);
      return { ok: true as const, state, data: inputs };
    } catch (e) {
      return err("ENGINE_ERROR", e instanceof Error ? e.message : String(e));
    }
  },
};

export function buildReadTools(presetStore: PresetStore): ToolSpec[] {
  const listPresetsTool: ToolSpec = {
    name: "list_presets",
    description:
      "List saved presets by name, with savedAt + prescribed session context + input at save time. Use switch_preset(name) to load one. Same content as presets://; use this when your MCP client doesn't proxy resource reads.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string" },
      },
      additionalProperties: false,
    },
    async handle(_args, engine: EngineHandle) {
      try {
        const state = await engine.getStateSnapshot();
        const presets = presetStore.listWithMeta();
        return { ok: true as const, state, data: presets };
      } catch (e) {
        return err("ENGINE_ERROR", e instanceof Error ? e.message : String(e));
      }
    },
  };
  return [getStartedTool, getStateTool, listInputsTool, listPresetsTool];
}
