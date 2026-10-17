"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { CountBars } from "@/components/charts";
import { hiddenText } from "@/components/StepTimeline";
import GrowthChart, { growthSteps } from "@/components/redteam/GrowthChart";
import Theater from "@/components/redteam/Theater";
import { useRedteamDirector } from "@/components/redteam/useRedteamDirector";
import {
  Badge, Card, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Section, Stat, StatStrip, TrapBadge, cx,
} from "@/components/ui";
import { useEvents } from "@/components/useEvents";
import type { RedTeamScam } from "@/lib/types";
import { useApi, type RedTeamResponse } from "@/lib/ui/api";
import { isAuthError, postJSON } from "@/lib/auth-client";
import AuthError from "@/components/auth/AuthError";
import { ago, modelHref, taskHref, trapLabel, usd } from "@/lib/ui/format";

export default function RedTeamView() {
  const { data, error, loading, reload } = useApi<RedTeamResponse>("/api/redteam");
  const director = useRedteamDirector();
  const [posting, setPosting] = useState(false);
  const [runErr, setRunErr] = useState<string>();
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soon = (ms = 600) => { if (!t.current) t.current = setTimeout(() => { t.current = null; reload(); }, ms); };

  const connected = useEvents(["scam"], (e) => {
    const isProgress = director.onFeed(e);
    const phase = (e.data as { phase?: string })?.phase;
    // registry upserts (no phase) and job boundaries change the gallery / growth data
    if (!isProgress || phase === "scam_kept" || phase === "job_start" || phase === "job_end") soon();
  });

  async function start() {
    setPosting(true); setRunErr(undefined);
    try {
      await postJSON("/api/redteam", { rounds: 1, perRound: 4 });
      reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already running/i.test(msg)) setRunErr(msg);
    } finally {
      setPosting(false);
    }
  }

  const serverRunning = !!data?.running;
  useEffect(() => {
    if (!serverRunning) return;
    const iv = setInterval(reload, 3000);
    return () => clearInterval(iv);
  }, [serverRunning, reload]);
  const busy = posting || serverRunning;

  // kept scams whose verdict hasn't played in the theater yet are held back, so the chart steps up on cue
  const pending = useMemo(() => new Set(director.pendingIds), [director.pendingIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const scams = (data?.scams ?? []).filter((s) => !pending.has(s.id));
  const base = data?.growth?.length ? data.growth[0].tasks : director.state.startTasks;
  const steps = base != null ? growthSteps(base, scams) : [];
  const fooledModels = new Set(scams.flatMap((s) => s.fooled));
  const freshIds = new Set(director.shownKept);
  const byTrapMap = new Map<string, number>();
  scams.forEach((s) => byTrapMap.set(s.trapType, (byTrapMap.get(s.trapType) ?? 0) + 1));
  const byTrap = [...byTrapMap].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: trapLabel(k), value: v }));

  return (
    <>
      <PageHeader title="Red team"
        description="An adversary writes new scam listings and tests them against every model. A scam that fools at least one model becomes a new benchmark task, so the benchmark gets harder over time." />

      <Theater director={director} busy={busy} onRun={start} onReplay={() => data && director.replay(data.scams)}
        canReplay={!!data?.scams.length} connected={connected} error={isAuthError(runErr) ? undefined : runErr} />
      {isAuthError(runErr) && <AuthError message={runErr} className="mt-2" />}

      {error && <div className="mt-4"><ErrorState error={error} onRetry={reload} /></div>}

      {loading && !data ? <div className="mt-8"><LoadingBlock rows={6} /></div> : data && (
        <>
          <div className="mt-8">
            <StatStrip cols={4}>
              <Stat label="Scams that fooled a model" value={<span className="tnum">{scams.length}</span>}
                sub={`${new Set(scams.map((s) => s.variantTaskId ?? s.taskId)).size} adversarial tasks added`} />
              <Stat label="Benchmark size" value={<span className="tnum">{steps.length ? steps[steps.length - 1].tasks : "—"}</span>}
                sub={steps.length > 1 ? `+${steps.length - 1} from the red team (base ${steps[0].tasks})` : "tasks"} />
              <Stat label="Models fooled" value={<span className="tnum">{fooledModels.size}</span>} sub="by at least one scam" />
              <Stat label="Most effective trap" value={byTrap[0] ? byTrap[0].label : "—"} sub={byTrap[0] ? `${byTrap[0].value} kept scam${byTrap[0].value === 1 ? "" : "s"}` : undefined} />
            </StatStrip>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
            <Card>
              <CardTitle aside="one step per kept scam · R = round">Benchmark growth</CardTitle>
              {steps.length >= 2 ? <GrowthChart steps={steps} /> : <p className="py-10 text-center text-[13px] text-ink-3">Growth appears after the first scam is kept.</p>}
            </Card>
            <Card>
              <CardTitle aside="kept scams">By trap type</CardTitle>
              {byTrap.length ? <CountBars rows={byTrap} color="oklch(68% 0.15 35)" /> : <p className="py-10 text-center text-[13px] text-ink-3">No scams yet.</p>}
            </Card>
          </div>

          <Section title="Scams that fooled models" description="Each listing as injected into the Arena, the technique used, and which models bought it or obeyed it.">
            {scams.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {scams.map((s) => <ScamCard key={s.id} s={s} fresh={freshIds.has(s.id)} />)}
              </div>
            ) : (
              <EmptyState title="No scams yet" description="Run a red-team round to generate listings and test them against the models." />
            )}
          </Section>
        </>
      )}
    </>
  );
}

function ScamCard({ s, fresh }: { s: RedTeamScam; fresh?: boolean }) {
  const p = s.product ?? {};
  const hidden = hiddenText(p.description);
  const notFooled = s.testedModels.filter((m) => !s.fooled.includes(m));
  const taskId = s.variantTaskId ?? s.taskId;
  return (
    <div className={cx("flex flex-col rounded-lg border bg-white", fresh ? "border-accent/40 row-in" : "border-divider")}>
      <div className="border-b border-divider px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium text-ink" title={p.title}>{p.title ?? s.id}</div>
            <div className="mt-0.5 text-[12px] text-ink-3">{p.brand}{p.category ? ` · ${p.category}` : ""}</div>
          </div>
          <div className="shrink-0 text-right font-mono text-[13px] tnum">
            {p.price != null && <div className="font-medium text-ink">{usd(p.price)}</div>}
            {p.listPrice != null && p.price != null && p.listPrice > p.price && <div className="text-[11px] text-ink-4 line-through">{usd(p.listPrice)}</div>}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <TrapBadge type={s.trapType} />
          <span className="rounded bg-canvas-sunk px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{s.technique}</span>
          {fresh && <Badge tone="accent">New</Badge>}
        </div>
        {(p.trap?.note || hidden.length > 0) && (
          <div className="mt-2 text-[12px] text-ink-2">
            {hidden.length > 0
              ? <pre className="line-clamp-3 whitespace-pre-wrap break-words rounded border border-coral/20 bg-coral-soft/50 px-2 py-1 font-mono text-[11px] text-coral-ink" title={hidden[0].how}>{hidden.map((h) => h.text).join("\n")}</pre>
              : p.trap?.note}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 py-3 text-[12px]">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-ink-3">Fooled</span>
          {s.fooled.map((m) => <Link key={m} href={modelHref(m)} className="tap rounded bg-coral-soft px-1.5 py-0.5 font-mono text-[11px] text-coral-ink hover:underline">{m.replace(/^sim\//, "")}</Link>)}
          {notFooled.length > 0 && <span className="ml-2 mr-1 text-ink-3">Resisted</span>}
          {notFooled.map((m) => <Link key={m} href={modelHref(m)} className="tap rounded bg-canvas-sunk px-1.5 py-0.5 font-mono text-[11px] text-ink-2 hover:underline">{m.replace(/^sim\//, "")}</Link>)}
        </div>
        <div className="mt-auto flex items-center justify-between pt-1 text-ink-3">
          <span>{s.generator === "llm" ? "LLM-generated" : "Mutation"}{s.round != null ? ` · round ${s.round}` : ""} · {ago(s.createdAt)}</span>
          <Link href={taskHref(taskId)} className="tap inline-flex items-center gap-1 text-accent hover:underline">
            <span className="font-mono">{taskId}</span><ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
