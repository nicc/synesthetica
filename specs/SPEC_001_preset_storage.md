# SPEC 001: Preset Storage

Status: Approved (revised 2026-10-22 to match the implementation)
Date: 2026-01-14

## Summary

Defines how presets (user configurations) are stored and managed.

The original decisions (bundled builtin presets, browser `localStorage`, `builtin:`/`user:` id prefixes, an `IPresetCatalog` abstraction) were replaced when presets moved behind the CLI and MCP control plane (SPEC_013 §Presets are shared, not per-instance). This spec now describes that implementation.

## Decisions

### Storage Location

- **User presets**: one JSON file per preset in a per-user directory, `$XDG_DATA_HOME/synesthetica/presets/<name>.json`. Without `XDG_DATA_HOME` it falls back to `~/Library/Application Support/synesthetica/presets/` on macOS, `%APPDATA%\synesthetica\presets\` on Windows, and `~/.local/share/synesthetica/presets/` elsewhere.
- **Builtin presets**: none ship. Presets are user-managed at runtime.

The store is shared by every instance the user runs.

### Names

A preset's name is its filename without `.json`. Names are 1–64 characters of letters, digits, hyphens and underscores. There is no id namespace or prefix.

### Collision Handling

Saving under an existing name **overwrites** it (last write wins). This avoids recall ambiguity — saying "use practice mode" always resolves to exactly one preset.

### No Inheritance

Presets are standalone snapshots. Saving captures the current state in full; there is no reference to any preset that was loaded before, so later changes to one preset never affect another.

### Content

```ts
interface PresetContent {
  version: 1;
  macros: Record<string, MacroValue>;      // user-facing macro intents, not effective values
  session: EngineStateSnapshot["session"]; // prescribed key/tempo/meter, chord mode, etc.
  savedAt: string;                         // ISO timestamp
}
```

Input source, `activePreset` and instance label are excluded: a preset may be loaded against a different physical setup, and loading one must not switch the active input device.

### Storage Interface

```ts
interface PresetStore {
  save(name: string, snapshot: EngineStateSnapshot): void;
  load(name: string): PresetContent | null;
  delete(name: string): boolean;
  list(): string[];
  listWithMeta(): PresetSummary[];
  storePath(): string;
}
```

MCP tools (`list_presets`, `get_preset`, `switch_preset`, `save_preset`, `delete_preset`) and the `presets://` resources are the only callers; see SPEC_013.

`IPresetCatalog`, `PresetMeta`, `PresetSource` and `ValidationResult` in `packages/contracts/config/preset.ts` are from the original design and have no implementation.

### Validation

- `save` and `delete` throw on an invalid name.
- `load` returns `null` for an unknown or invalid name and throws on an unsupported `version`.
- `listWithMeta` skips unreadable, malformed or wrong-version files silently.

## Implementation

`createPresetStore` in `packages/cli/src/presets/presetStore.ts`.
