"use client";
// Leaderboard as capsule rows (ARIA table semantics on a CSS grid, so each row can be a rounded, shadowed capsule).
// Sortable by any column; the whole capsule links to the model page (stretched link on the model name).
import { MIN_RANKED_N } from "@/lib/ui/rank";
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { ModelStats } from "@/lib/types";
import { cost, modelHref, num, pct } from "@/lib/ui/format";
import { DotBar, ScrollFade, SPRING } from "@/design";
import { ProviderBadge, cx } from "./ui";

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

const clean = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");

function Rate({ v, bad }: { v: number; bad?: boolean }) {
  return <span className={cx(v === 0 ? "text-ink-4" : bad && v >= 0.2 ? "font-medium text-coral-ink" : "text-ink")}>{pct(v)}</span>;
}

export default function LeaderboardTable({ rows, compact = false }: { rows: ModelStats[]; compact?: boolean }) {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "rank", dir: "asc" });
  const ranked = useMemo(() => [...rows].sort((a, b) => b.score - a.score).map((r, i) => ({ r, rank: i + 1 })), [rows]);
  const sorted = useMemo(() => {
    const g = GET[sort.key];
    return [...ranked].sort((a, b) => {
      const x = g(a.r), y = g(b.r);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return sort.dir === "asc" ? c : -c;
    });
  }, [ranked, sort]);

  const cols: { key: Key; label: string; align: "left" | "right"; title?: string }[] = [
    { key: "rank", label: "#", align: "right" },
    { key: "model", label: "Model", align: "left" },
    { key: "score", label: "Score", align: "right", title: "Composite 0–100: success, minus penalties for scams, budget violations and wrong items" },
    { key: "reliability", label: "Reliability · 90% CI", align: "left", title: "Posterior P(success), Beta(1+s, 1+f); soft dots = 90% credible interval, ink dot = mean" },
    { key: "success", label: "Success", align: "right" },
    { key: "scam", label: "Scammed", align: "right" },
    { key: "budget", label: "Over budget", align: "right", title: "Share of tasks where the agent spent more than the budget" },
    { key: "wrong", label: "Wrong item", align: "right" },
    ...(!compact ? [
      { key: "cost" as Key, label: "Avg cost", align: "right" as const, title: "Average LLM cost per task" },
      { key: "steps" as Key, label: "Avg steps", align: "right" as const },
    ] : []),
  ];
  const grid = compact
    ? "grid-cols-[28px_minmax(200px,1.6fr)_64px_230px_minmax(70px,0.6fr)_minmax(78px,0.6fr)_minmax(96px,0.7fr)_minmax(90px,0.7fr)]"
    : "grid-cols-[28px_minmax(200px,1.6fr)_64px_230px_minmax(70px,0.6fr)_minmax(78px,0.6fr)_minmax(96px,0.7fr)_minmax(90px,0.7fr)_minmax(78px,0.6fr)_minmax(78px,0.6fr)]";

  const toggle = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] }));

  return (
    <>
    {/* Phones: one capsule card per model, ranked by score */}
    <ol className="grid gap-2.5 sm:hidden">
      {ranked.map(({ r, rank }) => (
        <li key={r.model}>
          <Link href={modelHref(r.model)} className="block rounded-[22px] bg-surface p-4 shadow-key transition-shadow active:shadow-raised">
            <div className="flex items-start gap-3">
              <span className="w-5 shrink-0 pt-0.5 text-right text-[13px] text-ink-4 tabular-nums">{rank}</span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink">{clean(r.displayName)}</span>
                  <ProviderBadge provider={r.provider} simulated={r.simulated} />
                </div>
                <div className="mt-0.5 truncate font-mono text-[12px] text-ink-4">{r.model} · n={r.n}{r.n < MIN_RANKED_N && <span className="ml-1.5 font-sans text-amber-ink" title={`Fewer than ${MIN_RANKED_N} graded tasks: listed after established models`}>· provisional</span>}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[24px] font-light leading-none tracking-[-0.03em] text-ink tabular-nums">{num(r.score, 1)}</div>
                <div className="micro mt-1 !text-[10px]">score</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 pl-8">
              <DotBar value={r.reliability.mean} interval={r.reliability} dots={34} pitch={5}
                label={`Reliability ${Math.round(r.reliability.mean * 100)}%, 90% interval ${Math.round(r.reliability.lower * 100)} to ${Math.round(r.reliability.upper * 100)}%`} />
              <span className="text-[13px] tabular-nums text-ink">{Math.round(r.reliability.mean * 100)}%<span className="ml-1 text-[11.5px] text-ink-4">±{Math.round(((r.reliability.upper - r.reliability.lower) / 2) * 100)}</span></span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 pl-8 text-[13px] tabular-nums">
              <div><dt className="text-[12px] text-ink-3">Success</dt><dd><Rate v={r.metrics.successRate} /></dd></div>
              <div><dt className="text-[12px] text-ink-3">Scammed</dt><dd><Rate v={r.metrics.scamRate} bad /></dd></div>
              <div><dt className="text-[12px] text-ink-3">Over budget</dt><dd><Rate v={r.metrics.budgetViolationRate} bad /></dd></div>
            </dl>
          </Link>
        </li>
      ))}
    </ol>

    {/* Tablet + desktop: capsule rows. Below lg the full set of columns scrolls sideways with edge fades. */}
    <ScrollFade className="-mx-3 max-sm:hidden" innerClassName="px-3 pb-3 pt-1 max-lg:min-w-[1100px]" label="Leaderboard">
      <div role="table" aria-label="Leaderboard" aria-rowcount={sorted.length + 1}>
        <div role="row" className={cx("grid items-end gap-x-3 px-4 pb-2", grid)}>
          {cols.map((c) => {
            const active = sort.key === c.key && sort.key !== "rank";
            return (
              <div key={c.key} role="columnheader" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                className={cx(c.align === "right" ? "text-right" : "text-left")}>
                <button type="button" onClick={() => toggle(c.key)} title={c.title}
                  className={cx("hit inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] font-medium uppercase tracking-[0.09em] transition-colors hover:text-ink",
                    c.align === "right" && "flex-row-reverse", active ? "text-ink" : "text-ink-3")}>
                  {c.label}
                  <span aria-hidden className={cx("text-[8px] transition-opacity", active ? "opacity-100" : "opacity-0")}>{sort.dir === "asc" ? "▲" : "▼"}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="grid gap-2" role="rowgroup">
          {sorted.map(({ r, rank }) => (
            <motion.div layout="position" transition={SPRING.soft} key={r.model} role="row"
              className={cx("group relative grid min-h-[68px] items-center gap-x-3 rounded-capsule bg-surface px-4 shadow-key transition-shadow duration-200 hover:shadow-raised", grid)}>
              <div role="cell" className="text-right text-[13px] text-ink-4 tabular-nums">{rank}</div>
              <div role="cell" className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <Link href={modelHref(r.model)} className="truncate text-[15px] font-medium tracking-[-0.012em] text-ink after:absolute after:inset-0 after:rounded-capsule group-hover:text-accent">
                    {clean(r.displayName)}
                  </Link>
                  <ProviderBadge provider={r.provider} simulated={r.simulated} />
                </div>
                <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-4">{r.model} · n={r.n}{r.n < MIN_RANKED_N && <span className="ml-1.5 font-sans text-amber-ink" title={`Fewer than ${MIN_RANKED_N} graded tasks: listed after established models`}>· provisional</span>}</div>
              </div>
              <div role="cell" className="text-right text-[22px] font-light leading-none tracking-[-0.03em] text-ink tabular-nums">{num(r.score, 1)}</div>
              <div role="cell" className="flex items-center gap-3">
                <DotBar value={r.reliability.mean} interval={r.reliability} dots={28} pitch={5}
                  label={`Reliability ${Math.round(r.reliability.mean * 100)}%, 90% interval ${Math.round(r.reliability.lower * 100)} to ${Math.round(r.reliability.upper * 100)}%, n=${r.n}`} />
                <span className="whitespace-nowrap text-[13.5px] tabular-nums text-ink">{Math.round(r.reliability.mean * 100)}%<span className="ml-1 text-[11px] text-ink-4">±{Math.round(((r.reliability.upper - r.reliability.lower) / 2) * 100)}</span></span>
              </div>
              <div role="cell" className="text-right text-[13.5px] tabular-nums"><Rate v={r.metrics.successRate} /></div>
              <div role="cell" className="text-right text-[13.5px] tabular-nums"><Rate v={r.metrics.scamRate} bad /></div>
              <div role="cell" className="text-right text-[13.5px] tabular-nums"><Rate v={r.metrics.budgetViolationRate} bad /></div>
              <div role="cell" className="text-right text-[13.5px] tabular-nums"><Rate v={r.metrics.wrongItemRate} bad /></div>
              {!compact && <div role="cell" className="text-right font-mono text-[12.5px] text-ink-2">{cost(r.metrics.avgCostUsd)}</div>}
              {!compact && <div role="cell" className="text-right text-[13.5px] text-ink-2 tabular-nums">{num(r.metrics.avgSteps, 1)}</div>}
            </motion.div>
          ))}
        </div>
      </div>
    </ScrollFade>
    </>
  );
}
