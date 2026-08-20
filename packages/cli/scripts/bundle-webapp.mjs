#!/usr/bin/env node
/**
 * Copies packages/web-app/dist/ into packages/cli/dist/webapp/.
 * Runs at the end of the CLI build. The bundled dir is what the
 * installed CLI serves via the built-in static server when Vite
 * isn't available.
 */
import { cpSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");
const src = resolve(cliRoot, "..", "web-app", "dist");
// Deliberately lowercase-hyphen ("static") to avoid a case-insensitive
// filesystem collision with the compiled TS output at dist/webApp/.
const dst = resolve(cliRoot, "dist", "static");

if (!existsSync(src)) {
  console.error(
    `bundle-webapp: no web-app dist at ${src} — build the web-app first ` +
      `(npm run build -w @synesthetica/web-app).`,
  );
  process.exit(1);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(dirname(dst), { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`bundle-webapp: copied ${src} → ${dst}`);
