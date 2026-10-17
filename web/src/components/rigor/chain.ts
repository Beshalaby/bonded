// Browser-side, independent re-implementation of the trace hash chain (lib/recorder.ts).
// Uses only the platform: JSON.stringify for scalars and WebCrypto `crypto.subtle` for SHA-256.
// Must stay byte-for-byte identical to recorder.ts `canonical()` / `hashEntry()`.
import type { LogEntry } from "@/lib/types";

export const GENESIS = "GENESIS";

/** Deterministic JSON: object keys sorted (UTF-16 code-unit order), undefined-valued keys dropped, no whitespace. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

/** The exact bytes that get hashed for an entry: prevHash ‖ canonical(entry without `hash`). */
export function preimage(e: LogEntry | Omit<LogEntry, "hash">): string {
  const rest = { ...(e as LogEntry) } as Partial<LogEntry>;
  delete rest.hash;
  return rest.prevHash + canonical(rest);
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type LinkStatus = "ok" | "content" | "link";
export interface LinkCheck {
  seq: number;
  status: LinkStatus;          // ok | content (recomputed hash ≠ recorded hash) | link (prevHash ≠ previous entry's hash)
  recorded: string;            // entry.hash as stored
  computed: string;            // sha256(prevHash ‖ canonical(entry))
  expectedPrev: string;        // previous entry's recorded hash (or GENESIS)
  bytes: number;               // UTF-8 length of the preimage
}

/**
 * Verify one link. The chain is checked the same way the server does it: prevHash must equal the previous entry's
 * stored hash, and the stored hash must equal the recomputed one.
 */
export async function checkLink(e: LogEntry, expectedPrev: string): Promise<LinkCheck> {
  const pre = preimage(e);
  const computed = await sha256Hex(pre);
  const status: LinkStatus = e.prevHash !== expectedPrev ? "link" : computed !== e.hash ? "content" : "ok";
  return { seq: e.seq, status, recorded: e.hash, computed, expectedPrev, bytes: new TextEncoder().encode(pre).length };
}

export async function verifyChain(entries: LogEntry[]): Promise<{ valid: boolean; brokenAt?: number; checks: LinkCheck[] }> {
  const checks: LinkCheck[] = [];
  let prev = GENESIS;
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
    const c = await checkLink(e, prev);
    checks.push(c);
    prev = e.hash;
  }
  const bad = checks.find((c) => c.status !== "ok");
  return { valid: !bad, brokenAt: bad?.seq, checks };
}
