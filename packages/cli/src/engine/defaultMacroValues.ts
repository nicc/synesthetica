/**
 * Extracts the default value of every macro from the annotation
 * manifest. Used to seed StubEngineHandle (and eventually the real
 * engine) with launch-time values that match SPEC 013's promise
 * that `state://<label>/current` never lies about defaults.
 */

import { productionManifest } from "@synesthetica/contracts";

export const defaultMacroValues: Record<string, number | string> = (() => {
  const out: Record<string, number | string> = {};
  for (const macro of productionManifest.macros) {
    if (macro.type === "compound") {
      out[macro.id] = macro.default;
    } else if (macro.type === "continuous") {
      out[macro.id] = macro.default;
    } else if (macro.type === "discrete") {
      out[macro.id] = macro.default;
    }
  }
  return out;
})();
