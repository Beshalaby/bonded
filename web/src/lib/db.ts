// Tiny persistent store: an in-memory singleton with a synchronous API (read()/mutate()/replace()).
// Persistence is pluggable (lib/persist):
//   - DATABASE_URL set  -> Postgres: snapshot row in bonded_snapshot + append-only bonded_log trace mirror
//   - otherwise         -> JSON file $SPENDBENCH_DATA_DIR/db.json (default web/.data)
//
// Boot: instrumentation.ts awaits initStore() before Next serves requests, so the snapshot is in memory before
// the first read(). If a request still arrives first, read() falls back to a blocking load (loadSync).
// Writes: mutate() marks the store dirty; a debounced, async flush serialises the whole snapshot and writes it
// in the background (never on the request path). One flush in flight at a time; changes made during a flush
// trigger another one. Failed flushes are retried.
//
// SINGLE-WRITER ASSUMPTION: exactly one Next.js server process owns the store. Every flush writes the whole
// snapshot (last write wins), so two instances against the same file or DATABASE_URL would overwrite each
// other. Run one instance (no horizontal scaling). Python talks to the store only over HTTP.
import crypto from "node:crypto";
import type { DB } from "./types";
import { backend, setLogMark, storeKind, type StoreKind } from "./persist";

function empty(): DB {
  return {
    merchants: [], products: [], agents: [], sessions: [], carts: [], log: [],
    transactions: [], benchResults: [], runs: [], scams: [],
    meta: { seq: 0 },
  };
}

type FlushInfo = { at: string; ok: boolean; error?: string; ms?: number };
type G = {
  __sbDb?: DB;
  __sbFlush?: NodeJS.Timeout;
  __sbBoot?: Promise<void>;
  __sbFlushing?: Promise<void>;
  __sbDirty?: boolean;
  __sbLastFlush?: FlushInfo;
  __sbExitHook?: boolean;
};
const g = globalThis as unknown as G;

const FLUSH_MS = Number(process.env.BONDED_FLUSH_MS || (storeKind() === "postgres" ? 500 : 150));
const RETRY_MS = 5_000;

function normalize(raw: Partial<DB> | null): DB {
  if (!raw) return empty();
  const r = { ...(raw as Record<string, unknown>) };
  // Drop collections from the v1 schema if an old snapshot is loaded.
  for (const k of ["claims", "risk", "modelPriors"]) delete r[k];
  return { ...empty(), ...(r as Partial<DB>) } as DB;
}

function adopt(db: DB) {
  g.__sbDb = db;
  const log = db.log || [];
  setLogMark(log.length ? log[log.length - 1].seq : 0);
  installExitHook();
}

/** Synchronous load. Normally a no-op (boot already loaded); otherwise blocks once. */
function load(): DB {
  if (g.__sbDb) return g.__sbDb;
  const b = backend();
  let db: DB;
  try {
    if (b.kind === "postgres") console.warn("[db] store touched before boot load finished; loading synchronously");
    db = normalize(b.loadSync());
  } catch (e) {
    // File: keep the old behaviour (start empty). Postgres: refuse — starting empty would later overwrite
    // the real snapshot on the next flush.
    if (b.kind === "postgres") throw new Error(`[db] cannot load snapshot from ${b.describe()}: ${(e as Error).message}`);
    console.error("[db] failed to load, starting empty", e);
    db = empty();
  }
  adopt(db);
  return db;
}

/**
 * Async boot load (called from instrumentation.ts register()). Idempotent. Rejects if Postgres is unreachable,
 * which stops the server from booting rather than serving (and later flushing) an empty store.
 */
export function initStore(): Promise<void> {
  if (g.__sbDb) return Promise.resolve();
  if (!g.__sbBoot) {
    const b = backend();
    const t0 = Date.now();
    g.__sbBoot = b.load().then(
      (raw) => {
        if (!g.__sbDb) adopt(normalize(raw)); // a sync fallback load may have won the race; keep it
        const db = g.__sbDb!;
        console.log(`[db] ${b.kind} store loaded from ${b.describe()} in ${Date.now() - t0}ms ` +
          `(${db.products.length} products, ${db.benchResults.length} results, ${db.log.length} log entries)`);
      },
      (e) => {
        g.__sbBoot = undefined;
        if (b.kind === "postgres") throw e;
        console.error("[db] failed to load, starting empty", e);
        if (!g.__sbDb) adopt(empty());
      },
    );
  }
  return g.__sbBoot;
}

function scheduleFlush(delay = FLUSH_MS) {
  if (g.__sbFlush) return;
  g.__sbFlush = setTimeout(() => {
    g.__sbFlush = undefined;
    void flushNow();
  }, delay);
  g.__sbFlush.unref?.();
}

/**
 * Write the current snapshot now (async). Waits for an in-flight flush first. Never throws: failures are
 * logged, recorded in storeStatus(), and retried.
 */
export async function flushNow(): Promise<void> {
  if (g.__sbFlushing) {
    g.__sbDirty = true;
    await g.__sbFlushing;
    return;
  }
  const db = g.__sbDb;
  if (!db) return; // nothing loaded => nothing to write (never overwrite storage with an unloaded store)
  if (g.__sbFlush) { clearTimeout(g.__sbFlush); g.__sbFlush = undefined; }
  g.__sbDirty = false;
  const t0 = Date.now();
  const json = JSON.stringify(db); // snapshot taken synchronously => consistent
  g.__sbFlushing = backend().save(json, db).then(
    () => { g.__sbLastFlush = { at: new Date().toISOString(), ok: true, ms: Date.now() - t0 }; },
    (e) => {
      const error = (e as Error).message;
      g.__sbLastFlush = { at: new Date().toISOString(), ok: false, error };
      console.error(`[db] flush to ${backend().kind} failed (retrying in ${RETRY_MS / 1000}s):`, error);
      g.__sbDirty = false;
      scheduleFlush(RETRY_MS);
    },
  ).finally(() => {
    g.__sbFlushing = undefined;
    if (g.__sbDirty) { g.__sbDirty = false; scheduleFlush(); }
  });
  await g.__sbFlushing;
}

/** Last-chance persistence on shutdown: sync for the file store; postgres is flushed by the signal handler. */
function installExitHook() {
  if (g.__sbExitHook) return;
  g.__sbExitHook = true;
  process.on("exit", () => {
    const b = backend();
    if (!g.__sbDb || !b.saveSync) return;
    if (!g.__sbFlush && !g.__sbDirty && !g.__sbFlushing) return;
    try { b.saveSync(JSON.stringify(g.__sbDb)); } catch (e) { console.error("[db] exit flush failed", e); }
  });
}

/** Read-only access. Do not mutate the returned object; use mutate(). */
export function read(): DB {
  return load();
}

/** All writes go through here so they get persisted. */
export function mutate<T>(fn: (db: DB) => T): T {
  const out = fn(load());
  scheduleFlush();
  return out;
}

/** Replace whole DB (used by reset/seed). */
export function replace(next: DB) {
  g.__sbDb = next;
  installExitHook();
  scheduleFlush();
}

/** For /api/health. */
export function storeStatus(): { store: StoreKind; target: string; loaded: boolean; pendingFlush: boolean; lastFlush?: FlushInfo } {
  const b = backend();
  return {
    store: b.kind, target: b.describe(), loaded: !!g.__sbDb,
    pendingFlush: !!(g.__sbFlush || g.__sbFlushing || g.__sbDirty), lastFlush: g.__sbLastFlush,
  };
}

export { empty as emptyDb };

export function uid(prefix: string) {
  // time prefix keeps ids sortable; 60 random bits make them unguessable (session ids act as bearer handles)
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(8).toString("base64url").slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
}
