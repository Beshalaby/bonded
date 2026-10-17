"use client";
// The live instrument cluster: a glass orb for the benchmark's live state, the latest graded result,
// and four huge thin numerals that roll as SSE events arrive.
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import type { HeroStats } from "@/lib/findings";
import type { EvalRun } from "@/lib/types";
import { runHref } from "@/lib/ui/format";
import { ArrowButton, EASE, MicroLabel, Orb, Stat, Tile, cx } from "@/design";
import { RollingNumber } from "./RollingNumber";
import type { LiveLine } from "./HomeHero";

export default function LivePanel({ hero, connected, live, runs }: { hero: HeroStats; connected: boolean; live: LiveLine | null; runs: EvalRun[] }) {
  const running = runs.filter((r) => r.status === "running");
  const active = running.length > 0;
  const done = running.reduce((s, r) => s + r.progress.done, 0), total = running.reduce((s, r) => s + r.progress.total, 0);
  const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
  const stats = [
    { label: "Episodes evaluated", value: hero.episodes, fmt: undefined, hint: "Every graded model × task attempt, across all runs" },
    { label: "Agent spend audited", value: hero.spendUsd, fmt: usd, hint: "Sum of every checkout the agents made in the sandbox store" },
    { label: "Trace steps hash-chained", value: hero.traceEntries, fmt: undefined, hint: "SHA-256 chained trace entries; any edit breaks the chain" },
    { label: "Scams found by the red team", value: hero.scams, fmt: undefined, hint: "Generated listings that fooled at least one model and became tasks" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* live state */}
      <Tile pad={28} className="flex flex-col items-center overflow-hidden text-center lg:col-span-4 max-sm:!p-5">
        <div className="flex w-full items-center justify-between">
          <MicroLabel dot={connected ? "pass" : "muted"} pulse={connected}>{connected ? "Live feed" : "Connecting"}</MicroLabel>
          <ArrowButton href="/live" label="Open the live view" size={30} tone="surface" />
        </div>
        <Orb size={188} hue={active ? "blue" : "violet"} active={active} className="mt-6"
          label={active ? `Agents shopping: ${done} of ${total} tasks graded` : "No run in progress"}>
          <span className="text-[13px] font-medium tracking-[-0.01em] text-ink">{active ? "Agents shopping…" : "Standing by"}</span>
          <span className="mt-0.5 text-[11.5px] text-ink-2 tabular-nums">
            {active ? `${done} / ${total} graded` : `${runs.length} recent runs`}
          </span>
        </Orb>
        {/* latest graded result */}
        <div className="mt-7 flex h-11 w-full items-center gap-2.5 rounded-full bg-canvas px-4 text-left text-[12.5px] text-ink-2 shadow-well">
          <span className="micro shrink-0 !text-[10px]">Latest</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {live ? (
              <motion.span key={live.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: EASE }} className="flex min-w-0 items-center gap-2">
                <span className={cx("size-1.5 shrink-0 rounded-full", live.tone === "good" ? "bg-pass" : live.tone === "bad" ? "bg-coral" : "bg-ink-4")} />
                {live.href ? <Link href={live.href} className="truncate hover:text-accent max-lg:py-3">{live.text}</Link> : <span className="truncate">{live.text}</span>}
              </motion.span>
            ) : (
              <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="truncate text-ink-3">
                Waiting for results
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {running[0] && (
          <Link href={runHref(running[0].id)} className="micro mt-3 !text-[10px] hover:!text-ink">Open {running[0].name}</Link>
        )}
      </Tile>

      {/* numerals */}
      <Tile pad={36} className="lg:col-span-8 max-sm:!p-6">
        <div className="flex items-center justify-between">
          <MicroLabel dot="accent">The instrument so far</MicroLabel>
          <MicroLabel className="!text-ink-4 max-sm:hidden">Updated live</MicroLabel>
        </div>
        <dl className="mt-10 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 max-sm:mt-8 max-sm:gap-y-8">
          {stats.map((s) => (
            <Stat key={s.label} size="xl" title={s.hint} label={s.label} value={<RollingNumber value={s.value} format={s.fmt} />} />
          ))}
        </dl>
      </Tile>
    </div>
  );
}
