// GET ?runId= -> {rows: ModelStats[] (score desc), totals, updatedAt}
import { respond } from "@/lib/http";
import { leaderboard } from "@/lib/stats";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId");
  return respond(() => leaderboard(runId || undefined));
}
