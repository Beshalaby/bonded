import { NextResponse, type NextRequest } from "next/server";
import { AUTH_REQUIRED, INTERNAL_HEADER, SESSION_COOKIE, WRITES_DISABLED, authMode, verifyInternal, verifySessionValue } from "@/lib/auth";

// Access policy for every /api route (README "Security"). Deny by default for non-GET methods.
//
//   public          GET/HEAD/OPTIONS (except /api/admin/* and /api/auth/agent-keys), /api/arena/*, /api/mcp,
//                   /api/auth/login|logout|session
//   service         POST /api/bench/*, POST /api/redteam/progress: x-bonded-internal or admin cookie
//   admin (+svc)    /api/admin/* (any method; the Python runner reads trap ground truth and injects listings here)
//   admin           every other write: POST /api/runs, /api/redteam, /api/live, /api/auth/agent-keys, ...
//
// Rate limits (token/closed mode only; per client IP, in-memory token buckets): /api/mcp 60/min, POST /api/arena/sessions 20/min,
// POST /api/auth/login 10/min. Requests carrying a valid service token are exempt.

// ---------------------------------------------------------------- rate limiting
type Bucket = { tokens: number; at: number };
const g = globalThis as unknown as { __bondedRl?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = g.__bondedRl ?? (g.__bondedRl = new Map());
const LIMITS = { mcp: 60, sessions: 20, login: 10 } as const; // per minute

function take(name: keyof typeof LIMITS, ip: string): number {
  const cap = LIMITS[name], rate = cap / 60_000, now = Date.now(), key = `${name}:${ip}`;
  const b = buckets.get(key) ?? { tokens: cap, at: now };
  b.tokens = Math.min(cap, b.tokens + (now - b.at) * rate);
  b.at = now;
  if (buckets.size > 20_000) for (const [k, v] of buckets) if (now - v.at > 120_000) buckets.delete(k);
  if (b.tokens >= 1) { b.tokens -= 1; buckets.set(key, b); return 0; }
  buckets.set(key, b);
  return Math.max(1, Math.ceil((1 - b.tokens) / rate / 1000)); // seconds until the next token
}

/** Client IP from X-Forwarded-For, counted from the right: BONDED_PROXY_HOPS (default 1) trusted proxies append
 *  to it, so entries left of that are client-supplied. Next sets XFF from the socket only when it is absent, so a
 *  server exposed without a proxy cannot tell spoofed values apart: put it behind one. */
function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const hops = Math.max(1, Math.floor(Number(process.env.BONDED_PROXY_HOPS) || 1));
    return parts[Math.max(0, parts.length - hops)] || "unknown";
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

const limited = (retry: number) =>
  NextResponse.json({ error: "rate limit exceeded; slow down", code: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retry) } });

// ---------------------------------------------------------------- policy
const deny = (mode: string) => mode === "closed"
  ? NextResponse.json(WRITES_DISABLED, { status: 403 })
  : NextResponse.json(AUTH_REQUIRED, { status: 401 });

/** Cookie-authenticated writes must come from our own origin (SameSite=Lax already blocks most CSRF). */
function sameOrigin(req: NextRequest): boolean {
  const o = req.headers.get("origin");
  if (!o) return true;
  try {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    return new URL(o).host === host;
  } catch { return false; }
}

export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const m = req.method;
  const read = m === "GET" || m === "HEAD" || m === "OPTIONS";
  const internalHeader = req.headers.get(INTERNAL_HEADER);
  const internal = () => verifyInternal(internalHeader);

  // Rate-limited public agent surfaces. Only when the server is exposed (token/closed mode): in open local demo
  // mode there is no internal token the middleware can verify, so limiting would throttle our own runner.
  const limiting = authMode() !== "open";
  if (p === "/api/mcp" && m !== "OPTIONS") {
    const r = limiting ? take("mcp", clientIp(req)) : 0;
    return r ? limited(r) : NextResponse.next();
  }
  if (p === "/api/arena/sessions" && m === "POST") {
    if (limiting && !(internalHeader && await internal())) { const r = take("sessions", clientIp(req)); if (r) return limited(r); }
    return NextResponse.next();
  }
  if (p === "/api/auth/login" && m === "POST") {
    const r = take("login", clientIp(req));
    return r ? limited(r) : NextResponse.next();
  }
  if (p.startsWith("/api/arena/") || p === "/api/auth/logout" || p === "/api/auth/session") return NextResponse.next();

  const admin = p.startsWith("/api/admin/") || p === "/api/admin" || p.startsWith("/api/auth/agent-keys");
  if (read && !admin) return NextResponse.next();

  const mode = authMode();
  if (mode === "open") return NextResponse.next();
  if (mode === "closed") return deny(mode);

  const service = m === "POST" && (p.startsWith("/api/bench/") || p === "/api/redteam/progress");
  if ((service || p.startsWith("/api/admin")) && internalHeader) {
    if (await internal()) return NextResponse.next();
    return NextResponse.json({ error: "invalid service token", code: "auth_invalid" }, { status: 401 });
  }
  if (await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value)) {
    if (!read && !sameOrigin(req)) return NextResponse.json({ error: "cross-origin request refused", code: "bad_origin" }, { status: 403 });
    return NextResponse.next();
  }
  return deny(mode);
}

export const config = { matcher: ["/api/:path*"] };
