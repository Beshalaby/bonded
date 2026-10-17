// POST {token} -> {ok: true} + Set-Cookie bonded_admin=<expiry>.<HMAC>  (HttpOnly, SameSite=Lax, Secure in prod, 12h)
import { NextResponse } from "next/server";
import { SESSION_COOKIE, WRITES_DISABLED, authMode, checkAdminToken, createSessionValue } from "@/lib/auth";
import { jsonBody } from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const mode = authMode();
  if (mode === "open") return NextResponse.json({ ok: true, mode, note: "this server is in open demo mode; no sign-in needed" });
  if (mode === "closed") return NextResponse.json(WRITES_DISABLED, { status: 403 });
  const b = await jsonBody<{ token?: unknown }>(req);
  if (!(await checkAdminToken(b.token))) return NextResponse.json({ error: "invalid admin token", code: "auth_invalid" }, { status: 401 });
  const { value, expires } = await createSessionValue();
  const res = NextResponse.json({ ok: true, mode, expiresAt: expires.toISOString() });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires,
  });
  return res;
}
