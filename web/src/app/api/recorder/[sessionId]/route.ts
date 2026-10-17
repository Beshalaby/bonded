import { NextResponse } from "next/server";
import { read } from "@/lib/db";
import { getChain, verify } from "@/lib/recorder";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const db = read();
  const session = db.sessions.find((s) => s.id === sessionId) ?? null;
  const transaction = db.transactions.find((t) => t.sessionId === sessionId) ?? null;
  const claims = db.claims.filter((c) => c.sessionId === sessionId);
  return NextResponse.json({ sessionId, session, transaction, claims, entries: getChain(sessionId), verify: verify(sessionId) });
}
