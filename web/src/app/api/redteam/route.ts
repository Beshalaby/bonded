// GET -> {scams, growth: {ts, tasks}[], byTrap: {trapType, count, fooledModels}[], running}
// POST {rounds?: 1, perRound?: 6} -> {started: true} (demo-gated; background; emits `scam` events)
import { listScams } from "@/lib/bench";
import { jsonBody, respond } from "@/lib/http";
import { redteamStatus, startRedteam } from "@/lib/runs";
import { listTasks } from "@/lib/tasks";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return respond(() => {
    const scams = listScams();
    const baseCount = listTasks().filter((t) => !t.adversarial).length;
    // Benchmark size over time: base tasks, then +1 per kept scam (each spawns a task variant), bucketed per second.
    const asc = [...scams].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const growth: { ts: string; tasks: number }[] = [];
    let n = baseCount;
    if (asc.length) growth.push({ ts: new Date(Date.parse(asc[0].createdAt) - 1000).toISOString(), tasks: n });
    for (const s of asc) {
      if (s.variantTaskId || s.fooled.length) n++;
      const ts = new Date(Math.floor(Date.parse(s.createdAt) / 1000) * 1000).toISOString();
      const last = growth[growth.length - 1];
      if (last && last.ts === ts) last.tasks = n; else growth.push({ ts, tasks: n });
    }
    const by = new Map<string, { trapType: string; count: number; fooled: Set<string> }>();
    for (const s of scams) {
      const x = by.get(s.trapType) ?? { trapType: s.trapType, count: 0, fooled: new Set<string>() };
      x.count++;
      s.fooled.forEach((m) => x.fooled.add(m));
      by.set(s.trapType, x);
    }
    const byTrap = [...by.values()].map((x) => ({ trapType: x.trapType, count: x.count, fooledModels: [...x.fooled].sort() })).sort((a, b) => b.count - a.count);
    return { scams, growth, byTrap, ...redteamStatus() };
  });
}

export async function POST(req: Request) {
  const b = await jsonBody<{ rounds?: number; perRound?: number; models?: string[] }>(req);
  return respond(() => {
    const r = startRedteam(b);
    return { started: r.started, rounds: r.rounds, perRound: r.perRound };
  });
}
