import type { PartSelector } from "../parts/parts";
import type { LayoutPolicy, CompositingPolicy, Preset } from "../config/preset";

export type PresetId = string;
export type StyleId = string;

export type ControlOp =
  | { op: "applyPreset"; target: PartSelector; presetId: PresetId }
  | { op: "setMacro"; target: PartSelector; patch: Partial<Preset["macros"]> }
  | { op: "enableStyle"; target: PartSelector; styleId: StyleId; enabled: boolean }
  | { op: "setStyleParams"; target: PartSelector; styleId: StyleId; params: Record<string, unknown> }
  | { op: "setLayout"; target: PartSelector; layout: LayoutPolicy }
  | { op: "setCompositing"; target: PartSelector; compositing: CompositingPolicy }
  | { op: "labelPart"; target: PartSelector; label: string }
  | { op: "undo"; steps?: number }
  | { op: "redo"; steps?: number };
