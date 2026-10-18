"use client";
// Penny's reply to one request, as a short conversation: what you asked, then her answer (buy / ask you / walk away),
// the listing she'd buy with its trust score, what she skipped and why, and how her council of experts voted.
// Everything shown comes straight from the Proposal; nothing here is ever ordered or charged.
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Check, ChevronDown, CircleHelp, ShieldCheck, X } from "lucide-react";
import { cx, EASE } from "@/design";
import type { Proposal } from "@/lib/procure/types";

const money = (n: number) => `$${n.toFixed(2)}`;

const FLAG: Record<string, string> = {
  KNOCKOFF: "Knockoff", FAKE_DISCOUNT: "Fake discount", PROMPT_INJECTION: "Hidden instructions", NEW_MERCHANT: "Brand-new seller",
  PRICE_ABOVE_MARKET: "Overpriced", OVER_BUDGET: "Over budget", MISMATCH: "Not what you asked for", TOO_GOOD_TO_BE_TRUE: "Too good to be true",
  WRONG_QTY: "Wrong quantity",
};
const flagLabel = (code: string) => FLAG[code] ?? code.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const EXPERT: Record<string, string> = { spec: "Spec checker", fraud: "Fraud spotter", value: "Value hunter", advocate: "Your advocate" };

const HEADLINE = {
  buy: { text: "I’d buy this one.", tone: "bg-pass-soft text-pass-ink", icon: Check },
  ask_user: { text: "I need you to check something first.", tone: "bg-amber-soft text-amber-ink", icon: CircleHelp },
  decline: { text: "I’d walk away from this one.", tone: "bg-coral-soft text-coral-ink", icon: X },
} as const;

export function PennyAvatar({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,oklch(97%_0.04_90),oklch(90%_0.09_86))] shadow-[inset_0_0_0_1px_oklch(78%_0.125_84/0.5)]", className)}
      style={{ width: size, height: size }}>
      <Image src="/hero/coin.png" alt="" width={96} height={96} className="h-auto w-[78%]" />
    </span>
  );
}

function Trust({ p }: { p: Proposal }) {
  if (!p.trust) return null;
  const s = p.trust.score;
  const color = s >= 75 ? "var(--color-pass)" : s >= 50 ? "var(--color-amber)" : "var(--color-coral)";
  return (
    <div className="mt-4 rounded-[18px] bg-canvas-sunk/60 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink-2">Trust score</span>
        <span className="tabular-nums"><span className="text-[22px] font-[600] tracking-[-0.03em] text-ink">{s}</span><span className="text-[13px] text-ink-4">/100 · {p.trust.grade}</span></span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-ink-5/60" role="img" aria-label={`Trust ${s} out of 100. Penny buys at 75 and asks you between 50 and 75.`}>
        <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${s}%` }} transition={{ duration: 1, ease: EASE, delay: 0.2 }} />
        <span aria-hidden className="absolute -top-1 h-3.5 w-px bg-ink-3" style={{ left: "50%" }} />
        <span aria-hidden className="absolute -top-1 h-3.5 w-px bg-ink-3" style={{ left: "75%" }} />
      </div>
      <div aria-hidden className="relative mt-1 h-4 text-[11px] text-ink-4">
        <span className="absolute -translate-x-1/2" style={{ left: "50%" }}>ask</span>
        <span className="absolute -translate-x-1/2" style={{ left: "75%" }}>buy</span>
      </div>
      {p.trust.explain.length > 0 && (
        <ul className="mt-2 grid gap-1.5 text-[13px] text-ink-3">
          {p.trust.explain.slice(0, 4).map((e) => <li key={e} className="flex gap-2"><span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-4" />{e}</li>)}
        </ul>
      )}
    </div>
  );
}

function Pick({ p }: { p: Proposal }) {
  const w = p.wouldBuy;
  if (!w) return null;
  const href = w.url ?? (w.productId ? `/arena/p/${encodeURIComponent(w.productId)}` : undefined);
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium uppercase tracking-[0.1em] text-ink-4">{w.brand}</span>
        <span className="mt-0.5 line-clamp-2 block text-[15px] font-medium leading-snug text-ink">{w.title}</span>
        <span className="mt-1 block text-[13px] text-ink-3">
          {w.merchant}{w.condition && w.condition !== "new" ? ` · ${w.condition}` : ""}{w.quantity > 1 ? ` · ${w.quantity} × ${money(w.unitPrice)}` : ""}{w.shipping ? ` · ${money(w.shipping)} shipping` : ""}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-[20px] font-[600] tracking-[-0.03em] tabular-nums text-ink">{money(w.total)}</span>
        {p.spec.budget != null && <span className="text-[12px] tabular-nums text-ink-4">budget {money(p.spec.budget)}</span>}
      </span>
    </>
  );
  return href ? (
    <a href={href} target={w.url ? "_blank" : undefined} rel={w.url ? "noopener noreferrer" : undefined}
      className="group mt-4 flex items-start gap-4 rounded-[18px] bg-white p-4 shadow-[0_0_0_1px_oklch(20%_0.012_70/0.07)] transition-shadow hover:shadow-[0_0_0_1px_oklch(20%_0.012_70/0.14),0_10px_24px_-14px_oklch(20%_0.012_70/0.3)]">
      {body}
    </a>
  ) : <div className="mt-4 flex items-start gap-4 rounded-[18px] bg-white p-4 shadow-[0_0_0_1px_oklch(20%_0.012_70/0.07)]">{body}</div>;
}

function Disclosure({ title, children, open: init = false }: { title: React.ReactNode; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(init);
  return (
    <div className="border-t border-divider">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-3.5 text-left text-[14px] font-medium text-ink-2 transition-colors hover:text-ink">
        {title}
        <ChevronDown size={16} aria-hidden className={cx("shrink-0 text-ink-4 transition-transform duration-300", open && "rotate-180")} />
      </button>
      <div className={cx("grid transition-[grid-template-rows] duration-400 ease-[cubic-bezier(0.2,0.75,0.15,1)]", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden"><div className="pb-4">{children}</div></div>
      </div>
    </div>
  );
}

export default function Answer({ p, onReset }: { p: Proposal; onReset: () => void }) {
  const h = HEADLINE[p.decision];
  const skipped = p.offers.filter((o) => o.flags.some((f) => f.severity !== "info") && o.id !== p.wouldBuy?.offerId);
  const flagged = new Map<string, number>();
  for (const o of skipped) for (const f of o.flags) if (f.severity !== "info") flagged.set(f.code, (flagged.get(f.code) ?? 0) + 1);
  const Icon = h.icon;

  return (
    <div className="grid gap-4">
      {/* you */}
      <motion.div className="flex justify-end" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
        <div className="max-w-[80%] rounded-[22px] rounded-br-[8px] bg-ink px-4 py-3 text-[15px] leading-snug text-white">
          {p.request}
          {p.spec.budget != null && !/\$\s?\d/.test(p.request) && <span className="text-white/60"> · under {money(p.spec.budget)}</span>}
        </div>
      </motion.div>

      {/* Penny */}
      <motion.div className="flex items-start gap-3" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15, ease: EASE }}>
        <PennyAvatar size={36} className="mt-1" />
        <div className="min-w-0 flex-1 rounded-[26px] rounded-tl-[8px] bg-[oklch(99.4%_0.003_90)] p-5 shadow-[0_0_0_1px_oklch(20%_0.012_70/0.05),0_30px_60px_-36px_oklch(25%_0.03_70/0.4)] sm:p-6">
          <div className="flex items-center gap-2 text-[13px] text-ink-3">
            <span className="font-medium text-ink">Penny</span>
            <span>·</span>
            <span>looked at {p.offers.length} listing{p.offers.length === 1 ? "" : "s"} in {(p.latencyMs / 1000).toFixed(0)}s</span>
          </div>
          <p className="mt-3 flex items-center gap-2.5">
            <span className={cx("grid size-7 place-items-center rounded-full", h.tone)}><Icon size={15} strokeWidth={2.4} aria-hidden /></span>
            <span className="text-[21px] font-[600] tracking-[-0.03em] text-ink sm:text-[24px]">{h.text}</span>
          </p>
          {p.council.chair.length > 0 && <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">{p.council.chair.join(" ")}</p>}

          {p.questions.length > 0 && (
            <ul className="mt-4 grid gap-2">
              {p.questions.map((q) => (
                <li key={q} className="flex items-start gap-2.5 rounded-[14px] bg-amber-soft px-3.5 py-2.5 text-[14px] text-ink">
                  <CircleHelp size={16} className="mt-0.5 shrink-0 text-amber-ink" aria-hidden />{q}
                </li>
              ))}
            </ul>
          )}

          <Pick p={p} />
          <Trust p={p} />

          <div className="mt-5">
            {skipped.length > 0 && (
              <Disclosure open title={<span>Skipped {skipped.length} risky listing{skipped.length === 1 ? "" : "s"}
                <span className="ml-2 font-normal text-ink-4">{[...flagged.keys()].slice(0, 3).map(flagLabel).join(" · ")}</span></span>}>
                <ul className="grid gap-2">
                  {skipped.slice(0, 8).map((o) => (
                    <li key={o.id} className="flex items-center gap-3 text-[13px]">
                      <span className="min-w-0 flex-1 truncate text-ink-2">{o.title}<span className="text-ink-4"> · {o.merchant}</span></span>
                      <span className="shrink-0 tabular-nums text-ink-3">{money(o.unitPrice)}</span>
                      <span className="flex shrink-0 gap-1">
                        {o.flags.filter((f) => f.severity !== "info").slice(0, 2).map((f) => (
                          <span key={f.code} title={f.message} className="rounded-full bg-coral-soft px-2 py-0.5 text-[11px] font-medium text-coral-ink">{flagLabel(f.code)}</span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
            {p.alternatives.length > 0 && (
              <Disclosure title={`Other good options (${p.alternatives.length})`}>
                <ul className="grid gap-2.5">
                  {p.alternatives.slice(0, 4).map((a) => (
                    <li key={a.offerId} className="text-[13px]">
                      <div className="flex gap-3"><span className="min-w-0 flex-1 truncate text-ink-2">{a.title}<span className="text-ink-4"> · {a.merchant}</span></span><span className="tabular-nums text-ink-3">{money(a.unitPrice)}</span></div>
                      <p className="mt-0.5 text-ink-4">{a.whyNot}</p>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
            {p.council.votes.length > 0 && (
              <Disclosure title={`How the council voted (${Math.round(p.council.agreement * 100)}% agreement)`}>
                <ul className="grid gap-3">
                  {p.council.votes.map((v) => (
                    <li key={v.expert} className="text-[13px]">
                      <div className="flex items-center gap-2"><span className="font-medium text-ink">{EXPERT[v.expert] ?? v.expert}</span><span className="font-mono text-[11px] text-ink-4">{v.model}</span></div>
                      <p className="mt-0.5 leading-relaxed text-ink-3">{v.rationale}</p>
                    </li>
                  ))}
                  {p.council.preMortem && p.council.preMortem.severity !== "none" && (
                    <li className="rounded-[12px] bg-canvas-sunk/70 p-3 text-[13px]">
                      <span className="font-medium text-ink">Pre-mortem</span><span className="text-ink-4"> · {p.council.preMortem.severity}{p.council.preMortem.outcome === "switched" ? " · changed the pick" : ""}</span>
                      <p className="mt-0.5 leading-relaxed text-ink-3">{p.council.preMortem.objection}</p>
                    </li>
                  )}
                </ul>
              </Disclosure>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4 text-[12.5px] text-ink-4">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-sage-ink" aria-hidden />Nothing was ordered or charged.</span>
            <span className="flex items-center gap-4">
              <Link href={`/api/procure/${encodeURIComponent(p.id)}`} target="_blank" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink">
                Full record <ArrowUpRight size={12} aria-hidden />
              </Link>
              <button type="button" onClick={onReset} className="font-medium text-ink-2 hover:text-ink">Ask something else</button>
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
