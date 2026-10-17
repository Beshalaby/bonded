// GET /api/traces/:sessionId/raw → the session's hash-chain entries exactly as stored and hashed, plus the spec.
// Add ?download=1 for a Content-Disposition attachment. Verify offline with the scripts on /methodology#verify.
import { read } from "@/lib/db";
import { GENESIS, getChain } from "@/lib/recorder";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!read().sessions.some((s) => s.id === sessionId)) {
    return Response.json({ error: `session ${sessionId} not found` }, { status: 404 });
  }
  const body = {
    sessionId,
    spec: {
      algorithm: "sha256",
      genesis: GENESIS,
      hash: "hex(sha256(utf8(prevHash + canonical(entry without 'hash'))))",
      canonical: "JSON with object keys sorted, undefined-valued keys omitted, no whitespace; scalars as JSON.stringify",
    },
    entries: getChain(sessionId),
  };
  const download = new URL(req.url).searchParams.get("download");
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(download ? { "content-disposition": `attachment; filename="trace-${sessionId.replace(/[^\w.-]/g, "_")}.json"` } : {}),
    },
  });
}
