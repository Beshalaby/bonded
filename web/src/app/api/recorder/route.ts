import { NextResponse } from "next/server";
import { read } from "@/lib/db";
import { verify } from "@/lib/recorder";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") || 50);
  const db = read();
  const sessions = [...db.sessions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((s) => {
      const tx = db.transactions.find((t) => t.id === s.transactionId || t.sessionId === s.id);
      return {
        id: s.id, agentId: s.agentId, model: s.model, instruction: s.task?.instruction, budget: s.task?.budget,
        status: s.status, createdAt: s.createdAt,
        transaction: tx ? { id: tx.id, amount: tx.amount, status: tx.status } : null,
        verify: verify(s.id),
      };
    });
  return NextResponse.json({ sessions });
}
