// POST /api/shield/analyze → ShieldVerdict (Bonded Shield: is this listing safe to buy for this request?)
//   { product_id, intent?, market?: "reference"|"hidden", llm?: boolean }      Arena product → ShieldVerdict
//   { product_ids: string[≤40], intent?, market?, llm? }                         → { verdicts: Record<id, ShieldVerdict>, missing: string[] }
//   { listing: NormalizedListing, intent?, llm? }                                any listing (web, pasted) → ShieldVerdict
// Read-style compute endpoint: public, rate-limited per IP in token/closed mode (middleware.ts). Never reads ground truth.
import { isInternalRequest } from "@/lib/auth-node";
import { HttpError, jsonBody, respond } from "@/lib/http";
import { analyzeArenaProduct, analyzeCached } from "@/lib/shield/arena";
import { parseShieldRequest } from "@/lib/shield/input";
import type { ShieldVerdict } from "@/lib/shield/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return respond(async () => {
    const r = parseShieldRequest(await jsonBody(req));
    if (typeof r === "string") throw new HttpError(400, r);
    if (r.listing) return analyzeCached(r.listing, r.intent, { llm: r.llm });
    const ids = r.productIds!;
    // A batch is one rate-limit token but up to 40 analyses: only the server's own runner may switch the
    // LLM judge on for batches, so a public caller can't amplify model spend.
    const llm = r.batch && !isInternalRequest(req) ? false : r.llm;
    const opts = { market: r.market, llm };
    if (!r.batch) {
      const v = analyzeArenaProduct(ids[0], r.intent, opts);
      if (!v) throw new HttpError(404, `product ${ids[0]} not found`);
      return v;
    }
    const verdicts: Record<string, ShieldVerdict> = {};
    const missing: string[] = [];
    await Promise.all(ids.map(async (id) => {
      const v = analyzeArenaProduct(id, r.intent, opts);
      if (v) verdicts[id] = await v; else missing.push(id);
    }));
    return { verdicts, missing };
  });
}
