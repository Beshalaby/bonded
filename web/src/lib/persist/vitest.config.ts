// Persistence tests (kept out of the default `npm test` include, since the Postgres suite needs a database):
//   npx vitest run -c src/lib/persist/vitest.config.ts
//   BONDED_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run -c src/lib/persist/vitest.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: path.resolve(__dirname, "../../.."),
  resolve: { alias: { "@": path.resolve(__dirname, "../..") } },
  test: {
    environment: "node",
    include: ["src/lib/persist/__tests__/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
