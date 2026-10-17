// GET /api/models/:model (URL-encoded id) -> {stats, results (≤200 newest), failures (≤50, with attribution), history}
import { read } from "@/lib/db";
import { HttpError, respond } from "@/lib/http";
import { latestResults, modelStats } from "@/lib/stats";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ model: string }> }) {
  const { model: raw } = await params;
  const model = decodeURIComponent(raw);
  return respond(() => {
    const db = read();
    const mine = db.benchResults.filter((r) => r.model === model);
    if (!mine.length) throw new HttpError(404, `no results for model ${model}`);
    const latest = latestResults(mine);
    const newest = [...mine].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const failures = latest.filter((r) => !r.success).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50);
    const byRun = new Map<string, typeof mine>();
    for (const r of mine) byRun.set(r.runId, [...(byRun.get(r.runId) ?? []), r]);
    const runCreated = new Map(db.runs.map((r) => [r.id, r.createdAt]));
    const history = [...byRun].map(([runId, rs]) => {
      const s = modelStats(model, latestResults(rs));
      const createdAt = runCreated.get(runId) ?? rs.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), rs[0].createdAt);
      return { runId, createdAt, score: s.score, successRate: s.metrics.successRate };
    }).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return { stats: modelStats(model, latest), results: newest.slice(0, 200), failures, history };
  });
}
