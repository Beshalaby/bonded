// Tiny persistent store: in-memory singleton, flushed to $SPENDBENCH_DATA_DIR/db.json (default web/.data).
// Single writer (the Next.js server); Python talks to it only over HTTP.
import fs from "node:fs";
import path from "node:path";
import type { DB } from "./types";

// SPENDBENCH_DATA_DIR.
const DATA_DIR = process.env.SPENDBENCH_DATA_DIR || path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function empty(): DB {
  return {
    merchants: [], products: [], agents: [], sessions: [], carts: [], log: [],
    transactions: [], benchResults: [], runs: [], scams: [],
    meta: { seq: 0 },
  };
}

type G = { __sbDb?: DB; __sbFlush?: NodeJS.Timeout };
const g = globalThis as unknown as G;

function load(): DB {
  if (g.__sbDb) return g.__sbDb;
  let db = empty();
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Record<string, unknown>;
      // Drop collections from the v1 schema if an old db.json is loaded.
      for (const k of ["claims", "risk", "modelPriors"]) delete raw[k];
      db = { ...empty(), ...(raw as Partial<DB>) } as DB;
    }
  } catch (e) {
    console.error("[db] failed to load, starting empty", e);
  }
  g.__sbDb = db;
  return db;
}

function scheduleFlush() {
  if (g.__sbFlush) return;
  g.__sbFlush = setTimeout(() => {
    g.__sbFlush = undefined;
    flushNow();
  }, 150);
}

export function flushNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(load()));
  fs.renameSync(tmp, DB_FILE);
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
  scheduleFlush();
}

export { empty as emptyDb };

export function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
