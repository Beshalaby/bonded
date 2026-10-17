// MCP server (Streamable HTTP transport, protocol 2025-06-18; also 2025-03-26 / 2024-11-05).
//   POST   JSON-RPC message or batch -> application/json (202 when only notifications/responses were sent)
//   DELETE end the MCP session (Mcp-Session-Id header)
//   GET    405: this server does not open server-initiated SSE streams
// Add to Claude Code:  claude mcp add --transport http bonded http://localhost:3000/api/mcp
import { NextResponse } from "next/server";
import { agentKeyFrom, KeyError, type PublicAgentKey } from "@/lib/auth-node";
import { closeClient, handleMessage, hasSession, SUPPORTED_VERSIONS, type RpcReply } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCAL = ["localhost", "127.0.0.1", "[::1]", "::1"];
/** Hostnames we answer for. Add public hosts explicitly via SPENDBENCH_ALLOWED_HOSTS=a.com,b.com */
function allowedHosts(): Set<string> {
  const extra = (process.env.SPENDBENCH_ALLOWED_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return new Set([...LOCAL, ...extra]);
}
const hostnameOf = (hostHeader: string) => { try { return new URL(`http://${hostHeader}`).hostname.toLowerCase(); } catch { return ""; } };

/** DNS-rebinding protection: the Host must be allowlisted (a rebound attacker domain is not), and a browser
 *  Origin, when present, must be allowlisted too. No Origin = non-browser client (CLI agents). */
function originAllowed(req: Request): boolean {
  const hosts = allowedHosts();
  if (!hosts.has(hostnameOf(req.headers.get("host") || ""))) return false;
  const o = req.headers.get("origin");
  if (o === null) return true;
  try { return hosts.has(new URL(o).hostname.toLowerCase()); } catch { return false; }
}

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin");
  if (!o || !originAllowed(req)) return {};
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, accept, mcp-session-id, mcp-protocol-version, authorization",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    Vary: "Origin",
  };
}

/** Public origin for links we hand to the agent (respects proxies). */
function publicOrigin(req: Request): string {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const rpcError = (req: Request, status: number, code: number, message: string) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers: cors(req) });

export async function POST(req: Request) {
  if (!originAllowed(req)) return rpcError(req, 403, -32000, "Forbidden origin");
  const pv = req.headers.get("mcp-protocol-version");
  if (pv && !SUPPORTED_VERSIONS.includes(pv)) return rpcError(req, 400, -32000, `Unsupported MCP-Protocol-Version: ${pv}`);

  // Optional agent key: a valid one fixes the agent's identity for sessions this request initializes.
  let key: PublicAgentKey | null;
  try { key = agentKeyFrom(req); } catch (e) {
    if (e instanceof KeyError) return rpcError(req, e.status, -32001, e.message);
    throw e;
  }
  const agentKey = key ? { id: key.id, name: key.name, agentId: key.agentId, ...(key.model ? { model: key.model } : {}) } : undefined;

  let body: unknown;
  try { body = JSON.parse(await req.text()); } catch { return rpcError(req, 400, -32700, "Parse error"); }
  const batch = Array.isArray(body);
  const msgs = batch ? (body as unknown[]) : [body];
  if (batch && !msgs.length) return rpcError(req, 400, -32600, "Invalid Request: empty batch");

  let sessionId = req.headers.get("mcp-session-id");
  const initializing = msgs.some((m) => (m as { method?: unknown })?.method === "initialize");
  if (sessionId && !initializing && !hasSession(sessionId)) return rpcError(req, 404, -32001, "Session not found; re-initialize");
  const replies: RpcReply[] = [];
  for (const m of msgs) {
    const out = await handleMessage(m, { sessionId, origin: publicOrigin(req), agentKey });
    if (out.newSessionId) sessionId = out.newSessionId;
    if (out.reply) replies.push(out.reply);
  }
  const headers: Record<string, string> = { ...cors(req), ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) };
  if (!replies.length) return new Response(null, { status: 202, headers });
  return NextResponse.json(batch ? replies : replies[0], { headers });
}

export async function DELETE(req: Request) {
  if (!originAllowed(req)) return rpcError(req, 403, -32000, "Forbidden origin");
  const sid = req.headers.get("mcp-session-id");
  if (!sid) return rpcError(req, 400, -32000, "Mcp-Session-Id header required");
  closeClient(sid);
  return new Response(null, { status: 200, headers: cors(req) });
}

export async function GET(req: Request) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method Not Allowed: this server does not offer an SSE stream; POST JSON-RPC instead." } }), {
    status: 405, headers: { "Content-Type": "application/json", Allow: "POST, DELETE, OPTIONS", ...cors(req) },
  });
}

export async function OPTIONS(req: Request) {
  if (!originAllowed(req)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: cors(req) });
}
