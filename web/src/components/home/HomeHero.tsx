"use client";
// Home hero: a two-tone editorial headline over a blue/violet bloom, then the reliability landscape
// (HalftoneField: one dot-matrix ridge per model's Beta posterior) as the hero visual.
import { useMemo } from "react";
import { motion } from "motion/react";
import { ArrowRight, Presentation } from "lucide-react";
import type { HeroStats } from "@/lib/findings";
import type { ModelStats } from "@/lib/types";
import { modelHref } from "@/lib/ui/format";
import { Bloom, DisplayTitle, EASE, HalftoneField, MicroLabel, Pill, Tile, betaFromMean, type Ridge } from "@/design";

export interface LiveLine { id: string; text: string; tone: "good" | "bad" | "neutral"; href?: string }

const clean = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");

export default function HomeHero({ hero, connected, rows }: { hero: HeroStats; connected: boolean; live?: LiveLine | null; rows: ModelStats[] }) {
  const ridges = useMemo<Ridge[]>(() => [...rows]
    .sort((a, b) => b.reliability.mean - a.reliability.mean)
    .map((r) => ({
      key: r.model,
      label: clean(r.displayName),
      sub: `${r.simulated ? "Simulated" : r.provider} · n=${r.n}`,
      href: modelHref(r.model),
      beta: betaFromMean(r.reliability.mean, r.n),
      interval: r.reliability,
      n: r.n,
    })), [rows]);
  // zoom the x-domain to the data (floored to 10%) so tight clusters still read; say so on the axis
  const lo = ridges.length ? Math.max(0, Math.floor((Math.min(...ridges.map((r) => r.interval.lower)) - 0.03) * 10) / 10) : 0;
  const span = 1 - lo;
  const ticks = span >= 0.6 ? [lo, lo + span * 0.25, lo + span * 0.5, lo + span * 0.75, 1] : [lo, (lo + 1) / 2, 1];

  return (
    <section className="relative isolate pt-6 sm:pt-12">
      {/* full-bleed atmosphere */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-140px] -z-10 h-[820px] w-screen -translate-x-1/2">
        <Bloom tone="blue-violet" placement="top-right" intensity={1.2} />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-canvas" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <MicroLabel dot={connected ? "pass" : "muted"} pulse={connected}>
          SpendBench · {connected ? "Live" : "Connecting"}
        </MicroLabel>
        <MicroLabel className="tabular-nums max-sm:hidden" dot="accent">
          {hero.models} models · {hero.tasks} tasks · {hero.runs} runs
        </MicroLabel>
      </div>
      <DisplayTitle as="h1" size="display" animate className="mt-7 max-w-[980px]"
        line1="How safely do AI agents" line2="spend money?" />
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.16, ease: EASE }}
        className="mt-7 max-w-[540px] text-[16px] leading-relaxed text-ink-3 max-sm:text-[15px]">
        Agents shop in a sandbox store seeded with knockoffs, fake discounts and hidden prompt injections.
        Every step is hash-chained, every failure attributed, and a red team keeps writing new scams.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.24, ease: EASE }}
        className="mt-8 flex flex-wrap items-center gap-2.5">
        <Pill href="/runs/new" size="lg">Run the benchmark <ArrowRight size={15} className="-mr-0.5" /></Pill>
        <Pill href="/redteam" size="lg" variant="surface">Watch the red team</Pill>
        <Pill href="/present" size="lg" variant="ghost" title="Full-screen walkthrough built from live data"><Presentation size={15} /> Present</Pill>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.34, ease: EASE }}>
        <Tile as="figure" pad={0} radius={32} level="raised" className="mt-12 overflow-hidden sm:mt-14">
          <figcaption className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 px-7 pt-7 max-sm:px-5 max-sm:pt-5">
            <div>
              <MicroLabel dot="accent">Reliability landscape</MicroLabel>
              <div className="mt-2 text-[17px] font-[540] tracking-[-0.02em] text-ink">Posterior P(success) for every model</div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-ink-3">
              <span className="inline-flex items-center gap-2"><Swatch dense /> 90% credible interval</span>
              <span className="inline-flex items-center gap-2"><Swatch /> tails</span>
              <span className="inline-flex items-center gap-2"><span className="inline-flex flex-col gap-[2px]">{[0, 1, 2].map((k) => <span key={k} className="size-[3px] rounded-full bg-ink" />)}</span> mean</span>
            </div>
          </figcaption>
          <div className="px-7 pb-5 pt-2 max-sm:px-4">
            {ridges.length
              ? <HalftoneField ridges={ridges} domain={[lo, 1]} axisTicks={ticks} axisLabel={lo > 0 ? `P(success), axis from ${Math.round(lo * 100)}%` : "P(success)"} />
              : <div className="h-[420px] animate-pulse rounded-[20px] bg-canvas" />}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-7 pb-6 text-[12px] text-ink-4 max-sm:px-5">
            <span>Ridge height ∝ √density, shared scale · Beta(1+s, 1+f) · hover a ridge for values</span>
            <span className="tabular-nums">{hero.episodes.toLocaleString("en-US")} graded episodes</span>
          </div>
        </Tile>
      </motion.div>
    </section>
  );
}

function Swatch({ dense }: { dense?: boolean }) {
  return (
    <span aria-hidden className="grid grid-cols-3 gap-[2px]">
      {Array.from({ length: 6 }).map((_, k) => (
        <span key={k} className="size-[4px] rounded-full" style={{ background: dense ? "var(--color-accent-dot)" : "oklch(80% 0.08 258)" }} />
      ))}
    </span>
  );
}
