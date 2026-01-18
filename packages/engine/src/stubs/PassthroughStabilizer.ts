import type { IStabilizer, CMSFrame } from "@synesthetica/contracts";

/**
 * Passthrough stabilizer: does nothing, just returns the frame unchanged.
 * Used for Phase 0 until we implement real stabilizers.
 */
export class PassthroughStabilizer implements IStabilizer {
  readonly id = "passthrough";

  init(): void {
    // No-op
  }

  dispose(): void {
    // No-op
  }

  apply(frame: CMSFrame): CMSFrame {
    return frame;
  }

  reset(): void {
    // No-op
  }
}
