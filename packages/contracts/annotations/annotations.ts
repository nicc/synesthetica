/**
 * Annotations are advisory metadata designed to help an LLM operator
 * choose grammars/presets/macros that fit user intent.
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

export type MacroResponsiveness = "strong" | "moderate" | "weak" | "none";

export interface MacroResponse {
  responsiveness: MacroResponsiveness;
  notes?: string;
}

export interface GrammarAnnotation {
  id: string;                 // grammar id
  name?: string;
  aliases?: string[];         // user-facing synonyms: "style", "look", "effect"
  illustrates?: MusicalConcept[];
  traits?: VisualTrait[];
  notes?: string[];
  cautions?: string[];
  /** How this grammar responds to each macro (helps LLM choose adjustments) */
  macroResponses?: Record<string, MacroResponse>;
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
