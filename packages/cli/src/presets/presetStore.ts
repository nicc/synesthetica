/**
 * Filesystem preset store per SPEC 013 §Presets.
 *
 * Presets are shared across instances (one per-user store). Content
 * captures macro values and prescribed context — the musical /
 * aesthetic state. Input source is intentionally excluded: a saved
 * preset may be loaded against a different physical setup (different
 * MIDI device, no mic granted, etc.), and forcing a specific input
 * on load would hijack whatever the user is currently listening to.
 * `activePreset` and `instance` are also excluded (runtime
 * identifiers, not preset content).
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
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { StateSnapshot } from "../engine/engineHandle.js";

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export interface PresetContent {
  version: 1;
  macros: Record<string, number | string>;
  session: StateSnapshot["session"];
  savedAt: string; // ISO
}

/** Preset summary — what presets:// resource returns for each entry. */
export interface PresetSummary {
  name: string;
  savedAt: string; // ISO
  /** Prescribed context at save time, for LLM to eyeball. */
  session: PresetContent["session"];
}

export interface PresetStore {
  save(name: string, snapshot: StateSnapshot): void;
  load(name: string): PresetContent | null;
  /** Remove a preset from disk. Returns true if a file was deleted,
   *  false if no preset by that name existed. Throws on invalid name
   *  (same rules as save). */
  delete(name: string): boolean;
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
        // Save the user-facing intents, not the consumer-derived
        // effective values — presets record "what the user asked for"
        // so replaying reproduces the same intent. Input is
        // deliberately not captured (see file header).
        macros: { ...snapshot.macros.intents },
        session: snapshot.session,
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

    delete(name) {
      if (!NAME_RE.test(name)) {
        throw new Error(
          `invalid preset name '${name}' — alphanumeric, hyphens, underscores; max 64 chars`,
        );
      }
      const path = join(dir, `${name}.json`);
      if (!existsSync(path)) return false;
      unlinkSync(path);
      return true;
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
