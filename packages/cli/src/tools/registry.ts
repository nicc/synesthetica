/**
 * Central registry mapping tool names → ToolSpec. Chunk C seeds it
 * with session/input tools; Chunk D adds macro + hue-helper tools;
 * Chunk E adds preset tools.
 */

import type { ToolSpec } from "./sessionTools.js";
import { sessionTools } from "./sessionTools.js";
import { macroTools } from "./macroTools.js";
import { buildPresetTools } from "./presetTools.js";
import type { PresetStore } from "../presets/presetStore.js";

export function buildToolRegistry(presetStore: PresetStore): Map<string, ToolSpec> {
  const registry = new Map<string, ToolSpec>();
  for (const t of sessionTools) registry.set(t.name, t);
  for (const t of macroTools) registry.set(t.name, t);
  for (const t of buildPresetTools(presetStore)) registry.set(t.name, t);
  return registry;
}

export type { ToolSpec } from "./sessionTools.js";
