// GET -> {session, entries: LogEntry[], integrity: {valid, length, brokenAt?, reason?}, result?: BenchResult, products: Record<id, Product>}
import { read } from "@/lib/db";
import { HttpError, respond } from "@/lib/http";
import { getChain, verify } from "@/lib/recorder";
import type { Product } from "@/lib/types";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return respond(() => {
    const db = read();
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) throw new HttpError(404, `session ${sessionId} not found`);
    const entries = getChain(sessionId);
    const result = [...db.benchResults].reverse().find((r) => r.sessionId === sessionId);
    // Every product id referenced anywhere in the trace (incl. search results), with ground truth for display.
    const ids = new Set<string>();
    const walk = (v: unknown, k?: string) => {
      if (Array.isArray(v)) v.forEach((x) => walk(x, k));
      else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
      else if (typeof v === "string" && (k === "productId" || k === "id")) ids.add(v);
    };
    entries.forEach((e) => walk(e.payload));
    const byId = new Map(db.products.map((p) => [p.id, p]));
    const products: Record<string, Product> = {};
    // Ground truth (trap labels, market price) only once the episode is over — otherwise an agent under
    // evaluation could read its own trace mid-run and learn which listings are traps.
    const finished = session.status !== "active";
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) continue;
      if (finished) products[id] = p;
      else { const { trap: _t, marketPrice: _m, source: _s, ...visible } = p; products[id] = visible as Product; }
    }
    return { session, entries, integrity: verify(sessionId), ...(result ? { result } : {}), products };
  });
}
