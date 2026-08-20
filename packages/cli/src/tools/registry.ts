/**
 * Central registry mapping tool names → ToolSpec. Chunk C seeds it
 * with session/input tools; Chunk D adds macro + hue-helper tools;
 * Chunk E adds preset tools.
 */

import type { ToolSpec } from "./sessionTools.js";
import { sessionTools } from "./sessionTools.js";
import { macroTools } from "./macroTools.js";

export function buildToolRegistry(): Map<string, ToolSpec> {
  const registry = new Map<string, ToolSpec>();
  for (const t of sessionTools) registry.set(t.name, t);
  for (const t of macroTools) registry.set(t.name, t);
  return registry;
}

export type { ToolSpec } from "./sessionTools.js";
