"use client";
// The ranking: the same leaderboard figure as /research (success rate bar in the provider's colour, 90% interval
// whisker, composite score, tie-aware ranks), on a card under a section intro. Real ranked models only unless asked.
// Bonded Shield rows (`bonded/shield:<base>`) rank alongside the models, marked in gold with their measured lift over
// the same base model shopping alone ("+N vs GPT-5 mini alone"), computed from the rows themselves.
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Leaderboard } from "@/components/report/charts";
import { cx, Pill } from "@/design";
import type { ModelStats } from "@/lib/types";
import { MIN_RANKED_N } from "@/lib/ui/rank";
import { parseShieldModel } from "@/lib/shield/names";

/** Rows eligible for the ranking: the same set /research ranks (n ≥ MIN_RANKED_N, never MCP self-tests, real unless asked).
 *  Bonded Shield over a real model counts as real (its `simulated` flag follows the base model). */
export function rankable(rows: ModelStats[], includeSim: boolean) {
  return rows.filter((r) => r.n >= MIN_RANKED_N && r.provider !== "MCP" && (includeSim || !r.simulated));
}

export default function Ranking({ rows, loading, tasks, error, onRetry }: { rows: ModelStats[]; loading: boolean; tasks?: number; error?: string; onRetry: () => void }) {
  const [includeSim, setIncludeSim] = useState(false);
  const shown = rankable(rows, includeSim);
  const hasSim = rows.some((r) => r.simulated && r.n >= MIN_RANKED_N);
  const notes = shieldLift(shown, rows);

  return (
    <section id="ranking" aria-labelledby="ranking-title" className="relative isolate mx-auto max-w-[1040px] scroll-mt-20 px-5 pb-24 pt-28 sm:px-8 sm:pb-36 sm:pt-40">
      <div className="text-center">
        <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-ink-3">The ranking</p>
        <h2 id="ranking-title" className="mx-auto mt-4 max-w-[16ch] font-[600] leading-[1] tracking-[-0.045em] text-ink [font-size:clamp(38px,5vw,64px)]">Who’s safest with your money?</h2>
        <p className="mx-auto mt-5 max-w-[46ch] text-[16px] leading-[1.6] text-ink-3 sm:text-[17px]">{tasks ? `Every model shops the same ${tasks} tasks. ` : ""}Ranked by composite score.</p>
      </div>

      <div className="relative mt-12 rounded-[28px] bg-surface px-5 pb-5 pt-6 shadow-[0_0_0_1px_oklch(20%_0.012_70/0.05),0_40px_80px_-48px_oklch(25%_0.03_70/0.35)] sm:mt-16 sm:rounded-[36px] sm:px-10 sm:pb-8 sm:pt-8">
        <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "4%", ["--by" as string]: "0%", ["--bs" as string]: "min(760px, 120vw)", ["--bo" as string]: 0.6 }} />
        <div aria-hidden className="burst burst-sage" style={{ ["--bx" as string]: "100%", ["--by" as string]: "100%", ["--bs" as string]: "min(700px, 110vw)", ["--bo" as string]: 0.5 }} />
        {hasSim && (
          <div className="-mt-2 mb-3 flex justify-end">
            <button type="button" role="switch" aria-checked={includeSim} onClick={() => setIncludeSim((v) => !v)}
              className="group inline-flex items-center gap-2.5 rounded-full py-2 text-[13px] text-ink-3 transition-colors hover:text-ink">
              <span aria-hidden className={cx("relative h-[18px] w-[30px] rounded-full transition-colors duration-300", includeSim ? "bg-accent" : "bg-ink-5")}>
                <span className={cx("absolute left-[2px] top-[2px] size-[14px] rounded-full bg-white shadow-[0_1px_2px_oklch(20%_0.012_70/0.25)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.75,0.15,1)]", includeSim && "translate-x-[12px]")} />
              </span>
              Include simulated agents
            </button>
          </div>
        )}

        {error && !rows.length ? (
          <p className="py-10 text-[15px] text-ink-3">Couldn’t load the ranking. <button type="button" onClick={onRetry} className="font-medium text-accent underline-offset-4 hover:underline">Try again</button></p>
        ) : loading && !rows.length ? (
          <ul aria-hidden className="grid gap-3">{Array.from({ length: 6 }).map((_, i) => <li key={i} className="h-[44px] animate-pulse rounded-[12px] bg-canvas-sunk/60" />)}</ul>
        ) : !shown.length ? (
          <p className="py-10 text-[15px] text-ink-3">No model has enough graded tasks to rank yet.</p>
        ) : (
          <Leaderboard rows={shown} notes={notes} />
        )}
        <div className="mt-6 flex justify-center sm:mt-8">
          <Pill href="/runs/new" size="lg">Run models <ArrowUpRight size={16} aria-hidden /></Pill>
        </div>
      </div>

      {shown.length > 0 && (
        <p className="mx-auto mt-8 max-w-[70ch] text-center text-[13px] leading-relaxed text-ink-4">
          Success rate is the share of tasks where the agent bought exactly what was asked, within budget, without touching a trap.
          Whiskers are 90% credible intervals.{" "}
          <Link href="/research" className="text-ink-3 underline-offset-4 hover:text-ink hover:underline">Full results and analysis</Link>
        </p>
      )}
    </section>
  );
}

/** "+4.2 vs GPT-5 mini alone": composite-score difference between a Bonded Shield row and its base model's row. */
export function shieldLift(shown: ModelStats[], all: ModelStats[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of shown) {
    const s = parseShieldModel(r.model);
    if (!s || s.variant !== "shield") continue;
    const base = all.find((x) => x.model === s.base);
    if (!base || !base.n) continue;
    const d = Math.round((r.score - base.score) * 10) / 10;
    out[r.model] = `${d > 0 ? "+" : d < 0 ? "\u2212" : "\u00b1"}${Math.abs(d).toFixed(1)} vs ${base.displayName.replace(/\s*\(sim\)\s*$/i, "")} alone`;
  }
  return out;
}
