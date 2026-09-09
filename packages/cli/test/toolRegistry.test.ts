import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildToolRegistry } from "../src/tools/registry.js";
import { createPresetStore } from "../src/presets/presetStore.js";
import { SessionManager } from "../src/session/sessionManager.js";
import { productionManifest } from "@synesthetica/contracts";

function makeSession() {
  return new SessionManager({
    instanceLabel: "default",
    openBrowser: false,
    browser: "chrome",
  });
}

describe("tool registry — descriptions come from manifest", () => {
  it("registered tools carry the manifest's description verbatim", () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-registry-"));
    const store = createPresetStore(dir);
    const registry = buildToolRegistry(store, makeSession());
    for (const t of productionManifest.tools ?? []) {
      const registered = registry.get(t.id);
      expect(registered, `tool ${t.id} must be registered`).toBeDefined();
      expect(registered!.description).toBe(t.description);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("every non-get_started tool has `primer` as a required inputSchema field", () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-registry-primer-"));
    const store = createPresetStore(dir);
    const registry = buildToolRegistry(store, makeSession());
    for (const [name, spec] of registry) {
      const schema = spec.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      if (name === "get_started") {
        expect(schema.properties?.primer).toBeUndefined();
      } else {
        expect(schema.properties?.primer, `${name} must declare primer property`).toBeDefined();
        expect(
          schema.required?.includes("primer"),
          `${name} must require primer`,
        ).toBe(true);
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("every code-registered tool has a manifest annotation (no orphans)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-registry-"));
    const store = createPresetStore(dir);
    const registry = buildToolRegistry(store, makeSession());
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
