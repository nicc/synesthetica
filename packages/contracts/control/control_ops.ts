import type { PartSelector } from "../parts/parts";
import type { LayoutPolicy, CompositingPolicy, Preset } from "../config/preset";

export type PresetId = string;
export type GrammarId = string;

/**
 * Control operations for the engine.
 *
 * Note: Undo/redo is intentionally not supported at the engine level.
 * The operating LLM can implement reversal by issuing compensating ops
 * (e.g., re-applying the previous preset, resetting a macro to its prior value).
 * This keeps the engine stateless with respect to history.
 */
export type ControlOp =
  | { op: "applyPreset"; target: PartSelector; presetId: PresetId }
  | { op: "setMacro"; target: PartSelector; patch: Partial<Preset["macros"]> }
  | { op: "enableGrammar"; target: PartSelector; grammarId: GrammarId; enabled: boolean }
  | { op: "setGrammarParams"; target: PartSelector; grammarId: GrammarId; params: Record<string, unknown> }
  | { op: "setLayout"; target: PartSelector; layout: LayoutPolicy }
  | { op: "setCompositing"; target: PartSelector; compositing: CompositingPolicy }
  | { op: "labelPart"; target: PartSelector; label: string };
