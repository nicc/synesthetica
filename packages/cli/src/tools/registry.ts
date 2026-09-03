/**
 * Central registry mapping tool names → ToolSpec.
 *
 * Tool DESCRIPTIONS come from the manifest (productionManifest.tools),
 * not from each tool's own `.ts` file — the manifest is the single
 * edit point for LLM-facing wording. Schemas + handlers stay in code
 * (they need TypeScript). At registration time we look up each tool
 * id in the manifest and override its description; missing entries
 * fall back to the code default.
 */

import type { ToolSpec } from "./sessionTools.js";
import { sessionTools } from "./sessionTools.js";
import { macroTools } from "./macroTools.js";
import { buildPresetTools } from "./presetTools.js";
import type { PresetStore } from "../presets/presetStore.js";
import { productionManifest } from "@synesthetica/contracts";

export function buildToolRegistry(presetStore: PresetStore): Map<string, ToolSpec> {
  const registry = new Map<string, ToolSpec>();
  const annotations = new Map(
    (productionManifest.tools ?? []).map((t) => [t.id, t] as const),
  );
  const add = (t: ToolSpec) => {
    const ann = annotations.get(t.name);
    registry.set(t.name, ann ? { ...t, description: ann.description } : t);
  };
  for (const t of sessionTools) add(t);
  for (const t of macroTools) add(t);
  for (const t of buildPresetTools(presetStore)) add(t);
  return registry;
}

export type { ToolSpec } from "./sessionTools.js";
