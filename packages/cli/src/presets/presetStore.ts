/**
 * Filesystem preset store per SPEC 013 §Presets.
 *
 * Presets are shared across instances (one per-user store). Content
 * captures macro values, prescribed context, and input source —
 * everything on the state snapshot except `activePreset` and
 * `instance` (both are runtime identifiers, not preset content).
 *
 * Storage: $XDG_DATA_HOME/synesthetica/presets/<name>.json
 * Falls back to $HOME/.local/share/synesthetica/presets/ on Linux
 * and ~/Library/Application Support/synesthetica/presets/ on macOS.
 *
 * Preset name is the filename minus .json. Names are constrained
 * to alphanumeric + hyphens + underscores to keep filesystem
 * behaviour predictable.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { StateSnapshot } from "../engine/engineHandle.js";

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export interface PresetContent {
  version: 1;
  macros: Record<string, number | string>;
  session: StateSnapshot["session"];
  input: string | null;
  savedAt: string; // ISO
}

/** Preset summary — what presets:// resource returns for each entry. */
export interface PresetSummary {
  name: string;
  savedAt: string; // ISO
  /** Prescribed context at save time, for LLM to eyeball. */
  session: PresetContent["session"];
  input: PresetContent["input"];
}

export interface PresetStore {
  save(name: string, snapshot: StateSnapshot): void;
  load(name: string): PresetContent | null;
  list(): string[];
  /** Same as list() but with saved metadata — used by the presets:// MCP resource. */
  listWithMeta(): PresetSummary[];
  storePath(): string;
}

export function createPresetStore(overrideDir?: string): PresetStore {
  const dir = overrideDir ?? defaultPresetDir();
  mkdirSync(dir, { recursive: true });

  return {
    storePath: () => dir,

    save(name, snapshot) {
      if (!NAME_RE.test(name)) {
        throw new Error(
          `invalid preset name '${name}' — alphanumeric, hyphens, underscores; max 64 chars`,
        );
      }
      const content: PresetContent = {
        version: 1,
        macros: snapshot.macros,
        session: snapshot.session,
        input: snapshot.input,
        savedAt: new Date().toISOString(),
      };
      writeFileSync(join(dir, `${name}.json`), JSON.stringify(content, null, 2) + "\n");
    },

    load(name) {
      if (!NAME_RE.test(name)) return null;
      const path = join(dir, `${name}.json`);
      if (!existsSync(path)) return null;
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw) as PresetContent;
      if (parsed.version !== 1) {
        throw new Error(`unsupported preset version: ${parsed.version} (expected 1)`);
      }
      return parsed;
    },

    list() {
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -".json".length))
        .filter((n) => NAME_RE.test(n))
        .sort();
    },

    listWithMeta() {
      if (!existsSync(dir)) return [];
      const summaries: PresetSummary[] = [];
      for (const name of this.list()) {
        try {
          const raw = readFileSync(join(dir, `${name}.json`), "utf8");
          const parsed = JSON.parse(raw) as PresetContent;
          if (parsed.version !== 1) continue;
          summaries.push({
            name,
            savedAt: parsed.savedAt,
            session: parsed.session,
            input: parsed.input,
          });
        } catch {
          // Skip unreadable / malformed entries silently — the LLM
          // sees only what the store can produce cleanly.
        }
      }
      return summaries;
    },
  };
}

function defaultPresetDir(): string {
  // XDG on Linux; platform-appropriate elsewhere.
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return join(xdg, "synesthetica", "presets");
  const home = homedir();
  if (platform() === "darwin") {
    return join(home, "Library", "Application Support", "synesthetica", "presets");
  }
  if (platform() === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "synesthetica", "presets");
  }
  return join(home, ".local", "share", "synesthetica", "presets");
}
