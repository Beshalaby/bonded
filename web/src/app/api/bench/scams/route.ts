import { NextResponse } from "next/server";
import { addScams, listScams } from "@/lib/bench";

export const dynamic = "force-dynamic";

/** Red-team scam registry: scams that fooled >=1 model and were added to the benchmark. */
export async function GET() {
  const scams = listScams();
  const byType: Record<string, number> = {};
  const fooledCounts: Record<string, number> = {};
  for (const s of scams) {
    byType[s.trapType] = (byType[s.trapType] ?? 0) + 1;
    for (const m of s.fooled) fooledCounts[m] = (fooledCounts[m] ?? 0) + 1;
  }
  return NextResponse.json({ scams, total: scams.length, byType, fooledCounts });
}

/** POST {scams: RedTeamScam[]} — used by agents/redteam/loop.py --post. */
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
