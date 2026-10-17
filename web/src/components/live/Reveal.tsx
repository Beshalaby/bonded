"use client";
// The verdict: a full-screen moment. One huge word on a burst of colour (sage = passed, coral = risk),
// one sentence of attribution, two quiet links. Esc / × goes back to the store.
import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, RotateCcw, X } from "lucide-react";
import type { BenchResult, GuardianVerdict } from "@/lib/types";
import { cx, outcomeOf, type Outcome } from "@/components/ui";
import { FAULT_LABEL, failureLabel, traceHref, trapLabel, usd } from "@/lib/ui/format";

const LOOK: Record<Outcome, { word: string; tone: "sage" | "coral" | "gold"; sub: string }> = {
  success: { word: "Passed.", tone: "sage", sub: "It bought the right item, within budget, and fell for nothing." },
  scammed: { word: "Scammed.", tone: "coral", sub: "It bought a trap listing, or obeyed instructions planted in one." },
  over_budget: { word: "Over budget.", tone: "coral", sub: "It spent more than the hard limit." },
  wrong_item: { word: "Wrong item.", tone: "coral", sub: "It bought the wrong product, variant or quantity." },
  failed: { word: "Failed.", tone: "coral", sub: "The purchase did not satisfy the request." },
  no_purchase: { word: "No purchase.", tone: "gold", sub: "It stopped without checking out." },
  error: { word: "Error.", tone: "gold", sub: "The agent crashed before finishing." },
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
  const a = result.attribution;
  const caught = result.guardrailDecision && result.guardrailDecision !== "approve";
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; prev?.focus?.({ preventScroll: true }); };
  }, []);

  const sentence = a ? <Cites text={a.explanation} onSeq={onSeq} />
    : o === "success"
      ? <>{agentName} bought the right item{result.amount != null ? ` for ${usd(result.amount)}` : ""}{dodged.length ? `, and walked past ${dodged.length === 1 ? "a trap" : `${dodged.length} traps`}: ${dodged.map((t) => trapLabel(t.type).toLowerCase()).join(", ")}.` : ", and fell for nothing."}</>
      : L.sub;

  const facts = [
    result.bought === false ? "Nothing bought" : `Spent ${usd(result.amount ?? 0)}${budget != null ? ` of ${usd(budget, 0)}` : ""}`,
    `${result.steps} steps`,
    verdict?.decision ? `guardrail ${o === "success" ? (caught ? "raised a false alarm" : "approved") : result.bought === false ? "not run" : caught ? "caught it" : "missed it"}` : null,
    chain.valid ? `trace verified · ${chain.length} blocks` : "trace broken",
  ].filter(Boolean).join(" · ");
  const label = a ? `${failureLabel(a.mode)} · ${FAULT_LABEL[a.fault] ?? a.fault}` : (result.trapTypes ?? []).map((t) => trapLabel(t)).join(" · ");

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="lv-verdict" tabIndex={-1}
      className="outline-none lv-fade-in fixed inset-0 z-[70] isolate flex flex-col items-center justify-center overflow-y-auto overflow-x-clip bg-canvas/[0.94] px-5 py-20 text-center backdrop-blur-md">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className={cx("burst lv-bloom", `burst-${L.tone}`)} style={{ ["--bx" as string]: "50%", ["--by" as string]: "46%", ["--bs" as string]: "min(1250px, 150vw)" }} />
        <div className="burst burst-gold lv-bloom" style={{ ["--bx" as string]: "66%", ["--by" as string]: "64%", ["--bs" as string]: "min(560px, 90vw)", ["--bo" as string]: 0.65 }} />
      </div>

      <button type="button" onClick={onClose} aria-label="Back to the store"
        className="absolute right-4 top-4 inline-flex size-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface/70 hover:text-ink sm:right-6 sm:top-6">
        <X size={18} aria-hidden />
      </button>

      <p className="lv-fade-up text-[15px] text-ink-3" style={{ animationDelay: "60ms" }}>
        {agentName}{taskId ? <> on <span className="font-mono text-[13.5px]">{taskId}</span></> : null}
      </p>
      <h2 id="lv-verdict" className="lv-word pnum mt-3 font-[600] text-ink numeral [font-size:clamp(76px,15vw,232px)]">{L.word}</h2>

      <div className="lv-fade-up mt-8 sm:mt-10" style={{ animationDelay: "520ms" }}>
        {label && <p className={cx("mb-3 text-[12px] font-medium uppercase tracking-[0.14em]", L.tone === "sage" ? "text-sage-ink" : L.tone === "coral" ? "text-coral-ink" : "text-accent")}>{label}</p>}
        <p className="mx-auto max-w-[38ch] text-[19px] leading-[1.4] tracking-[-0.015em] text-ink-2 sm:text-[23px]">{sentence}</p>
        <p className="mx-auto mt-5 max-w-[60ch] text-[13px] text-ink-4">{facts}</p>
      </div>

      <div className="lv-fade-up mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3" style={{ animationDelay: "700ms" }}>
        <Link href={traceHref(sessionId)} className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-ink transition-colors hover:text-accent">
          See every step <ArrowRight size={15} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
        <button type="button" onClick={onAgain} className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ink-3 transition-colors hover:text-ink">
          <RotateCcw size={14} aria-hidden /> {againLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Make "(#634)" citations in the judge's explanation clickable: each one jumps to that step. */
function Cites({ text, onSeq }: { text: string; onSeq: (s: number) => void }) {
  const parts = text.split(/(#\d+)/g);
  return (
    <>
      {parts.map((s, i) => /^#\d+$/.test(s)
        ? <button key={i} type="button" onClick={() => onSeq(Number(s.slice(1)))} title="Show this step"
            className="rounded-[6px] px-0.5 font-mono text-[0.8em] text-accent underline decoration-gold/60 underline-offset-4 transition-colors hover:text-ink">{s}</button>
        : <span key={i}>{s}</span>)}
    </>
  );
}
