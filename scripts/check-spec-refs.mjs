#!/usr/bin/env node
/**
 * check-spec-refs — keep specs/SPEC_*.md pointing at code that exists.
 *
 * CLAUDE.md treats specs as canonical: code and specs must match. This
 * catches the mechanical half of drift — references that no longer
 * resolve. It does not judge whether prose is still true.
 *
 * For every specs/SPEC_*.md (RFCs are exploratory and exempt):
 *   (a) every `packages/...` path, in backticks or a markdown link, must
 *       exist relative to the repo root (a trailing :line or #anchor is
 *       ignored; `{a,b}` lists are expanded; paths with a `<placeholder>`
 *       or `*` glob are skipped as templates);
 *   (b) every backticked identifier that looks like an interface
 *       (`IFooBar`) or a PascalCase component name ending in Stabilizer,
 *       Lens, Vocabulary, Renderer, Compositor, Adapter or Registry must
 *       appear somewhere in packages/<pkg>/src or packages/contracts;
 *   (c) retired terms ("Grammar", "Ruleset") must not appear, except on
 *       lines that mark history (containing "renamed" or "formerly").
 *
 * Prints `file:line: message` per violation; exits 1 if there are any.
 * Run with `npm run check:specs` (also part of `npm run lint`).
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const specDir = join(root, "specs");

const PATH_RE = /(?:`|\]\()(packages\/[^`)\s]+?)(?::\d+(?:-\d+)?)?(?:#[^`)\s]*)?(?:`|\))/g;
const IDENT_RE =
  /`(I[A-Z][A-Za-z]+|[A-Z][A-Za-z0-9]*(?:Stabilizer|Lens|Vocabulary|Renderer|Compositor|Adapter|Registry))`/g;
const RETIRED_RE = /\b(grammars?|rulesets?)\b/gi;
const HISTORY_RE = /renamed|formerly/i;

/** All source text under packages/<pkg>/src and packages/contracts, concatenated. */
function loadSourceCorpus() {
  const chunks = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) chunks.push(readFileSync(p, "utf8"));
    }
  };
  const pkgs = join(root, "packages");
  for (const pkg of readdirSync(pkgs)) {
    const dir = pkg === "contracts" ? join(pkgs, pkg) : join(pkgs, pkg, "src");
    if (existsSync(dir)) walk(dir);
  }
  return chunks.join("\n");
}

/** Expand one `{a,b,c}` group: "x/{a,b}.ts" → ["x/a.ts", "x/b.ts"]. */
function expandBraces(path) {
  const m = path.match(/^(.*?)\{([^}]+)\}(.*)$/);
  return m ? m[2].split(",").map((alt) => m[1] + alt + m[3]) : [path];
}

const corpus = loadSourceCorpus();
const identCache = new Map();
const identExists = (name) => {
  if (!identCache.has(name)) identCache.set(name, new RegExp(`\\b${name}\\b`).test(corpus));
  return identCache.get(name);
};

const violations = [];
const specs = readdirSync(specDir).filter((f) => /^SPEC_.*\.md$/.test(f)).sort();

for (const file of specs) {
  const rel = relative(root, join(specDir, file));
  const lines = readFileSync(join(specDir, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    for (const [, ref] of line.matchAll(PATH_RE)) {
      if (/[<*]/.test(ref)) continue;
      for (const path of expandBraces(ref)) {
        if (!existsSync(join(root, path))) violations.push(`${at}: path does not exist: ${path}`);
      }
    }
    for (const [, name] of line.matchAll(IDENT_RE)) {
      if (!identExists(name)) violations.push(`${at}: identifier not found in packages: ${name}`);
    }
    if (!HISTORY_RE.test(line)) {
      for (const [term] of line.matchAll(RETIRED_RE)) {
        violations.push(`${at}: retired term "${term}" (grammar → lens, ruleset → vocabulary)`);
      }
    }
  });
}

for (const v of violations) console.log(v);
if (violations.length > 0) {
  console.log(`\n${violations.length} spec reference problem(s) in ${specs.length} specs.`);
  process.exit(1);
}
console.log(`check-spec-refs: ${specs.length} specs OK.`);
