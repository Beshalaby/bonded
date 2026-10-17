// OWNER: Team 1. POST {sessionId, reasoning?} -> {transaction, guardian, quote}
import { body, checkout, handle } from "@/lib/arena";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<{ sessionId?: string; reasoning?: string }>(req);
  const sessionId = b.sessionId || req.headers.get("x-session-id") || "";
  return handle(() => checkout(sessionId, b.reasoning));
}
