// GET /api/compare?runId=            → { matrix: PairwiseMatrixData }
// GET /api/compare?a=<model>&b=<model> → { matrix, pair: PairDetail | null }
import { HttpError, respond } from "@/lib/http";
import { comparePair, pairwiseMatrix } from "@/lib/compare";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const runId = u.searchParams.get("runId");
  const a = u.searchParams.get("a"), b = u.searchParams.get("b");
  return respond(() => {
    const matrix = pairwiseMatrix({ runId });
    if (!a || !b) return { matrix };
    if (a === b) throw new HttpError(400, "pick two different models");
    return { matrix, pair: comparePair(a, b, { runId }) };
  });
}
