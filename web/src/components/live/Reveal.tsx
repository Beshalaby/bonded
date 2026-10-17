"use client";
import Link from "next/link";
import { CircleCheck, CircleX, Link2, MinusCircle, RotateCcw, ShieldAlert, TriangleAlert, X } from "lucide-react";
import type { BenchResult, GuardianVerdict } from "@/lib/types";
import { Badge, TrapBadge, buttonClass, cx, outcomeOf, type Outcome } from "@/components/ui";
import { FAULT_LABEL, failureLabel, traceHref, trapLabel, usd } from "@/lib/ui/format";

const LOOK: Record<Outcome, { label: string; icon: typeof CircleCheck; ring: string; text: string; sub: string }> = {
  success: { label: "Pass", icon: CircleCheck, ring: "bg-emerald-50 text-emerald-600 ring-emerald-200", text: "text-emerald-800", sub: "Bought the right item within budget, no traps." },
  scammed: { label: "Scammed", icon: ShieldAlert, ring: "bg-rose-50 text-rose-600 ring-rose-200", text: "text-rose-800", sub: "Bought a trap listing or obeyed instructions planted in one." },
  over_budget: { label: "Over budget", icon: CircleX, ring: "bg-rose-50 text-rose-600 ring-rose-200", text: "text-rose-800", sub: "Spent more than the user's hard limit." },
  wrong_item: { label: "Wrong item", icon: TriangleAlert, ring: "bg-amber-50 text-amber-600 ring-amber-200", text: "text-amber-800", sub: "Bought the wrong product, variant or quantity." },
  failed: { label: "Fail", icon: CircleX, ring: "bg-rose-50 text-rose-600 ring-rose-200", text: "text-rose-800", sub: "The purchase did not satisfy the request." },
  no_purchase: { label: "No purchase", icon: MinusCircle, ring: "bg-zinc-100 text-zinc-500 ring-zinc-200", text: "text-zinc-900", sub: "The agent stopped without checking out." },
  error: { label: "Error", icon: MinusCircle, ring: "bg-zinc-100 text-zinc-500 ring-zinc-200", text: "text-zinc-900", sub: "The agent crashed before finishing." },
};

export default function Reveal({
  result, verdict, budget, sessionId, agentName, taskId, chain, onSeq, onClose, onAgain, againLabel, dodged = [],
}: {
  dodged?: { id: string; type: string }[];
  result: BenchResult; verdict?: GuardianVerdict & { mode?: string }; budget?: number; sessionId: string; agentName: string; taskId?: string;
  chain: { valid: boolean; length: number }; onSeq: (s: number) => void; onClose: () => void; onAgain: () => void; againLabel: string;
}) {
  const o = outcomeOf(result);
  const L = LOOK[o];
  const Icon = L.icon;
  const a = result.attribution;
  const caught = result.guardrailDecision && result.guardrailDecision !== "approve";
  return (
    <div className="lv-fade-in absolute inset-0 z-40 flex items-center justify-center bg-white/70 p-6 backdrop-blur-[3px]">
      <div className="lv-pop relative w-full max-w-[560px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_60px_-20px_rgba(24,24,27,0.25)]">
        <button onClick={onClose} title="Hide (keep watching the store)" className="absolute right-3 top-3 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X size={15} /></button>
        <div className="px-6 pt-6">
          <div className="text-[12px] text-zinc-500">{agentName}{taskId ? <> on <span className="font-mono text-[11.5px] text-zinc-700">{taskId}</span></> : null} · graded</div>
          <div className="mt-3 flex items-center gap-3.5">
            <span className={cx("lv-stamp flex size-12 items-center justify-center rounded-full ring-1", L.ring)} style={{ animationDelay: "120ms" }}><Icon size={24} strokeWidth={1.75} /></span>
            <div>
              <div className={cx("lv-fade-up text-[28px] font-semibold leading-none tracking-[-0.025em]", L.text)} style={{ animationDelay: "180ms" }}>{L.label}</div>
              <div className="lv-fade-up mt-1.5 text-[13px] text-zinc-600" style={{ animationDelay: "240ms" }}>{L.sub}</div>
            </div>
          </div>
          {(result.trapTypes?.length || result.overBudget || result.wrongItem) ? (
            <div className="lv-fade-up mt-3 flex flex-wrap gap-1.5" style={{ animationDelay: "300ms" }}>
              {(result.trapTypes ?? []).map((t) => <TrapBadge key={t} type={t} />)}
              {result.overBudget && <Badge tone="bad">Over budget</Badge>}
              {result.wrongItem && <Badge tone="warn">Wrong item</Badge>}
            </div>
          ) : null}
        </div>

        {o === "success" && dodged.length > 0 && (
          <div className="lv-fade-up mx-6 mt-4 rounded-md border border-emerald-200 bg-emerald-50/50 px-3.5 py-3" style={{ animationDelay: "420ms" }}>
            <div className="text-[12.5px] font-semibold text-emerald-900">Inspected and avoided {dodged.length} trap listing{dodged.length === 1 ? "" : "s"}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dodged.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-white px-1.5 py-0.5 text-[11.5px] text-zinc-700">
                  <span className="font-mono text-[11px] text-zinc-500">{t.id}</span>{trapLabel(t.type)}
                </span>
              ))}
            </div>
          </div>
        )}

        {a && (
          <div className="lv-fade-up mx-6 mt-4 rounded-md border border-zinc-200 bg-zinc-50/60 px-3.5 py-3" style={{ animationDelay: "420ms" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold text-zinc-900">Failure attribution</span>
              <Badge tone="bad">{failureLabel(a.mode)}</Badge>
              <Badge tone="outline">{FAULT_LABEL[a.fault] ?? a.fault}</Badge>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-700"><Cites text={a.explanation} onSeq={onSeq} /></p>
            {a.evidenceSeqs.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-zinc-500">
                {a.judge === "llm" ? "LLM judge" : "Heuristic judge"} cites
                {a.evidenceSeqs.map((s) => (
                  <button key={s} onClick={() => onSeq(s)} className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 ring-1 ring-amber-200 hover:text-accent hover:ring-accent">#{s}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="lv-fade-up mx-6 mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 text-[12px]" style={{ animationDelay: "520ms" }}>
          <Cell k="Spent" v={result.bought === false ? "—" : usd(result.amount ?? 0)} sub={budget != null ? `of ${usd(budget, 0)}` : undefined} bad={result.overBudget} />
          <Cell k="Steps" v={String(result.steps)} sub="tool calls" />
          <Cell k="Guardrail" v={verdict?.decision ? ({ approve: "Approve", ask: "Flag", block: "Block" } as const)[verdict.decision] : "—"}
            sub={o === "success" ? (caught ? "false alarm" : "no issues") : result.bought === false ? "not run" : caught ? "caught it" : "missed it"} bad={verdict?.decision === "block"} />
          <Cell k="Trace" v={chain.valid ? "Verified" : "Broken"} sub={`${chain.length} blocks`} good={chain.valid} icon={<Link2 size={11} />} />
        </div>

        <div className="lv-fade-up mt-5 flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-6 py-3" style={{ animationDelay: "600ms" }}>
          <Link href={traceHref(sessionId)} className={buttonClass("secondary")}>Open full trace</Link>
          <button onClick={onAgain} className={buttonClass("primary")}><RotateCcw size={13} /> {againLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Cell({ k, v, sub, bad, good, icon }: { k: string; v: string; sub?: string; bad?: boolean; good?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="bg-white px-3 py-2">
      <div className="text-[11px] text-zinc-500">{k}</div>
      <div className={cx("mt-0.5 flex items-center gap-1 text-[14px] font-semibold tnum", bad ? "text-rose-700" : good ? "text-emerald-700" : "text-zinc-900")}>{icon}{v}</div>
      {sub && <div className="text-[11px] text-zinc-400">{sub}</div>}
    </div>
  );
}

/** Make "(#634)" citations in the judge's explanation clickable. */
function Cites({ text, onSeq }: { text: string; onSeq: (s: number) => void }) {
  const parts = text.split(/(#\d+)/g);
  return (
    <>
      {parts.map((s, i) => /^#\d+$/.test(s)
        ? <button key={i} onClick={() => onSeq(Number(s.slice(1)))} className="rounded bg-amber-50 px-1 font-mono text-[11.5px] text-amber-800 ring-1 ring-amber-200 hover:text-accent hover:ring-accent">{s}</button>
        : <span key={i}>{s}</span>)}
    </>
  );
}
