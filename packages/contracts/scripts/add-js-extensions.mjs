#!/usr/bin/env node
/**
 * Post-build pass for contracts/dist.
 *
 * TypeScript's `moduleResolution: bundler` accepts extension-less
 * relative imports in source, and emits them extension-less in the
 * output. That's fine when a bundler (Vite, Webpack) consumes the
 * package, but Node ESM (used by the CLI at runtime) requires the
 * explicit .js extension.
 *
 * This script walks dist/**\/*.{js,d.ts} and rewrites relative
 * imports/exports to include the .js extension when a matching file
 * exists on disk. Directory imports get /index.js appended.
 *
 * Zero-op when extensions are already present.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "..", "dist");

if (!existsSync(distRoot)) {
  console.error(`no dist at ${distRoot} — nothing to do`);
  process.exit(0);
}

let touched = 0;

for (const file of walk(distRoot)) {
  if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
  const original = readFileSync(file, "utf8");
  const fixed = rewriteImports(original, dirname(file));
  if (fixed !== original) {
    writeFileSync(file, fixed);
    touched++;
  }
}
console.log(`add-js-extensions: rewrote ${touched} file(s) under dist/`);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function rewriteImports(source, fromDir) {
  // Match:  import ... from "./foo"    export * from "../bar/baz"
  //         import("./x")               (dynamic imports, rare in dist)
  //         export { ... } from "./x"
  const re = /((?:from|import)\s*\(?\s*)(["'])(\.\.?\/[^"']+)\2/g;
  return source.replace(re, (m, kw, quote, spec) => {
    if (/\.[a-z0-9]+$/i.test(spec)) return m; // has an extension already
    const candidate = resolve(fromDir, spec);
    if (existsSync(candidate + ".js")) return `${kw}${quote}${spec}.js${quote}`;
    if (existsSync(join(candidate, "index.js"))) {
      return `${kw}${quote}${spec}/index.js${quote}`;
    }
    // Leave unchanged — let Node complain rather than fabricate a path.
    return m;
  });
}
