/**
 * Prompt resources per SPEC 013 §Prompts.
 *
 *   posture://quiet             — quiet-performance posture prompt
 *   posture://conversational    — conversational posture prompt
 *   guide://system-overview     — pipeline narrative for LLM context
 *
 * Bodies live in `@synesthetica/contracts/prompts/*.md`. The CLI and
 * the web-app both read the same authoritative copy — no duplication.
 * Resolution uses import.meta.resolve so this works both in the
 * monorepo (workspace symlink) and after npm install.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

// createRequire against this module's URL gives us a resolver that
// works in native Node ESM AND under vitest (which doesn't implement
// import.meta.resolve). We resolve contracts' package.json — a
// stable export — and read the prompts dir relative to it.
const req = createRequire(import.meta.url);

function loadPrompt(filename: string): string {
  const pkgPath = req.resolve("@synesthetica/contracts/package.json");
  const path = resolve(dirname(pkgPath), "prompts", filename);
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `prompt file not found: ${filename} at ${path} (${err instanceof Error ? err.message : err})`,
    );
  }
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
