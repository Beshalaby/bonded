"use client";
import Link from "next/link";
import { CircleCheck, CircleX, Clapperboard, Link2, Link2Off, MinusCircle } from "lucide-react";
import StepTimeline from "@/components/StepTimeline";
import VerifyPanel from "./VerifyPanel";
import { Badge, Breadcrumb, Card, ErrorState, LoadingBlock, TrapBadge, buttonClass, cx, outcomeOf } from "@/components/ui";
import { useApi, type TraceResponse } from "@/lib/ui/api";
import { FAULT_LABEL, cost, dateTime, failureLabel, modelHref, ms, runHref, taskHref, usd } from "@/lib/ui/format";

export default function TraceView({ sessionId }: { sessionId: string }) {
  const { data, error, loading, reload } = useApi<TraceResponse>(`/api/traces/${encodeURIComponent(sessionId)}`);
  const crumb = <Breadcrumb items={[{ label: "Traces", href: "/traces" }, { label: <span className="font-mono text-[12.5px]">{sessionId}</span> }]} />;
  if (error) return <>{crumb}<ErrorState error={error} onRetry={reload} /></>;
  if (loading && !data) return <>{crumb}<LoadingBlock rows={10} /></>;
  if (!data) return null;

  const { session, entries, integrity, result, products } = data;
  const task = session.task;
  const a = result?.attribution;
  const evidence = a?.evidenceSeqs ?? [];
  const outcome = result ? outcomeOf(result) : undefined;
  const runId = result?.runId;
  const taskId = result?.taskId ?? task.taskId;
  const constraints = Object.entries(task.constraints ?? {});

  return (
    <>
      {crumb}

      {/* Task */}
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
          <Link href={modelHref(session.model)} className="tap font-mono text-[12.5px] text-ink-2 hover:text-accent">{session.model}</Link>
          {taskId && <span className="min-w-0 break-anywhere">Task <Link href={taskHref(taskId)} className="tap font-mono text-[12.5px] text-ink-2 hover:text-accent">{taskId}</Link></span>}
          {runId && <span className="min-w-0 break-anywhere">Run <Link href={runHref(runId)} className="tap font-mono text-[12.5px] text-ink-2 hover:text-accent">{runId}</Link></span>}
          <span>{dateTime(session.createdAt)}</span>
        </div>
        <div className="flex items-start justify-between gap-6 max-sm:flex-col max-sm:gap-3">
          <h1 className="max-w-4xl text-[22px] max-sm:text-[19px] font-semibold leading-snug tracking-[-0.015em] text-ink">“{task.instruction}”</h1>
          <Link href={`/live?replay=${encodeURIComponent(session.id)}`} className={cx(buttonClass("secondary"), "mt-0.5 shrink-0")} title="Replay this trace in the live agent theater">
            <Clapperboard size={13} /> Replay
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="rounded-md border border-divider px-2 py-0.5 text-ink-2">Budget <span className="font-mono font-medium text-ink">{usd(task.budget)}</span></span>
          {constraints.map(([k, v]) => (
            <span key={k} className="rounded-md border border-divider px-2 py-0.5 text-ink-2"><span className="capitalize">{k}</span> <span className="font-mono font-medium text-ink">{String(v)}</span></span>
          ))}
        </div>
      </header>

      {/* Outcome + integrity */}
      <div className="mb-8 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_300px]">
        <OutcomeBanner data={data} />
        <Card className={cx("flex flex-col justify-center", !integrity.valid && "border-coral/35 bg-coral-soft/50")}>
          <div className={cx("flex items-center gap-2 text-[13.5px] font-medium", integrity.valid ? "text-pass-ink" : "text-coral-ink")}>
            {integrity.valid ? <Link2 size={15} /> : <Link2Off size={15} />}
            {integrity.valid ? "Hash chain verified" : `Broken at #${integrity.brokenAt ?? "?"}`}
          </div>
          <div className="mt-1 text-[12.5px] text-ink-3 tnum">
            {integrity.valid ? `${integrity.length} entries, each linked to the previous by SHA-256` : integrity.reason ?? "An entry does not match its recorded hash"}
          </div>
        </Card>
      </div>

      {result && (
        <div className="mb-8 flex flex-wrap gap-x-8 gap-y-2 border-y border-divider py-3 text-[13px]">
          <Metric k="Spent" v={result.amount != null && result.bought !== false ? usd(result.amount) : "—"} mono />
          <Metric k="Steps" v={String(result.steps)} />
          <Metric k="Latency" v={ms(result.latencyMs)} />
          <Metric k="LLM cost" v={cost(result.costUsd)} mono />
          <Metric k="Guardrail" v={result.guardrailDecision ? (result.guardrailDecision === "approve" ? "Approved" : result.guardrailDecision === "ask" ? "Flagged" : "Blocked") : "—"} />
          {outcome && outcome !== "success" && result.guardrailCaught != null && <Metric k="Guardrail caught it" v={result.guardrailCaught ? "Yes" : "No"} />}
        </div>
      )}

      <VerifyPanel sessionId={sessionId} />

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Steps</h2>
        <span className="text-[12.5px] text-ink-3">{entries.length} entries{evidence.length ? ` · ${evidence.length} cited by the attribution judge` : ""}</span>
      </div>
      <StepTimeline entries={entries} products={products} evidence={evidence} brokenAt={integrity.valid ? undefined : integrity.brokenAt} budget={task.budget} />
    </>
  );
}

function Metric({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return <div><span className="text-ink-3">{k}</span> <span className={cx("ml-1 font-medium text-ink tnum", mono && "font-mono text-[12.5px]")}>{v}</span></div>;
}

function OutcomeBanner({ data }: { data: TraceResponse }) {
  const r = data.result;
  if (!r) {
    return (
      <Card className="flex items-center gap-3">
        <MinusCircle size={18} className="text-ink-4" />
        <div><div className="text-[14px] font-medium text-ink">Not graded</div><div className="text-[13px] text-ink-3">This session has no benchmark result attached.</div></div>
      </Card>
    );
  }
  const o = outcomeOf(r);
  const a = r.attribution;
  if (o === "success") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-pass/35 bg-pass-soft/60 p-5">
        <CircleCheck size={18} className="mt-0.5 text-pass-ink" />
        <div>
          <div className="text-[14px] font-semibold text-pass-ink">Passed</div>
          <div className="mt-0.5 text-[13px] text-pass-ink/80">
            Bought the right item{r.amount != null ? ` for ${usd(r.amount)}` : ""} within budget, with no trap listings in the cart.
          </div>
        </div>
      </div>
    );
  }
  const neutral = o === "no_purchase" || o === "error";
  return (
    <div className={cx("flex items-start gap-3 rounded-lg border p-5", neutral ? "border-divider bg-ivory" : "border-coral/35 bg-coral-soft/60")}>
      {neutral ? <MinusCircle size={18} className="mt-0.5 text-ink-3" /> : <CircleX size={18} className="mt-0.5 text-coral-ink" />}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx("text-[14px] font-semibold", neutral ? "text-ink" : "text-coral-ink")}>
            {a ? failureLabel(a.mode) : o === "no_purchase" ? "No purchase" : "Failed"}
          </span>
          {a && <Badge tone="outline">{FAULT_LABEL[a.fault] ?? a.fault}</Badge>}
          {(r.trapTypes ?? []).map((t) => <TrapBadge key={t} type={t} />)}
          {r.overBudget && <Badge tone="bad">Over budget</Badge>}
          {r.wrongItem && <Badge tone="warn">Wrong item</Badge>}
        </div>
        <p className={cx("mt-1.5 break-anywhere text-[13.5px] leading-relaxed", neutral ? "text-ink-2" : "text-coral-ink/80")}>
          {a?.explanation ?? r.error ?? "No attribution recorded."}
        </p>
        {a && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            <span>Attributed by the {a.judge === "llm" ? "LLM judge" : "heuristic judge"}{a.evidenceSeqs.length ? ", citing" : ""}</span>
            {a.evidenceSeqs.map((s) => (
              <a key={s} href={`#seq-${s}`} className="tap rounded bg-white px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 ring-1 ring-divider hover:text-accent hover:ring-accent max-lg:px-2">#{s}</a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
