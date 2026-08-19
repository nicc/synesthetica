/**
 * Generates manifest.json — the LLM-facing representation of the
 * annotations authored in annotations.ts. This is what the LLM would
 * actually receive via MCP resources (concatenated for the smoke test).
 *
 * Run:
 *   node --experimental-strip-types docs/smoke-test/generate-manifest.mjs
 *
 * Regenerate whenever annotations.ts changes.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Node 24+ strips type annotations from .ts imports natively.
// annotations.ts uses only type-only imports, so no runtime deps.
const { smokeTestManifest } = await import("./annotations.ts");

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "manifest.json");

const output = {
  _generated: "manifest.json is generated from annotations.ts — do not edit by hand",
  _how_to_regenerate:
    "node --experimental-strip-types docs/smoke-test/generate-manifest.mjs",
  ...smokeTestManifest,
};

writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
