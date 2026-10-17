"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BenchResult } from "@/lib/types";
import { FAULT_LABEL, ago, failureLabel, modelHref, taskHref, traceHref, usd } from "@/lib/ui/format";
import { Badge, OutcomeBadge, TrapBadge, outcomeOf } from "./ui";

export default function FailureList({ results, showModel = false }: { results: BenchResult[]; showModel?: boolean }) {
  return (
    <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
      {results.map((r, i) => {
        const a = r.attribution;
        return (
          <div key={`${r.runId}-${r.taskId}-${r.model}-${i}`} className="grid gap-x-6 gap-y-2 px-4 py-3.5 transition-colors hover:bg-zinc-50/70 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <OutcomeBadge outcome={outcomeOf(r)} />
                {a && <span className="text-[13.5px] font-medium text-zinc-900">{failureLabel(a.mode)}</span>}
                {a && <span className="text-[12px] text-zinc-500">· {FAULT_LABEL[a.fault] ?? a.fault}</span>}
                {(r.trapTypes ?? []).map((t) => <TrapBadge key={t} type={t} />)}
                {r.guardrailCaught && <Badge tone="warn" title="The guardrail flagged this cart before checkout">Guardrail flagged</Badge>}
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">
                {a?.explanation ?? r.error ?? "No attribution recorded."}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
                {showModel && <Link href={modelHref(r.model)} className="font-mono hover:text-accent">{r.model}</Link>}
                <Link href={taskHref(r.taskId)} className="font-mono hover:text-accent">{r.taskId}</Link>
                {r.amount != null && r.bought !== false && <span className="tnum">spent {usd(r.amount)}</span>}
                {a?.evidenceSeqs?.length ? <span className="tnum">cites {a.evidenceSeqs.map((s) => `#${s}`).join(", ")}</span> : null}
                {a && <span>judge: {a.judge}</span>}
                <span>{ago(r.createdAt)}</span>
              </div>
            </div>
            {r.sessionId && (
              <div className="flex items-start">
                <Link href={traceHref(r.sessionId) + (a?.evidenceSeqs?.length ? `#seq-${a.evidenceSeqs[0]}` : "")}
                  className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-accent hover:underline underline-offset-2">
                  View trace <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
