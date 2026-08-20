/**
 * Turns the annotation manifest into an MCP resource index.
 *
 * SPEC 013 §Resources exposes:
 *   annotations://manifest          — bundled JSON (convenience)
 *   annotations://macros/{id}       — one macro annotation
 *   annotations://session-controls/{id}
 *   annotations://concepts/{term}   — one concept annotation
 *   annotations://grammars/{id}
 *   concepts://{term}               — shortcut alias for concepts
 *   concepts://                     — list of all concept terms
 *
 * All content is application/json except the manifest, which is a
 * single blob of the same shape used by the smoke test.
 */

import type {
  MacroAnnotation,
  SessionControlAnnotation,
  SystemConceptAnnotation,
  GrammarAnnotation,
  PresetAnnotation,
} from "@synesthetica/contracts";

export interface AnnotationManifest {
  macros: MacroAnnotation[];
  sessionControls: SessionControlAnnotation[];
  concepts: SystemConceptAnnotation[];
  grammars: GrammarAnnotation[];
  presets?: PresetAnnotation[];
}

export interface ResourceEntry {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read(): string;
}

/**
 * Build a static index of resources for the given manifest.
 * Regenerated whenever annotations change (server startup + reload).
 */
export function buildAnnotationResources(m: AnnotationManifest): ResourceEntry[] {
  const entries: ResourceEntry[] = [];

  // -----------------------------------------------------------------
  // annotations://manifest — bundled
  // -----------------------------------------------------------------
  entries.push({
    uri: "annotations://manifest",
    name: "Annotation manifest (bundled)",
    description:
      "The full annotation manifest as a single JSON document. Convenience for LLMs that prefer one fetch over per-URI browsing.",
    mimeType: "application/json",
    read: () => JSON.stringify(m, null, 2),
  });

  // -----------------------------------------------------------------
  // annotations://macros/{id}
  // -----------------------------------------------------------------
  for (const macro of m.macros) {
    entries.push({
      uri: `annotations://macros/${encodeURIComponent(macro.id)}`,
      name: macro.name ?? macro.id,
      description: describeMacro(macro),
      mimeType: "application/json",
      read: () => JSON.stringify(macro, null, 2),
    });
  }

  // -----------------------------------------------------------------
  // annotations://session-controls/{id}
  // -----------------------------------------------------------------
  for (const sc of m.sessionControls) {
    entries.push({
      uri: `annotations://session-controls/${encodeURIComponent(sc.id)}`,
      name: sc.name ?? sc.id,
      description: describeSessionControl(sc),
      mimeType: "application/json",
      read: () => JSON.stringify(sc, null, 2),
    });
  }

  // -----------------------------------------------------------------
  // annotations://concepts/{term} and concepts://{term}
  // -----------------------------------------------------------------
  for (const concept of m.concepts) {
    entries.push({
      uri: `annotations://concepts/${encodeURIComponent(concept.term)}`,
      name: concept.term,
      description: concept.definition.slice(0, 120),
      mimeType: "application/json",
      read: () => JSON.stringify(concept, null, 2),
    });
    // Shortcut alias
    entries.push({
      uri: `concepts://${encodeURIComponent(concept.term)}`,
      name: concept.term,
      description: concept.definition.slice(0, 120),
      mimeType: "application/json",
      read: () => JSON.stringify(concept, null, 2),
    });
  }

  // concepts:// listing (indexed by term)
  entries.push({
    uri: "concepts://",
    name: "All system concepts",
    description: "List of every concept term available under concepts://<term>",
    mimeType: "application/json",
    read: () =>
      JSON.stringify(
        m.concepts.map((c) => ({ term: c.term, definition: c.definition })),
        null,
        2,
      ),
  });

  // -----------------------------------------------------------------
  // annotations://grammars/{id}
  // -----------------------------------------------------------------
  for (const g of m.grammars) {
    entries.push({
      uri: `annotations://grammars/${encodeURIComponent(g.id)}`,
      name: g.name ?? g.id,
      description: (g.notes?.[0] ?? "").slice(0, 120),
      mimeType: "application/json",
      read: () => JSON.stringify(g, null, 2),
    });
  }

  // -----------------------------------------------------------------
  // annotations://presets/{id}
  // -----------------------------------------------------------------
  for (const p of m.presets ?? []) {
    entries.push({
      uri: `annotations://presets/${encodeURIComponent(p.id)}`,
      name: p.name ?? p.id,
      description: (p.notes?.[0] ?? "").slice(0, 120),
      mimeType: "application/json",
      read: () => JSON.stringify(p, null, 2),
    });
  }

  return entries;
}

function describeMacro(m: MacroAnnotation): string {
  switch (m.type) {
    case "continuous":
      return `${m.name ?? m.id} — continuous, range [${m.range[0]}, ${m.range[1]}], default ${m.default}`;
    case "discrete":
      return `${m.name ?? m.id} — discrete, ${m.enumValues.length} values, default ${JSON.stringify(m.default)}`;
    case "compound":
      return `${m.name ?? m.id} — compound (fans to ${m.targets.length}), range [${m.range[0]}, ${m.range[1]}], default ${m.default}`;
  }
}

function describeSessionControl(sc: SessionControlAnnotation): string {
  const nullable = sc.nullable ? " (nullable)" : "";
  switch (sc.type) {
    case "number":
      return `${sc.name ?? sc.id} — number in [${sc.range[0]}, ${sc.range[1]}]${sc.unit ? ` ${sc.unit}` : ""}${nullable}`;
    case "enum":
      return `${sc.name ?? sc.id} — enum (${sc.enumValues.length} values)${nullable}`;
    case "boolean":
      return `${sc.name ?? sc.id} — boolean${nullable}`;
    case "pair":
      return `${sc.name ?? sc.id} — paired with (${sc.pair[0]}, ${sc.pair[1]})${nullable}`;
  }
}
