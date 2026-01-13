import type { Ms, Confidence } from "../core/time";
import type { Provenance } from "../core/provenance";
import type { PartId } from "../parts/parts";

export type Timescale = "micro" | "beat" | "phrase" | "section";

export interface ControlSignal {
  id: string;        // e.g. "loudness", "tension"
  t: Ms;
  part: PartId;
  value: number;     // recommended: normalize to 0..1 unless documented
  confidence: Confidence;
  timescale: Timescale;
  provenance: Provenance;
}

export interface DistributionSignal {
  id: string;        // e.g. "pc_dist"
  t: Ms;
  part: PartId;
  probs: number[];   // length 12, sums to ~1
  confidence: Confidence;
  timescale: Timescale;
  provenance: Provenance;
}
