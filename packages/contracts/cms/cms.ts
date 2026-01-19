/**
 * Legacy CMS types.
 *
 * @deprecated These types are part of the old pipeline model.
 * New code should use RawInputFrame, MusicalFrame, and VisualIntentFrame.
 * See RFC 005 for the new frame type architecture.
 */

import type { Ms } from "../core/time";
import type { MusicalEvent } from "./music";
import type { ControlSignal, DistributionSignal } from "./signals";

/**
 * @deprecated Use RawInputFrame or MusicalFrame instead. See RFC 005.
 */
export interface CMSFrame {
  t: Ms;
  events: MusicalEvent[];
  controls: ControlSignal[];
  distributions?: DistributionSignal[];
}

/**
 * @deprecated Use IRawSourceAdapter instead. See RFC 005.
 */
export interface ICMSStream {
  nextFrame(): CMSFrame | null;
}
