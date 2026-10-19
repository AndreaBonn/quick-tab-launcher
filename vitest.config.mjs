import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
    reporters: ["default", "junit"],
    outputFile: { junit: "test-results.xml" },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.js", "background/**/*.js", "content/**/*.js", "options/**/*.js", "popup/**/*.js", "welcome/**/*.js"],
      exclude: ["tests/**"],
      thresholds: {
        statements: 98.5,
        branches: 94,
        functions: 96.5,
        lines: 98.5,
      },
    },
  },
});
