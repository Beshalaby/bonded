import { NextResponse } from "next/server";
import { read } from "@/lib/db";
import { tamper, verify } from "@/lib/recorder";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.BONDED_DEMO === "0") return NextResponse.json({ error: "tampering disabled (BONDED_DEMO=0)" }, { status: 403 });
  const { seq, patch } = (await req.json().catch(() => ({}))) as { seq?: number; patch?: Record<string, unknown> };
  const entry = read().log.find((l) => l.seq === Number(seq));
  if (!entry) return NextResponse.json({ error: `entry #${seq} not found` }, { status: 404 });
  tamper(entry.seq, patch && typeof patch === "object" ? patch : { tampered: true });
  return NextResponse.json({ ok: true, sessionId: entry.sessionId, seq: entry.seq, verify: verify(entry.sessionId) });
}
