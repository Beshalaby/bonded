// MCP, all tools (legacy combined endpoint). Prefer /api/mcp/penny or /api/mcp/bench.
import { mcpHandlers } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { POST, DELETE, GET, OPTIONS } = mcpHandlers("all");
