import { defineWorkspace } from "vitest/config";

// One vitest process for every package's tests (`npm test` at the root).
// Each package keeps its own vitest.config.ts, so `npm test` inside a
// package still works. contracts has no tests; cli has no config file.
export default defineWorkspace([
  "packages/adapters",
  "packages/engine",
  "packages/web-app",
  { test: { name: "cli", root: "./packages/cli", include: ["test/**/*.test.ts"] } },
]);
