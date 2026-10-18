// MCP server (Streamable HTTP transport, protocol 2025-06-18; also 2025-03-26 / 2024-11-05).
//   POST   JSON-RPC message or batch -> application/json (202 when only notifications/responses were sent)
//   DELETE end the MCP session (Mcp-Session-Id header)
//   GET    405: this server does not open server-initiated SSE streams
// Mounted three times: /api/mcp/penny (Penny's shopping tools), /api/mcp/bench (SpendBench), /api/mcp (all, legacy).
import { currentPublicHost } from "@/lib/public-url";
import { NextResponse } from "next/server";
import { agentKeyFrom, KeyError, type PublicAgentKey } from "@/lib/auth-node";
import { closeClient, handleMessage, hasSession, SUPPORTED_VERSIONS, type RpcReply, type Toolset } from "@/lib/mcp/server";


const LOCAL = ["localhost", "127.0.0.1", "[::1]", "::1"];
/** Hostnames we answer for. Add public hosts explicitly via SPENDBENCH_ALLOWED_HOSTS=a.com,b.com */
function allowedHosts(): Set<string> {
  const extra = (process.env.SPENDBENCH_ALLOWED_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const pub = currentPublicHost(); // the live tunnel link, which can change while the server runs
  if (pub) extra.push(pub);
  return new Set([...LOCAL, ...extra]);
}
const hostnameOf = (hostHeader: string) => { try { return new URL(`http://${hostHeader}`).hostname.toLowerCase(); } catch { return ""; } };

/** DNS-rebinding protection: the Host must be allowlisted (a rebound attacker domain is not), and a browser
 *  Origin, when present, must be allowlisted too. No Origin = non-browser client (CLI agents). */
function originAllowed(req: Request): boolean {
  const hosts = allowedHosts();
  const host = hostnameOf(req.headers.get("host") || "");
  if (!hosts.has(host)) return false;
  const o = req.headers.get("origin");
  if (o === null) return true;
  // A deliberately public hostname (tunnel or deployment): hosted agents (Claude.ai, ChatGPT connectors,
  // browser clients) send their own Origin, and MCP carries no ambient credentials, so any origin may call it.
  // The Host allowlist above still defeats DNS rebinding.
  if (isPublicName(host)) return true;
  // localhost / IP literals (incl. a LAN IP): a malicious web page must not be able to drive a server on the
  // visitor's own machine or network, so the Origin has to be allow-listed too.
  try { return hosts.has(new URL(o).hostname.toLowerCase()); } catch { return false; }
}

/** A DNS name other than localhost-style names; IP literals don't count. */
function isPublicName(host: string): boolean {
  if (!host || LOCAL.includes(host) || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
  return host.includes(".");
}

/** One line per MCP request (no bodies, no keys), so connection problems can be traced from the server log. */
function logRequest(req: Request, status: number, note = "") {
  const ua = (req.headers.get("user-agent") || "-").slice(0, 60);
  const origin = req.headers.get("origin") || "-";
  console.log(`[mcp] ${req.method} ${new URL(req.url).pathname} ${status} host=${hostnameOf(req.headers.get("host") || "")} origin=${origin} ua="${ua}"${note ? ` ${note}` : ""}`);
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

export function mcpHandlers(toolset: Toolset) {
async function POST(req: Request) {
  if (!originAllowed(req)) { logRequest(req, 403, "forbidden-origin-or-host"); return rpcError(req, 403, -32000, "Forbidden origin"); }
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
    const out = await handleMessage(m, { sessionId, origin: publicOrigin(req), agentKey, toolset });
    if (out.newSessionId) sessionId = out.newSessionId;
    if (out.reply) replies.push(out.reply);
  }
  const headers: Record<string, string> = { ...cors(req), ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) };
  const methods = msgs.map((m) => String((m as { method?: unknown })?.method ?? "?")).join(",");
  if (!replies.length) { logRequest(req, 202, methods); return new Response(null, { status: 202, headers }); }
  logRequest(req, 200, methods);
  return NextResponse.json(batch ? replies : replies[0], { headers });
}

async function DELETE(req: Request) {
  if (!originAllowed(req)) return rpcError(req, 403, -32000, "Forbidden origin");
  const sid = req.headers.get("mcp-session-id");
  if (!sid) return rpcError(req, 400, -32000, "Mcp-Session-Id header required");
  closeClient(sid);
  return new Response(null, { status: 200, headers: cors(req) });
}

async function GET(req: Request) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method Not Allowed: this server does not offer an SSE stream; POST JSON-RPC instead." } }), {
    status: 405, headers: { "Content-Type": "application/json", Allow: "POST, DELETE, OPTIONS", ...cors(req) },
  });
}

async function OPTIONS(req: Request) {
  if (!originAllowed(req)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: cors(req) });
}
return { POST, DELETE, GET, OPTIONS };
}
