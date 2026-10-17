// POST {agentId, model, instruction, budget, constraints?, taskId?, runId?, guardrail?} -> {sessionId, agentId, runId, guardrail}
// Optional `Authorization: Bearer <agent key>`: agentId (and model, if the key has one) come from the key, not the body.
// Without a key the session is logged `unverified: true` (except the server's own runner, via x-bonded-internal).
import { body, createSession, handle } from "@/lib/arena";
import { agentKeyFrom, isInternalRequest, KeyError, type PublicAgentKey } from "@/lib/auth-node";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let key: PublicAgentKey | null;
  try { key = agentKeyFrom(req); } catch (e) {
    if (e instanceof KeyError) return NextResponse.json({ error: e.message, code: "auth_invalid" }, { status: e.status, headers: { "WWW-Authenticate": "Bearer" } });
    throw e;
  }
  const b = await body<Parameters<typeof createSession>[0]>(req);
  return handle(() => {
    if (key) return createSession({ ...b, agentId: key.agentId, model: key.model ?? b.model }, { keyId: key.id });
    return createSession(b, { internal: isInternalRequest(req) });
  });
}
