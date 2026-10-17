// Admin only (middleware). Per-agent API keys for the Arena API and MCP.
//   POST   {name, model?} -> {key, agentKey}   the plaintext key is returned once; only its SHA-256 is stored
//   GET    -> {keys}                           metadata only (id, name, agentId, model, prefix, createdAt, revokedAt)
//   DELETE ?id=akey_... -> {revoked: true}
import { HttpError, jsonBody, respond } from "@/lib/http";
import { listAgentKeys, mintAgentKey, revokeAgentKey } from "@/lib/auth-node";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const b = await jsonBody<{ name?: unknown; model?: unknown }>(req);
  return respond(() => mintAgentKey(b));
}

export async function GET() {
  return respond(() => ({ keys: listAgentKeys() }));
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  return respond(() => {
    if (!revokeAgentKey(id)) throw new HttpError(404, `no active key ${id}`);
    return { revoked: true };
  });
}
