// POST /api/check { url?, text?, intent?: { request?, budget? } }
//   -> { listing, verdict, fetched: { status, site, extractedWith, blocked?, ms, cached? }, fallback? }
// Fetches a real product listing (SSRF-safe), normalises it and runs Bonded Shield. Nothing is ever purchased.
// Public; rate-limited per IP in token/closed mode (middleware). Raw page HTML is never returned.
import { NextResponse } from "next/server";
import { CheckError, checkListing, parseCheckInput } from "@/lib/shield/web/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { body = null; }
  const input = parseCheckInput(body);
  if (typeof input === "string") return NextResponse.json({ error: input, code: "bad_request" }, { status: 400 });
  try {
    return NextResponse.json(await checkListing(input), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const err = e instanceof CheckError ? e : new CheckError(500, "internal", "Something went wrong checking that listing.");
    if (!(e instanceof CheckError)) console.error("[api/check]", e);
    return NextResponse.json({ error: err.message, code: err.code, ...(err.fallback ? { fallback: err.fallback } : {}) }, { status: err.status });
  }
}
