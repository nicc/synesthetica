/**
 * MCP resources backed by the preset store.
 *
 *   presets://                — fixed URI, list of preset summaries
 *                                (name, savedAt, session, input)
 *   presets://<name>          — template URI, full preset content
 *
 * The switch/save/load surface stays as MCP tools (verbs); this
 * exposes the READ surface (nouns) — the piece the LLM needs to
 * decide which preset to switch to before it calls switch_preset.
 *
 * The index entry is a normal async resource (fixed URI). Per-preset
 * entries are TEMPLATE routing: the mcpServer detects `presets://<x>`
 * URIs and calls `readByName` here. Templates are advertised via
 * ListResourceTemplates so MCP clients that browse templates see the
 * shape.
 */

import type { PresetStore } from "./presetStore.js";
import type { AsyncResourceEntry } from "../state/stateResources.js";

export interface PresetResourceHandlers {
  /** Async entries with fixed URIs — plug into the CLI's asyncIndex. */
  entries: AsyncResourceEntry[];
  /** True when the URI matches the per-preset template shape. */
  matchesItemUri(uri: string): boolean;
  /** Read a per-preset URI. Throws on unknown name. */
  readItemUri(uri: string): Promise<{ mimeType: string; text: string }>;
}

export function buildPresetResources(store: PresetStore): PresetResourceHandlers {
  const entries: AsyncResourceEntry[] = [
    {
      uri: "presets://",
      name: "Presets — index",
      description:
        "List of saved preset summaries (name + savedAt + session + input at save time). Use switch_preset(name) to load one, or read presets://<name> for the full content.",
      mimeType: "application/json",
      subscribable: false,
      async read() {
        return JSON.stringify(store.listWithMeta(), null, 2);
      },
    },
  ];

  return {
    entries,
    matchesItemUri(uri: string): boolean {
      // presets:// (bare) is the index — NOT an item URI.
      // presets://<name> (non-empty tail) is an item.
      const m = uri.match(/^presets:\/\/(.+)$/);
      return m !== null && m[1].length > 0;
    },
    async readItemUri(uri: string): Promise<{ mimeType: string; text: string }> {
      const m = uri.match(/^presets:\/\/(.+)$/);
      if (!m || m[1].length === 0) {
        throw new Error(
          `presets://<name> requires a name in the URI (e.g. presets://jazz-comping)`,
        );
      }
      const name = decodeURIComponent(m[1]);
      const content = store.load(name);
      if (!content) {
        throw new Error(
          `preset '${name}' not found. Available: ${store.list().join(", ") || "(none)"}`,
        );
      }
      return { mimeType: "application/json", text: JSON.stringify(content, null, 2) };
    },
  };
}
