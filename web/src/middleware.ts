import { NextResponse, type NextRequest } from "next/server";
import { demoEnabled } from "@/lib/demo-gate";

// Admin (seed/inject), demo orchestration and evidence tampering are sandbox-only.
// There is no auth layer yet — see README "Security".
export function middleware(_req: NextRequest) {
  if (!demoEnabled()) return NextResponse.json({ error: "demo/admin routes disabled (set BONDED_DEMO=1)" }, { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: ["/api/admin/:path*", "/api/demo/:path*", "/api/recorder/tamper"] };
