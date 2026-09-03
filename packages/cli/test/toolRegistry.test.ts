import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildToolRegistry } from "../src/tools/registry.js";
import { createPresetStore } from "../src/presets/presetStore.js";
import { productionManifest } from "@synesthetica/contracts";

describe("tool registry — descriptions come from manifest", () => {
  it("registered tools carry the manifest's description, not the code default", () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-registry-"));
    const store = createPresetStore(dir);
    const registry = buildToolRegistry(store);
    // Every annotated tool's description should match the manifest.
    for (const t of productionManifest.tools ?? []) {
      const registered = registry.get(t.id);
      expect(registered, `tool ${t.id} must be registered`).toBeDefined();
      expect(registered!.description).toBe(t.description);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("every code-registered tool has a manifest annotation (no orphans)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-registry-"));
    const store = createPresetStore(dir);
    const registry = buildToolRegistry(store);
    const annotatedIds = new Set(
      (productionManifest.tools ?? []).map((t) => t.id),
    );
    const missing: string[] = [];
    for (const name of registry.keys()) {
      if (!annotatedIds.has(name)) missing.push(name);
    }
    expect(missing).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});
