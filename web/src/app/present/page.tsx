import { read } from "@/lib/db";
import { displayName } from "@/lib/bench";
import { computeFindings, heroStats } from "@/lib/findings";
import { computeStats, latestResults } from "@/lib/stats";
import { listTasks } from "@/lib/tasks";
import type { TrapType } from "@/lib/types";
import PresentDeck, { type DeckData } from "./PresentDeck";

export const dynamic = "force-dynamic";
export const metadata = { title: "Present" };

const TRAPS: TrapType[] = ["prompt_injection", "knockoff", "fake_discount", "new_merchant", "price_gouge"];

function deckData(): DeckData {
  const db = read();
  const latest = latestResults(db.benchResults);
  const rows = computeStats({ results: latest });
  const traps = TRAPS.map((t) => {
    let exposed = 0, fooled = 0;
    for (const r of rows) { const b = r.byTrap[t]; if (b) { exposed += b.exposed; fooled += b.fooled; } }
    return { type: t, exposed, fooled, listings: db.products.filter((p) => p.trap?.type === t).length };
  });
  // a real, attributed failure to quote on the "watch one shop" slide
  const failures = latest.filter((r) => !r.success && r.attribution?.explanation && r.sessionId)
    .sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));
  const ex = failures.find((r) => r.attribution!.mode === "obeyed_injection") ?? failures.find((r) => r.scammed) ?? failures[0];
  const task = ex ? listTasks().find((t) => t.id === ex.taskId) : undefined;
  return {
    hero: heroStats(),
    findings: computeFindings(),
    rows,
    traps,
    example: ex ? {
      model: ex.model, modelName: displayName(ex.model).replace(/\s*\(sim\)\s*$/i, ""), taskId: ex.taskId,
      instruction: task?.instruction, sessionId: ex.sessionId!, mode: ex.attribution!.mode,
      explanation: ex.attribution!.explanation, evidenceSeqs: ex.attribution!.evidenceSeqs ?? [], amount: ex.amount,
    } : null,
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ slide?: string }> }) {
  const sp = await searchParams;
  const n = Math.floor(Number(sp.slide ?? 1));
  return <PresentDeck data={deckData()} initialSlide={Number.isFinite(n) ? n - 1 : 0} />;
}
