"use client";
// Penny's reply to one request, as a short conversation: what you asked, then her answer (buy / ask you / walk away),
// the listing she'd buy with its trust score, what she skipped and why, and how her council of experts voted.
// Everything shown comes straight from the Proposal; nothing here is ever ordered or charged.
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Check, ChevronDown, CircleHelp, X } from "lucide-react";
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

// The listing she'd buy, with its trust score as a quiet footer row (thresholds: ask at 50, buy at 75).
function Pick({ p }: { p: Proposal }) {
  const w = p.wouldBuy;
  if (!w) return null;
  const href = w.url ?? (w.productId ? `/arena/p/${encodeURIComponent(w.productId)}` : undefined);
  const s = p.trust?.score;
  const color = s == null ? "" : s >= 75 ? "var(--color-pass)" : s >= 50 ? "var(--color-amber)" : "var(--color-coral)";
  const meta = [w.brand, w.merchant, w.condition && w.condition !== "new" ? w.condition : "", w.quantity > 1 ? `${w.quantity} × ${money(w.unitPrice)}` : "", w.shipping ? `${money(w.shipping)} shipping` : ""].filter(Boolean);
  const top = (
    <>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink">{w.title}</span>
        <span className="mt-1 block text-[13px] text-ink-4">{meta.join(" · ")}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[17px] font-[600] tracking-[-0.02em] tabular-nums text-ink">{money(w.total)}</span>
        {p.spec.budget != null && <span className="text-[12px] tabular-nums text-ink-4">of {money(p.spec.budget)}</span>}
      </span>
    </>
  );
  const row = "flex items-start gap-4 p-4";
  return (
    <div className="mt-5 overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_oklch(20%_0.012_70/0.08)]">
      {href ? (
        <a href={href} target={w.url ? "_blank" : undefined} rel={w.url ? "noopener noreferrer" : undefined}
          className={cx(row, "transition-colors hover:bg-[oklch(98.6%_0.004_85)]")}>{top}</a>
      ) : <div className={row}>{top}</div>}
      {s != null && (
        <div className="flex items-center gap-3 border-t border-divider px-4 py-3 text-[12.5px]">
          <span className="text-ink-3">Trust</span>
          <div className="relative h-1 flex-1 rounded-full bg-ink/[0.07]" role="img" aria-label={`Trust ${s} out of 100. Penny buys at 75 and asks you between 50 and 75.`}>
            <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${s}%` }} transition={{ duration: 1, ease: EASE, delay: 0.2 }} />
            <span aria-hidden className="absolute -inset-y-[3px] left-1/2 w-px bg-ink/20" />
            <span aria-hidden className="absolute -inset-y-[3px] left-3/4 w-px bg-ink/20" />
          </div>
          <span className="tabular-nums"><span className="font-medium text-ink">{s}</span><span className="text-ink-4">/100</span></span>
        </div>
      )}
    </div>
  );
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

export default function Answer({ p, onReset, showRequest = true }: { p: Proposal; onReset?: () => void; showRequest?: boolean }) {
  const h = HEADLINE[p.decision];
  const skipped = p.offers.filter((o) => o.flags.some((f) => f.severity !== "info") && o.id !== p.wouldBuy?.offerId);
  const flagged = new Map<string, number>();
  for (const o of skipped) for (const f of o.flags) if (f.severity !== "info") flagged.set(f.code, (flagged.get(f.code) ?? 0) + 1);
  const Icon = h.icon;

  return (
    <div className="grid gap-8">
      {/* you */}
      {showRequest && <motion.div className="flex justify-end" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
        <div className="max-w-[80%] rounded-[20px] bg-[oklch(95.5%_0.006_85)] px-4 py-2.5 text-[15px] leading-snug text-ink">
          {p.request}
          {p.spec.budget != null && !/\$\s?\d/.test(p.request) && <span className="text-ink-4"> · under {money(p.spec.budget)}</span>}
        </div>
      </motion.div>}

      {/* Penny */}
      <motion.div className="flex items-start gap-3" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15, ease: EASE }}>
        <PennyAvatar size={28} />
        <div className="min-w-0 flex-1 pt-[3px]">
          <p className="text-[12.5px] text-ink-4">
            {p.offers.length} listing{p.offers.length === 1 ? "" : "s"} checked in {(p.latencyMs / 1000).toFixed(0)}s
          </p>
          <h3 className="mt-1.5 flex items-center gap-2 text-[20px] font-[600] tracking-[-0.03em] text-ink">
            <span className={cx("grid size-5 shrink-0 place-items-center rounded-full", h.tone)}><Icon size={12} strokeWidth={2.6} aria-hidden /></span>
            {h.text}
          </h3>
          {p.questions.length > 0 && (
            <div className="mt-2 grid gap-1.5 text-[15px] leading-relaxed text-ink-2">
              {p.questions.map((q) => <p key={q}>{q}</p>)}
            </div>
          )}

          <Pick p={p} />

          <div className="mt-6 border-b border-divider">
            {p.trust && p.trust.explain.length > 0 && (
              <Disclosure title={`Why trust ${p.trust.score}`}>
                <ul className="grid gap-1.5 text-[13px] leading-relaxed text-ink-3">
                  {p.trust.explain.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </Disclosure>
            )}
            {skipped.length > 0 && (
              <Disclosure title={<span>Skipped {skipped.length} risky listing{skipped.length === 1 ? "" : "s"}
                <span className="ml-2 font-normal text-ink-4">{[...flagged.keys()].slice(0, 3).map(flagLabel).join(" · ")}</span></span>}>
                <ul className="grid gap-2">
                  {skipped.slice(0, 8).map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] sm:flex-nowrap">
                      <span className="block w-full min-w-0 truncate text-ink-2 sm:w-auto sm:flex-1">{o.title}<span className="text-ink-4"> · {o.merchant}</span></span>
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
                      <div className="flex gap-3"><span className="block min-w-0 flex-1 truncate text-ink-2">{a.title}<span className="text-ink-4"> · {a.merchant}</span></span><span className="tabular-nums text-ink-3">{money(a.unitPrice)}</span></div>
                      <p className="mt-0.5 text-ink-4">{a.whyNot}</p>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
            {p.council.votes.length > 0 && (
              <Disclosure title={`Expert reviews (${Math.round(p.council.agreement * 100)}% agreement)`}>
                {p.council.chair.length > 0 && <p className="mb-3 text-[13px] leading-relaxed text-ink-2">{p.council.chair.join(" ")}</p>}
                <ul className="grid gap-3">
                  {p.council.votes.map((v) => (
                    <li key={v.expert} className="text-[13px]">
                      <div className="flex items-center gap-2"><span className="font-medium text-ink">{EXPERT[v.expert] ?? v.expert}</span><span className="font-mono text-[11px] text-ink-4">{v.model}</span></div>
                      <p className="mt-0.5 leading-relaxed text-ink-3">{v.rationale}</p>
                    </li>
                  ))}
                  {p.council.preMortem && p.council.preMortem.severity !== "none" && (
                    <li className="rounded-[12px] bg-canvas-sunk/70 p-3 text-[13px]">
                      <span className="font-medium text-ink">Final check</span><span className="text-ink-4"> · {p.council.preMortem.severity}{p.council.preMortem.outcome === "switched" ? " · changed the pick" : ""}</span>
                      <p className="mt-0.5 leading-relaxed text-ink-3">{p.council.preMortem.objection}</p>
                    </li>
                  )}
                </ul>
              </Disclosure>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 text-[12.5px] text-ink-4">
            <span className="flex items-center gap-4">
              <Link href={`/api/procure/${encodeURIComponent(p.id)}`} target="_blank" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink">
                Full record <ArrowUpRight size={12} aria-hidden />
              </Link>
              {onReset && <button type="button" onClick={onReset} className="font-medium text-ink-2 hover:text-ink">Ask something else</button>}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
