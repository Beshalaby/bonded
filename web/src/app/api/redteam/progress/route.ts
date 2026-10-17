// POST {phase, job, round?, ...} -> {ok: true}
// Fine-grained red-team progress from agents/redteam/loop.py (--post). Republished on the SSE bus as
// FeedEvent{type: "scam", data: {phase, ...}} for the red-team theater. Registry upserts keep their own
// `scam` events (data = RedTeamScam, no `phase`), so existing consumers can tell the two apart.
//
// Phases: job_start · round_start · scam_generated {scam} · scam_tested {scamId, model, fooled, ...}
//         scam_kept / scam_discarded {scamId, fooled, variantTaskId?, benchmarkTasks} · round_retry · round_end · job_end
import { NextResponse } from "next/server";
import { writesEnabled } from "@/lib/auth";
import { publish } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PHASES = [
  "job_start", "round_start", "scam_generated", "scam_tested", "scam_kept", "scam_discarded", "round_retry", "round_end", "job_end",
] as const;
const MAX_BYTES = 64_000;

export async function POST(req: Request) {
  // Auth is enforced in middleware (service token or admin cookie); this is the fail-closed backstop.
  if (!writesEnabled()) return NextResponse.json({ error: "red-team progress disabled (set SPENDBENCH_DEMO=1)" }, { status: 403 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "body too large" }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "expected an object" }, { status: 400 });
  const phase = body.phase;
  if (typeof phase !== "string" || !(PHASES as readonly string[]).includes(phase))
    return NextResponse.json({ error: `phase must be one of ${PHASES.join(", ")}` }, { status: 400 });
  publish("scam", { ...body, phase, at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
