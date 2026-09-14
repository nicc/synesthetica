#!/usr/bin/env node
/**
 * Bundle the CLI for publication.
 *
 * The CLI's TypeScript sources import from @synesthetica/* workspace
 * packages that stay private-to-the-monorepo per C1 in
 * synesthetica-qo6j: "only `synesthetica` gets published". tsc alone
 * leaves those imports intact in the emitted dist, which would 404
 * at runtime for anyone running `npx synesthetica` — the transitive
 * @synesthetica/* packages aren't on the npm registry.
 *
 * This script runs AFTER tsc (which emits .d.ts for the library entry)
 * and:
 *   1. esbuild bundles src/bin.ts and src/index.ts, inlining every
 *      `@synesthetica/*` import. Real npm dependencies
 *      (@modelcontextprotocol/sdk, ws) and node builtins stay
 *      external so the bundle stays small.
 *   2. Copies contracts/prompts/*.md into dist/prompts/ so
 *      promptResources.ts can readFileSync them at runtime from
 *      the CLI's own dist location (see the CLI_DIST_DIR resolver
 *      at the top of promptResources.ts).
 *   3. Chmods the bin so `npx synesthetica` can execute it.
 */

import { build } from "esbuild";
import { cp, chmod, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");
const distDir = join(cliRoot, "dist");
const contractsRoot = resolve(cliRoot, "..", "contracts");

const external = [
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/sdk/*",
  "ws",
];

async function bundle(entry, outfile, banner) {
  await build({
    entryPoints: [join(cliRoot, entry)],
    outfile: join(cliRoot, outfile),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    external,
    logLevel: "info",
    allowOverwrite: true,
    // Keep readable stack traces — this is a Node CLI, not a size-
    // sensitive browser bundle.
    minify: false,
    banner: banner ? { js: banner } : undefined,
  });
}

async function copyPrompts() {
  const src = join(contractsRoot, "prompts");
  const dst = join(distDir, "prompts");
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".md")) {
      await cp(join(src, e.name), join(dst, e.name));
    }
  }
}

/**
 * Drop tsc's per-file .js/.js.map output. tsc still runs upstream
 * so we get .d.ts type declarations, but its emitted .js files
 * carry raw `@synesthetica/*` imports that would 404 at runtime in
 * the published tarball. esbuild replaces bin.js and index.js
 * with fully-inlined bundles; every other .js file tsc produced
 * would ship broken. Clean them out first, then bundle.
 *
 * Preserves: .d.ts, .d.ts.map (types + type-source maps),
 * dist/prompts/ (populated by copyPrompts below), dist/static/
 * (populated by bundle-webapp.mjs afterwards).
 */
async function pruneCompiledJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "prompts" || e.name === "static") continue;
      await pruneCompiledJs(full);
    } else if (e.isFile() && (e.name.endsWith(".js") || e.name.endsWith(".js.map"))) {
      await rm(full);
    }
  }
}

async function main() {
  await pruneCompiledJs(distDir);
  // No explicit shebang banner — src/bin.ts opens with #!/usr/bin/env
  // node and esbuild passes source shebangs through unchanged. Adding
  // a banner on top of that produced a doubled shebang and a
  // SyntaxError at load.
  await bundle("src/bin.ts", "dist/bin.js");
  await bundle("src/index.ts", "dist/index.js");
  await copyPrompts();
  await chmod(join(distDir, "bin.js"), 0o755);
  console.log(
    "bundle-cli: pruned stale .js, bundled bin.js + index.js, copied prompts, chmod +x bin.js",
  );
}

main().catch((err) => {
  console.error("bundle-cli failed:", err);
  process.exit(1);
});
