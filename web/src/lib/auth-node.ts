// Node-only auth helpers: the service token handed to spawned Python children, and per-agent API keys.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { adminToken, sessionSecret } from "./auth";
import { mutate, read, uid } from "./db";
import type { AgentKey } from "./types";

const g = globalThis as unknown as { __bondedInternal?: string };

/** Token children send as `x-bonded-internal`. Same derivation as configuredInternalToken() in lib/auth.ts so the
 *  edge middleware can check it; in open mode with no admin token it is a per-process random value (the
 *  middleware does not need it then, but arena session creation still uses it to mark runner sessions verified). */
export function internalToken(): string {
  const env = (process.env.BONDED_INTERNAL_TOKEN || "").trim();
  if (env) return env;
  if (adminToken()) return createHmac("sha256", sessionSecret()).update("internal-token-v1").digest("hex");
  return g.__bondedInternal ?? (g.__bondedInternal = randomBytes(32).toString("hex"));
}

function eq(a: string, b: string) {
  const x = createHash("sha256").update(a).digest(), y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function isInternalRequest(req: Request): boolean {
  const h = req.headers.get("x-bonded-internal");
  return !!h && eq(h, internalToken());
}

// ---------------------------------------------------------------- agent API keys
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export class KeyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type PublicAgentKey = Omit<AgentKey, "hash">;
const strip = ({ hash: _h, ...k }: AgentKey): PublicAgentKey => { void _h; return k; };

/** Mint a key. Returns the plaintext once; only its SHA-256 is stored. */
export function mintAgentKey(b: { name?: unknown; model?: unknown }): { key: string; agentKey: PublicAgentKey } {
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name || !slug(name)) throw new KeyError(400, "name: a non-empty agent name is required");
  const model = typeof b.model === "string" && b.model.trim() ? b.model.trim().slice(0, 100) : undefined;
  if (model && !/^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,99}$/.test(model)) throw new KeyError(400, "model: invalid model id");
  const agentId = `key-${slug(name)}`;
  const key = `bk_${randomBytes(32).toString("base64url")}`;
  const rec: AgentKey = {
    id: uid("akey"), name, agentId, ...(model ? { model } : {}), hash: sha256(key), prefix: key.slice(0, 9),
    createdAt: new Date().toISOString(),
  };
  mutate((db) => {
    const list = (db.agentKeys ??= []);
    if (list.some((k) => !k.revokedAt && k.agentId === agentId)) throw new KeyError(409, `an active key for agent "${name}" already exists`);
    list.push(rec);
  });
  return { key, agentKey: strip(rec) };
}

export function listAgentKeys(): PublicAgentKey[] {
  return (read().agentKeys ?? []).map(strip);
}

export function revokeAgentKey(id: string): boolean {
  return mutate((db) => {
    const k = (db.agentKeys ?? []).find((x) => x.id === id);
    if (!k || k.revokedAt) return false;
    k.revokedAt = new Date().toISOString();
    return true;
  });
}

/**
 * Resolve `Authorization: Bearer <key>`. Returns null when no Authorization header is present,
 * throws KeyError(401) when one is present but is not a valid, unrevoked key.
 */
export function agentKeyFrom(req: Request): PublicAgentKey | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  if (!m) throw new KeyError(401, "Authorization must be 'Bearer <agent key>'");
  const hash = sha256(m[1]);
  const k = (read().agentKeys ?? []).find((x) => x.hash === hash && !x.revokedAt);
  if (!k) throw new KeyError(401, "invalid or revoked agent key");
  return strip(k);
}
