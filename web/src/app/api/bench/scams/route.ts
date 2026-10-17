// Red-team scam registry write endpoint (used by agents/redteam/loop.py --post). Read via GET /api/redteam.
// GET is kept as a thin alias -> {scams, total}.
import { NextResponse } from "next/server";
import { addScams, listScams } from "@/lib/bench";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const scams = listScams();
  return NextResponse.json({ scams, total: scams.length });
}

/** POST {scams: RedTeamScam[]} — upserts and emits `scam` events. */
export async function POST(req: Request) {
  let body: { scams?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body?.scams)) return NextResponse.json({ error: "expected {scams: RedTeamScam[]}" }, { status: 400 });
  const added = addScams(body.scams);
  return NextResponse.json({ added: added.length, total: listScams().length });
}
