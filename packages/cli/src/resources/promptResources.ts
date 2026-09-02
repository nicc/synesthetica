/**
 * Prompt resources per SPEC 013 §Prompts.
 *
 *   posture://quiet             — quiet-performance posture prompt
 *   posture://conversational    — conversational posture prompt
 *   guide://system-overview     — pipeline narrative + auto-generated
 *                                 macro / session / concept / grammar
 *                                 reference, composed from the
 *                                 authoritative manifest
 *
 * Bodies live in `@synesthetica/contracts/prompts/*.md`. The CLI and
 * the web-app both read the same authoritative copy — no duplication.
 * Resolution uses createRequire so this works both in the monorepo
 * (workspace symlink) and after npm install; unlike import.meta.resolve
 * it also works under vitest.
 *
 * The system-overview prompt composes the authored prose with a
 * generated reference block. This puts every macro's directionality,
 * range, and notes into the LLM's context on connection, so per-macro
 * `annotations://` reads become optional detail rather than the only
 * path to those facts. Manifest edits flow into the prompt
 * automatically — no drift.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import {
  productionManifest,
  type MacroAnnotation,
  type SessionControlAnnotation,
  type SystemConceptAnnotation,
  type GrammarAnnotation,
} from "@synesthetica/contracts";

const req = createRequire(import.meta.url);

function loadPrompt(filename: string): string {
  const pkgPath = req.resolve("@synesthetica/contracts/package.json");
  const path = resolve(dirname(pkgPath), "prompts", filename);
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `prompt file not found: ${filename} at ${path} (${err instanceof Error ? err.message : err})`,
    );
  }
}

export interface PromptEntry {
  name: string;
  description: string;
  content: string;
}

export function buildPromptResources(): Record<string, PromptEntry> {
  return {
    "posture://quiet": {
      name: "Quiet posture",
      description: "System prompt fragment for quiet-performance mode",
      content: loadPrompt("posture-quiet.md"),
    },
    "posture://conversational": {
      name: "Conversational posture",
      description: "System prompt fragment for conversational mode",
      content: loadPrompt("posture-conversational.md"),
    },
    "guide://system-overview": {
      name: "System overview",
      description:
        "Pipeline narrative + full macro/session/concept/grammar reference. Attach at conversation start; primary bootstrap context.",
      content: composeSystemOverview(),
    },
  };
}

/* ------------------------------------------------------------------
 * Composition — narrative + generated reference
 * ------------------------------------------------------------------ */

function composeSystemOverview(): string {
  const sections: string[] = [
    loadPrompt("system-overview.md").trimEnd(),
    "",
    "---",
    "",
    "# Full reference (auto-generated from the annotation manifest)",
    "",
    "Every macro, session control, concept, and grammar the engine exposes appears below. Ranges, directionality, and notes come directly from the manifest — use these values when composing tool calls. Per-URI `annotations://` reads remain available for the same content on demand.",
    "",
    "## Macros",
    "",
    productionManifest.macros.map(renderMacro).join("\n\n"),
    "",
    "## Session controls",
    "",
    productionManifest.sessionControls.map(renderSessionControl).join("\n\n"),
    "",
    "## System concepts",
    "",
    productionManifest.concepts.map(renderConcept).join("\n\n"),
    "",
    "## Grammars",
    "",
    productionManifest.grammars.map(renderGrammar).join("\n\n"),
    "",
  ];
  return sections.join("\n");
}

function renderMacro(m: MacroAnnotation): string {
  const lines: string[] = [];
  lines.push(`### \`${m.id}\` — ${m.name ?? m.id}`);
  if (m.aliases?.length) lines.push(`Aliases: ${m.aliases.join(", ")}`);
  if (m.affects?.length) lines.push(`Affects: ${m.affects.join(", ")}`);

  switch (m.type) {
    case "continuous":
      lines.push(
        `Type: continuous, range [${m.range[0]}, ${m.range[1]}], default ${m.default}`,
      );
      lines.push(`Low: ${m.directionality.low.description}`);
      if (m.directionality.low.tendsTo?.length) {
        lines.push(`  tends to: ${m.directionality.low.tendsTo.join("; ")}`);
      }
      lines.push(`High: ${m.directionality.high.description}`);
      if (m.directionality.high.tendsTo?.length) {
        lines.push(`  tends to: ${m.directionality.high.tendsTo.join("; ")}`);
      }
      break;
    case "discrete":
      lines.push(
        `Type: discrete, default ${JSON.stringify(m.default)}`,
      );
      lines.push(
        `Values: ${m.enumValues.map((v) => `${JSON.stringify(v.value)} (${v.label})`).join(", ")}`,
      );
      break;
    case "compound": {
      lines.push(
        `Type: compound, range [${m.range[0]}, ${m.range[1]}], default ${m.default}`,
      );
      const targetLabels = m.targets.map((t) => {
        if (typeof t === "string") return t;
        return t.invert ? `${t.id} (inverted)` : t.id;
      });
      lines.push(
        targetLabels.length > 0
          ? `Fans out to: ${targetLabels.join(", ")}`
          : `Fans out to: (none wired yet — no-op until targets are exposed as macros)`,
      );
      lines.push(`Low: ${m.directionality.low.description}`);
      lines.push(`High: ${m.directionality.high.description}`);
      break;
    }
  }

  if (m.notes?.length) {
    lines.push("Notes:");
    for (const n of m.notes) lines.push(`- ${n}`);
  }
  if (m.cautions?.length) {
    lines.push("Cautions:");
    for (const c of m.cautions) lines.push(`- ${c}`);
  }
  return lines.join("\n");
}

function renderSessionControl(s: SessionControlAnnotation): string {
  const lines: string[] = [];
  lines.push(`### \`${s.id}\` — ${s.name ?? s.id}`);
  if (s.aliases?.length) lines.push(`Aliases: ${s.aliases.join(", ")}`);
  lines.push(`Nullable: ${s.nullable}`);

  switch (s.type) {
    case "number":
      lines.push(
        `Type: number, range [${s.range[0]}, ${s.range[1]}]${s.unit ? ` ${s.unit}` : ""}`,
      );
      break;
    case "enum": {
      const opts = s.dynamicOptions
        ? "(dynamic — runtime-populated)"
        : s.enumValues.map((v) => `${JSON.stringify(v.value)} (${v.label})`).join(", ");
      const dflt = s.default !== undefined ? `, default ${JSON.stringify(s.default)}` : "";
      lines.push(`Type: enum${dflt}`);
      lines.push(`Values: ${opts}`);
      break;
    }
    case "boolean":
      lines.push(`Type: boolean`);
      break;
    case "pair":
      lines.push(`Type: pair — set both together (${s.pair[0]} + ${s.pair[1]})`);
      break;
  }

  if (s.notes?.length) {
    lines.push("Notes:");
    for (const n of s.notes) lines.push(`- ${n}`);
  }
  if (s.cautions?.length) {
    lines.push("Cautions:");
    for (const c of s.cautions) lines.push(`- ${c}`);
  }
  return lines.join("\n");
}

function renderConcept(c: SystemConceptAnnotation): string {
  const lines: string[] = [`### ${c.term}`, c.definition];
  if (c.related?.length) lines.push(`Related: ${c.related.join(", ")}`);
  if (c.examples?.length) {
    lines.push("Examples:");
    for (const e of c.examples) lines.push(`- ${e}`);
  }
  return lines.join("\n");
}

function renderGrammar(g: GrammarAnnotation): string {
  const lines: string[] = [`### \`${g.id}\` — ${g.name ?? g.id}`];
  if (g.aliases?.length) lines.push(`Aliases: ${g.aliases.join(", ")}`);
  if (g.illustrates?.length) lines.push(`Illustrates: ${g.illustrates.join(", ")}`);
  if (g.traits?.length) lines.push(`Traits: ${g.traits.join(", ")}`);
  if (g.notes?.length) {
    lines.push("Notes:");
    for (const n of g.notes) lines.push(`- ${n}`);
  }
  if (g.cautions?.length) {
    lines.push("Cautions:");
    for (const c of g.cautions) lines.push(`- ${c}`);
  }
  if (g.macroResponses && Object.keys(g.macroResponses).length > 0) {
    lines.push("Macro responses:");
    for (const [macroId, resp] of Object.entries(g.macroResponses)) {
      const suffix = resp.notes ? ` — ${resp.notes}` : "";
      lines.push(`- \`${macroId}\`: ${resp.responsiveness}${suffix}`);
    }
  }
  return lines.join("\n");
}
