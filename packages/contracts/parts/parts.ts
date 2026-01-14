export type PartId = string;

/**
 * A PartSelector identifies which part(s) a control operation targets.
 * This enables speech patterns like "this is the guitar" and "apply X to guitar".
 */
export type PartSelector =
  | { kind: "partId"; partId: PartId }
  | { kind: "label"; label: string }
  | { kind: "mostActive"; windowMs: number } // Ms
  | { kind: "all" };

export interface PartMeta {
  id: PartId;
  label?: string;
  presetId?: string;
}

export interface PartRegistry {
  getParts(): PartId[];
  getMeta(part: PartId): PartMeta;
  setLabel(part: PartId, label: string): void;
  assignPreset(part: PartId, presetId: string): void;
}
