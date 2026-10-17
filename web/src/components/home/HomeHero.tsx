"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Presentation } from "lucide-react";
import type { HeroStats } from "@/lib/findings";
import type { ModelStats } from "@/lib/types";
import ReliabilityForest from "./ReliabilityForest";
import { buttonClass, cx } from "@/components/ui";
import { RollingNumber } from "./RollingNumber";

export interface LiveLine { id: string; text: string; tone: "good" | "bad" | "neutral"; href?: string }

const EASE = [0.2, 0.75, 0.15, 1] as const;

export default function HomeHero({ hero, connected, live, rows }: { hero: HeroStats; connected: boolean; live: LiveLine | null; rows: ModelStats[] }) {
  const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
  const stats = [
    { label: "episodes evaluated", value: hero.episodes, fmt: undefined, hint: "Every graded model × task attempt, across all runs" },
    { label: "agent spend audited", value: hero.spendUsd, fmt: usd, hint: "Sum of every checkout the agents made in the sandbox store" },
    { label: "trace steps hash-chained", value: hero.traceEntries, fmt: undefined, hint: "SHA-256 chained trace entries; any edit breaks the chain" },
    { label: "scams found by the red team", value: hero.scams, fmt: undefined, hint: "Generated listings that fooled at least one model and became tasks" },
  ];
  return (
    <section className="relative pb-2 pt-6">
      <div className="relative grid items-end gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_452px]">
       <div>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-zinc-500">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 font-medium text-zinc-700">
            <span className={cx("size-1.5 rounded-full", connected ? "pulse-dot bg-emerald-500" : "bg-zinc-300")} />
            {connected ? "Live" : "Connecting"}
          </span>
          <span className="tnum">Bonded · SpendBench leaderboard · {hero.models} models · {hero.tasks} tasks ({hero.tasks - hero.baseTasks} from the red team) · {hero.runs} runs</span>
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05, ease: EASE }}
          className="mt-5 max-w-[640px] text-[48px] font-semibold leading-[1.04] tracking-[-0.035em] text-zinc-900">
          How safely do AI agents <br className="hidden lg:block" /><span className="text-zinc-400">spend money?</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12, ease: EASE }}
          className="mt-4 max-w-[600px] text-[16px] leading-relaxed text-zinc-600">
          Agents shop in a sandbox store seeded with knockoffs, fake discounts and hidden prompt injections. Every step is
          hash-chained, every failure is attributed, and a red team keeps writing new scams that make the benchmark harder.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.18, ease: EASE }}
          className="mt-6 flex flex-wrap items-center gap-2">
          <Link href="/runs/new" className={cx(buttonClass("primary"), "h-9 px-4 text-[13.5px]")}>Run the benchmark <ArrowRight size={14} /></Link>
          <Link href="/redteam" className={cx(buttonClass("secondary"), "h-9 px-4 text-[13.5px]")}>Watch the red team</Link>
          <Link href="/present" className={cx(buttonClass("ghost"), "h-9 px-3 text-[13.5px]")} title="Full-screen walkthrough built from live data">
            <Presentation size={14} /> Present
          </Link>
        </motion.div>
       </div>
        <motion.figure initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <figcaption className="mb-3 flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-zinc-900">P(success), 90% credible interval</span>
            <span className="text-[11.5px] text-zinc-400">Beta posterior</span>
          </figcaption>
          {rows.length ? <ReliabilityForest rows={rows} /> : <div className="h-[180px] animate-pulse rounded-md bg-zinc-50" />}
        </motion.figure>
      </div>
      <div>

        <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-12 grid grid-cols-2 border-t border-zinc-200 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} title={s.hint}
              className={cx("py-5 pr-6", i > 0 && "lg:border-l lg:border-zinc-200 lg:pl-6", i % 2 === 1 && "border-l border-zinc-200 pl-6 lg:pl-6")}>
              <dd className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-zinc-900">
                <RollingNumber value={s.value} format={s.fmt} />
              </dd>
              <dt className="mt-2.5 text-[13px] text-zinc-500">{s.label}</dt>
            </div>
          ))}
        </motion.dl>
        <div className="flex h-8 items-center border-t border-zinc-100 text-[12.5px] text-zinc-500">
          <span className="mr-2 font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-400">Latest</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {live ? (
              <motion.span key={live.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: EASE }} className="flex min-w-0 items-center gap-1.5 truncate">
                <span className={cx("size-1.5 shrink-0 rounded-full", live.tone === "good" ? "bg-emerald-500" : live.tone === "bad" ? "bg-rose-500" : "bg-zinc-400")} />
                {live.href ? <Link href={live.href} className="truncate hover:text-accent">{live.text}</Link> : <span className="truncate">{live.text}</span>}
              </motion.span>
            ) : (
              <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="truncate">
                Waiting for results. Start a run and graded episodes stream in here.
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
