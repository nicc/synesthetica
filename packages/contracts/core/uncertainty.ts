import type { Confidence } from "./time";
import type { Provenance } from "./provenance";

export interface Span {
  t0: number; // Ms (kept as number here to avoid circular imports)
  t1: number; // Ms
}

export interface Uncertain<T> {
  value: T;
  confidence: Confidence;
  span?: Span;
  provenance: Provenance;
}
