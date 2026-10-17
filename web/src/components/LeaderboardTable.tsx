"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFeed } from "./useFeed";
import { Empty, pct } from "./ui";

export interface LbRow {
  model: string; displayName: string; simulated?: boolean; tasks: number; successRate: number; budgetDiscipline: number;
  wrongItemRate: number; scamRate: number; avgCostUsd: number; avgLatencyMs: number; score: number;
  prior?: { alpha: number; beta: number; mean: number };
}
export interface Lb { rows: LbRow[]; scams?: { total: number; redteam: number }; totalResults?: number; lastRunAt?: string | null }

export function useLeaderboard() {
  const [data, setData] = useState<Lb | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/bench/leaderboard", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useFeed(() => load(), ["bench"]);
  return { data, err, reload: load };
}

function ScoreBar({ score }: { score: number }) {
  const c = score >= 80 ? "from-emerald-400 to-emerald-300" : score >= 60 ? "from-amber-400 to-amber-300" : "from-rose-500 to-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full bg-gradient-to-r ${c}`} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      </div>
      <span className="w-9 text-right font-semibold tabular text-white">{score.toFixed(0)}</span>
    </div>
  );
}

const rateCls = (v: number, bad = true) => (bad ? (v > 0.2 ? "text-rose-300" : v > 0.05 ? "text-amber-300" : "text-zinc-300") : v >= 0.9 ? "text-emerald-300" : v >= 0.7 ? "text-zinc-200" : "text-amber-300");

export default function LeaderboardTable({ limit, full = false }: { limit?: number; full?: boolean }) {
  const { data, err } = useLeaderboard();
  if (err && !data) return <div className="p-5"><Empty>Leaderboard unavailable ({err}). SpendBench hasn’t reported yet.</Empty></div>;
  if (!data) return <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-white/[0.04]" />)}</div>;
  const rows = limit ? data.rows.slice(0, limit) : data.rows;
  if (!rows.length) return <div className="p-5"><Empty cta={{ href: "/demo", label: "Run baseline benchmark" }}>No benchmark runs yet.</Empty></div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.05] text-left text-[11px] uppercase tracking-wider text-zinc-500">
            <th className="py-2.5 pl-5 pr-2 font-medium">#</th>
            <th className="px-2 font-medium">Model</th>
            <th className="px-2 text-right font-medium">Success</th>
            {full && <th className="px-2 text-right font-medium">Budget discipline</th>}
            <th className="px-2 text-right font-medium">Wrong item</th>
            <th className="px-2 text-right font-medium">Scammed</th>
            {full && <th className="px-2 text-right font-medium">Cost / task</th>}
            {full && <th className="px-2 text-right font-medium">Latency</th>}
            {full && <th className="px-2 text-right font-medium">Tasks</th>}
            <th className="px-2 pr-5 font-medium">Safety score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.model} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
              <td className="py-2.5 pl-5 pr-2 tabular text-zinc-500">{i + 1}</td>
              <td className="px-2">
                <div className="font-medium text-zinc-100">{r.displayName}</div>
                <div className="font-mono text-[11px] text-zinc-500">{r.model}</div>
              </td>
              <td className={`px-2 text-right tabular ${rateCls(r.successRate, false)}`}>{pct(r.successRate)}</td>
              {full && <td className={`px-2 text-right tabular ${rateCls(r.budgetDiscipline, false)}`}>{pct(r.budgetDiscipline)}</td>}
              <td className={`px-2 text-right tabular ${rateCls(r.wrongItemRate)}`}>{pct(r.wrongItemRate)}</td>
              <td className={`px-2 text-right tabular ${rateCls(r.scamRate)}`}>{pct(r.scamRate)}</td>
              {full && <td className="px-2 text-right tabular text-zinc-400">${r.avgCostUsd.toFixed(r.avgCostUsd < 0.01 ? 4 : 3)}</td>}
              {full && <td className="px-2 text-right tabular text-zinc-400">{r.avgLatencyMs >= 1000 ? `${(r.avgLatencyMs / 1000).toFixed(1)}s` : `${r.avgLatencyMs}ms`}</td>}
              {full && <td className="px-2 text-right tabular text-zinc-400">{r.tasks}</td>}
              <td className="px-2 pr-5"><ScoreBar score={r.score} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!full && (
        <div className="border-t border-white/[0.05] px-5 py-2.5 text-right text-xs">
          <Link href="/leaderboard" className="text-zinc-400 hover:text-white">Full SpendBench results →</Link>
        </div>
      )}
    </div>
  );
}
