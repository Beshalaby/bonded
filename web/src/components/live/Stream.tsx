"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import type { GuardianVerdict, LogEntry } from "@/lib/types";
import { cx } from "@/components/ui";
import { usd } from "@/lib/ui/format";
import { useScramble, useTypewriter } from "./hooks";
import { obj, str, type ReasoningKind } from "./model";

/* ------------------------------------------------------------------ budget meter */

export function BudgetMeter({ spent, budget, settled }: { spent: number; budget?: number; settled: boolean }) {
  if (budget == null) return null;
  const ratio = budget > 0 ? spent / budget : 0;
  const over = spent > budget + 1e-9;
  const near = !over && ratio >= 0.95;
  const max = over ? spent : budget;
  const tone = over ? "bg-rose-500" : near ? "bg-amber-500" : "bg-accent";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-zinc-500">{settled ? "Spent" : "In cart"}</span>
        <span className="tnum">
          <span className={cx("font-mono text-[13px] font-semibold transition-colors duration-300", over ? "text-rose-700" : near ? "text-amber-700" : "text-zinc-900")}>{usd(spent)}</span>
          <span className="text-zinc-400"> / {usd(budget)}</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className={cx("absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out", tone)} style={{ width: `${Math.min(100, (spent / (max || 1)) * 100)}%` }} />
        {over && <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${(budget / spent) * 100}%` }} />}
      </div>
      <div className={cx("mt-1 h-4 text-[11px] tnum transition-colors", over ? "text-rose-700" : near ? "text-amber-700" : "text-zinc-400")}>
        {over ? `${usd(spent - budget)} over budget` : spent > 0 ? `${usd(budget - spent)} left` : "Nothing in the cart yet"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ chain strip */

export function ChainStrip({ entries }: { entries: LogEntry[] }) {
  const head = entries[entries.length - 1];
  const h = useScramble(head?.hash.slice(0, 12) ?? "", !!head, 600);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="flex items-center gap-1.5 text-zinc-500"><Link2 size={12} /> Hash chain <span className="tnum text-zinc-400">· {entries.length} block{entries.length === 1 ? "" : "s"}</span></span>
        <span className="font-mono text-[11.5px] text-zinc-400">head <span className="text-zinc-800">{head ? h : "GENESIS"}</span></span>
      </div>
      <div className="mt-1.5 flex h-3 items-center gap-[3px] overflow-hidden">
        {entries.slice(-56).map((e, i, arr) => (
          <span key={e.seq} title={`#${e.seq} ${e.action} ${e.hash.slice(0, 12)}`}
            className={cx("lv-block-in h-2.5 w-1.5 shrink-0 rounded-[2px]",
              e.action === "reasoning" ? "bg-zinc-300" : e.actor === "guardrail" ? "bg-amber-400" : e.actor === "system" ? "bg-zinc-500" : "bg-accent",
              i === arr.length - 1 && "lv-pulse-ring")} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ stream */

export function StreamList({ entries, speed, live, evidence, focusSeq, onSeq, empty }: {
  entries: LogEntry[]; speed: number; live: boolean; evidence: Set<number>; focusSeq?: number; onSeq?: (s: number) => void; empty: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const n = entries.length;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => { stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  });
  useEffect(() => {
    if (focusSeq == null) return;
    const el = ref.current?.querySelector(`[data-seq="${focusSeq}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusSeq]);

  return (
    <div ref={ref} className="lv-scroll relative min-h-0 flex-1 overflow-y-auto px-3 py-2">
      {n === 0 ? empty : (
        <ol>
          {entries.map((e, i) => (
            <StreamItem key={e.seq} e={e} newest={i === n - 1} prev={entries[i - 1]} speed={speed} live={live}
              cited={evidence.has(e.seq)} focused={focusSeq === e.seq} onSeq={onSeq} last={i === n - 1} />
          ))}
        </ol>
      )}
    </div>
  );
}

function StreamItem({ e, newest, speed, cited, focused, onSeq, last }: {
  e: LogEntry; newest: boolean; prev?: LogEntry; speed: number; live: boolean; cited: boolean; focused: boolean; onSeq?: (s: number) => void; last: boolean;
}) {
  const hash = useScramble(e.hash.slice(0, 8), newest, 480 / speed);
  const isThought = e.action === "reasoning";
  const tone = toneOf(e);
  return (
    <li data-seq={e.seq} className={cx("lv-fade-up group relative grid grid-cols-[14px_1fr] gap-x-2.5")}>
      {/* chain rail */}
      <div className="relative flex justify-center">
        {!last && <span className="absolute bottom-[-2px] top-[14px] w-px bg-zinc-200" />}
        <span className={cx("relative z-10 mt-[7px] size-[7px] rounded-[2px] transition-colors",
          tone === "bad" ? "bg-rose-500" : tone === "warn" ? "bg-amber-500" : tone === "good" ? "bg-emerald-500" : isThought ? "bg-zinc-300" : e.actor === "system" ? "bg-zinc-500" : "bg-accent",
          newest && "lv-pulse-ring")} />
      </div>
      <div className={cx("mb-1 min-w-0 rounded-md px-2 py-1 transition-colors duration-300",
        cited && "bg-amber-50/80 ring-1 ring-amber-200", focused && "ring-2 ring-accent/40")}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {isThought ? <Thought e={e} typing={newest} speed={speed} /> : <ToolLine e={e} />}
          </div>
          <button type="button" onClick={() => onSeq?.(e.seq)} title={`#${e.seq} · ${e.actor}\nprev ${e.prevHash}\nhash ${e.hash}`}
            className="mt-[1px] shrink-0 font-mono text-[10.5px] leading-5 text-zinc-400 tnum hover:text-zinc-700">
            <span className="text-zinc-400">#{e.seq}</span> <span className={cx(newest ? "text-accent" : "text-zinc-400")}>{hash}</span>
          </button>
        </div>
      </div>
    </li>
  );
}

function toneOf(e: LogEntry): "bad" | "warn" | "good" | undefined {
  const p = obj(e.payload);
  if (e.action === "guardrail_verdict") return p.decision === "block" ? "bad" : p.decision === "ask" ? "warn" : "good";
  if (e.action === "checkout_result") return str(p.status) === "completed" ? "good" : "bad";
  return undefined;
}

const KIND_LABEL: Record<ReasoningKind, string> = { plan: "Plan", thought: "Thinking", decision: "Decision" };

function Thought({ e, typing, speed }: { e: LogEntry; typing: boolean; speed: number }) {
  const p = obj(e.payload);
  const kind = (str(p.kind) || "thought") as ReasoningKind;
  const text = str(p.text);
  const shown = useTypewriter(text, typing, 13 / speed);
  const done = shown.length >= text.length;
  return (
    <div>
      <div className={cx("text-[10.5px] font-medium uppercase tracking-[0.06em]", kind === "decision" ? "text-accent" : "text-zinc-400")}>{KIND_LABEL[kind] ?? kind}</div>
      <p className={cx("text-[13px] leading-[1.5]", kind === "decision" ? "font-medium text-zinc-900" : "text-zinc-700")}>
        <Rich text={shown} />
        {!done && <span className="lv-caret ml-px inline-block h-3.5 w-[1.5px] translate-y-[2px] bg-zinc-800" />}
      </p>
    </div>
  );
}

/** Light emphasis inside agent thoughts: listing ids mono, rejections rose, passes emerald, money tabular. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\bp_[A-Za-z0-9_]+\b|\bRejecting\b|\bpasses\b|\$[\d,]+(?:\.\d{2})?|“[^”]*”?)/g);
  return (
    <>
      {parts.map((s, i) => {
        if (!s) return null;
        if (/^p_/.test(s)) return <span key={i} className="rounded bg-zinc-100 px-[3px] font-mono text-[11.5px] text-zinc-800">{s}</span>;
        if (s === "Rejecting") return <span key={i} className="font-medium text-rose-700">{s}</span>;
        if (s === "passes") return <span key={i} className="font-medium text-emerald-700">{s}</span>;
        if (s.startsWith("$")) return <span key={i} className="tnum">{s}</span>;
        if (s.startsWith("“")) return <span key={i} className="text-zinc-900">{s}</span>;
        return <span key={i}>{s}</span>;
      })}
    </>
  );
}

function ToolLine({ e }: { e: LogEntry }) {
  const p = obj(e.payload);
  const M = ({ children, c = "text-zinc-900" }: { children: ReactNode; c?: string }) => <span className={c}>{children}</span>;
  const arrow = <span className="text-zinc-400"> → </span>;
  const arg = (s: string) => <span className="text-emerald-700">&quot;{s}&quot;</span>;
  let body: ReactNode;
  switch (e.action) {
    case "session_start": {
      const t = obj(p.task);
      body = <><M>session.start</M><span className="text-zinc-500">(budget {usd(Number(t.budget))}, guardrail {str(p.guardrail) || "observe"})</span></>;
      break;
    }
    case "search":
      body = <><M>search</M>({arg(str(p.query))}){arrow}<span className="text-zinc-600">{Number(p.count ?? 0)} results</span></>;
      break;
    case "view":
      body = <><M>view_product</M>({arg(str(p.productId))}){arrow}<span className="text-zinc-600">{usd(Number(p.price))}</span></>;
      break;
    case "add_to_cart":
      body = <><M>add_to_cart</M>({arg(str(p.productId))}, <span className={Number(p.qty) > 1 ? "font-semibold text-rose-700" : "text-blue-700"}>{Number(p.qty ?? 1)}</span>){arrow}<span className="text-zinc-600">cart {usd(Number(p.cartTotal))}</span></>;
      break;
    case "remove_from_cart":
      body = <><M>remove_from_cart</M>({arg(str(p.productId))}){arrow}<span className="text-zinc-600">cart {usd(Number(p.cartTotal))}</span></>;
      break;
    case "checkout_requested":
      body = <><M>checkout</M>(){arrow}<span className="text-zinc-600">{usd(Number(p.total))}</span></>;
      break;
    case "guardrail_verdict": {
      const v = e.payload as GuardianVerdict;
      const d = v?.decision;
      body = <><M>guardrail</M>{arrow}<span className={cx("font-semibold", d === "block" ? "text-rose-700" : d === "ask" ? "text-amber-700" : "text-emerald-700")}>{String(d).toUpperCase()}</span>
        {(v?.reasons ?? []).length > 0 && <span className="text-zinc-500"> [{v.reasons.map((r) => r.code).join(", ")}]</span>}</>;
      break;
    }
    case "checkout_result":
      body = <><M>order</M>{arrow}<span className={str(p.status) === "completed" ? "text-emerald-700" : "font-semibold text-rose-700"}>{str(p.status)}</span> <span className="text-zinc-600">{p.amount != null ? usd(Number(p.amount)) : ""}</span></>;
      break;
    default:
      body = <><M>{e.action}</M></>;
  }
  return <div className="break-words font-mono text-[11.5px] leading-5 text-zinc-500">{body}</div>;
}
