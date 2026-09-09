import type { Preset } from "../config/preset";
import type { PartMeta, PartId } from "../parts/parts";
import type { LensId, PresetId } from "./control_ops";

export type Query =
  | { q: "listPresets" }
  | { q: "describePreset"; presetId: PresetId }
  | { q: "listLenses" }
  | { q: "getParts" }
  | { q: "getPartMeta"; partId: PartId }
  | { q: "getAssignments" };

export type QueryResult =
  | { q: "listPresets"; presets: Array<Pick<Preset, "id" | "name">> }
  | { q: "describePreset"; preset: Preset }
  | { q: "listLenses"; lenses: Array<{ id: LensId; name?: string }> }
  | { q: "getParts"; parts: PartId[] }
  | { q: "getPartMeta"; meta: PartMeta }
  | { q: "getAssignments"; assignments: Array<{ partId: PartId; presetId?: PresetId }> };
