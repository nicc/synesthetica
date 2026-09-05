/**
 * Chunk B tests — annotation resources.
 *
 * Exercises the production annotation manifest through the resource
 * builder directly (unit level). MCP transport is exercised
 * end-to-end in Chunk F.
 */

import { describe, it, expect } from "vitest";
import { productionManifest } from "@synesthetica/contracts";
import { buildAnnotationResources } from "../src/resources/annotationResources.js";
import { buildPromptResources } from "../src/resources/promptResources.js";

describe("annotation resource builder", () => {
  const resources = buildAnnotationResources(productionManifest);
  const uris = new Set(resources.map((r) => r.uri));

  it("serves annotations://manifest as a bundled JSON", () => {
    const entry = resources.find((r) => r.uri === "annotations://manifest");
    expect(entry).toBeDefined();
    const parsed = JSON.parse(entry!.read());
    expect(parsed.macros).toBeInstanceOf(Array);
    expect(parsed.sessionControls).toBeInstanceOf(Array);
    expect(parsed.concepts).toBeInstanceOf(Array);
    expect(parsed.grammars).toBeInstanceOf(Array);
  });

  it("serves one URI per macro under annotations://macros/{id}", () => {
    for (const m of productionManifest.macros) {
      const uri = `annotations://macros/${encodeURIComponent(m.id)}`;
      expect(uris.has(uri)).toBe(true);
    }
  });

  it("serves one URI per session control", () => {
    for (const sc of productionManifest.sessionControls) {
      const uri = `annotations://session-controls/${encodeURIComponent(sc.id)}`;
      expect(uris.has(uri)).toBe(true);
    }
  });

  it("serves each concept under BOTH annotations:// and concepts:// URIs", () => {
    for (const c of productionManifest.concepts) {
      expect(uris.has(`annotations://concepts/${encodeURIComponent(c.term)}`)).toBe(true);
      expect(uris.has(`concepts://${encodeURIComponent(c.term)}`)).toBe(true);
    }
  });

  it("serves concepts:// listing", () => {
    const entry = resources.find((r) => r.uri === "concepts://");
    expect(entry).toBeDefined();
    const parsed = JSON.parse(entry!.read());
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed).toHaveLength(productionManifest.concepts.length);
    expect(parsed[0]).toHaveProperty("term");
    expect(parsed[0]).toHaveProperty("definition");
  });

  it("serves one URI per grammar", () => {
    for (const g of productionManifest.grammars) {
      expect(uris.has(`annotations://grammars/${encodeURIComponent(g.id)}`)).toBe(true);
    }
  });

  it("macro descriptions include type + range + default", () => {
    const continuous = resources.find(
      (r) => r.uri === `annotations://macros/${encodeURIComponent("harmony:linger")}`,
    );
    expect(continuous?.description).toContain("continuous");
    expect(continuous?.description).toContain("range");
    expect(continuous?.description).toContain("default");

    const discrete = resources.find(
      (r) =>
        r.uri === `annotations://macros/${encodeURIComponent("rhythm:quantise-resolution")}`,
    );
    expect(discrete?.description).toContain("discrete");
    expect(discrete?.description).toContain("default");

    const compound = resources.find(
      (r) => r.uri === `annotations://macros/${encodeURIComponent("time-horizon")}`,
    );
    expect(compound?.description).toContain("compound");
  });

  it("each resource is readable and returns valid JSON", () => {
    for (const r of resources) {
      const content = r.read();
      expect(() => JSON.parse(content)).not.toThrow();
    }
  });
});

describe("prompt resources", () => {
  const prompts = buildPromptResources();

  it("serves all three canonical prompts", () => {
    expect(Object.keys(prompts).sort()).toEqual([
      "conversational-posture",
      "quiet-posture",
      "system-overview",
    ]);
  });

  it("each prompt has non-empty content", () => {
    for (const [uri, entry] of Object.entries(prompts)) {
      expect(entry.content.length).toBeGreaterThan(50);
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
      void uri;
    }
  });

  it("system-overview references the three grammars", () => {
    const guide = prompts["system-overview"].content;
    expect(guide).toMatch(/dynamics/i);
    expect(guide).toMatch(/rhythm/i);
    expect(guide).toMatch(/harmony/i);
  });

  it("system-overview composes authored prose + auto-generated manifest reference", () => {
    const guide = prompts["system-overview"].content;
    // Authored prose (from system-overview.md) present
    expect(guide).toContain("Synesthetica");
    // Generated reference block appears
    expect(guide).toContain("Full reference (auto-generated");
    expect(guide).toContain("## Macros");
    expect(guide).toContain("## Session controls");
    expect(guide).toContain("## System concepts");
    expect(guide).toContain("## Grammars");
  });

  it("system-overview embeds every macro from the manifest with range + directionality", () => {
    const guide = prompts["system-overview"].content;
    for (const m of productionManifest.macros) {
      expect(guide).toContain(m.id);
    }
    // Spot-check that at least one continuous macro's directionality
    // and notes reached the prompt.
    const linger = productionManifest.macros.find(
      (m): m is Extract<typeof m, { type: "continuous" }> =>
        m.id === "harmony:linger" && m.type === "continuous",
    );
    if (linger) {
      expect(guide).toContain(linger.directionality.low.description);
      expect(guide).toContain(linger.directionality.high.description);
      if (linger.notes?.[0]) expect(guide).toContain(linger.notes[0]);
    }
  });

  it("system-overview embeds every session control from the manifest", () => {
    const guide = prompts["system-overview"].content;
    for (const s of productionManifest.sessionControls) {
      expect(guide).toContain(s.id);
    }
  });

  it("system-overview embeds every concept from the manifest", () => {
    const guide = prompts["system-overview"].content;
    for (const c of productionManifest.concepts) {
      expect(guide).toContain(c.term);
    }
  });
});
