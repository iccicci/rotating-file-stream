import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "rotating-file-stream": join(rootDir, "packages/rotating-file-stream/index.ts") } },
  test:    {
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
