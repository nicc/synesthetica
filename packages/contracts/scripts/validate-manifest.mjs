#!/usr/bin/env node
/**
 * Build-time manifest validation (SPEC 004 §Validation, SPEC 014 §5).
 *
 * Loads the built productionManifest and asserts structural integrity:
 *   - Unique ids per category
 *   - Alias non-conflict across macros + session controls + tools
 *   - Continuous macro defaults within declared range
 *   - Discrete macro defaults are one of enumValues
 *   - Compound macro targets exist (as macro ids in the manifest)
 *   - Session control pair children exist
 *   - Every session control has notes[] (LLM-facing prose)
 *   - Every tool description is non-empty
 *   - Every resource has a description
 *
 * Exits non-zero with a clear per-check failure list. Runs as part
 * of the contracts build.
 */

import { productionManifest } from "../dist/annotations/manifest.js";

const errors = [];
const warnings = [];

function err(check, msg) {
  errors.push(`${check}: ${msg}`);
}
function warn(check, msg) {
  warnings.push(`${check}: ${msg}`);
}

/* -----------------------------------------------------------------
 * 1. Unique ids
 * ----------------------------------------------------------------- */
function checkUniqueIds(name, arr, keyFn = (x) => x.id) {
  const seen = new Set();
  for (const item of arr) {
    const key = keyFn(item);
    if (seen.has(key)) err("unique-ids", `duplicate ${name} id: ${key}`);
    seen.add(key);
  }
}
checkUniqueIds("macro", productionManifest.macros);
checkUniqueIds("sessionControl", productionManifest.sessionControls);
checkUniqueIds("concept", productionManifest.concepts, (c) => c.term);
checkUniqueIds("grammar", productionManifest.grammars);
checkUniqueIds("tool", productionManifest.tools ?? []);
checkUniqueIds("preset", productionManifest.presets ?? []);
checkUniqueIds("resource", productionManifest.resources ?? [], (r) => r.uri);

/* -----------------------------------------------------------------
 * 2. Alias non-conflict WITHIN a category.
 *    Cross-category overlaps are legitimate — a control and the tool
 *    that writes it often share user-facing terms ('meter' →
 *    session:meter + set_meter). Same-category collisions are the
 *    real problem (two macros both claiming 'pulse strength').
 * ----------------------------------------------------------------- */
function checkAliasesWithinCategory(name, items) {
  const seen = new Map();
  for (const item of items) {
    for (const alias of item.aliases ?? []) {
      const key = alias.toLowerCase();
      if (seen.has(key)) {
        err(
          "alias-conflict",
          `${name} alias '${alias}' is claimed by both ${seen.get(key)} and ${item.id}`,
        );
      } else {
        seen.set(key, item.id);
      }
    }
  }
}
checkAliasesWithinCategory("macro", productionManifest.macros);
checkAliasesWithinCategory("sessionControl", productionManifest.sessionControls);
checkAliasesWithinCategory("tool", productionManifest.tools ?? []);

/* -----------------------------------------------------------------
 * 3. Continuous macro defaults within range
 * ----------------------------------------------------------------- */
for (const m of productionManifest.macros) {
  if (m.type === "continuous" || m.type === "compound") {
    const [lo, hi] = m.range;
    if (typeof m.default !== "number" || !Number.isFinite(m.default)) {
      err("macro-default", `${m.id}: default must be a finite number`);
    } else if (m.default < lo || m.default > hi) {
      err(
        "macro-default",
        `${m.id}: default ${m.default} outside range [${lo}, ${hi}]`,
      );
    }
  }
  if (m.type === "discrete") {
    const values = m.enumValues.map((v) => v.value);
    if (!values.includes(m.default)) {
      err(
        "macro-default",
        `${m.id}: default ${JSON.stringify(m.default)} not one of enumValues [${values.map(String).join(", ")}]`,
      );
    }
  }
}

/* -----------------------------------------------------------------
 * 4. Compound targets exist
 * ----------------------------------------------------------------- */
const macroIds = new Set(productionManifest.macros.map((m) => m.id));
for (const m of productionManifest.macros) {
  if (m.type !== "compound") continue;
  for (const target of m.targets) {
    const id = typeof target === "string" ? target : target.id;
    if (!macroIds.has(id)) {
      err(
        "compound-target",
        `${m.id}: target '${id}' isn't a declared macro`,
      );
    }
  }
}

/* -----------------------------------------------------------------
 * 4b. Consumers declared on every non-compound macro.
 *     Structural check — asserts a consumer entry exists and is
 *     shaped correctly. Runtime coverage test in packages/engine
 *     (SPEC 014 §Wiring coverage) asserts each entry's macros[key]
 *     is actually implemented on the named consumer.
 * ----------------------------------------------------------------- */
const grammarIds = new Set(productionManifest.grammars.map((g) => g.id));
// Stabilizer + vocab ids aren't listed in the manifest today; declare
// the shipping set here. Adding a new one is a two-line change (this
// list + the runtime coverage test).
const stabilizerIds = new Set([
  "chord-detection",
  "note-tracking",
  "harmony",
  "dynamics",
]);
const vocabIds = new Set(["musical-visual"]);
for (const m of productionManifest.macros) {
  if (m.type === "compound") continue;
  if (!Array.isArray(m.consumers) || m.consumers.length === 0) {
    err(
      "macro-consumers",
      `${m.id}: consumers[] missing or empty — an unwired macro is a manifest lie`,
    );
    continue;
  }
  for (const c of m.consumers) {
    if (!c || typeof c !== "object") {
      err("macro-consumers", `${m.id}: consumer entry is not an object`);
      continue;
    }
    if (!["grammar", "stabilizer", "vocab"].includes(c.kind)) {
      err("macro-consumers", `${m.id}: unknown consumer kind '${c.kind}'`);
    }
    if (typeof c.id !== "string" || c.id.length === 0) {
      err("macro-consumers", `${m.id}: consumer.id missing`);
    }
    if (typeof c.macroKey !== "string" || c.macroKey.length === 0) {
      err("macro-consumers", `${m.id}: consumer.macroKey missing`);
    }
    const registry =
      c.kind === "grammar"
        ? grammarIds
        : c.kind === "stabilizer"
          ? stabilizerIds
          : vocabIds;
    if (!registry.has(c.id)) {
      err(
        "macro-consumers",
        `${m.id}: consumer id '${c.id}' isn't a known ${c.kind} — add it to the validator's registry if it's new`,
      );
    }
  }
}

/* -----------------------------------------------------------------
 * 5. Session control pair children exist
 * ----------------------------------------------------------------- */
const sessionIds = new Set(productionManifest.sessionControls.map((s) => s.id));
for (const s of productionManifest.sessionControls) {
  if (s.type !== "pair") continue;
  for (const childId of s.pair) {
    if (!sessionIds.has(childId)) {
      err(
        "pair-child",
        `${s.id}: child '${childId}' isn't a declared session control`,
      );
    }
  }
}

/* -----------------------------------------------------------------
 * 6. LLM-facing prose present
 * ----------------------------------------------------------------- */
for (const s of productionManifest.sessionControls) {
  if (!s.notes || s.notes.length === 0) {
    warn(
      "notes-missing",
      `sessionControl ${s.id}: no notes[] — LLM has no prose to reason about this control`,
    );
  }
}
for (const t of productionManifest.tools ?? []) {
  if (!t.description || t.description.trim().length === 0) {
    err("tool-description", `${t.id}: empty description`);
  }
}
for (const r of productionManifest.resources ?? []) {
  if (!r.description || r.description.trim().length === 0) {
    err("resource-description", `${r.uri}: empty description`);
  }
}
for (const c of productionManifest.concepts) {
  if (!c.definition || c.definition.trim().length === 0) {
    err("concept-definition", `${c.term}: empty definition`);
  }
}

/* -----------------------------------------------------------------
 * Report
 * ----------------------------------------------------------------- */
if (warnings.length > 0) {
  console.warn(`manifest validation — ${warnings.length} warning(s):`);
  for (const w of warnings) console.warn(`  ⚠  ${w}`);
}
if (errors.length > 0) {
  console.error(`manifest validation FAILED — ${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗  ${e}`);
  process.exit(1);
}
console.log(
  `manifest validation OK — ${productionManifest.macros.length} macros, ${productionManifest.sessionControls.length} session controls, ${productionManifest.concepts.length} concepts, ${productionManifest.grammars.length} grammars, ${(productionManifest.tools ?? []).length} tools, ${(productionManifest.resources ?? []).length} resources`,
);
