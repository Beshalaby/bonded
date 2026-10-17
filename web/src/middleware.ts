import { NextResponse, type NextRequest } from "next/server";
import { demoEnabled } from "@/lib/demo-gate";

// Admin (seed/inject/delete), the routes that spawn Python processes (POST /api/runs, POST /api/redteam)
// and result/scam ingestion (POST /api/bench/*)
// are sandbox-only. There is no auth layer — see README "Security".
export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const gated = p.startsWith("/api/admin") ||
    (req.method === "POST" && (p === "/api/runs" || p === "/api/redteam" || p === "/api/redteam/progress" || p === "/api/live" || p.startsWith("/api/bench/")));
  if (gated && !demoEnabled())
    return NextResponse.json({ error: "admin/run routes disabled (set SPENDBENCH_DEMO=1)" }, { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: ["/api/admin/:path*", "/api/runs", "/api/redteam", "/api/redteam/progress", "/api/live", "/api/bench/:path*"] };
