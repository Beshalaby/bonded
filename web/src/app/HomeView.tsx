"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Heatmap, ScaleLegend } from "@/components/charts";
import LeaderboardTable from "@/components/LeaderboardTable";
import RunsList from "@/components/RunsList";
import HomeHero, { type LiveLine } from "@/components/home/HomeHero";
import KeyFindings from "@/components/home/KeyFindings";
import PairwiseMatrix from "@/components/rigor/PairwiseMatrix";
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, Section, TextLink } from "@/components/ui";
import { useEvents } from "@/components/useEvents";
import type { Finding, HeroStats } from "@/lib/findings";
import type { BenchResult, FeedEvent } from "@/lib/types";
import { useApi, type LeaderboardResponse, type RunsResponse } from "@/lib/ui/api";
import { TRAP_LABEL, TRAP_TYPES, ago, failureLabel, modelHref, traceHref } from "@/lib/ui/format";

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

  return (
    <>
      <HomeHero hero={hero} connected={connected} live={live} rows={rows} />

      {findings.length > 0 && (
        <Section className="!mt-10" title="Key findings"
          description={`Generated from the live results: ${hero.episodes.toLocaleString("en-US")} graded episodes. Each claim links to its evidence.`}>
          <KeyFindings findings={findings} />
        </Section>
      )}

      {lb.error && <div className="mt-8"><ErrorState error={lb.error} onRetry={lb.reload} /></div>}

      <Section title="Leaderboard" className="!mt-14"
        description="Ranked by composite score. Reliability is the posterior probability of success with a 90% credible interval; click a column to sort."
        actions={lb.data && <span className="text-zinc-500">Updated {ago(lb.data.updatedAt)} · latest result per model × task</span>}>
        {lb.loading && !lb.data ? <LoadingBlock rows={6} /> : rows.length ? <LeaderboardTable rows={rows} /> : !lb.error && (
          <EmptyState title="No results yet" description="Start a run to evaluate models in the Arena. Results appear here as each task is graded."
            action={<ButtonLink href="/runs/new">New run</ButtonLink>} />
        )}
      </Section>

      {rows.length > 1 && (
        <Section title="Head to head"
          description="P(row model's true success rate > column model's), from the Beta posteriors. Marked cells are distinguishable at 95%."
          actions={<TextLink href="/compare" className="tap inline-flex items-center gap-1 whitespace-nowrap">Compare two models <ArrowRight size={13} /></TextLink>}>
          <PairwiseMatrix compact limit={5} />
        </Section>
      )}

      {rows.length > 0 && (
        <Section title="Trap resistance"
          description="Share of trap-tagged tasks where the model was fooled, by trap type. Lower is better; k/n is fooled over exposed."
          actions={<ScaleLegend label="Fooled" />}>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 max-sm:p-2">
            <Heatmap
              rows={rows.map((r) => ({ key: r.model, label: r.displayName.replace(/\s*\(sim\)\s*$/i, "") }))}
              cols={TRAP_TYPES.map((k) => ({ key: k, label: TRAP_LABEL[k] }))}
              rowHref={modelHref}
              cell={(m, k) => {
                const b = rows.find((r) => r.model === m)?.byTrap?.[k as keyof typeof TRAP_LABEL];
                return b ? { rate: b.exposed ? b.fooled / b.exposed : null, fooled: b.fooled, exposed: b.exposed, lower: b.rate.lower, upper: b.rate.upper } : undefined;
              }}
            />
          </div>
        </Section>
      )}

      <Section title="Latest runs" actions={<TextLink href="/runs" className="tap inline-flex items-center gap-1">All runs <ArrowRight size={13} /></TextLink>}>
        {runs.data?.runs.length ? <RunsList runs={runs.data.runs.slice(0, 5)} compact />
          : runs.loading ? <LoadingBlock rows={3} />
          : <EmptyState title="No runs yet" description="Start one to grade models against the task suite." action={<ButtonLink href="/runs/new">New run</ButtonLink>} />}
      </Section>
    </>
  );
}
