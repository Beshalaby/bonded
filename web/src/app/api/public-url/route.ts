// GET /api/public-url -> { url: string | null }
// The address this server is reachable at from other devices (set by scripts/public.sh as BONDED_PUBLIC_URL),
// so pages show copy-paste snippets with the public link even when opened as http://localhost.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const raw = (process.env.BONDED_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  return NextResponse.json({ url: /^https?:\/\/[^/\s]+$/.test(raw) ? raw : null });
}
