// Persistence backends. The Postgres suite needs a real database:
//   BONDED_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run -c src/lib/persist/vitest.config.ts
// It drops and recreates bonded_snapshot / bonded_log in that database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { LogEntry } from "../../types";

const PG_URL = process.env.BONDED_TEST_DATABASE_URL;
const G = globalThis as Record<string, unknown>;

/** Simulate a process restart: forget the in-memory store and backend (module code stays loaded). */
async function restart() {
  const { closePg } = await import("../index");
  for (const k of ["__sbDb", "__sbBoot", "__sbFlush", "__sbFlushing", "__sbDirty", "__sbLastFlush", "__sbBackend"]) {
    if (k === "__sbFlush" && G[k]) clearTimeout(G[k] as NodeJS.Timeout);
    delete G[k];
  }
  await closePg();
  delete G.__sbPg;
}

const entry = (seq: number, sessionId = "s1"): LogEntry => ({
  seq, sessionId, ts: new Date().toISOString(), actor: "agent", action: "search", payload: { q: `q${seq}` },
  prevHash: "GENESIS", hash: `h${seq}`,
});

describe("file backend", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bonded-persist-"));
  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    process.env.SPENDBENCH_DATA_DIR = dir;
    await restart();
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("round-trips through db.json and survives a restart", async () => {
    const db = await import("../../db");
    await db.initStore();
    expect(db.storeStatus().store).toBe("file");
    db.mutate((d) => { d.meta.seq = 7; d.log.push(entry(1)); });
    expect(db.storeStatus().pendingFlush).toBe(true);
    await db.flushNow();
    expect(JSON.parse(fs.readFileSync(path.join(dir, "db.json"), "utf8")).meta.seq).toBe(7);
    await restart();
    await db.initStore();
    expect(db.read().meta.seq).toBe(7);
    expect(db.read().log).toHaveLength(1);
  });

  it("falls back to a synchronous load if read() comes before initStore()", async () => {
    const db = await import("../../db");
    expect(db.read().meta.seq).toBe(7);
  });
});

describe.skipIf(!PG_URL)("postgres backend (real database)", () => {
  let pg: typeof import("pg");
  let admin: import("pg").Client;

  beforeEach(async () => {
    process.env.DATABASE_URL = PG_URL!;
    process.env.BONDED_PG_SKIP_LOCK = "1";
    await restart();
  });
  afterAll(async () => { await admin?.end(); await restart(); delete process.env.DATABASE_URL; });

  it("creates the schema on an empty database and starts empty", async () => {
    pg = await import("pg");
    admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    await admin.query("DROP TABLE IF EXISTS bonded_snapshot, bonded_log");
    const db = await import("../../db");
    await db.initStore();
    expect(db.storeStatus().store).toBe("postgres");
    expect(db.read().products).toHaveLength(0);
    const t = await admin.query("SELECT to_regclass('bonded_snapshot') AS a, to_regclass('bonded_log') AS b");
    expect(t.rows[0]).toEqual({ a: "bonded_snapshot", b: "bonded_log" });
  });

  it("debounced async flush writes the snapshot + mirrors new log entries once", async () => {
    const db = await import("../../db");
    await db.initStore();
    db.mutate((d) => { d.meta.seq = 3; d.log.push(entry(1), entry(2), entry(3)); });
    // not written synchronously
    expect((await admin.query("SELECT count(*)::int AS n FROM bonded_snapshot")).rows[0].n).toBe(0);
    await new Promise((r) => setTimeout(r, 900)); // > BONDED_FLUSH_MS default (500ms for postgres)
    const snap = await admin.query("SELECT data, updated_at FROM bonded_snapshot WHERE id = 1");
    expect(snap.rows[0].data.meta.seq).toBe(3);
    expect(db.storeStatus().lastFlush?.ok).toBe(true);

    db.mutate((d) => { d.log.push(entry(4)); });
    await db.flushNow();
    await db.flushNow(); // nothing new: no duplicate log rows
    const log = await admin.query("SELECT seq, session_id, action, data->>'hash' AS hash FROM bonded_log ORDER BY id");
    expect(log.rows.map((r) => Number(r.seq))).toEqual([1, 2, 3, 4]);
    expect(log.rows[3]).toMatchObject({ session_id: "s1", action: "search", hash: "h4" });
  });

  it("reloads the snapshot after a restart (async boot and sync fallback) without re-mirroring", async () => {
    const db = await import("../../db");
    await db.initStore();
    expect(db.read().log.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    db.mutate((d) => { d.log.push(entry(5)); });
    await db.flushNow();
    expect((await admin.query("SELECT count(*)::int AS n FROM bonded_log")).rows[0].n).toBe(5);

    await restart();
    const t0 = Date.now();
    expect(db.read().log).toHaveLength(5); // sync fallback through a child process
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it("starts a new log epoch after replace() (wipe) and keeps the old rows", async () => {
    const db = await import("../../db");
    await db.initStore();
    const fresh = db.emptyDb();
    fresh.log.push(entry(1, "s2"));
    db.replace(fresh);
    await db.flushNow();
    const rows = await admin.query("SELECT seq, session_id FROM bonded_log ORDER BY id");
    expect(rows.rows).toHaveLength(6);
    expect(rows.rows[5]).toMatchObject({ session_id: "s2" });
    const snap = await admin.query("SELECT jsonb_array_length(data->'log') AS n FROM bonded_snapshot");
    expect(snap.rows[0].n).toBe(1);
  });

  it("serialises concurrent flushes and keeps the last state", async () => {
    const db = await import("../../db");
    await db.initStore();
    const ps: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) { db.mutate((d) => { d.meta.seq = 100 + i; }); ps.push(db.flushNow()); }
    await Promise.all(ps);
    await db.flushNow();
    const snap = await admin.query("SELECT data->'meta'->>'seq' AS s FROM bonded_snapshot");
    expect(snap.rows[0].s).toBe("119");
  });

  it("refuses to boot (rather than start empty) when Postgres is unreachable", async () => {
    process.env.DATABASE_URL = "postgres://postgres@127.0.0.1:1/none";
    const db = await import("../../db");
    await expect(db.initStore()).rejects.toThrow();
    expect(db.storeStatus().loaded).toBe(false);
    expect(() => db.read()).toThrow(/cannot load snapshot/);
  });
});
