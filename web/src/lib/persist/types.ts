// Persistence backends for the in-memory store in lib/db.ts.
// The store itself stays synchronous (read()/mutate()); a backend only loads the snapshot at boot and
// writes it back (debounced, async) after mutations.
import type { DB } from "../types";

export type StoreKind = "file" | "postgres";

export interface Backend {
  kind: StoreKind;
  /** Human-readable target for logs/health (never includes credentials). */
  describe(): string;
  /** Async load of the last snapshot; null when nothing has been stored yet. */
  load(): Promise<Partial<DB> | null>;
  /**
   * Synchronous load, used only if a request touches the store before the async boot load finished
   * (should not happen: instrumentation.ts awaits the load before Next serves requests).
   */
  loadSync(): Partial<DB> | null;
  /** Persist a snapshot. `json` is JSON.stringify(db), taken synchronously at flush time. */
  save(json: string, db: DB): Promise<void>;
  /** Best-effort synchronous save on process exit (file backend only; postgres cannot block). */
  saveSync?(json: string): void;
}
