import type { Ms } from "../core/time";
import type { MusicalEvent } from "./music";
import type { ControlSignal, DistributionSignal } from "./signals";

export interface CMSFrame {
  t: Ms;
  events: MusicalEvent[];
  controls: ControlSignal[];
  distributions?: DistributionSignal[];
}

export interface ICMSStream {
  nextFrame(): CMSFrame | null;
}
