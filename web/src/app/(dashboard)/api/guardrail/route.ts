// GET /api/guardrail?scope=all|latest&runId= → GuardrailEval (guardrail as a classifier; see lib/guardrail-eval.ts)
import { respond } from "@/lib/http";
import { evaluateGuardrail, type GuardrailScope } from "@/lib/guardrail-eval";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const scope: GuardrailScope = u.searchParams.get("scope") === "latest" ? "latest" : "all";
  return respond(() => evaluateGuardrail({ scope, runId: u.searchParams.get("runId") }));
}
