// POST {text, kind?: "thought" | "plan" | "decision"} -> {seq, hash}
// Records the agent's own reasoning in its hash-chained trace (actor "agent", action "reasoning").
// Agent-authored text is untrusted data: it is length-capped, stored verbatim and never interpreted.
import { ArenaError, assertSessionAccess, body, handle, requireSession } from "@/lib/arena";
import { append } from "@/lib/recorder";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = ["thought", "plan", "decision"] as const;
type Kind = (typeof KINDS)[number];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body<{ text?: unknown; kind?: unknown }>(req);
  return handle(() => {
    requireSession(id);
    assertSessionAccess(req, id);
    const text = typeof b.text === "string" ? b.text.replace(/\s+$/g, "").trim() : "";
    if (!text) throw new ArenaError(400, "text required");
    const kind: Kind = KINDS.includes(b.kind as Kind) ? (b.kind as Kind) : "thought";
    const e = append(id, "agent", "reasoning", { kind, text: text.slice(0, 1000) });
    return { seq: e.seq, hash: e.hash };
  });
}
