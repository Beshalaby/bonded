// GET -> {run, results: BenchResult[], leaderboard: ModelStats[]}
import { read } from "@/lib/db";
import { HttpError, respond } from "@/lib/http";
import { getRun } from "@/lib/runs";
import { computeStats } from "@/lib/stats";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(() => {
    const run = getRun(id);
    if (!run) throw new HttpError(404, `run ${id} not found`);
    const results = read().benchResults.filter((r) => r.runId === id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { run, results, leaderboard: computeStats({ runId: id }) };
  });
}
