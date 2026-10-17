// GET -> {runs: EvalRun[]} newest first
// POST {models, taskCount?, taskIds?, tags?, includeAdversarial?, guardrail?} -> {run}  (demo-gated; runs in background)
import { jsonBody, respond } from "@/lib/http";
import { createRun, listRuns, type CreateRunInput } from "@/lib/runs";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return respond(() => ({ runs: listRuns() }));
}

export async function POST(req: Request) {
  const b = await jsonBody<CreateRunInput>(req);
  return respond(() => ({ run: createRun(b) }));
}
