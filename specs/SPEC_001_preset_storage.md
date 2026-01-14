# SPEC 001: Preset Storage

Status: Approved
Date: 2026-01-14

## Summary

Defines how presets (user configurations) are stored and managed.

## Decisions

### Storage Location

- **Builtin presets**: Bundled with app code in `packages/presets/builtin/`
- **User presets**: Browser `localStorage` for v0

### ID Namespace

Presets use prefixed IDs to distinguish source:
- `builtin:starfield` — shipped with the app
- `user:practice-mode` — created by user

### Collision Handling

Name collisions in user presets result in **overwrites** (last write wins). This avoids recall ambiguity — saying "use practice mode" always resolves to exactly one preset.

### No Inheritance

User presets are standalone copies, not derivatives. When a user loads a builtin preset, modifies it, and saves:
- A complete copy is stored under a new user ID
- No reference to the original builtin is retained
- Changes to builtins (e.g. app updates) do not affect saved user presets

### Storage Interface

The `IPresetCatalog` interface abstracts storage:
```ts
interface IPresetCatalog {
  list(): PresetMeta[];
  get(id: string): Preset | null;
  save(preset: Preset): ValidationResult;
  delete(id: string): boolean;
  exportUser(): string;
  importUser(json: string): ValidationResult;
}
```

v0 uses localStorage; the interface allows future migration to IndexedDB or file-based storage.

### Validation

- Presets validated at load time
- Invalid presets are skipped with warnings, not fatal errors
- Presets referencing unknown styles are loaded but flagged

## Contract Location

Types defined in `packages/contracts/config/preset.ts`:
- `PresetSource`
- `PresetMeta`
- `ValidationResult`
- `IPresetCatalog`
