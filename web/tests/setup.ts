// Runs before every test file (in that file's worker, before its imports are evaluated).
// - Points the JSON store at a throwaway temp dir so tests never touch web/.data.
// - Strips env that would switch modules onto network paths (LLM judges, Postgres persistence).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bonded-vitest-"));
process.env.SPENDBENCH_DATA_DIR = dir;
for (const k of ["OPENROUTER_API_KEY", "DATABASE_URL", "POSTGRES_URL", "PGHOST", "PGDATABASE", "BONDED_DATABASE_URL", "NESSIE_API_KEY", "NESSIE_BASE_URL"]) delete process.env[k];

afterAll(() => {
  // Let any pending debounced flush (150 ms) land before removing the dir.
  return new Promise<void>((resolve) => setTimeout(() => { fs.rmSync(dir, { recursive: true, force: true }); resolve(); }, 250));
});
