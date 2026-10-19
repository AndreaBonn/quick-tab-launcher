import globals from "globals";

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "multi-line"],
      "no-throw-literal": "error",
    },
  },
  {
    files: ["src/**/*.js", "background/**/*.js", "content/**/*.js", "options/**/*.js", "popup/**/*.js", "welcome/**/*.js"],
    languageOptions: {
      globals: globals.commonjs,
    },
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 30, skipBlankLines: true, skipComments: true }],
      "max-params": ["error", 4],
      "max-depth": ["error", 3],
      "no-undef": "error",
    },
  },
  {
    // The locale dictionary remains cohesive; its size comes from translation data.
    files: ["src/i18n.js"],
    rules: { "max-lines": "off" },
  },
  {
    files: ["tests/**/*.js", "vitest.config.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    ignores: ["node_modules/", "icons/"],
  },
];
