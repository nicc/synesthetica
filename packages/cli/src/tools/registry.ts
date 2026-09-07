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
import { buildReadTools } from "./readTools.js";
import { buildLifecycleTools } from "./lifecycleTools.js";
import type { PresetStore } from "../presets/presetStore.js";
import type { SessionManager } from "../session/sessionManager.js";
import { productionManifest } from "@synesthetica/contracts";

/**
 * Tools that skip the "call get_started first" description tag —
 * either because they ARE the onboarding surface (get_started) or
 * because they operate outside a session context (start_session,
 * stop_session). The tag is a low-cost hint on every other tool so
 * the LLM has a discovery cue attached to whichever tool it hovers
 * over first.
 */
const NO_HINT_TAG = new Set(["get_started", "start_session", "stop_session"]);
const GET_STARTED_HINT = " (Call get_started first if you haven't — it returns the full Synesthetica primer.)";

export function buildToolRegistry(
  presetStore: PresetStore,
  session: SessionManager,
): Map<string, ToolSpec> {
  const registry = new Map<string, ToolSpec>();
  const annotations = new Map(
    (productionManifest.tools ?? []).map((t) => [t.id, t] as const),
  );
  const add = (t: ToolSpec) => {
    const ann = annotations.get(t.name);
    const description = ann ? ann.description : t.description;
    const tagged = NO_HINT_TAG.has(t.name) ? description : description + GET_STARTED_HINT;
    registry.set(t.name, { ...t, description: tagged });
  };
  for (const t of buildLifecycleTools(session)) add(t);
  for (const t of sessionTools) add(t);
  for (const t of macroTools) add(t);
  for (const t of buildPresetTools(presetStore)) add(t);
  for (const t of buildReadTools(presetStore)) add(t);
  return registry;
}

export type { ToolSpec } from "./sessionTools.js";
