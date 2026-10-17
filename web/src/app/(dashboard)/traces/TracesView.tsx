"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeader, Select, Table, Td, Th, Tr } from "@/components/ui";
import { useApi, type LeaderboardResponse, type RunsResponse, type TracesResponse } from "@/lib/ui/api";
import { ago, modelHref, taskHref, traceHref, usd } from "@/lib/ui/format";

const OUT = {
  success: <Badge tone="good">Pass</Badge>,
  failed: <Badge tone="bad">Fail</Badge>,
  no_purchase: <Badge>No purchase</Badge>,
  ungraded: <Badge>Ungraded</Badge>,
} as const;

export default function TracesView({ initialModel, initialRun }: { initialModel: string; initialRun: string }) {
  const router = useRouter();
  const [model, setModel] = useState(initialModel);
  const [runId, setRunId] = useState(initialRun);
  const [limit, setLimit] = useState(50);
  const qs = new URLSearchParams();
  if (model) qs.set("model", model);
  if (runId) qs.set("runId", runId);
  qs.set("limit", String(limit));
  const { data, error, loading, reload } = useApi<TracesResponse>(`/api/traces?${qs}`);
  const lb = useApi<LeaderboardResponse>("/api/leaderboard");
  const runs = useApi<RunsResponse>("/api/runs");

  useEffect(() => {
    const u = new URLSearchParams();
    if (model) u.set("model", model);
    if (runId) u.set("runId", runId);
    window.history.replaceState(null, "", `/traces${u.toString() ? `?${u}` : ""}`);
  }, [model, runId]);

  const models = useMemo(() => {
    const s = new Set<string>((lb.data?.rows ?? []).map((r) => r.model));
    (data?.traces ?? []).forEach((t) => s.add(t.model));
    if (model) s.add(model);
    return [...s].sort();
  }, [lb.data, data, model]);

  const traces = data?.traces ?? [];

  return (
    <>
      <PageHeader title="Traces"
        description="Every agent action in the Arena is logged to a per-session hash chain: searches, product views, cart changes, the guardrail verdict and checkout." />
      {error && <div className="mb-4"><ErrorState error={error} onRetry={reload} /></div>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select label="Model" value={model} onChange={setModel} className="min-w-[200px] font-mono text-[12.5px]">
          <option value="">All models</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Select label="Run" value={runId} onChange={setRunId} className="min-w-[220px]">
          <option value="">All runs</option>
          {(runs.data?.runs ?? []).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.id}</option>)}
          {runId && !(runs.data?.runs ?? []).some((r) => r.id === runId) && <option value={runId}>{runId}</option>}
        </Select>
        {(model || runId) && <button onClick={() => { setModel(""); setRunId(""); }} className="px-2 text-[13px] text-zinc-500 hover:text-zinc-900">Clear</button>}
        <span className="ml-auto text-[13px] text-zinc-500 tnum">{traces.length} trace{traces.length === 1 ? "" : "s"}</span>
      </div>

      {loading && !data ? <LoadingBlock rows={10} /> : traces.length ? (
        <>
          <Table>
            <thead><tr>
              <Th>Outcome</Th><Th>Instruction</Th><Th>Model</Th><Th>Task</Th><Th align="right">Steps</Th><Th align="right">Spent</Th><Th align="right">When</Th>
            </tr></thead>
            <tbody>
              {traces.map((t) => (
                <Tr key={t.sessionId} onClick={() => router.push(traceHref(t.sessionId))}>
                  <Td className="w-[110px]">{OUT[t.outcome] ?? <Badge>{t.outcome}</Badge>}</Td>
                  <Td className="max-w-[420px]">
                    <Link href={traceHref(t.sessionId)} onClick={(e) => e.stopPropagation()} className="block truncate text-zinc-900 hover:text-accent" title={t.instruction}>{t.instruction}</Link>
                    <div className="font-mono text-[11.5px] text-zinc-400">{t.sessionId}</div>
                  </Td>
                  <Td><Link href={modelHref(t.model)} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] text-zinc-600 hover:text-accent">{t.model}</Link></Td>
                  <Td>{t.taskId ? <Link href={taskHref(t.taskId)} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] text-zinc-600 hover:text-accent">{t.taskId}</Link> : <span className="text-zinc-300">—</span>}</Td>
                  <Td align="right">{t.steps}</Td>
                  <Td align="right" mono>{t.amount != null ? usd(t.amount) : <span className="text-zinc-300">—</span>}</Td>
                  <Td align="right" className="whitespace-nowrap text-zinc-500">{ago(t.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {traces.length >= limit && (
            <div className="mt-3 text-center"><button onClick={() => setLimit((l) => l + 50)} className="text-[13px] text-accent hover:underline">Load more</button></div>
          )}
        </>
      ) : !error && <EmptyState title="No traces" description={model || runId ? "Nothing matches these filters." : "Traces appear once an agent starts a session in the Arena."} />}
    </>
  );
}
