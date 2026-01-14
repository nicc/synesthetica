import type { Preset } from "../config/preset";
import type { PartMeta, PartId } from "../parts/parts";
import type { GrammarId, PresetId } from "./control_ops";

export type Query =
  | { q: "listPresets" }
  | { q: "describePreset"; presetId: PresetId }
  | { q: "listGrammars" }
  | { q: "getParts" }
  | { q: "getPartMeta"; partId: PartId }
  | { q: "getAssignments" };

export type QueryResult =
  | { q: "listPresets"; presets: Array<Pick<Preset, "id" | "name">> }
  | { q: "describePreset"; preset: Preset }
  | { q: "listGrammars"; grammars: Array<{ id: GrammarId; name?: string }> }
  | { q: "getParts"; parts: PartId[] }
  | { q: "getPartMeta"; meta: PartMeta }
  | { q: "getAssignments"; assignments: Array<{ partId: PartId; presetId?: PresetId }> };
