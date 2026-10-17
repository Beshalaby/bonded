// GET -> {session, entries, products, merchants, finished, integrity, result?, transaction?, run?}
// State for the live theater (and replays). Ground truth is withheld while the session is active.
import { respond } from "@/lib/http";
import { liveSession } from "../../_lib";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(() => liveSession(decodeURIComponent(id)));
}
