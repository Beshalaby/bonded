// GET -> {tasks: Task[], tags: {tag, count}[]}  (base tasks.json + red-team tasks_generated.json)
import { respond } from "@/lib/http";
import { listTasks, tagCounts } from "@/lib/tasks";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return respond(() => {
    const tasks = listTasks();
    return { tasks, tags: tagCounts(tasks) };
  });
}
