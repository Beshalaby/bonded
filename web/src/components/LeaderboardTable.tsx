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

// Below lg the table scrolls sideways; rank + model stay pinned on the left.
const PIN = "max-lg:sticky max-lg:z-[1]";
const PIN_TH = "max-lg:bg-zinc-50";
const PIN_BG = "max-lg:bg-white";

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

  const th = (key: Key, label: string, align: "left" | "right" = "right", title?: string, className?: string) => (
    <Th align={align} title={title} className={className} sorted={sort.key === key && sort.key !== "rank" ? sort.dir : false}
      onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] }))}>
      {label}
    </Th>
  );

  return (
    <>
    {/* Phones: one card per model, ranked by score */}
    <ol className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white sm:hidden">
      {ranked.map(({ r, rank }) => (
        <li key={r.model}>
          <Link href={modelHref(r.model)} className="block px-4 py-3.5 transition-colors active:bg-zinc-50">
            <div className="flex items-start gap-3">
              <span className="w-5 shrink-0 pt-px text-right text-[13px] text-zinc-400 tnum">{rank}</span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-zinc-900">{r.displayName.replace(/\s*\(sim\)\s*$/i, "")}</span>
                  <ProviderBadge provider={r.provider} simulated={r.simulated} />
                </div>
                <div className="mt-0.5 truncate font-mono text-[12px] text-zinc-400">{r.model} · n={r.n}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[18px] font-semibold leading-none text-zinc-900 tnum">{num(r.score, 1)}</div>
                <div className="mt-1 text-[12px] text-zinc-400">score</div>
              </div>
            </div>
            <div className="mt-2.5 pl-8"><CIBar interval={r.reliability} n={r.n} width={150} /></div>
            <dl className="mt-2.5 grid grid-cols-3 gap-2 pl-8 text-[13px] tnum">
              <div><dt className="text-[12px] text-zinc-500">Success</dt><dd><Rate v={r.metrics.successRate} /></dd></div>
              <div><dt className="text-[12px] text-zinc-500">Scammed</dt><dd><Rate v={r.metrics.scamRate} bad /></dd></div>
              <div><dt className="text-[12px] text-zinc-500">Over budget</dt><dd><Rate v={r.metrics.budgetViolationRate} bad /></dd></div>
            </dl>
          </Link>
        </li>
      ))}
    </ol>
    <Table className="max-sm:hidden">
      <thead>
        <tr>
          {th("rank", "#", "right", undefined, cx(PIN, PIN_TH, "max-lg:left-0 w-10"))}
          {th("model", "Model", "left", undefined, cx(PIN, PIN_TH, "max-lg:left-10 max-lg:shadow-[inset_-1px_0_0_#e4e4e7]"))}
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
            <Td align="right" className={cx("w-10 text-zinc-400", PIN, PIN_BG, "max-lg:left-0")}>{rank}</Td>
            <Td className={cx("min-w-[210px]", PIN, PIN_BG, "max-lg:left-10 max-lg:shadow-[inset_-1px_0_0_#e4e4e7]")}>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Link href={modelHref(r.model)} onClick={(e) => e.stopPropagation()} className="tap font-medium text-zinc-900 hover:text-accent">
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
    </>
  );
}
