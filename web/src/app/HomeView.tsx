"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Heatmap, ScaleLegend } from "@/components/charts";
import LeaderboardTable from "@/components/LeaderboardTable";
import HomeHero, { type LiveLine } from "@/components/home/HomeHero";
import KeyFindings from "@/components/home/KeyFindings";
import LivePanel from "@/components/home/LivePanel";
import Podium from "@/components/home/Podium";
import PairwiseMatrix from "@/components/rigor/PairwiseMatrix";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui";
import { useEvents } from "@/components/useEvents";
import { DotBar, Pill, SectionHead, Tile, cx } from "@/design";
import type { Finding, HeroStats } from "@/lib/findings";
import type { BenchResult, EvalRun, FeedEvent } from "@/lib/types";
import { useApi, type LeaderboardResponse, type RunsResponse } from "@/lib/ui/api";
import { TRAP_LABEL, TRAP_TYPES, ago, failureLabel, modelHref, runHref, traceHref } from "@/lib/ui/format";
import { runModelsLabel } from "@/components/RunsList";

const shortName = (m: string) => m.replace(/^sim\//, "");

export default function HomeView({ hero: heroProp, findings }: { hero: HeroStats; findings: Finding[] }) {
  const router = useRouter();
  const lb = useApi<LeaderboardResponse>("/api/leaderboard");
  const runs = useApi<RunsResponse>("/api/runs");

  // Hero counters: server truth from props, advanced locally by live events between refreshes.
  const [hero, setHero] = useState(heroProp);
  useEffect(() => { setHero(heroProp); }, [heroProp]);
  const pending = useRef({ episodes: 0, spend: 0, entries: 0 });
  const [live, setLive] = useState<LiveLine | null>(() => {
    const r = heroProp.last;
    if (!r) return null;
    return {
      id: "initial",
      text: `${shortName(r.model)} ${r.success ? `passed ${r.taskId}` : `· ${r.mode ? failureLabel(r.mode).toLowerCase() : "failed"} on ${r.taskId}`}${r.amount ? ` · $${r.amount.toFixed(2)}` : ""} · ${ago(r.createdAt)}`,
      tone: r.success ? "good" : "bad",
      href: r.sessionId ? traceHref(r.sessionId) : undefined,
    };
  });

  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshAll = () => {
    if (t.current) return;
    t.current = setTimeout(() => { t.current = null; lb.reload(); runs.reload(); router.refresh(); }, 1500);
  };

  // flush batched counter increments 4×/s so the odometer rolls instead of flickering
  useEffect(() => {
    const iv = setInterval(() => {
      const p = pending.current;
      if (!p.episodes && !p.spend && !p.entries) return;
      pending.current = { episodes: 0, spend: 0, entries: 0 };
      setHero((h) => ({ ...h, episodes: h.episodes + p.episodes, spendUsd: h.spendUsd + p.spend, traceEntries: h.traceEntries + p.entries }));
    }, 250);
    return () => clearInterval(iv);
  }, []);

  const connected = useEvents(["result", "run", "scam", "log"], (e: FeedEvent) => {
    if (e.type === "log") { pending.current.entries++; return; }
    if (e.type === "result") {
      const r = e.data as BenchResult;
      pending.current.episodes++;
      if (r.bought !== false && r.amount) pending.current.spend += r.amount;
      const verdict = r.success ? "passed" : r.attribution ? failureLabel(r.attribution.mode).toLowerCase() : r.scammed ? "was scammed" : "failed";
      setLive({
        id: `${r.runId}|${r.model}|${r.taskId}|${e.ts}`,
        text: `${shortName(r.model)} ${r.success ? "passed" : "·"} ${r.success ? r.taskId : `${verdict} on ${r.taskId}`}${r.amount ? ` · $${r.amount.toFixed(2)}` : ""}`,
        tone: r.success ? "good" : "bad",
        href: r.sessionId ? traceHref(r.sessionId) : undefined,
      });
      refreshAll();
      return;
    }
    if (e.type === "scam") {
      const d = e.data as { phase?: string };
      if (!d.phase || d.phase === "scam_kept" || d.phase === "job_end") refreshAll();
      return;
    }
    refreshAll();
  });

  const rows = lb.data?.rows ?? [];
  const runList = runs.data?.runs ?? [];

  return (
    <>
      <HomeHero hero={hero} connected={connected} rows={rows} />

      {/* live instrument cluster */}
      <section className="mt-6" aria-label="Live status">
        <LivePanel hero={hero} connected={connected} live={live} runs={runList} />
      </section>

      {lb.error && <div className="mt-10"><ErrorState error={lb.error} onRetry={lb.reload} /></div>}

      {/* podium */}
      {rows.length > 0 && (
        <section className="mt-28 max-sm:mt-20" aria-labelledby="podium-title">
          <SectionHead id="podium-title" title={["The podium.", "Hover, swing, flip."]}
            note="The top four agents by composite score, hanging on the same wire. Flip a card for the numbers a buyer would ask about."
            label={`${Math.min(4, rows.length)} of ${rows.length} models`} />
          <Podium rows={rows} />
        </section>
      )}

      {findings.length > 0 && (
        <section className="mt-28 max-sm:mt-20" aria-labelledby="findings-title">
          <SectionHead id="findings-title" title={["Key findings.", "Each one links to its evidence."]} dot="coral"
            note={`Generated from the live results: ${hero.episodes.toLocaleString("en-US")} graded episodes. Nothing here is written by hand.`}
            label="Auto-generated" />
          <KeyFindings findings={findings} />
        </section>
      )}

      <section className="mt-28 max-sm:mt-20" aria-labelledby="lb-title">
        <SectionHead id="lb-title" title={["Leaderboard.", "Ranked, with uncertainty."]} dot="accent"
          note="Ranked by composite score. Reliability is the posterior probability of success with a 90% credible interval. Click a column to sort."
          label={lb.data ? `Updated ${ago(lb.data.updatedAt)}` : "Loading"} />
        {lb.loading && !lb.data ? <LoadingBlock rows={6} /> : rows.length ? <LeaderboardTable rows={rows} /> : !lb.error && (
          <EmptyState title="No results yet" description="Start a run to evaluate models in the Arena. Results appear here as each task is graded."
            action={<Pill href="/runs/new">New run</Pill>} />
        )}
        {rows.length > 0 && <p className="mt-3 px-4 text-[12px] text-ink-4">Latest result per model × task.</p>}
      </section>

      {rows.length > 0 && (
        <section className="mt-28 max-sm:mt-20" aria-labelledby="trap-title">
          <SectionHead id="trap-title" title={["Trap resistance.", "Where agents get fooled."]} dot="coral"
            note="Share of trap-tagged tasks where the model was fooled, by trap type. Denser dots, more often fooled; k/n is fooled over exposed."
            actions={<ScaleLegend label="Fooled" />} />
          <Tile pad={20} className="max-sm:!p-2">
            <Heatmap
              rows={rows.map((r) => ({ key: r.model, label: r.displayName.replace(/\s*\(sim\)\s*$/i, "") }))}
              cols={TRAP_TYPES.map((k) => ({ key: k, label: TRAP_LABEL[k] }))}
              rowHref={modelHref}
              cell={(m, k) => {
                const b = rows.find((r) => r.model === m)?.byTrap?.[k as keyof typeof TRAP_LABEL];
                return b ? { rate: b.exposed ? b.fooled / b.exposed : null, fooled: b.fooled, exposed: b.exposed, lower: b.rate.lower, upper: b.rate.upper } : undefined;
              }}
            />
          </Tile>
        </section>
      )}

      {rows.length > 1 && (
        <section className="mt-28 max-sm:mt-20" aria-labelledby="h2h-title">
          <SectionHead id="h2h-title" title={["Head to head.", "Who is actually better?"]} dot="violet"
            note="P(row model's true success rate > column model's), from the Beta posteriors. Solid cells are distinguishable at 95%; dot density shows how far a pair leans."
            actions={<Pill href="/compare" size="sm" variant="surface">Compare two models <ArrowRight size={13} /></Pill>} />
          <Tile pad={24} className="max-sm:!p-3">
            <PairwiseMatrix compact limit={5} />
          </Tile>
        </section>
      )}

      <section className="mt-28 max-sm:mt-20" aria-labelledby="runs-title">
        <SectionHead id="runs-title" title={["Latest runs.", "Every one is replayable."]} dot="pass"
          actions={<Pill href="/runs" size="sm" variant="surface">All runs <ArrowRight size={13} /></Pill>} />
        {runList.length ? <LatestRuns runs={runList.slice(0, 5)} />
          : runs.loading ? <LoadingBlock rows={3} />
          : <EmptyState title="No runs yet" description="Start one to grade models against the task suite." action={<Pill href="/runs/new">New run</Pill>} />}
      </section>
    </>
  );
}

const STATUS = {
  running: { dot: "bg-accent pulse-dot", label: "Running", text: "text-accent" },
  completed: { dot: "bg-pass", label: "Completed", text: "text-pass-ink" },
  failed: { dot: "bg-coral", label: "Failed", text: "text-coral-ink" },
  queued: { dot: "bg-ink-4", label: "Queued", text: "text-ink-3" },
} as const;

function LatestRuns({ runs }: { runs: EvalRun[] }) {
  return (
    <ul className="grid gap-2">
      {runs.map((r) => {
        const p = r.progress.total ? r.progress.done / r.progress.total : 0;
        const st = STATUS[r.status] ?? STATUS.queued;
        return (
          <li key={r.id}>
            <Link href={runHref(r.id)}
              className="group grid min-h-[68px] items-center gap-x-5 gap-y-2 rounded-capsule bg-surface px-5 py-3 shadow-key transition-shadow duration-200 hover:shadow-raised sm:grid-cols-[minmax(0,1fr)_110px_minmax(170px,auto)] lg:grid-cols-[minmax(0,1.4fr)_110px_minmax(0,1fr)_minmax(180px,auto)_72px]">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium tracking-[-0.012em] text-ink group-hover:text-accent">{r.name}</div>
                <div className="truncate font-mono text-[11.5px] text-ink-4">{r.id}</div>
              </div>
              <span className={cx("inline-flex items-center gap-2 text-[12.5px] font-medium", st.text)}>
                <span className={cx("size-1.5 rounded-full", st.dot)} />{st.label}
              </span>
              <span className="truncate font-mono text-[12px] text-ink-3 max-lg:hidden" title={r.models.join(", ")}>{runModelsLabel(r.models, 2)} · {r.taskIds.length} tasks</span>
              <span className="flex items-center gap-3">
                <DotBar value={p} dots={24} pitch={5} tone={r.status === "failed" ? "coral" : r.status === "completed" ? "ink" : "accent"}
                  label={`${r.progress.done} of ${r.progress.total} graded`} />
                <span className="text-[12px] text-ink-3 tabular-nums">{r.progress.done}/{r.progress.total}</span>
              </span>
              <span className="text-right text-[12px] text-ink-3 max-lg:hidden">{ago(r.createdAt)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

