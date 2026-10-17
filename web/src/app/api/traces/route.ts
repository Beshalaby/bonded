// GET ?model=&runId=&limit=50 -> {traces: {sessionId, model, taskId?, runId?, instruction, createdAt, steps, outcome (success|failed|no_purchase|ungraded), amount?}[]}
import { read } from "@/lib/db";
import { intParam, respond } from "@/lib/http";
import type { BenchResult } from "@/lib/types";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const model = u.searchParams.get("model");
  const runId = u.searchParams.get("runId");
  const limit = intParam(u.searchParams.get("limit"), 50, 1, 500);
  return respond(() => {
    const db = read();
    const bySession = new Map<string, BenchResult>();
    for (const r of db.benchResults) if (r.sessionId) bySession.set(r.sessionId, r);
    const steps = new Map<string, number>();
    for (const e of db.log) steps.set(e.sessionId, (steps.get(e.sessionId) ?? 0) + 1);
    const txs = new Map(db.transactions.map((t) => [t.id, t]));
    const traces = [];
    for (let i = db.sessions.length - 1; i >= 0 && traces.length < limit; i--) {
      const s = db.sessions[i];
      const r = bySession.get(s.id);
      const sRun = s.runId ?? r?.runId;
      if (model && s.model !== model) continue;
      if (runId && sRun !== runId) continue;
      const tx = s.transactionId ? txs.get(s.transactionId) : undefined;
      // No graded result (e.g. red-team probes, ad-hoc CLI sessions): don't claim a pass we never graded
      const outcome: "success" | "failed" | "no_purchase" | "ungraded" = r
        ? r.success ? "success" : r.bought === false ? "no_purchase" : "failed"
        : "ungraded";
      traces.push({
        sessionId: s.id, model: s.model, taskId: s.task.taskId ?? r?.taskId, runId: sRun, instruction: s.task.instruction,
        createdAt: s.createdAt, steps: steps.get(s.id) ?? 0, outcome,
        ...(tx || r?.amount != null ? { amount: tx?.amount ?? r?.amount } : {}),
      });
    }
    return { traces };
  });
}
