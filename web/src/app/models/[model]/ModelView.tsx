"use client";
import Link from "next/link";
import { CIBar, CountBars, LineChart, RateBars } from "@/components/charts";
import FailureList from "@/components/FailureList";
import {
  Badge, Card, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, ProviderBadge, Section, Stat, StatStrip,
} from "@/components/ui";
import { useApi, type ModelResponse } from "@/lib/ui/api";
import { TRAP_LABEL, TRAP_TYPES, cost, dateTime, failureLabel, ms, num, pct, runHref } from "@/lib/ui/format";

export default function ModelView({ model }: { model: string }) {
  const { data, error, loading, reload } = useApi<ModelResponse>(`/api/models/${encodeURIComponent(model)}`);

  if (error) return (<><Crumb /><PageHeader title={model} /><ErrorState error={error} onRetry={reload} /></>);
  if (loading && !data) return (<><Crumb /><PageHeader title={<span className="font-mono">{model}</span>} /><LoadingBlock rows={8} /></>);
  if (!data) return null;

  const { stats: s, failures, history } = data;
  const m = s.metrics;
  const traps = TRAP_TYPES.map((t) => {
    const b = s.byTrap?.[t];
    return { key: t, label: TRAP_LABEL[t], rate: b?.rate ?? { mean: 0, lower: 0, upper: 0 }, k: b?.fooled ?? 0, n: b?.exposed ?? 0 };
  });
  const modes = Object.entries(s.failureModes ?? {})
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, v]) => ({ key: k, label: failureLabel(k), value: v ?? 0 }));
  const failedN = modes.reduce((a, b) => a + b.value, 0);
  const hist = [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      <Crumb />
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{s.displayName.replace(/\s*\(sim\)\s*$/i, "")} <ProviderBadge provider={s.provider} simulated={s.simulated} /></span>}
        meta={<><span className="font-mono text-[12.5px]">{s.model}</span><span>{s.n} graded results</span>{s.simulated && <span>Scripted policy, used to calibrate the benchmark</span>}</>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <Card className="flex flex-col justify-between">
          <div>
            <div className="text-[12px] text-zinc-500">Composite score</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[44px] font-semibold leading-none tracking-[-0.03em] text-zinc-900 tnum">{num(s.score, 1)}</span>
              <span className="text-[14px] text-zinc-400">/ 100</span>
            </div>
          </div>
          <div className="mt-6 border-t border-zinc-100 pt-4">
            <div className="text-[12px] text-zinc-500">Reliability · P(success), 90% credible interval</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[20px] font-semibold text-zinc-900 tnum">{pct(s.reliability.mean)}</span>
              <span className="text-[13px] text-zinc-500 tnum">{pct(s.reliability.lower)} – {pct(s.reliability.upper)}</span>
            </div>
            <div className="mt-2"><CIBar interval={s.reliability} width={280} label={false} n={s.n} /></div>
            <div className="flex w-[280px] justify-between px-[5px] text-[10.5px] text-zinc-400 tnum"><span>0</span><span>50</span><span>100</span></div>
          </div>
        </Card>

        <StatStrip cols={4}>
          <Stat label="Success" value={pct(m.successRate)} tone={m.successRate >= 0.8 ? "good" : undefined} />
          <Stat label="Scammed" value={pct(m.scamRate)} tone={m.scamRate >= 0.2 ? "bad" : undefined} />
          <Stat label="Over budget" value={pct(m.budgetViolationRate)} tone={m.budgetViolationRate >= 0.2 ? "bad" : undefined} />
          <Stat label="Wrong item" value={pct(m.wrongItemRate)} tone={m.wrongItemRate >= 0.2 ? "warn" : undefined} />
          <Stat label="No purchase" value={pct(m.noPurchaseRate)} />
          <Stat label="Guardrail catch rate" value={pct(m.guardrailCatchRate)} sub="failures flagged pre-checkout" />
          <Stat label="Avg cost / task" value={<span className="font-mono text-[20px]">{cost(m.avgCostUsd)}</span>} />
          <Stat label="Avg latency · steps" value={<span className="tnum">{ms(m.avgLatencyMs)}</span>} sub={`${num(m.avgSteps, 1)} steps per task`} />
        </StatStrip>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle aside="fooled / exposed · 90% CI">Trap resistance</CardTitle>
          <RateBars rows={traps} />
        </Card>
        <Card>
          <CardTitle aside={`${failedN} attributed failure${failedN === 1 ? "" : "s"}`}>Failure modes</CardTitle>
          {modes.length ? <CountBars rows={modes} /> : <p className="py-8 text-center text-[13px] text-zinc-500">No failures attributed.</p>}
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle aside={hist.length ? `${hist.length} run${hist.length === 1 ? "" : "s"}` : undefined}>Score across runs</CardTitle>
        {hist.length >= 2 ? (
          <LineChart
            data={hist.map((h, i) => ({ x: i, y: h.score, label: `Run ${i + 1}`, href: runHref(h.runId) }))}
            yMin={0} yMax={100} height={190}
            yFormat={(v) => v.toFixed(0)}
            xFormat={(p) => p.label ?? ""}
            tooltip={(p, i) => (
              <>
                <div className="text-[13px] font-semibold text-zinc-900 tnum">Score {hist[i].score.toFixed(1)}</div>
                <div className="text-zinc-600 tnum">Success {pct(hist[i].successRate)}</div>
                <div className="mt-0.5 font-mono text-[11px] text-zinc-400">{hist[i].runId}</div>
                <div className="text-zinc-400">{p.label} · {dateTime(hist[i].createdAt)}</div>
              </>
            )}
          />
        ) : hist.length === 1 ? (
          <p className="py-6 text-[13px] text-zinc-500">One run so far (score {hist[0].score.toFixed(1)}). History appears after the next run.</p>
        ) : <p className="py-6 text-[13px] text-zinc-500">No run history.</p>}
        {hist.length >= 2 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-zinc-500">
            {hist.map((h, i) => (
              <Link key={h.runId} href={runHref(h.runId)} className="hover:text-accent"><span className="text-zinc-400">Run {i + 1}</span> <span className="font-mono">{h.runId}</span></Link>
            ))}
          </div>
        )}
      </Card>

      <Section title="Recent failures" description="Each failed result is read by the attribution judge, which labels the fault and cites the trace steps it relied on."
        actions={failures.length ? <Badge>{failures.length}</Badge> : undefined}>
        {failures.length ? <FailureList results={failures} /> :
          <EmptyState title="No failures" description="Every graded result for this model passed." />}
      </Section>
    </>
  );
}

function Crumb() {
  return (
    <nav className="mb-3 flex items-center gap-1.5 text-[13px] text-zinc-500">
      <Link href="/" className="hover:text-zinc-900">Leaderboard</Link><span className="text-zinc-300">/</span><span>Model</span>
    </nav>
  );
}
