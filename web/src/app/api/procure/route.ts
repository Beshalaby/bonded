// Penny, the shopping agent.
// POST /api/procure { request, budget?, quantity?, constraints?, sources?: ("web"|"arena")[] } -> Proposal
//   Plans a purchase (council of experts + trust score) and returns what Penny would buy. Never orders anything.
// GET  /api/procure?limit=50 -> { proposals: Proposal[] } newest first
import { authMode, isAdminRequest } from "@/lib/auth";
import { agentKeyFrom, isInternalRequest } from "@/lib/auth-node";
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
    // Same gate as the MCP plan_purchase tool: on an exposed server, web sourcing (LLM search + page fetches,
    // the expensive part) needs an admin session, an agent key or the service token; anyone else gets the Arena.
    let agent = "http";
    if (authMode() !== "open") {
      let key: ReturnType<typeof agentKeyFrom> = null;
      try { key = agentKeyFrom(req); } catch { throw new HttpError(401, "invalid or revoked agent key"); }
      const trusted = !!key || isInternalRequest(req) || (await isAdminRequest(req));
      if (!trusted) {
        if (parsed.sources?.includes("web")) throw new HttpError(401, "Web sourcing needs a sign-in or an agent key. Use sources: [\"arena\"].");
        parsed.sources = ["arena"];
      }
      if (key) agent = key.name;
    }
    return procure({ ...parsed, agent });
  });
}

export async function GET(req: Request) {
  const limit = intParam(new URL(req.url).searchParams.get("limit"), 50, 1, 200);
  return respond(async () => {
    // Everyone's requests and plans: only admins (or the local open demo) may list them. A single proposal stays
    // readable by its unguessable id (GET /api/procure/:id), which is what its creator is given.
    if (authMode() !== "open" && !(await isAdminRequest(req)) && !isInternalRequest(req))
      throw new HttpError(401, "Listing proposals needs an admin sign-in.");
    return { proposals: listProposals(limit) };
  });
}
