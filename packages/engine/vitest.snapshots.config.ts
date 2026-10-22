import { defineConfig } from "vitest/config";

// SVG snapshot generators (`npm run snapshots`). These write review
// artefacts to test/_snapshots/ for a human to look at; they are not
// part of `npm test` and don't assert on the images.
export default defineConfig({
  test: {
    include: ["test/**/*.snapshot.ts"],
    globals: true,
    env: { GENERATE_SNAPSHOTS: "1" },
  },
});
