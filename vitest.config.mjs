import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js", "background/**/*.js", "content/**/*.js", "options/**/*.js"],
      exclude: ["tests/**"],
    },
  },
});
