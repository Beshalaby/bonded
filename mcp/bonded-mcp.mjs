#!/usr/bin/env node
// Bonded MCP stdio bridge: lets any stdio-only MCP client (Claude Desktop, agent frameworks, IDEs)
// talk to a Bonded server's Streamable HTTP endpoint. Zero dependencies; Node 18+.
//
//   BONDED_URL=http://localhost:3000 BONDED_MCP=penny node mcp/bonded-mcp.mjs
//
// Env: BONDED_URL (default http://localhost:3000), BONDED_MCP = penny | bench | all (default all),
//      BONDED_AGENT_KEY (optional Bearer agent key).
// Protocol: newline-delimited JSON-RPC on stdin/stdout (MCP stdio transport); logs go to stderr.
import readline from "node:readline";

const BASE = (process.env.BONDED_URL || "http://localhost:3000").replace(/\/$/, "");
const WHICH = (process.env.BONDED_MCP || "all").toLowerCase();
const ENDPOINT = `${BASE}/api/mcp${WHICH === "penny" ? "/penny" : WHICH === "bench" ? "/bench" : ""}`;
const KEY = process.env.BONDED_AGENT_KEY || "";
const log = (...a) => process.stderr.write(`[bonded-mcp] ${a.join(" ")}\n`);

let sessionId = null;
let protocolVersion = null;
let initMessage = null; // replayed if the server restarts and forgets our session

const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

async function post(payload) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  if (protocolVersion) headers["mcp-protocol-version"] = protocolVersion;
  if (KEY) headers.authorization = `Bearer ${KEY}`;
  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(payload) });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function reinitialize() {
  log("session expired on the server; re-initializing");
  sessionId = null;
  const r = await post(initMessage);
  if (r.status >= 400) throw new Error(`re-initialize failed: HTTP ${r.status}`);
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
}

async function handle(msg) {
  const isRequest = msg && msg.id !== undefined && typeof msg.method === "string";
  if (msg?.method === "initialize") { initMessage = msg; sessionId = null; }
  try {
    let r = await post(msg);
    if (r.status === 404 && initMessage && msg.method !== "initialize") { await reinitialize(); r = await post(msg); }
    if (msg?.method === "initialize" && r.body?.result?.protocolVersion) protocolVersion = r.body.result.protocolVersion;
    if (r.body) for (const reply of Array.isArray(r.body) ? r.body : [r.body]) {
      // HTTP-level errors come back with id:null; give the client its own request id back
      if (isRequest && reply && reply.id === null) reply.id = msg.id;
      send(reply);
    } else if (isRequest && r.status >= 400) {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: `Bonded server returned HTTP ${r.status}` } });
    }
  } catch (e) {
    log(`request failed: ${e.message}`);
    if (isRequest) send({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: `Cannot reach Bonded at ${ENDPOINT}: ${e.message}` } });
  }
}

// Requests are processed in order so a session id from initialize is in place before the next call.
let chain = Promise.resolve();
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
  chain = chain.then(() => handle(msg));
}).on("close", () => {
  chain.then(async () => {
    if (sessionId) await fetch(ENDPOINT, { method: "DELETE", headers: { "mcp-session-id": sessionId } }).catch(() => {});
    process.exit(0);
  });
});
log(`bridging stdio -> ${ENDPOINT}`);
