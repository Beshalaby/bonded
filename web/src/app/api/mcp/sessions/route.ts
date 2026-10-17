// GET -> { clients, sessions }: connected MCP clients and recent MCP-driven arena sessions (progress + grade).
// Feeds the live "Connected agents" panel on /connect (which also listens to /api/events for instant updates).
import { respond } from "@/lib/http";
import { mcpOverview } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") || 12) || 12, 1), 50);
  return respond(() => mcpOverview(limit));
}
