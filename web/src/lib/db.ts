// Tiny persistent store: in-memory singleton, flushed to web/.data/db.json.
// Single writer (the Next.js server); Python talks to it only over HTTP.
import fs from "node:fs";
import path from "node:path";
import type { DB } from "./types";

const DATA_DIR = process.env.BONDED_DATA_DIR || path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function empty(): DB {
  return {
    merchants: [], products: [], agents: [], sessions: [], carts: [], log: [],
    transactions: [], claims: [], risk: [], benchResults: [], modelPriors: {},
    meta: { seq: 0 },
  };
}

type G = { __bondedDb?: DB; __bondedFlush?: NodeJS.Timeout };
const g = globalThis as unknown as G;

function load(): DB {
  if (g.__bondedDb) return g.__bondedDb;
  let db = empty();
  try {
    if (fs.existsSync(DB_FILE)) db = { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
  } catch (e) {
    console.error("[db] failed to load, starting empty", e);
  }
  g.__bondedDb = db;
  return db;
}

function scheduleFlush() {
  if (g.__bondedFlush) return;
  g.__bondedFlush = setTimeout(() => {
    g.__bondedFlush = undefined;
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
  g.__bondedDb = next;
  scheduleFlush();
}

export { empty as emptyDb };

export function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
