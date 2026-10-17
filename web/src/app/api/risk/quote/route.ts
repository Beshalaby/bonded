import { NextResponse } from "next/server";
import { quote } from "@/lib/risk";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { agentId?: string; model?: string; amount?: number };
  if (!body.agentId || !body.model || !Number.isFinite(Number(body.amount)))
    return NextResponse.json({ error: "agentId, model and amount are required" }, { status: 400 });
  return NextResponse.json(quote(body.agentId, body.model, Number(body.amount)));
}
