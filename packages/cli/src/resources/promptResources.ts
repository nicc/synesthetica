/**
 * Prompt resources — MCP prompt registry + CLI-side composer wrapper.
 *
 * The main composer lives in @synesthetica/contracts so both the CLI
 * (via get_started) and the web-app's About panel can render the
 * identical primer text. This file supplies the CLI's Node-only
 * pieces:
 *
 * - `loadPrompt` — filesystem read for the authored markdown.
 * - `computePrimerToken` — sha256 fingerprint via node:crypto.
 * - `composeSystemOverview` — thin wrapper that reads the .md and
 *   delegates to the shared composer, then memoises the result.
 * - `buildPromptResources` — MCP prompt registry (currently empty;
 *   kept wired for future prompt content).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { composeSystemOverview as composeFromMd } from "@synesthetica/contracts";

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

/**
 * Prompt registry currently empty — see the file-level doc for the
 * history (system-overview moved to a tool; posture prompts dropped
 * with the verbosity axis). MCP prompt handlers stay wired so a
 * future prompt can slot in without re-plumbing.
 */
export function buildPromptResources(): Record<string, PromptEntry> {
  return {};
}

/**
 * Fingerprint of the current primer text — a stable, short hex string
 * derived from the composed system-overview content. Returned by
 * `get_started` and required as the `primer` argument on every other
 * tool call so the server can refuse work from callers that haven't
 * called `get_started` for this primer version.
 *
 * SHA-256 truncated to 16 hex chars (64 bits) — this is a
 * fingerprint, not a secret, so the truncation is fine and the
 * shorter form saves LLM tokens across many calls. Recomputing at
 * call time makes primer edits invalidate outstanding tokens for
 * free: change system-overview.md or a manifest annotation, and the
 * next tool call is rejected with the fresh primer + fresh token
 * attached — the LLM re-reads and retries with the new token.
 */
export function computePrimerToken(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Compose the full system-overview text for the get_started tool.
 * Reads the authored .md from disk and hands it to the shared
 * composer in contracts. Memoised — the inputs are baked into the
 * build, so the result is invariant for the process lifetime, and
 * the primer gate calls this on every non-get_started tool.
 */
let cachedSystemOverview: string | null = null;
export function composeSystemOverview(): string {
  if (cachedSystemOverview !== null) return cachedSystemOverview;
  cachedSystemOverview = composeFromMd(loadPrompt("system-overview.md"));
  return cachedSystemOverview;
}
