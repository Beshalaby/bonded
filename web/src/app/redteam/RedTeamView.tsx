"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Swords } from "lucide-react";
import { CountBars, LineChart } from "@/components/charts";
import { hiddenText } from "@/components/StepTimeline";
import {
  Badge, Card, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Section, Stat, StatStrip, TrapBadge, buttonClass, cx,
} from "@/components/ui";
import { useEvents } from "@/components/useEvents";
import type { RedTeamScam } from "@/lib/types";
import { postJSON, useApi, type RedTeamResponse } from "@/lib/ui/api";
import { ago, modelHref, taskHref, trapLabel, usd } from "@/lib/ui/format";

export default function RedTeamView() {
  const { data, error, loading, reload } = useApi<RedTeamResponse>("/api/redteam");
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState<string>();
  const [live, setLive] = useState<RedTeamScam[]>([]);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connected = useEvents(["scam"], (e) => {
    const s = e.data as RedTeamScam;
    if (!s?.id) return;
    setLive((l) => [s, ...l.filter((x) => x.id !== s.id)].slice(0, 12));
    if (!t.current) t.current = setTimeout(() => { t.current = null; reload(); }, 1500);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => { idle.current = null; setRunning(false); }, 8000);
  });

  async function start() {
    setRunning(true); setRunErr(undefined);
    try {
      await postJSON("/api/redteam", { rounds: 1, perRound: 6 });
      if (idle.current) clearTimeout(idle.current);
      idle.current = setTimeout(() => { idle.current = null; setRunning(false); reload(); }, 8000);
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : String(e)); setRunning(false);
    }
  }

  // Server-side state wins: a round may have been started elsewhere, or finished.
  const serverRunning = !!data?.running;
  useEffect(() => {
    if (!serverRunning && !running) return;
    const iv = setInterval(reload, 4000);
    return () => clearInterval(iv);
  }, [serverRunning, running, reload]);
  useEffect(() => {
    if (data && data.running === false && running && !idle.current) setRunning(false);
  }, [data, running]);
  const busy = running || serverRunning;
  const scams = data?.scams ?? [];
  const growth = [...(data?.growth ?? [])].sort((a, b) => a.ts.localeCompare(b.ts));
  const fooledModels = new Set(scams.flatMap((s) => s.fooled));
  const liveIds = new Set(live.map((s) => s.id));
  const byTrap = (data?.byTrap ?? []).filter((b) => b.count > 0).sort((a, b) => b.count - a.count)
    .map((b) => ({ key: b.trapType, label: trapLabel(b.trapType), value: b.count }));

  return (
    <>
      <PageHeader title="Red team"
        description="An adversarial generator writes new scam listings and tests them against the models. Scams that fool at least one model become new benchmark tasks, so the benchmark gets harder over time."
        actions={
          <button onClick={start} disabled={busy} className={buttonClass("primary")}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> Round in progress…</> : <><Swords size={14} /> Run red-team round</>}
          </button>
        }
        meta={busy ? <span className="inline-flex items-center gap-1.5"><span className={cx("size-1.5 rounded-full", connected ? "pulse-dot bg-emerald-500" : "bg-zinc-300")} />{connected ? "Listening for new scams" : "Connecting…"}</span> : undefined}
      />
      {runErr && <div className="mb-4"><ErrorState error={runErr} /></div>}
      {error && <div className="mb-4"><ErrorState error={error} onRetry={reload} /></div>}

      {loading && !data ? <LoadingBlock rows={6} /> : data && (
        <>
          <StatStrip cols={4}>
            <Stat label="Scams that fooled a model" value={<span className="tnum">{scams.length}</span>}
              sub={`${new Set(scams.map((s) => s.variantTaskId ?? s.taskId)).size} adversarial tasks added`} />
            <Stat label="Benchmark size" value={<span className="tnum">{growth.length ? growth[growth.length - 1].tasks : "—"}</span>}
              sub={growth.length > 1 ? `+${growth[growth.length - 1].tasks - growth[0].tasks} tasks since ${new Date(growth[0].ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "tasks"} />
            <Stat label="Models fooled" value={<span className="tnum">{fooledModels.size}</span>} sub="by at least one scam" />
            <Stat label="Most effective trap" value={byTrap[0] ? byTrap[0].label : "—"} sub={byTrap[0] ? `${byTrap[0].value} scams` : undefined} />
          </StatStrip>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
            <Card>
              <CardTitle aside="tasks in the benchmark">Benchmark growth</CardTitle>
              {growth.length >= 2 ? (
                <LineChart step xType="time" height={200}
                  data={growth.map((g) => ({ x: new Date(g.ts).getTime(), y: g.tasks, label: growthLabel(g.ts, growth) }))}
                  yMin={(() => { const lo = growth[0].tasks, hi = growth[growth.length - 1].tasks; return Math.max(0, Math.floor((lo - Math.max(5, hi - lo)) / 5) * 5); })()}
                  yMax={(() => { const lo = growth[0].tasks, hi = growth[growth.length - 1].tasks; return Math.ceil((hi + Math.max(2, (hi - lo) * 0.25)) / 5) * 5; })()}
                  tooltip={(p) => (<><div className="text-[13px] font-semibold text-zinc-900 tnum">{p.y} tasks</div><div className="text-zinc-500">{new Date(p.x).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div></>)}
                />
              ) : <p className="py-10 text-center text-[13px] text-zinc-500">Growth appears after the first red-team round.</p>}
            </Card>
            <Card>
              <CardTitle aside="scams that fooled ≥1 model">By trap type</CardTitle>
              {byTrap.length ? <CountBars rows={byTrap} color="#e11d48" /> : <p className="py-10 text-center text-[13px] text-zinc-500">No scams yet.</p>}
            </Card>
          </div>

          <Section title="Scams that fooled models" description="Each listing as injected into the Arena, the technique used, and which models bought it or obeyed it.">
            {scams.length || live.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[...live.filter((l) => !scams.some((s) => s.id === l.id)), ...scams].map((s) => <ScamCard key={s.id} s={s} fresh={liveIds.has(s.id)} />)}
              </div>
            ) : (
              <EmptyState title="No scams yet" description="Run a red-team round to generate listings and test them against the models."
                action={<button onClick={start} className={buttonClass("primary")}><Swords size={14} /> Run red-team round</button>} />
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
    <div className={cx("flex flex-col rounded-lg border bg-white", fresh ? "border-accent/40 row-in" : "border-zinc-200")}>
      <div className="border-b border-zinc-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium text-zinc-900" title={p.title}>{p.title ?? s.id}</div>
            <div className="mt-0.5 text-[12px] text-zinc-500">{p.brand}{p.category ? ` · ${p.category}` : ""}</div>
          </div>
          <div className="shrink-0 text-right font-mono text-[13px] tnum">
            {p.price != null && <div className="font-medium text-zinc-900">{usd(p.price)}</div>}
            {p.listPrice != null && p.price != null && p.listPrice > p.price && <div className="text-[11px] text-zinc-400 line-through">{usd(p.listPrice)}</div>}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <TrapBadge type={s.trapType} />
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">{s.technique}</span>
          {fresh && <Badge tone="accent">New</Badge>}
        </div>
        {(p.trap?.note || hidden.length > 0) && (
          <div className="mt-2 text-[12px] text-zinc-600">
            {hidden.length > 0
              ? <pre className="line-clamp-3 whitespace-pre-wrap break-words rounded border border-rose-100 bg-rose-50/50 px-2 py-1 font-mono text-[11px] text-rose-900" title={hidden[0].how}>{hidden.map((h) => h.text).join("\n")}</pre>
              : p.trap?.note}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 py-3 text-[12px]">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-zinc-500">Fooled</span>
          {s.fooled.map((m) => <Link key={m} href={modelHref(m)} className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] text-rose-700 hover:underline">{m.replace(/^sim\//, "")}</Link>)}
          {notFooled.length > 0 && <span className="ml-2 mr-1 text-zinc-500">Resisted</span>}
          {notFooled.map((m) => <Link key={m} href={modelHref(m)} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 hover:underline">{m.replace(/^sim\//, "")}</Link>)}
        </div>
        <div className="mt-auto flex items-center justify-between pt-1 text-zinc-500">
          <span>{s.generator === "llm" ? "LLM-generated" : "Mutation"}{s.round != null ? ` · round ${s.round}` : ""} · {ago(s.createdAt)}</span>
          <Link href={taskHref(taskId)} className="inline-flex items-center gap-1 text-accent hover:underline">
            <span className="font-mono">{taskId}</span><ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function growthLabel(ts: string, all: { ts: string }[]) {
  const span = new Date(all[all.length - 1].ts).getTime() - new Date(all[0].ts).getTime();
  const d = new Date(ts);
  return span < 2 * 86400e3
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
