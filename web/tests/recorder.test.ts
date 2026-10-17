import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { append, canonical, GENESIS, getChain, hashEntry, tamper, verify } from "@/lib/recorder";
import { mutate } from "@/lib/db";
import type { LogEntry } from "@/lib/types";

describe("canonical()", () => {
  it("is independent of key insertion order, at every depth", () => {
    const a = { b: 1, a: { y: [1, { q: 2, p: 1 }], x: "s" } };
    const b = { a: { x: "s", y: [1, { p: 1, q: 2 }] }, b: 1 };
    expect(canonical(a)).toBe(canonical(b));
    expect(canonical(a)).toBe('{"a":{"x":"s","y":[1,{"p":1,"q":2}]},"b":1}');
  });

  it("drops undefined object values but keeps null", () => {
    expect(canonical({ a: undefined, b: null, c: 1 })).toBe('{"b":null,"c":1}');
    expect(canonical(undefined)).toBe("null");
    expect(canonical(null)).toBe("null");
  });

  it("keeps array order (arrays are not sorted)", () => {
    expect(canonical([3, 1, 2])).toBe("[3,1,2]");
    expect(canonical([3, 1, 2])).not.toBe(canonical([1, 2, 3]));
  });

  it("encodes unicode the way JSON.stringify does (stable across runs)", () => {
    const v = { "ключ": "ｉｇｎｏｒｅ​", emoji: "🛒", e: "é" };
    const s = canonical(v);
    // Keys sort by UTF-16 code unit; non-ASCII stays literal (no \u escapes), like JSON.stringify.
    expect(s).toBe('{"e":"é","emoji":"🛒","ключ":"ｉｇｎｏｒｅ​"}');
    expect(JSON.parse(s)).toEqual(v);
    expect(canonical(v)).toBe(s);
  });

  it("scalars match JSON.stringify", () => {
    for (const x of [0, -1.5, "a\"b\\c\n", true, false]) expect(canonical(x)).toBe(JSON.stringify(x));
  });
});

describe("hashEntry()", () => {
  const base: Omit<LogEntry, "hash"> = {
    seq: 1, sessionId: "s_1", ts: "2026-01-01T00:00:00.000Z", actor: "agent", action: "search",
    payload: { query: "airpods", count: 3 }, prevHash: GENESIS,
  };

  it("is sha256(prevHash + canonical(entry)) and stable", () => {
    const expected = crypto.createHash("sha256").update(GENESIS + canonical(base)).digest("hex");
    expect(hashEntry(base)).toBe(expected);
    expect(hashEntry(base)).toMatch(/^[0-9a-f]{64}$/);
    // Same content, different key order -> same hash.
    const reordered = { payload: { count: 3, query: "airpods" }, action: "search", actor: "agent", ts: base.ts, sessionId: "s_1", seq: 1, prevHash: GENESIS } as Omit<LogEntry, "hash">;
    expect(hashEntry(reordered)).toBe(hashEntry(base));
  });

  it("changes when any field changes", () => {
    const h = hashEntry(base);
    expect(hashEntry({ ...base, seq: 2 })).not.toBe(h);
    expect(hashEntry({ ...base, prevHash: "x" })).not.toBe(h);
    expect(hashEntry({ ...base, payload: { query: "airpods", count: 4 } })).not.toBe(h);
  });
});

describe("append / verify / tamper", () => {
  it("builds a valid per-session chain and detects tampering at the edited seq", () => {
    mutate((db) => { db.log = []; db.meta.seq = 0; });
    const e1 = append("sess_a", "agent", "session_start", { budget: 260 });
    append("sess_b", "agent", "session_start", { budget: 10 }); // interleaved other session
    const e2 = append("sess_a", "agent", "search", { query: "AirPods Pro 2", count: 5 });
    const e3 = append("sess_a", "agent", "add_to_cart", { productId: "p_1", qty: 1 });
    const e4 = append("sess_a", "system", "checkout_requested", { items: [{ productId: "p_1", qty: 1, unitPrice: 199 }] });

    expect(e1.prevHash).toBe(GENESIS);
    expect(e2.prevHash).toBe(e1.hash); // chain skips other sessions' entries
    expect(e3.prevHash).toBe(e2.hash);
    expect(getChain("sess_a").map((e) => e.seq)).toEqual([e1.seq, e2.seq, e3.seq, e4.seq]);
    expect(verify("sess_a")).toEqual({ valid: true, length: 4 });
    expect(verify("sess_b")).toEqual({ valid: true, length: 1 });
    expect(verify("nope")).toEqual({ valid: true, length: 0 });

    tamper(e3.seq, { qty: 3 });
    const v = verify("sess_a");
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(e3.seq);
    expect(v.reason).toBe("content hash mismatch");
    expect(verify("sess_b").valid).toBe(true);
  });

  it("detects a deleted entry as a prevHash mismatch at the following seq", () => {
    mutate((db) => { db.log = []; db.meta.seq = 0; });
    append("sess_c", "agent", "session_start", {});
    const mid = append("sess_c", "agent", "search", { query: "x" });
    const last = append("sess_c", "agent", "view", { productId: "p_2" });
    mutate((db) => { db.log = db.log.filter((e) => e.seq !== mid.seq); });
    expect(verify("sess_c")).toMatchObject({ valid: false, brokenAt: last.seq, reason: "prevHash mismatch" });
  });

  it("stores a JSON-normalised copy of the payload (undefined dropped)", () => {
    const e = append("sess_d", "agent", "search", { q: "a", gone: undefined });
    expect(e.payload).toEqual({ q: "a" });
    expect(verify("sess_d").valid).toBe(true);
  });
});
