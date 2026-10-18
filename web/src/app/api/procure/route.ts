// Penny, the shopping agent.
// POST /api/procure { request, budget?, quantity?, constraints?, sources?: ("web"|"arena")[] } -> Proposal
//   Plans a purchase (council of experts + trust score) and returns what Penny would buy. Never orders anything.
// GET  /api/procure?limit=50 -> { proposals: Proposal[] } newest first
import { HttpError, intParam, jsonBody, respond } from "@/lib/http";
import { listProposals, procure } from "@/lib/procure";
import { parseProcureArgs } from "@/lib/procure/args";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  return respond(async () => {
    const b = await jsonBody(req);
    const parsed = parseProcureArgs(b);
    if (typeof parsed === "string") throw new HttpError(400, parsed);
    return procure({ ...parsed, agent: "http" });
  });
}

export async function GET(req: Request) {
  const limit = intParam(new URL(req.url).searchParams.get("limit"), 50, 1, 200);
  return respond(() => ({ proposals: listProposals(limit) }));
}
