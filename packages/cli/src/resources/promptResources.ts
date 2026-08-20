/**
 * Prompt resources per SPEC 013 §Prompts.
 *
 *   posture://quiet             — quiet-performance posture prompt
 *   posture://conversational    — conversational posture prompt
 *   guide://system-overview     — pipeline narrative for LLM context
 *
 * Bodies are loaded from packages/cli/src/prompts/*.md at build time
 * (bundled as strings). Refinement is a docs edit, not a code edit —
 * matches SPEC 013 §Annotation Storage's spirit.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Resolve prompt files relative to the module. `here` = dist/resources
// after build; source promptdir is dist/prompts (tsc copies MD? no,
// only .ts). We ship the prompts alongside the code via a build step
// (see package.json + build script). For now, resolve from the
// source tree if we're running from dist by walking up.
function loadPrompt(filename: string): string {
  // Try dist-adjacent first (bundled), then source (dev).
  const candidates = [
    resolve(here, "..", "prompts", filename),
    resolve(here, "..", "..", "src", "prompts", filename),
    resolve(here, "..", "..", "..", "src", "prompts", filename),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error(`prompt file not found: ${filename} (looked in: ${candidates.join(", ")})`);
}

export interface PromptEntry {
  name: string;
  description: string;
  content: string;
}

export function buildPromptResources(): Record<string, PromptEntry> {
  return {
    "posture://quiet": {
      name: "Quiet posture",
      description: "System prompt fragment for quiet-performance mode",
      content: loadPrompt("posture-quiet.md"),
    },
    "posture://conversational": {
      name: "Conversational posture",
      description: "System prompt fragment for conversational mode",
      content: loadPrompt("posture-conversational.md"),
    },
    "guide://system-overview": {
      name: "System overview",
      description:
        "Prose narrative of the pipeline flow, grammar semantics, and prescribed context. Read once for LLM context.",
      content: loadPrompt("system-overview.md"),
    },
  };
}
