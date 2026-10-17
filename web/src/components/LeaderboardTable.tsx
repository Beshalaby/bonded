"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ModelStats } from "@/lib/types";
import { cost, modelHref, num, pct } from "@/lib/ui/format";
import { CIAxis, CIBar } from "./charts";
import { ProviderBadge, Table, Td, Th, Tr, cx } from "./ui";

type Key = "rank" | "model" | "score" | "reliability" | "success" | "scam" | "budget" | "wrong" | "cost" | "steps";

const GET: Record<Key, (r: ModelStats) => number | string> = {
  rank: (r) => -r.score,
  model: (r) => r.displayName.toLowerCase(),
  score: (r) => r.score,
  reliability: (r) => r.reliability.mean,
  success: (r) => r.metrics.successRate,
  scam: (r) => r.metrics.scamRate,
  budget: (r) => r.metrics.budgetViolationRate,
  wrong: (r) => r.metrics.wrongItemRate,
  cost: (r) => r.metrics.avgCostUsd,
  steps: (r) => r.metrics.avgSteps,
};
// Natural "best first" direction for each column
const DEFAULT_DIR: Record<Key, "asc" | "desc"> = {
  rank: "asc", model: "asc", score: "desc", reliability: "desc", success: "desc", scam: "asc", budget: "asc", wrong: "asc", cost: "asc", steps: "asc",
};

function Rate({ v, bad }: { v: number; bad?: boolean }) {
  return <span className={cx(v === 0 ? "text-zinc-400" : bad && v >= 0.2 ? "text-rose-700" : "text-zinc-800")}>{pct(v)}</span>;
}

export default function LeaderboardTable({ rows, compact = false }: { rows: ModelStats[]; compact?: boolean }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "rank", dir: "asc" });
  const ranked = useMemo(() => [...rows].sort((a, b) => b.score - a.score).map((r, i) => ({ r, rank: i + 1 })), [rows]);
  const sorted = useMemo(() => {
    const g = GET[sort.key];
    const out = [...ranked].sort((a, b) => {
      const x = g(a.r), y = g(b.r);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return sort.dir === "asc" ? c : -c;
    });
    return out;
  }, [ranked, sort]);

  const th = (key: Key, label: string, align: "left" | "right" = "right", title?: string) => (
    <Th align={align} title={title} sorted={sort.key === key && sort.key !== "rank" ? sort.dir : false}
      onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] }))}>
      {label}
    </Th>
  );

  return (
    <Table>
      <thead>
        <tr>
          {th("rank", "#", "right")}
          {th("model", "Model", "left")}
          {th("score", "Score", "right", "Composite 0–100: success, minus penalties for scams, budget violations and wrong items")}
          {th("reliability", "Reliability · 90% CI", "left", "Posterior P(success), Beta(1+s, 1+f); whisker = 90% credible interval")}
          {th("success", "Success")}
          {th("scam", "Scammed")}
          {th("budget", "Over budget", "right", "Share of tasks where the agent spent more than the budget")}
          {th("wrong", "Wrong item")}
          {!compact && th("cost", "Avg cost", "right", "Average LLM cost per task")}
          {!compact && th("steps", "Avg steps")}
        </tr>
      </thead>
      <tbody>
        {sorted.map(({ r, rank }) => (
          <Tr key={r.model} onClick={() => router.push(modelHref(r.model))}>
            <Td align="right" className="w-10 text-zinc-400">{rank}</Td>
            <Td className="min-w-[210px]">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Link href={modelHref(r.model)} onClick={(e) => e.stopPropagation()} className="font-medium text-zinc-900 hover:text-accent">
                  {r.displayName.replace(/\s*\(sim\)\s*$/i, "")}
                </Link>
                <ProviderBadge provider={r.provider} simulated={r.simulated} />
              </div>
              <div className="mt-0.5 font-mono text-[11.5px] text-zinc-400">{r.model} · n={r.n}</div>
            </Td>
            <Td align="right" className="text-[15px] font-semibold text-zinc-900">{num(r.score, 1)}</Td>
            <Td className="w-[200px]"><CIBar interval={r.reliability} n={r.n} /></Td>
            <Td align="right"><Rate v={r.metrics.successRate} /></Td>
            <Td align="right"><Rate v={r.metrics.scamRate} bad /></Td>
            <Td align="right"><Rate v={r.metrics.budgetViolationRate} bad /></Td>
            <Td align="right"><Rate v={r.metrics.wrongItemRate} bad /></Td>
            {!compact && <Td align="right" mono className="text-zinc-700">{cost(r.metrics.avgCostUsd)}</Td>}
            {!compact && <Td align="right" className="text-zinc-700">{num(r.metrics.avgSteps, 1)}</Td>}
          </Tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3} />
          <td className="px-3 pb-2 pt-1"><CIAxis /></td>
          <td colSpan={compact ? 4 : 6} />
        </tr>
      </tfoot>
    </Table>
  );
}
