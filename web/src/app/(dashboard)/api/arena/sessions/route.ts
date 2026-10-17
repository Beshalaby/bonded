// POST {agentId, model, instruction, budget, constraints?, taskId?, runId?, guardrail?} -> {sessionId, agentId, runId, guardrail}
import { body, createSession, handle } from "@/lib/arena";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<Parameters<typeof createSession>[0]>(req);
  return handle(() => createSession(b));
}
