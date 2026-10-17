// Auth core shared by middleware (edge runtime) and route handlers (node). Web Crypto only: no node imports.
//
// Modes (see README "Security"):
//   open    SPENDBENCH_DEMO=1, or dev (`next dev`) with no BONDED_ADMIN_TOKEN: every route is open, as before.
//   token   BONDED_ADMIN_TOKEN is set: admin routes need the admin session cookie, service routes need
//           `x-bonded-internal` (or the cookie). Applies in dev too.
//   closed  production (or SPENDBENCH_DEMO=0) without BONDED_ADMIN_TOKEN: admin/service writes are disabled.

export type AuthMode = "open" | "token" | "closed";

export const SESSION_COOKIE = "bonded_admin";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const INTERNAL_HEADER = "x-bonded-internal";

export function adminToken(): string {
  return (process.env.BONDED_ADMIN_TOKEN || "").trim();
}

export function authMode(): AuthMode {
  if (process.env.SPENDBENCH_DEMO === "1") return "open";
  if (adminToken()) return "token";
  if (process.env.SPENDBENCH_DEMO === "0") return "closed";
  return process.env.NODE_ENV !== "production" ? "open" : "closed";
}

/** Admin/process-spawning writes are possible on this server at all (open, or token mode with a login). */
export function writesEnabled() {
  return authMode() !== "closed";
}

// ---------------------------------------------------------------- primitives
const enc = new TextEncoder();

/** Key material for session HMACs: BONDED_SESSION_SECRET, else derived from the admin token (rotating the
 *  token then invalidates every session). Must match lib/auth-node.ts. */
export function sessionSecret(): string {
  return process.env.BONDED_SESSION_SECRET || `bonded-session-v1:${adminToken()}`;
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string) {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    if (keyCache.size > 8) keyCache.clear();
    keyCache.set(secret, k);
  }
  return k;
}

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacB64(secret: string, msg: string) {
  return b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(msg)));
}

/** Constant-time string compare: HMAC both sides under a per-call random key, then XOR-compare the digests. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const k = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [x, y] = await Promise.all([crypto.subtle.sign("HMAC", k, enc.encode(a)), crypto.subtle.sign("HMAC", k, enc.encode(b))]);
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < xa.length; i++) d |= xa[i] ^ ya[i];
  return d === 0;
}

// ---------------------------------------------------------------- admin session cookie
// Cookie value: "<expiryMs>.<base64url HMAC-SHA256(secret, "admin:" + expiryMs)>". Never the raw token.

export async function createSessionValue(now = Date.now()): Promise<{ value: string; expires: Date }> {
  const exp = now + SESSION_TTL_MS;
  return { value: `${exp}.${await hmacB64(sessionSecret(), `admin:${exp}`)}`, expires: new Date(exp) };
}

export async function verifySessionValue(v: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!v || !adminToken()) return false;
  const m = /^(\d{13,16})\.([A-Za-z0-9_-]{43})$/.exec(v);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isSafeInteger(exp) || exp <= now || exp > now + SESSION_TTL_MS + 60_000) return false;
  return safeEqual(m[2], await hmacB64(sessionSecret(), `admin:${exp}`));
}

export async function checkAdminToken(candidate: unknown): Promise<boolean> {
  const t = adminToken();
  if (!t || typeof candidate !== "string" || !candidate) return false;
  return safeEqual(candidate, t);
}

// ---------------------------------------------------------------- service (internal) token
/** BONDED_INTERNAL_TOKEN, else HMAC(session secret, "internal-token-v1") hex when an admin token exists.
 *  Null in open mode without either (lib/auth-node.ts then uses a per-process random token). Must match auth-node. */
export async function configuredInternalToken(): Promise<string | null> {
  const env = (process.env.BONDED_INTERNAL_TOKEN || "").trim();
  if (env) return env;
  if (!adminToken()) return null;
  return hex(await crypto.subtle.sign("HMAC", await hmacKey(sessionSecret()), enc.encode("internal-token-v1")));
}

export async function verifyInternal(header: string | null): Promise<boolean> {
  if (!header) return false;
  const t = await configuredInternalToken();
  return !!t && safeEqual(header, t);
}

/** Read one cookie from a raw Cookie header (route handlers that only have a Request). */
export function cookieFrom(header: string | null, name = SESSION_COOKIE): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** Is this request from a signed-in admin (or is the server open)? For node route handlers. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const mode = authMode();
  if (mode === "open") return true;
  if (mode === "closed") return false;
  return verifySessionValue(cookieFrom(req.headers.get("cookie")));
}

export const AUTH_REQUIRED = { error: "Sign in required: this action needs an admin session.", code: "auth_required" } as const;
export const WRITES_DISABLED = {
  error: "Admin and run routes are disabled on this server (set BONDED_ADMIN_TOKEN to enable sign-in).", code: "writes_disabled",
} as const;
