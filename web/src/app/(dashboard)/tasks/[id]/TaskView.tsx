"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Badge, Breadcrumb, Card, CardTitle, EmptyState, ErrorState, KV, LoadingBlock, OutcomeBadge, PageHeader, Section, Table, Td, Th, Tr, TrapBadge, outcomeOf,
} from "@/components/ui";
import { useApi, type TaskResponse } from "@/lib/ui/api";
import { ago, cost, failureLabel, modelHref, taskHref, traceHref, usd } from "@/lib/ui/format";

export default function TaskView({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<TaskResponse>(`/api/tasks/${encodeURIComponent(id)}`);
  const crumb = <Breadcrumb items={[{ label: "Tasks", href: "/tasks" }, { label: <span className="font-mono text-[12.5px]">{id}</span> }]} />;
  if (error) return <>{crumb}<ErrorState error={error} onRetry={reload} /></>;
  if (loading && !data) return <>{crumb}<LoadingBlock rows={6} /></>;
  if (!data) return null;
  const { task, results } = data;
  const constraints = Object.entries(task.constraints ?? {});
  const expected = task.expected && typeof task.expected === "object"
    ? Object.entries(task.expected as Record<string, unknown>).filter(([k, v]) =>
        v != null && v !== "" && !(typeof v === "object" && Object.keys(v as object).length === 0) &&
        !constraints.some(([ck, cv]) => ck === k && String(cv) === String(v)) && !(k === "maxTotal" && Number(v) === task.budget))
    : [];
  const cap = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase());

  return (
    <>
      {crumb}
      <PageHeader
        title={<span className="font-mono text-[22px]">{task.id}</span>}
        meta={<>
          {task.adversarial ? <Badge tone="warn">Adversarial</Badge> : <Badge>Base task</Badge>}
          {task.baseTaskId && <span>Derived from <Link href={taskHref(task.baseTaskId)} className="font-mono text-accent hover:underline">{task.baseTaskId}</Link></span>}
          <span>{results.length} model{results.length === 1 ? "" : "s"} evaluated</span>
        </>}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <div className="text-[12px] text-zinc-500">Instruction given to the agent</div>
          <p className="mt-2 text-[17px] leading-relaxed text-zinc-900">“{task.instruction}”</p>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {task.tags.map((g) => <span key={g} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[12px] text-zinc-600">{g}</span>)}
          </div>
        </Card>
        <Card>
          <CardTitle>Spec</CardTitle>
          <KV items={[
            ["Budget", <span key="b" className="font-mono">{usd(task.budget)}</span>],
            ...constraints.map(([k, v]) => [cap(k), <span key={k}>{String(v)}</span>] as [string, React.ReactNode]),
            ...expected.map(([k, v]) => [`Expected ${cap(k).toLowerCase()}`, <span key={k} className="break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>] as [string, React.ReactNode]),
          ]} />
        </Card>
      </div>

      <Section title="Latest result per model">
        {results.length ? (
          <Table>
            <thead><tr>
              <Th>Model</Th><Th>Outcome</Th><Th>Failure</Th><Th align="right">Spent</Th><Th align="right">Steps</Th><Th align="right">LLM cost</Th><Th align="right">When</Th><Th />
            </tr></thead>
            <tbody>
              {results.map((r) => (
                <Tr key={r.model + r.runId}>
                  <Td><Link href={modelHref(r.model)} className="font-mono text-[12.5px] text-zinc-800 hover:text-accent">{r.model}</Link></Td>
                  <Td><div className="flex items-center gap-1.5"><OutcomeBadge outcome={outcomeOf(r)} />{(r.trapTypes ?? []).slice(0, 1).map((t) => r.scammed && <TrapBadge key={t} type={t} />)}</div></Td>
                  <Td className="max-w-[320px] truncate text-zinc-600" >{r.attribution ? <span title={r.attribution.explanation}>{failureLabel(r.attribution.mode)}</span> : <span className="text-zinc-300">—</span>}</Td>
                  <Td align="right" mono>{r.amount != null && r.bought !== false ? usd(r.amount) : <span className="text-zinc-300">—</span>}</Td>
                  <Td align="right">{r.steps}</Td>
                  <Td align="right" mono className="text-zinc-600">{cost(r.costUsd)}</Td>
                  <Td align="right" className="whitespace-nowrap text-zinc-500">{ago(r.createdAt)}</Td>
                  <Td align="right">{r.sessionId && <Link href={traceHref(r.sessionId)} className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline">Trace <ArrowRight size={12} /></Link>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="Not evaluated yet" description="No model has attempted this task." />}
      </Section>
    </>
  );
}
