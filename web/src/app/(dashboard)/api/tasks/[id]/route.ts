// GET -> {task, results: BenchResult[] (latest per model)}
import { read } from "@/lib/db";
import { HttpError, respond } from "@/lib/http";
import { latestResults } from "@/lib/stats";
import { getTask } from "@/lib/tasks";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  return respond(() => {
    const task = getTask(id);
    if (!task) throw new HttpError(404, `task ${id} not found`);
    const results = latestResults(read().benchResults.filter((r) => r.taskId === id)).sort((a, b) => a.model.localeCompare(b.model));
    return { task, results };
  });
}
