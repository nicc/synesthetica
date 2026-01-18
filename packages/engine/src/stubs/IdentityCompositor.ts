import type { ICompositor, SceneFrame } from "@synesthetica/contracts";

/**
 * Identity compositor: merges scenes by concatenating entities.
 * No layout transforms, blending, or z-ordering.
 * Used for Phase 0 with single-part scenarios.
 */
export class IdentityCompositor implements ICompositor {
  readonly id = "identity";

  compose(frames: SceneFrame[]): SceneFrame {
    if (frames.length === 0) {
      return { t: 0, entities: [], diagnostics: [] };
    }

    if (frames.length === 1) {
      return frames[0];
    }

    // Use the latest timestamp
    const t = Math.max(...frames.map((f) => f.t));

    // Concatenate all entities and diagnostics
    const entities = frames.flatMap((f) => f.entities);
    const diagnostics = frames.flatMap((f) => f.diagnostics);

    return { t, entities, diagnostics };
  }
}
