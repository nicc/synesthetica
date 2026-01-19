import type { RawInputFrame } from "../raw/raw";
import type { PartId } from "../parts/parts";

/**
 * Router that distributes raw input to parts.
 * Routes input frames to the appropriate parts based on routing rules.
 */
export interface IRouter {
  route(frame: RawInputFrame): Map<PartId, RawInputFrame>;
}
