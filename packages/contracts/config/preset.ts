export interface LayoutPolicy {
  region: "left" | "right" | "top" | "bottom" | "center" | "full";
  scale?: number;
}

export interface CompositingPolicy {
  opacityMultiplier?: number;
  blendMode?: "normal" | "additive" | "multiply";
  zOrder?: number;
}

export interface Preset {
  id: string;
  name: string;

  grammars: Array<{
    grammarId: string;
    enabled: boolean;
    params?: Record<string, unknown>;
    priority?: number;
  }>;

  layout?: LayoutPolicy;
  compositing?: CompositingPolicy;

  macros: {
    articulation: number;  // tight(0) .. loose(1)
    persistence: number;   // ephemeral(0) .. lingering(1)
    emphasis: {
      melody: number;
      harmony: number;
      rhythm: number;
      timbre: number;
    };
  };
}

// --- Preset Storage ---

export type PresetSource = "builtin" | "user";

export interface PresetMeta {
  id: string;
  name: string;
  source: PresetSource;
  createdAt?: number;  // Ms timestamp, user presets only
  updatedAt?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];  // e.g. "grammar 'foo' not found"
}

/**
 * Catalog abstraction for preset storage.
 *
 * v0 implementation uses localStorage; interface allows future migration
 * to IndexedDB or file-based storage.
 *
 * ID format:
 * - builtin presets: "builtin:<name>" (e.g. "builtin:starfield")
 * - user presets: "user:<name>" (e.g. "user:practice-mode")
 *
 * Name collisions in user presets result in overwrites (no ambiguity).
 */
export interface IPresetCatalog {
  // Read operations (all presets)
  list(): PresetMeta[];
  get(id: string): Preset | null;

  // User presets only
  save(preset: Preset): ValidationResult;
  delete(id: string): boolean;

  // Import/export for backup
  exportUser(): string;  // JSON string
  importUser(json: string): ValidationResult;
}
