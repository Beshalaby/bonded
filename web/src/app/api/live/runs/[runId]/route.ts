// GET -> {run, sessionId | null, running}   Fallback discovery of a live run's session.
import { respond } from "@/lib/http";
import { liveRun } from "../../_lib";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return respond(() => liveRun(decodeURIComponent(runId)));
}
