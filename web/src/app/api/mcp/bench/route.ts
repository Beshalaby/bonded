// MCP for SpendBench: put your agent through the graded store tasks and onto the leaderboard.
// claude mcp add --transport http bonded-bench http://localhost:3000/api/mcp/bench
import { mcpHandlers } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { POST, DELETE, GET, OPTIONS } = mcpHandlers("bench");
