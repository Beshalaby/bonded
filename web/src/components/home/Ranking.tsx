"use client";
// The ranking: real models only, at most six rows, one score each, one bar. Everything else is one click away.
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { cx } from "@/design";
import type { ModelStats } from "@/lib/types";
import { modelHref } from "@/lib/ui/format";
import { MIN_RANKED_N } from "@/lib/ui/rank";

const MAX_ROWS = 6;
const EASE = [0.2, 0.75, 0.15, 1] as const;
const clean = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");

/** Rows eligible for the home ranking: ranked (n ≥ MIN_RANKED_N), never MCP self-tests, real unless asked. */
export function rankable(rows: ModelStats[], includeSim: boolean) {
  return rows.filter((r) => r.n >= MIN_RANKED_N && r.provider !== "MCP" && (includeSim || !r.simulated)).slice(0, MAX_ROWS);
}

function scamLine(r: ModelStats) {
  const k = Math.round(r.metrics.scamRate * r.n);
  return k === 0 ? `Never fell for a scam in ${r.n} tasks` : `Fell for a scam in ${k} of ${r.n} tasks`;
}

function ProviderMark({ provider, lead }: { provider: string; lead: boolean }) {
  return (
    <span aria-hidden title={provider}
      className={cx("inline-flex size-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        lead ? "bg-gold-soft text-accent shadow-[inset_0_0_0_1px_oklch(78%_0.125_84/0.6)]" : "bg-canvas-sunk text-ink-3")}>
      {provider.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** P(success): a hairline track, the 90% interval as a soft gold fade, and the mean as a bead. */
function Bar({ r, i }: { r: ModelStats; i: number }) {
  const { lower, upper, mean } = r.reliability;
  return (
    <div className="relative h-5" role="img" aria-label={`Chance of success ${Math.round(mean * 100)}%, 90% interval ${Math.round(lower * 100)} to ${Math.round(upper * 100)}%`}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-5/70" />
      <motion.div className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 origin-left rounded-full bg-gradient-to-r from-transparent to-[oklch(82%_0.1_86/0.8)]"
        style={{ width: `${mean * 100}%` }}
        initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, delay: 0.1 + i * 0.06, ease: EASE }} />
      <motion.div className="absolute top-1/2 h-[6px] -translate-y-1/2 origin-left rounded-full"
        style={{ left: `${lower * 100}%`, width: `${Math.max(1, (upper - lower) * 100)}%`,
          background: "linear-gradient(90deg, oklch(84% 0.1 86 / 0) 0%, oklch(80% 0.125 84 / 0.9) 35%, oklch(80% 0.125 84 / 0.9) 65%, oklch(84% 0.1 86 / 0) 100%)" }}
        initial={{ scaleX: 0, opacity: 0 }} whileInView={{ scaleX: 1, opacity: 1 }} viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.15 + i * 0.06, ease: EASE }} />
      <motion.div className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_2px_white]"
        style={{ left: `${mean * 100}%` }}
        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.5 + i * 0.06 }} />
    </div>
  );
}

export default function Ranking({ rows, loading, tasks, error, onRetry }: { rows: ModelStats[]; loading: boolean; tasks?: number; error?: string; onRetry: () => void }) {
  const [includeSim, setIncludeSim] = useState(false);
  const shown = rankable(rows, includeSim);
  const hasSim = rows.some((r) => r.simulated && r.n >= MIN_RANKED_N);
  // the benchmark every shown model completed (a model can carry a few extra tasks from ad-hoc runs)
  const common = shown.length ? Math.min(...shown.map((r) => r.n)) : tasks;

  return (
    <section id="ranking" aria-labelledby="ranking-title" className="relative isolate mx-auto max-w-[960px] scroll-mt-20 px-5 pb-28 pt-16 sm:px-8 sm:pb-40 sm:pt-24">
      <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "4%", ["--by" as string]: "14%", ["--bs" as string]: "min(860px, 120vw)", ["--bo" as string]: 0.7 }} />
      <div aria-hidden className="burst burst-sage" style={{ ["--bx" as string]: "100%", ["--by" as string]: "78%", ["--bs" as string]: "min(760px, 110vw)", ["--bo" as string]: 0.6 }} />

      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          <h2 id="ranking-title" className="font-[600] leading-[0.98] tracking-[-0.05em] text-ink [font-size:clamp(40px,5.6vw,72px)]">The ranking.</h2>
          <p className="mt-3 text-[17px] text-ink-3">{common ? `Every model shops the same ${common} tasks. ` : ""}Higher is safer.</p>
        </div>
        {hasSim && (
          <button type="button" role="switch" aria-checked={includeSim} onClick={() => setIncludeSim((v) => !v)}
            className="group inline-flex items-center gap-2.5 rounded-full py-2 text-[13.5px] text-ink-3 transition-colors hover:text-ink">
            <span aria-hidden className={cx("relative h-[18px] w-[30px] rounded-full transition-colors duration-300", includeSim ? "bg-accent" : "bg-ink-5")}>
              <span className={cx("absolute left-[2px] top-[2px] size-[14px] rounded-full bg-white shadow-[0_1px_2px_oklch(20%_0.012_70/0.25)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.75,0.15,1)]", includeSim && "translate-x-[12px]")} />
            </span>
            Include simulated agents
          </button>
        )}
      </div>

      <div className="mt-12 sm:mt-16">
        {error && !rows.length ? (
          <p className="py-10 text-[15px] text-ink-3">Couldn’t load the ranking. <button type="button" onClick={onRetry} className="font-medium text-accent underline-offset-4 hover:underline">Try again</button></p>
        ) : loading && !rows.length ? (
          <ul aria-hidden className="grid gap-2">{Array.from({ length: 6 }).map((_, i) => <li key={i} className="h-[72px] animate-pulse rounded-[22px] bg-canvas-sunk/60" />)}</ul>
        ) : !shown.length ? (
          <p className="py-10 text-[15px] text-ink-3">No model has enough graded tasks to rank yet. <Link href="/runs/new" className="font-medium text-accent underline-offset-4 hover:underline">Start a run</Link></p>
        ) : (
          <ol className="grid">
            {shown.map((r, i) => (
              <motion.li key={r.model} layout transition={{ duration: 0.8, delay: i * 0.06, ease: EASE, layout: { type: "spring", stiffness: 260, damping: 30 } }}
                initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}>
                <Link href={modelHref(r.model)}
                  className="group -mx-4 grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[22px] px-4 py-4 transition-colors duration-300 hover:bg-[oklch(98.4%_0.016_88)] focus-visible:bg-[oklch(98.4%_0.016_88)] sm:-mx-5 sm:grid-cols-[44px_minmax(0,1.05fr)_minmax(0,1fr)_96px] sm:gap-x-6 sm:px-5 sm:py-5">
                  <span className={cx("text-[15px] font-medium tabular-nums", i === 0 ? "text-accent" : "text-ink-4")}>{i + 1}</span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-3">
                      <ProviderMark provider={r.provider} lead={i === 0} />
                      <span className="truncate text-[17px] font-medium tracking-[-0.02em] text-ink sm:text-[19px]">{clean(r.displayName)}</span>
                      <ArrowUpRight aria-hidden size={15} className="shrink-0 text-ink-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    </span>
                    <span className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr] [@media(hover:none)]:grid-rows-[1fr]">
                      <span className="overflow-hidden">
                        <span className="block pl-[38px] pt-1.5 text-[13px] text-ink-3">{scamLine(r)}</span>
                      </span>
                    </span>
                  </span>
                  <span className="col-span-2 col-start-2 row-start-2 mt-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0"><Bar r={r} i={i} /></span>
                  <span className="text-right text-[26px] font-[560] leading-none tracking-[-0.04em] text-ink tabular-nums sm:text-[32px]">{r.score.toFixed(1)}</span>
                </Link>
              </motion.li>
            ))}
          </ol>
        )}
      </div>

      {shown.length > 0 && (
        <p className="mt-8 text-[13px] leading-relaxed text-ink-4">
          Score out of 100. The bar is the chance of success, with its 90% interval.{" "}
          <Link href="/methodology" className="text-ink-3 underline-offset-4 hover:text-ink hover:underline">How we grade</Link>
        </p>
      )}
    </section>
  );
}
