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
import { buildPromptResources, composeSystemOverview } from "../src/resources/promptResources.js";

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
    expect(parsed.lenses).toBeInstanceOf(Array);
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

  it("serves one URI per lens", () => {
    for (const g of productionManifest.lenses) {
      expect(uris.has(`annotations://lenses/${encodeURIComponent(g.id)}`)).toBe(true);
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

  it("returns an empty registry today (system-overview → get_started; posture prompts dropped with the verbosity axis)", () => {
    expect(Object.keys(prompts)).toEqual([]);
  });
});

/**
 * The composed system-overview content used to live behind
 * `guide://system-overview` / prompts["system-overview"]. It moved to
 * the `get_started` MCP tool in Route 1 (SPEC 014 §Lifecycle) — the
 * content generator itself is unchanged, so we keep exercising it
 * directly to guard against regressions in shape.
 */
describe("composed system overview (used by get_started)", () => {
  const guide = composeSystemOverview();

  it("references the three lenses", () => {
    expect(guide).toMatch(/dynamics/i);
    expect(guide).toMatch(/rhythm/i);
    expect(guide).toMatch(/harmony/i);
  });

  it("composes authored prose + auto-generated manifest reference", () => {
    expect(guide).toContain("Synesthetica");
    expect(guide).toContain("Full reference (auto-generated");
    expect(guide).toContain("## Macros");
    expect(guide).toContain("## Session controls");
    expect(guide).toContain("## System concepts");
    expect(guide).toContain("## Lenses");
  });

  it("embeds every macro from the manifest with range + directionality", () => {
    for (const m of productionManifest.macros) {
      expect(guide).toContain(m.id);
    }
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

  it("embeds every session control from the manifest", () => {
    for (const s of productionManifest.sessionControls) {
      expect(guide).toContain(s.id);
    }
  });

  it("embeds every concept from the manifest", () => {
    for (const c of productionManifest.concepts) {
      expect(guide).toContain(c.term);
    }
  });
});
