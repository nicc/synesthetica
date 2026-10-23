// @ts-check
/**
 * ESLint flat config.
 *
 * Beyond the recommended sets, these rules enforce architectural
 * principles that were previously kept by discipline alone. Each rule
 * block names the principle or spec it encodes. Type-aware rules use
 * the TypeScript project service, so every linted file must belong to a
 * tsconfig (package tsconfig.json for src, packages/<pkg>/test/tsconfig.json
 * for tests).
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";

const ENGINE = "packages/engine/src";

/**
 * Engine data flow (SPEC_008): stabilizers → vocabulary → lenses →
 * renderer. A layer may not import the layers it doesn't consume.
 */
function layerBoundary(dir, banned, extraPaths = []) {
  return {
    files: [`${ENGINE}/${dir}/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: banned.map((other) => ({
            group: [`**/${other}`, `**/${other}/**`],
            message: `${dir} must not import ${other} (SPEC_008 data flow).`,
          })),
          paths: extraPaths,
        },
      ],
    },
  };
}

export default defineConfig(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.{js,mjs,cjs}", "**/test/_snapshots/**"],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["vitest.workspace.ts", "packages/adapters/vitest.config.ts", "packages/engine/vitest*.config.ts", "docs/smoke-test/*.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: false },
      ],
      // CLAUDE.md: no deprecated aliases or shims.
      "@typescript-eslint/no-deprecated": "error",
      // Async methods that satisfy a Promise-returning interface without
      // awaiting anything are idiomatic here (engine handles, MCP tools).
      "@typescript-eslint/require-await": "off",
      "no-debugger": "error",
    },
  },

  // ---------------------------------------------------------------
  // Contracts discipline: contracts is the leaf every package shares;
  // other packages use package entry points, never another package's
  // internals.
  // ---------------------------------------------------------------
  {
    files: ["packages/contracts/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@synesthetica/*", "three", "tonal"], message: "contracts is the shared leaf; it imports no other package." }] },
      ],
    },
  },
  {
    files: ["packages/adapters/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@synesthetica/engine", "@synesthetica/web-app", "@synesthetica/cli"], message: "Adapters produce RawInputFrame; they don't depend on the pipeline." },
            { group: ["three", "tonal"], message: "Adapters don't render or analyse music." },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/{cli,web-app}/src/**/*.ts", "packages/*/test/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@synesthetica/*/src/**", "@synesthetica/*/dist/**"], message: "Import the package entry point, not its internals." }] },
      ],
    },
  },

  // ---------------------------------------------------------------
  // Engine layer boundaries (SPEC_008) and invariants (SPEC_010).
  // ---------------------------------------------------------------
  layerBoundary("stabilizers", ["vocabularies", "lenses", "renderers"], [
    { name: "three", message: "Stabilizers produce musical state, not visuals." },
  ]),
  layerBoundary("vocabularies", ["stabilizers", "lenses", "renderers"], [
    { name: "three", message: "Vocabularies annotate; renderers draw." },
  ]),
  layerBoundary("lenses", ["stabilizers", "vocabularies", "renderers"], [
    { name: "tonal", message: "I4: lenses don't compute musical semantics; stabilizers do." },
    { name: "@synesthetica/contracts", importNames: ["pcToHue"], message: "I14: lenses receive hue from the vocabulary rather than computing it." },
  ]),
  layerBoundary("renderers", ["stabilizers", "vocabularies", "lenses"], [
    { name: "tonal", message: "I4: renderers don't compute musical semantics." },
  ]),

  // Determinism (SPEC_005 frame time, I12 seeded randomness) and no
  // browser APIs in the pipeline's pure layers.
  {
    files: [`${ENGINE}/{stabilizers,vocabularies,lenses}/**/*.ts`],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "I12: use a seeded RNG from LensContext.rngSeed." },
        { object: "Date", property: "now", message: "SPEC_005: use the frame time t." },
        { object: "performance", property: "now", message: "SPEC_005: use the frame time t." },
      ],
      "no-restricted-globals": [
        "error",
        ...["window", "document", "navigator", "localStorage", "requestAnimationFrame", "AudioContext"].map((name) => ({
          name,
          message: "The pipeline's pure layers don't touch browser APIs; renderers and adapters do.",
        })),
      ],
    },
  },

  // ---------------------------------------------------------------
  // Tests (CLAUDE.md Testing Conventions)
  // ---------------------------------------------------------------
  {
    files: ["packages/*/test/**/*.ts"],
    plugins: { vitest },
    rules: {
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/no-identical-title": "error",
      // expect(value, message) is valid vitest and names the failing case.
      "vitest/valid-expect": ["error", { maxArgs: 2 }],
      // Rule 6: every test must be able to fail.
      "vitest/expect-expect": ["error", { assertFunctionNames: ["expect", "expect*", "assert*"] }],
      // Rule 11.
      "no-console": "error",
      // Tests poke at untyped JSON and mocks; the unsafe-* family is noise there.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/unbound-method": "off",
      // Socket messages in tests are always text frames.
      "@typescript-eslint/no-base-to-string": "off",
    },
  },
  {
    files: ["packages/*/test/**/*.snapshot.ts"],
    rules: { "vitest/expect-expect": "off" },
  },
);
