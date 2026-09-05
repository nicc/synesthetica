/**
 * Wiring coverage — every macro declared in productionManifest is
 * asserted to actually take effect on its declared consumer.
 *
 * Iterates productionManifest.macros. For each continuous/discrete
 * macro (compound macros fan out to leaves and are covered
 * transitively), for each entry in consumers[]:
 *   1. Instantiate the consumer.
 *   2. Read its current macro value (baseline).
 *   3. Pick an in-range test value distinct from the baseline.
 *   4. Dispatch through pipeline.setMacro(macroId, testValue) — the
 *      SAME code path a set_macro tool call reaches after crossing
 *      the wsBridge in production.
 *   5. Assert consumer.readMacros()[macroKey] === testValue.
 *
 * A consumer declared in the manifest but not implemented in code
 * fails at (5). A macro added to the manifest without a consumer
 * fails earlier — the type union requires consumers[]. Together with
 * the build-time validator (validate-manifest.mjs), this is the
 * verification loop that closes the gap the meta-conversation named:
 * "declared but not actually plumbed".
 *
 * See SPEC 014 §Wiring coverage.
 */

import { describe, it, expect } from "vitest";
import { productionManifest, type MacroConsumer } from "@synesthetica/contracts";
import {
  VisualPipeline,
  NoteTrackingStabilizer,
  DynamicsStabilizer,
  ChordDetectionStabilizer,
  HarmonyStabilizer,
  MusicalVisualVocabulary,
  RhythmGrammar,
  HarmonyGrammar,
  DynamicsGrammar,
  IdentityCompositor,
} from "../src";
import type {
  IMusicalStabilizer,
  IVisualGrammar,
  IVisualVocabulary,
} from "@synesthetica/contracts";

/** A fresh production-shaped pipeline, plus direct handles to each
 *  consumer instance so tests can readMacros() without walking
 *  pipeline internals. Stabilizers are wired through the pipeline
 *  as factories AND kept as direct instances for readback — the
 *  pipeline dispatches setMacro to its own factory-created copies,
 *  so we assert against those (retrieved via reflection on partState). */
function buildPipeline() {
  const partId = "test-part" as const;

  const rhythmGrammar = new RhythmGrammar();
  const harmonyGrammar = new HarmonyGrammar();
  const dynamicsGrammar = new DynamicsGrammar();
  const vocabulary = new MusicalVisualVocabulary();

  const pipeline = new VisualPipeline({
    canvasSize: { width: 800, height: 600 },
    rngSeed: 42,
    partId,
  });

  // Stabilizer factories — pipeline creates its own instances per part.
  pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
  pipeline.addStabilizerFactory(() => new DynamicsStabilizer({ partId }));
  pipeline.addStabilizerFactory(() => new ChordDetectionStabilizer({ partId }));
  pipeline.addStabilizerFactory(() => new HarmonyStabilizer({ partId }));
  pipeline.setVocabulary(vocabulary);
  pipeline.addGrammar(rhythmGrammar);
  pipeline.addGrammar(harmonyGrammar);
  pipeline.addGrammar(dynamicsGrammar);
  pipeline.setCompositor(new IdentityCompositor());

  // Trigger partState creation so stabilizer instances exist and
  // pipeline.setMacro has something to dispatch to.
  pipeline.requestFrame(0);

  // Extract stabilizer instances from the pipeline's part state so
  // we assert against the SAME objects pipeline.setMacro touches.
  const partStates = (
    pipeline as unknown as {
      partStates: Map<string, { stabilizers: IMusicalStabilizer[] }>;
    }
  ).partStates;
  const stabilizers = partStates.get(partId)?.stabilizers ?? [];

  const consumerLookup = new Map<
    string,
    IVisualGrammar | IMusicalStabilizer | IVisualVocabulary
  >();
  consumerLookup.set(rhythmGrammar.id, rhythmGrammar);
  consumerLookup.set(harmonyGrammar.id, harmonyGrammar);
  consumerLookup.set(dynamicsGrammar.id, dynamicsGrammar);
  consumerLookup.set(vocabulary.id, vocabulary);
  for (const s of stabilizers) consumerLookup.set(s.id, s);

  return { pipeline, consumerLookup };
}

/** Pick a test value that's in the macro's range but not the default
 *  or the current baseline — so a no-op setter can't accidentally pass
 *  by returning the pre-existing value. */
function pickTestValue(
  macro: { type: string; default?: number | string },
  baseline: number | string,
  range?: [number, number],
  enumValues?: Array<{ value: number | string }>,
): number | string {
  if (macro.type === "continuous" && range) {
    const [lo, hi] = range;
    // Try halfway between default and hi; if that equals baseline,
    // try halfway to lo.
    const candidateA = (typeof macro.default === "number" ? macro.default : lo) + (hi - lo) * 0.37;
    if (candidateA !== baseline) return candidateA;
    return lo + (hi - lo) * 0.13;
  }
  if (macro.type === "discrete" && enumValues) {
    for (const v of enumValues) {
      if (v.value !== baseline) return v.value;
    }
  }
  throw new Error(`cannot pick a test value for macro (baseline=${String(baseline)})`);
}

// -----------------------------------------------------------------
// Sanity: every declared consumer id resolves to a real instance.
// -----------------------------------------------------------------
describe("Wiring coverage — consumer instances resolve", () => {
  const { consumerLookup } = buildPipeline();
  for (const macro of productionManifest.macros) {
    if (macro.type === "compound") continue;
    for (const consumer of macro.consumers) {
      it(`${macro.id} → ${consumer.kind} '${consumer.id}' exists at runtime`, () => {
        expect(consumerLookup.has(consumer.id)).toBe(true);
      });
    }
  }
});

// -----------------------------------------------------------------
// Coverage: pipeline.setMacro reaches the consumer AND mutates it.
// -----------------------------------------------------------------
describe("Wiring coverage — pipeline.setMacro reaches consumers", () => {
  for (const macro of productionManifest.macros) {
    if (macro.type === "compound") continue;

    it(`${macro.id} is applied to every declared consumer`, () => {
      const { pipeline, consumerLookup } = buildPipeline();

      const range = macro.type === "continuous" ? macro.range : undefined;
      const enumValues = macro.type === "discrete" ? macro.enumValues : undefined;

      for (const consumer of macro.consumers as MacroConsumer[]) {
        const instance = consumerLookup.get(consumer.id);
        if (!instance) throw new Error(`no instance for '${consumer.id}'`);

        const reader = (instance as { readMacros?: () => Record<string, number | string> }).readMacros;
        expect(
          typeof reader === "function",
          `consumer '${consumer.id}' does not implement readMacros() — required for wiring coverage`,
        ).toBe(true);

        const baseline = reader!.call(instance)[consumer.macroKey];
        expect(
          baseline !== undefined,
          `consumer '${consumer.id}'.readMacros() has no entry for '${consumer.macroKey}' — did the setter for ${macro.id} ever land?`,
        ).toBe(true);

        const testValue = pickTestValue(macro, baseline, range, enumValues);

        pipeline.setMacro(macro.id, testValue);

        const after = reader!.call(instance)[consumer.macroKey];
        expect(
          after,
          `pipeline.setMacro('${macro.id}', ${JSON.stringify(testValue)}) did not reach '${consumer.id}'.macros['${consumer.macroKey}'] (still ${JSON.stringify(after)})`,
        ).toBe(testValue);
      }
    });
  }
});
