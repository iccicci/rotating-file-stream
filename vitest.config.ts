import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      clean:            true,
      exclude:          ["**/test/**", "**/*.test.ts", "**/*.test-d.ts", "**/node_modules/**", "**/dist/**"],
      include:          ["packages/*/index.ts"],
      provider:         "v8",
      reporter:         ["text", "text-summary", "html", "lcov"],
      reportsDirectory: "./coverage"
    },
    environment: "node",
    include:     ["packages/*/test/unit/**/*.test.ts", "packages/*/test/integration/**/*.test.ts"],
    sequence:    { shuffle: false },
    typecheck:   {
      enabled:  true,
      include:  ["packages/*/test/unit/**/*.test-d.ts"],
      tsconfig: "./tsconfig.vitest.json"
    }
  }
});
