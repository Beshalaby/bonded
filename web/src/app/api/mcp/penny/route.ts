// MCP for Penny: plan_purchase, get_proposal, vet_listing, send_listing (never purchases).
// claude mcp add --transport http bonded-penny http://localhost:3000/api/mcp/penny
import { mcpHandlers } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { POST, DELETE, GET, OPTIONS } = mcpHandlers("penny");
