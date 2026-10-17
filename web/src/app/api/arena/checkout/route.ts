// POST {sessionId, reasoning?} -> {transaction, guardrail}
import { assertSessionAccess, body, checkout, handle } from "@/lib/arena";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<{ sessionId?: string; reasoning?: string }>(req);
  const sessionId = b.sessionId || req.headers.get("x-session-id") || "";
  return handle(() => { assertSessionAccess(req, sessionId); return checkout(sessionId, b.reasoning); });
}
