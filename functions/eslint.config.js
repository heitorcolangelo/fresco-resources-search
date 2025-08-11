const globals = require("globals");
const tseslint = require("typescript-eslint");
const js = require("@eslint/js");

module.exports = tseslint.config(
  // Global ignores
  {
    ignores: ["lib/", "node_modules/", "eslint.config.js"],
  },

  // Base recommended rules from ESLint
  js.configs.recommended,

  // TypeScript specific rules
  ...tseslint.configs.recommended,

  // Custom configuration for your project
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: ["tsconfig.json", "tsconfig.dev.json"],
      },
    },
    rules: {
      "quotes": ["error", "double"],
      "indent": ["error", 2],
      "max-len": "off",
    },
  }
);