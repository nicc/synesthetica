/**
 * Central registry mapping tool names → ToolSpec.
 *
 * Tool DESCRIPTIONS come from the manifest (productionManifest.tools),
 * not from each tool's own `.ts` file — the manifest is the single
 * edit point for LLM-facing wording. Schemas + handlers stay in code
 * (they need TypeScript). At registration time we look up each tool
 * id in the manifest and override its description; missing entries
 * fall back to the code default.
 *
 * Every non-get_started tool has its inputSchema augmented here with
 * a required `primer` string parameter — the token returned by
 * get_started. The mcpServer dispatch enforces it before calling the
 * handler; see PRIMER_EXEMPT below for the set that skips the gate.
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

/** Tools that DON'T require the primer token — get_started only. */
export const PRIMER_EXEMPT: ReadonlySet<string> = new Set(["get_started"]);

/**
 * Inject the required `primer` field into a tool's inputSchema.
 * Kept out-of-band from the tool definitions so every tool doesn't
 * have to remember to declare it. The mcpServer dispatch validates
 * the token before calling the handler; the handler receives args
 * with `primer` stripped.
 */
function withPrimerParam(schema: Record<string, unknown>): Record<string, unknown> {
  const props = { ...(schema.properties as Record<string, unknown> | undefined) };
  props.primer = {
    type: "string",
    description:
      "Primer token from get_started's response. Required on every tool call. If your token is stale or missing the server rejects with PRIMER_INVALID and returns the fresh primer + token in details.",
  };
  const required = Array.isArray(schema.required)
    ? Array.from(new Set([...(schema.required as string[]), "primer"]))
    : ["primer"];
  return { ...schema, properties: props, required };
}

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
    const inputSchema = PRIMER_EXEMPT.has(t.name)
      ? t.inputSchema
      : withPrimerParam(t.inputSchema);
    registry.set(t.name, { ...t, description, inputSchema });
  };
  for (const t of buildLifecycleTools(session)) add(t);
  for (const t of sessionTools) add(t);
  for (const t of macroTools) add(t);
  for (const t of buildPresetTools(presetStore)) add(t);
  for (const t of buildReadTools(presetStore)) add(t);
  return registry;
}

export type { ToolSpec } from "./sessionTools.js";
