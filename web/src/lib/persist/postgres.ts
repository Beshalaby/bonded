// Postgres backend (Supabase or any Postgres), enabled by DATABASE_URL.
//
//   bonded_snapshot(id int primary key, data jsonb, updated_at timestamptz)  -- one row (id = 1): the whole store
//   bonded_log(id bigserial, seq bigint, session_id text, action text, ts timestamptz, data jsonb, mirrored_at)
//                                                                           -- append-only mirror of trace entries
//
// The snapshot is authoritative; bonded_log is an audit/analytics mirror (never read back by the app).
// Single writer: exactly one server process may own the snapshot (last flush wins). We take a session-level
// advisory lock at boot and log a loud warning if another process already holds it.
import { execFileSync } from "node:child_process";
import { Pool, type PoolConfig } from "pg";
import type { DB, LogEntry } from "../types";
import type { Backend } from "./types";

const SNAPSHOT_ID = 1;
const LOCK_KEY = 0x60_d0_ed; // arbitrary constant for pg_try_advisory_lock

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bonded_snapshot (
  id int PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bonded_log (
  id bigserial PRIMARY KEY,
  seq bigint NOT NULL,
  session_id text NOT NULL,
  action text NOT NULL,
  ts timestamptz,
  data jsonb NOT NULL,
  mirrored_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bonded_log_session_idx ON bonded_log (session_id, seq);
-- Supabase exposes public tables through its Data API (anon/authenticated roles). RLS with no policies hides
-- them there; the owning role this server connects as bypasses RLS, so the app is unaffected.
ALTER TABLE bonded_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonded_log ENABLE ROW LEVEL SECURITY;
`;

/** Strip sslmode/ssl params from the URL (pg lets them override `ssl`) and decide TLS ourselves. */
export function pgConfig(url = process.env.DATABASE_URL || ""): PoolConfig {
  let connectionString = url;
  let host = "";
  let sslmode = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    sslmode = u.searchParams.get("sslmode") || "";
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    connectionString = u.toString();
  } catch { /* leave as-is; pg will report a useful error */ }
  const local = !host || host === "localhost" || host === "127.0.0.1" || host === "::1" || host.startsWith("/");
  // BONDED_PG_CA: PEM of the server CA (e.g. Supabase's "SSL certificate" download). Implies verify-full.
  const ca = process.env.BONDED_PG_CA?.replace(/\\n/g, "\n") || undefined;
  const mode = (process.env.BONDED_PG_SSL || (ca ? "verify-full" : "") || sslmode || (local ? "disable" : "require")).toLowerCase();
  // Same semantics as libpq sslmode:
  //   "require"     = encrypted, certificate not verified (libpq default for hosted DBs without a CA bundle).
  //   "verify-full" = encrypted + certificate and hostname verified (against BONDED_PG_CA, else system CAs).
  const ssl = mode === "disable" ? false
    : mode === "verify-full" || mode === "verify-ca" ? { rejectUnauthorized: true, ca }
    : { rejectUnauthorized: false };
  return {
    connectionString, ssl,
    max: Number(process.env.BONDED_PG_POOL_MAX || 3),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "bonded",
  };
}

/** Where the target lives, without credentials. */
function redact(url: string) {
  try { const u = new URL(url); return `postgres://${u.hostname}:${u.port || 5432}${u.pathname}`; } catch { return "postgres://(unparseable DATABASE_URL)"; }
}

type PgState = { pool?: Pool; schema?: Promise<void>; lockClient?: import("pg").PoolClient; logMark?: number };
const g = globalThis as unknown as { __sbPg?: PgState };
const st: PgState = g.__sbPg ?? (g.__sbPg = {});

function pool(): Pool {
  if (!st.pool) {
    st.pool = new Pool(pgConfig());
    st.pool.on("error", (e) => console.error("[db:postgres] idle client error", e.message));
  }
  return st.pool;
}

function ensureSchema() {
  if (!st.schema) {
    st.schema = pool().query(SCHEMA).then(() => undefined);
    st.schema.catch(() => { st.schema = undefined; }); // retry on next call
  }
  return st.schema;
}

async function takeWriterLock() {
  if (st.lockClient || process.env.BONDED_PG_SKIP_LOCK === "1") return;
  try {
    const c = await pool().connect();
    const r = await c.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (r.rows[0]?.ok) { st.lockClient = c; return; }
    c.release();
    console.warn("[db:postgres] WARNING: another Bonded process holds the writer lock on this database. " +
      "Bonded is single-writer (whole-snapshot, last flush wins): run exactly one instance per DATABASE_URL.");
  } catch (e) {
    // Transaction poolers (e.g. Supabase :6543) don't support session advisory locks; not fatal.
    console.warn("[db:postgres] could not take writer lock:", (e as Error).message);
  }
}

/** Highest log seq already mirrored. Initialised from the loaded snapshot so a restart doesn't re-mirror. */
export function setLogMark(seq: number) { st.logMark = seq; }

type LogRow = { seq: number; session_id: string; action: string; ts: string | null; data: LogEntry };

function newLogRows(db: DB): LogRow[] {
  const log = db.log || [];
  const top = log.length ? log[log.length - 1].seq : 0;
  // Store was wiped/replaced (seq went backwards): start a new epoch. bonded_log is append-only, so the old
  // rows stay; new rows simply restart from seq 1.
  if (st.logMark === undefined || top < st.logMark) st.logMark = 0;
  const mark = st.logMark;
  const out: LogRow[] = [];
  for (let i = log.length - 1; i >= 0 && log[i].seq > mark; i--) {
    const e = log[i];
    out.push({ seq: e.seq, session_id: e.sessionId, action: e.action, ts: e.ts || null, data: e });
  }
  return out.reverse();
}

export function postgresBackend(): Backend {
  const url = process.env.DATABASE_URL || "";
  return {
    kind: "postgres",
    describe: () => redact(url),
    async load() {
      await ensureSchema();
      await takeWriterLock();
      const r = await pool().query<{ data: Partial<DB> }>("SELECT data FROM bonded_snapshot WHERE id = $1", [SNAPSHOT_ID]);
      return r.rows[0]?.data ?? null;
    },
    loadSync() {
      // Emergency path: block on a child node process that runs the same SELECT. Only reached if a request
      // hits the store before instrumentation's async load completed.
      const script = `
        const { Client } = require(require.resolve("pg", { paths: [process.cwd()] }));
        const c = new Client(JSON.parse(process.env.__BONDED_PG_CFG));
        c.connect()
          .then(() => c.query(${JSON.stringify(SCHEMA)}))
          .then(() => c.query("SELECT data::text AS t FROM bonded_snapshot WHERE id = ${SNAPSHOT_ID}"))
          .then((r) => { process.stdout.write(r.rows[0] ? r.rows[0].t : "null"); return c.end(); })
          .catch((e) => { console.error(e.message); process.exit(1); });`;
      const cfg = pgConfig(url);
      const out = execFileSync(process.execPath, ["-e", script], {
        cwd: process.cwd(), env: { ...process.env, __BONDED_PG_CFG: JSON.stringify(cfg) },
        maxBuffer: 512 * 1024 * 1024, timeout: 30_000, stdio: ["ignore", "pipe", "inherit"],
      }).toString("utf8");
      return JSON.parse(out) as Partial<DB> | null;
    },
    async save(json, db) {
      await ensureSchema();
      const rows = newLogRows(db);
      const c = await pool().connect();
      try {
        await c.query("BEGIN");
        await c.query(
          `INSERT INTO bonded_snapshot (id, data, updated_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [SNAPSHOT_ID, json],
        );
        if (rows.length && process.env.BONDED_PG_LOG_MIRROR !== "0") {
          await c.query(
            `INSERT INTO bonded_log (seq, session_id, action, ts, data)
             SELECT seq, session_id, action, ts, data
             FROM jsonb_to_recordset($1::jsonb) AS x(seq bigint, session_id text, action text, ts timestamptz, data jsonb)
             ORDER BY seq`,
            [JSON.stringify(rows)],
          );
        }
        await c.query("COMMIT");
        if (rows.length) st.logMark = rows[rows.length - 1].seq;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

/** For tests / graceful shutdown. */
export async function closePg() {
  st.lockClient?.release();
  st.lockClient = undefined;
  const p = st.pool;
  st.pool = undefined;
  st.schema = undefined;
  await p?.end();
}
