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
  it("registered tools carry the manifest's description (with the get_started hint appended where applicable)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-registry-"));
    const store = createPresetStore(dir);
    const registry = buildToolRegistry(store, makeSession());
    const NO_HINT = new Set(["get_started", "start_session", "stop_session"]);
    for (const t of productionManifest.tools ?? []) {
      const registered = registry.get(t.id);
      expect(registered, `tool ${t.id} must be registered`).toBeDefined();
      if (NO_HINT.has(t.id)) {
        expect(registered!.description).toBe(t.description);
      } else {
        expect(registered!.description.startsWith(t.description)).toBe(true);
        expect(registered!.description).toContain("get_started");
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
