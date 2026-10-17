// Backend selection: DATABASE_URL set => Postgres, else the JSON file in SPENDBENCH_DATA_DIR.
import { fileBackend } from "./file";
import { postgresBackend } from "./postgres";
import type { Backend, StoreKind } from "./types";

export type { Backend, StoreKind } from "./types";
export { setLogMark, closePg } from "./postgres";

export function storeKind(): StoreKind {
  return process.env.DATABASE_URL ? "postgres" : "file";
}

const g = globalThis as unknown as { __sbBackend?: Backend };

export function backend(): Backend {
  if (!g.__sbBackend || g.__sbBackend.kind !== storeKind())
    g.__sbBackend = storeKind() === "postgres" ? postgresBackend() : fileBackend();
  return g.__sbBackend;
}

/** Tests only. */
export function _setBackend(b: Backend | undefined) { g.__sbBackend = b; }
