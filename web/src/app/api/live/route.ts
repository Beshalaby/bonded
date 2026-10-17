// GET  -> {models, presets, demoEnabled}
// POST {model, taskId, guardrail?, paceMs?} -> {runId}   Starts one paced agent session as a 1-task EvalRun.
import { writesEnabled } from "@/lib/auth";
import { HttpError, jsonBody, respond } from "@/lib/http";
import { liveModels, presets, startLive } from "./_lib";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return respond(() => ({ models: liveModels(), presets: presets(), demoEnabled: writesEnabled() }));
}

export async function POST(req: Request) {
  const b = await jsonBody<{ model?: unknown; taskId?: unknown; guardrail?: unknown; paceMs?: unknown }>(req);
  return respond(() => {
    if (!writesEnabled()) throw new HttpError(403, "live runs are disabled on this server (set SPENDBENCH_DEMO=1)");
    const run = startLive(b);
    return { runId: run.id, run };
  });
}
