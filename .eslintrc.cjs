/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  rules: {
    /**
     * Contracts discipline
     *
     * - Types must come from @synesthetica/contracts
     * - No redefinition or shadowing of core concepts
     */
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["**/cms/**", "**/scene/**", "**/intents/**", "**/control/**"],
            "message": "Do not import internal representations directly. Import types from @synesthetica/contracts instead."
          }
        ]
      }
    ],

    /**
     * TypeScript hygiene
     */
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        "prefer": "type-imports"
      }
    ],

    /**
     * Sanity / clarity
     */
    "no-console": "off",
    "no-debugger": "error"
  },
  overrides: [
    {
      files: ["packages/contracts/**/*"],
      rules: {
        // Contracts are allowed to define foundational types
        "no-restricted-imports": "off"
      }
    }
  ]
};