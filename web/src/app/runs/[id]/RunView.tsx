"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import LeaderboardTable from "@/components/LeaderboardTable";
import {
  Badge, Card, Chip, EmptyState, ErrorState, LoadingBlock, PageHeader, ProgressBar, RunStatusBadge, Section, Stat, StatStrip, cx, outcomeOf, type Outcome,
} from "@/components/ui";
import { useEvents } from "@/components/useEvents";
import type { BenchResult, EvalRun, FeedEvent } from "@/lib/types";
import { useApi, type RunResponse, type TasksResponse } from "@/lib/ui/api";
import { dateTime, duration, failureLabel, modelHref, pct, taskHref, traceHref } from "@/lib/ui/format";

const CELL: Record<Outcome, { label: string; cls: string }> = {
  success: { label: "Pass", cls: "text-pass-ink hover:bg-pass-soft" },
  scammed: { label: "Scammed", cls: "bg-coral-soft text-coral-ink hover:bg-coral-soft" },
  failed: { label: "Fail", cls: "bg-coral-soft text-coral-ink hover:bg-coral-soft" },
  over_budget: { label: "Over budget", cls: "bg-coral-soft text-coral-ink hover:bg-coral-soft" },
  wrong_item: { label: "Wrong item", cls: "bg-amber-soft text-amber-ink hover:bg-amber-soft" },
  no_purchase: { label: "No purchase", cls: "bg-canvas-sunk text-ink-2 hover:bg-ink-5" },
  error: { label: "Error", cls: "bg-canvas-sunk text-ink-2 hover:bg-ink-5" },
};

export default function RunView({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<RunResponse>(`/api/runs/${encodeURIComponent(id)}`);
  const tasks = useApi<TasksResponse>("/api/tasks");
  const [run, setRun] = useState<EvalRun>();
  const [results, setResults] = useState<BenchResult[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "failed">("all");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (data) { setRun(data.run); setResults(data.results); } }, [data]);

  const live = run?.status === "running" || run?.status === "queued";
  const connected = useEvents(["run", "result"], (e: FeedEvent) => {
    if (e.type === "run") {
      const r = e.data as EvalRun;
      if (r?.id === id) {
        setRun((prev) => ({ ...(prev ?? r), ...r }));
        if (r.status === "completed" || r.status === "failed") reload();
      }
    } else if (e.type === "result") {
      const r = e.data as BenchResult;
      if (r?.runId !== id) return;
      const key = `${r.model}::${r.taskId}`;
      setResults((prev) => [...prev.filter((x) => `${x.model}::${x.taskId}` !== key), r]);
      setFresh((s) => new Set(s).add(key));
      if (!t.current) t.current = setTimeout(() => { t.current = null; reload(); }, 2500);
    }
  });

  const instr = useMemo(() => new Map((tasks.data?.tasks ?? []).map((x) => [x.id, x])), [tasks.data]);
  const byCell = useMemo(() => new Map(results.map((r) => [`${r.model}::${r.taskId}`, r])), [results]);

  if (error && !data) return <><Crumb id={id} /><ErrorState error={error} onRetry={reload} /></>;
  if (!run) return <><Crumb id={id} /><LoadingBlock rows={8} /></>;

  const counts = results.reduce((acc, r) => { const o = outcomeOf(r); acc[o] = (acc[o] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const passed = counts.success ?? 0;
  const scammed = counts.scammed ?? 0;
  const failedTotal = results.length - passed;
  const taskIds = run.taskIds.length ? run.taskIds : [...new Set(results.map((r) => r.taskId))];
  const rowsShown = filter === "all" ? taskIds : taskIds.filter((tid) => run.models.some((m) => { const r = byCell.get(`${m}::${tid}`); return r && !r.success; }));

  return (
    <>
      <Crumb id={id} />
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{run.name}<RunStatusBadge status={run.status} /></span>}
        meta={<>
          <span>Started {dateTime(run.startedAt ?? run.createdAt)}</span>
          <span>{run.finishedAt ? `Took ${duration(run.startedAt ?? run.createdAt, run.finishedAt)}` : live ? `Running for ${duration(run.startedAt ?? run.createdAt)}` : null}</span>
          <span>Guardrail: <span className="capitalize">{run.guardrail}</span></span>
          {live && <span className="inline-flex items-center gap-1.5"><span className={cx("size-1.5 rounded-full", connected ? "pulse-dot bg-pass" : "bg-ink-5")} />{connected ? "Live" : "Connecting…"}</span>}
        </>}
      />

      {run.error && <div className="mb-4"><ErrorState error={run.error} /></div>}

      <Card className="mb-4">
        <div className="mb-2 flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-ink">Progress</span>
          <span className="text-ink-3 tnum">{run.progress.done} of {run.progress.total} episodes · {pct(run.progress.total ? run.progress.done / run.progress.total : 0)}</span>
        </div>
        <ProgressBar done={run.progress.done} total={run.progress.total} />
      </Card>

      <StatStrip cols={4}>
        <Stat label="Graded" value={<span className="tnum">{results.length}</span>} sub={`${run.models.length} models × ${taskIds.length} tasks`} />
        <Stat label="Passed" value={<span className="tnum">{passed}</span>} sub={results.length ? `${pct(passed / results.length)} of graded` : undefined} tone={passed ? "good" : undefined} />
        <Stat label="Failed" value={<span className="tnum">{failedTotal}</span>} sub={failedTotal ? [["scammed", counts.scammed], ["over budget", counts.over_budget], ["wrong item", counts.wrong_item], ["no purchase", counts.no_purchase], ["other", (counts.failed ?? 0) + (counts.error ?? 0)]].filter(([, n]) => n).map(([l, n]) => `${n} ${l}`).join(" · ") : undefined} />
        <Stat label="Scammed" value={<span className="tnum">{scammed}</span>} sub={results.length ? `${pct(scammed / results.length)} of graded` : undefined} tone={scammed ? "bad" : undefined} />
      </StatStrip>

      <Section title="Run leaderboard" description="Computed from this run’s results only.">
        {data?.leaderboard?.length ? <LeaderboardTable rows={data.leaderboard} compact /> :
          loading ? <LoadingBlock rows={3} /> : <EmptyState title="Waiting for the first graded result" />}
      </Section>

      <Section title="Results" description="Task × model. Each cell links to the trace of that episode."
        actions={<>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All tasks</Chip>
          <Chip active={filter === "failed"} onClick={() => setFilter("failed")}>With failures</Chip>
        </>}>
        {taskIds.length === 0 ? <EmptyState title="No tasks in this run" /> : (
          <div className="overflow-x-auto rounded-lg border border-divider bg-white">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 h-auto border-b border-divider bg-ivory px-4 py-2 text-left text-[12px] font-medium text-ink-3 max-lg:shadow-[inset_-1px_0_0_oklch(92%_0.006_80)] max-sm:px-3">Task</th>
                  {run.models.map((m) => (
                    <th key={m} className="h-auto min-w-[112px] max-sm:min-w-[96px] border-b border-l border-divider bg-ivory px-2 py-2 text-center text-[12px] font-medium text-ink-3">
                      <Link href={modelHref(m)} className="tap font-mono text-[11.5px] hover:text-accent">{m.replace(/^sim\//, "")}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsShown.map((tid) => {
                  const task = instr.get(tid);
                  return (
                    <tr key={tid} className="hover:bg-ivory/60">
                      <td className="sticky left-0 z-10 max-w-[420px] border-b border-divider bg-white px-4 py-2 max-lg:max-w-[240px] max-lg:shadow-[inset_-1px_0_0_oklch(92%_0.006_80)] max-sm:min-w-[132px] max-sm:max-w-[148px] max-sm:px-3">
                        <div className="flex min-w-0 items-center gap-2 max-sm:flex-wrap max-sm:gap-1">
                          <Link href={taskHref(tid)} className="tap min-w-0 truncate font-mono text-[12px] text-ink-3 hover:text-accent">{tid}</Link>
                          {task?.adversarial && <Badge tone="warn">Adversarial</Badge>}
                        </div>
                        {task && <div className="truncate text-[12.5px] text-ink-2" title={task.instruction}>{task.instruction}</div>}
                      </td>
                      {run.models.map((m) => {
                        const key = `${m}::${tid}`;
                        const r = byCell.get(key);
                        if (!r) return (
                          <td key={m} className="border-b border-l border-divider px-2 py-2 text-center">
                            <span className={cx("inline-block size-1.5 rounded-full", live ? "pulse-dot bg-ink-5" : "bg-ink-5")} />
                          </td>
                        );
                        const o = outcomeOf(r);
                        const c = CELL[o];
                        const tip = r.attribution ? `${failureLabel(r.attribution.mode)}: ${r.attribution.explanation}` : o === "success" ? "Passed" : c.label;
                        const content = <span className={cx("flex h-7 max-lg:h-10 items-center justify-center gap-1 rounded text-[12px] font-medium transition-colors", c.cls)}>{o === "success" && <Check size={12} strokeWidth={2.5} />}{c.label}</span>;
                        return (
                          <td key={m} title={tip} className={cx("border-b border-l border-divider px-1.5 py-1.5", fresh.has(key) && "row-in")}>
                            {r.sessionId ? <Link href={traceHref(r.sessionId)}>{content}</Link> : content}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rowsShown.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-ink-3">No failures so far.</p>}
          </div>
        )}
      </Section>
    </>
  );
}

function Crumb({ id }: { id: string }) {
  return (
    <nav className="mb-3 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-3">
      <Link href="/runs" className="hover:text-ink max-lg:inline-flex max-lg:min-h-10 max-lg:items-center">Runs</Link><span className="text-ink-5">/</span><span className="min-w-0 truncate font-mono text-[12.5px]">{id}</span>
    </nav>
  );
}
