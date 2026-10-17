import { NextResponse } from "next/server";
import { read } from "@/lib/db";
import { explainLimit, getProfile } from "@/lib/risk";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const db = read();
  const id = decodeURIComponent(agentId);
  let profile = db.risk.find((r) => r.agentId === id);
  if (!profile) {
    const model = new URL(req.url).searchParams.get("model") || db.agents.find((a) => a.id === id)?.model;
    if (!model) return NextResponse.json({ error: `unknown agent ${id}` }, { status: 404 });
    profile = getProfile(id, model);
  }
  return NextResponse.json({ ...profile, explanation: explainLimit(profile) });
}
