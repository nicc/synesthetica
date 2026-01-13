import type { PartSelector } from "../parts/parts";
import type { LayoutPolicy, CompositingPolicy, Registration } from "../config/registration";

export type RegistrationId = string;
export type MotifId = string;

export type ControlOp =
  | { op: "applyRegistration"; target: PartSelector; registrationId: RegistrationId }
  | { op: "setMacro"; target: PartSelector; patch: Partial<Registration["macros"]> }
  | { op: "enableMotif"; target: PartSelector; motifId: MotifId; enabled: boolean }
  | { op: "setMotifParams"; target: PartSelector; motifId: MotifId; params: Record<string, unknown> }
  | { op: "setLayout"; target: PartSelector; layout: LayoutPolicy }
  | { op: "setCompositing"; target: PartSelector; compositing: CompositingPolicy }
  | { op: "labelPart"; target: PartSelector; label: string }
  | { op: "undo"; steps?: number }
  | { op: "redo"; steps?: number };
