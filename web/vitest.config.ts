import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Each test file gets a fresh SPENDBENCH_DATA_DIR and no LLM / Postgres env (see tests/setup.ts).
    setupFiles: ["tests/setup.ts"],
    isolate: true,
    testTimeout: 30_000,
  },
});
