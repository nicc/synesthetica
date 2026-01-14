/**
 * Annotations are advisory metadata designed to help an LLM operator
 * choose styles/presets/macros that fit user intent.
 *
 * They are NOT executable semantics.
 */

export type MusicalConcept =
  | "rhythm" | "harmony" | "melody" | "timbre"
  | "density" | "articulation" | "phrasing" | "dynamics";

export type VisualTrait =
  | "discrete" | "continuous"
  | "transient" | "persistent"
  | "directional" | "layered"
  | "minimal" | "dense"
  | "high-contrast" | "low-contrast"
  | "stable" | "reactive";

export interface StyleAnnotation {
  id: string;                 // style id
  name?: string;
  illustrates?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
  cautions?: string[];
}

export interface PresetAnnotation {
  id: string;                 // preset id
  name?: string;
  emphasises?: MusicalConcept[];
  deEmphasises?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
}

export interface MacroDirectionality {
  low: { description: string; tendsTo?: string[] };
  high: { description: string; tendsTo?: string[] };
}

export interface MacroAnnotation {
  id: string;                 // e.g. "articulation", "persistence", "emphasis.rhythm"
  affects?: MusicalConcept[];
  traits?: VisualTrait[];
  directionality: MacroDirectionality;
  notes?: string[];
  cautions?: string[];
}
