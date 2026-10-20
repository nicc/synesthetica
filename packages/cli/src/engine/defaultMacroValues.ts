/**
 * Extracts the default value of every macro from the annotation
 * manifest. Used to seed StubEngineHandle (and eventually the real
 * engine) with launch-time values that match SPEC 013's promise
 * that `state://<label>/current` never lies about defaults.
 */

import { productionManifest } from "@synesthetica/contracts";
import type { MacroValue } from "@synesthetica/contracts";

export const defaultMacroValues: Record<string, MacroValue> = (() => {
  const out: Record<string, MacroValue> = {};
  for (const macro of productionManifest.macros) {
    out[macro.id] = macro.default;
  }
  return out;
})();
