#!/usr/bin/env node
/**
 * Entry for the `synesthetica` binary. Kept tiny — args in, main out,
 * exit code back to the shell.
 */

import { runCli } from "./main.js";

const argv = process.argv.slice(2);
runCli(argv)
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
