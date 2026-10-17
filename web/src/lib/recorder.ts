// Flight Recorder: per-session SHA-256 hash chain. Any edit to history breaks verify().
import crypto from "node:crypto";
import { mutate, read } from "./db";
import { publish } from "./events";
import type { LogEntry } from "./types";

export const GENESIS = "GENESIS";

/** Deterministic JSON (sorted keys) so hashes are reproducible in any language. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export function hashEntry(e: Omit<LogEntry, "hash">): string {
  return crypto.createHash("sha256").update(e.prevHash + canonical(e)).digest("hex");
}

export function append(sessionId: string, actor: LogEntry["actor"], action: string, payload: unknown): LogEntry {
  const entry = mutate((db) => {
    const prev = [...db.log].reverse().find((l) => l.sessionId === sessionId);
    const base: Omit<LogEntry, "hash"> = {
      seq: ++db.meta.seq,
      sessionId,
      ts: new Date().toISOString(),
      actor,
      action,
      payload: JSON.parse(JSON.stringify(payload ?? null)),
      prevHash: prev ? prev.hash : GENESIS,
    };
    const e: LogEntry = { ...base, hash: hashEntry(base) };
    db.log.push(e);
    return e;
  });
  publish("log", entry);
  return entry;
}

export function getChain(sessionId: string): LogEntry[] {
  return read().log.filter((l) => l.sessionId === sessionId).sort((a, b) => a.seq - b.seq);
}

export function verify(sessionId: string): { valid: boolean; length: number; brokenAt?: number; reason?: string } {
  const chain = getChain(sessionId);
  let prev = GENESIS;
  for (const e of chain) {
    if (e.prevHash !== prev) return { valid: false, length: chain.length, brokenAt: e.seq, reason: "prevHash mismatch" };
    const { hash, ...rest } = e;
    if (hashEntry(rest) !== hash) return { valid: false, length: chain.length, brokenAt: e.seq, reason: "content hash mismatch" };
    prev = hash;
  }
  return { valid: true, length: chain.length };
}

/** Demo helper: silently edit an entry's payload to show the chain breaking. */
export function tamper(seq: number, patch: Record<string, unknown>) {
  mutate((db) => {
    const e = db.log.find((l) => l.seq === seq);
    if (e) e.payload = { ...(e.payload as object), ...patch };
  });
}
