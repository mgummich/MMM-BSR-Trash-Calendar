import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/unit/**/*.test.js",
      "tests/property/**/*.property.js",
      "tests/integration/**/*.test.js",
    ],
    passWithNoTests: true,
  },
});
