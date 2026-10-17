"use client";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { GuardianVerdict, LogEntry } from "@/lib/types";
import { cx } from "@/components/ui";
import { usd } from "@/lib/ui/format";
import { useScramble, useTypewriter } from "./hooks";
import { obj, str, type ReasoningKind } from "./model";

/* ------------------------------------------------------------------ budget: one thin gold line, coral once exceeded */

export function BudgetMeter({ spent, budget, settled }: { spent: number; budget?: number; settled: boolean }) {
  if (budget == null) return null;
  const over = spent > budget + 1e-9;
  const max = over ? spent : budget;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-ink-3">{settled ? "Spent" : "In cart"}</span>
        <span className="tnum">
          <span className={cx("font-medium transition-colors duration-300", over ? "text-coral-ink" : "text-ink")}>{usd(spent)}</span>
          <span className="text-ink-4"> of {usd(budget, 0)}</span>
        </span>
      </div>
      <div className="relative mt-2 h-[3px] rounded-full bg-ink-5/60">
        <div className={cx("absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out", over ? "bg-coral" : "bg-gold")}
          style={{ width: `${Math.min(100, (spent / (max || 1)) * 100)}%` }} />
        {over && <div className="absolute -inset-y-1 w-[2px] rounded-full bg-ink" style={{ left: `${(budget / spent) * 100}%` }} title="Budget" />}
      </div>
      {over && <div className="lv-fade-in mt-1.5 text-[12.5px] font-medium text-coral-ink tnum">{usd(spent - budget)} over budget</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ chain: one muted line */

export function ChainStrip({ entries }: { entries: LogEntry[] }) {
  const head = entries[entries.length - 1];
  const h = useScramble(head?.hash.slice(0, 10) ?? "", !!head, 600);
  if (!head) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] text-ink-4">
      <span>{entries.length} signed step{entries.length === 1 ? "" : "s"}</span>
      <span className="truncate font-mono text-[11.5px]">hash {h}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ stream: thoughts large and calm, tool calls tiny */

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
    if (el && stick.current && focusSeq == null) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  });
  useEffect(() => {
    if (focusSeq == null) return;
    const el = ref.current?.querySelector(`[data-seq="${focusSeq}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusSeq]);

  // how many thoughts come after each entry: the newest thought is 0 and everything older fades
  const age = useMemo(() => {
    const out = new Array<number>(n);
    let k = 0;
    for (let i = n - 1; i >= 0; i--) { out[i] = k; if (entries[i].action === "reasoning") k++; }
    return out;
  }, [entries, n]);
  const lastThought = useMemo(() => { for (let i = n - 1; i >= 0; i--) if (entries[i].action === "reasoning") return i; return -1; }, [entries, n]);

  return (
    <div ref={ref} className="lv-scroll lv-mask relative min-h-0 flex-1 overflow-y-auto px-1 py-6">
      {n === 0 ? empty : (
        <ol className="grid gap-1">
          {entries.map((e, i) => (
            <StreamItem key={e.seq} e={e} newest={i === n - 1} current={i === lastThought} age={age[i]} speed={speed} live={live}
              cited={evidence.has(e.seq)} focused={focusSeq === e.seq} onSeq={onSeq} />
          ))}
        </ol>
      )}
    </div>
  );
}

function StreamItem({ e, newest, current, age, speed, cited, focused, onSeq }: {
  e: LogEntry; newest: boolean; current: boolean; age: number; speed: number; live: boolean; cited: boolean; focused: boolean; onSeq?: (s: number) => void;
}) {
  const isThought = e.action === "reasoning";
  const fade = cited || focused ? 1 : isThought ? (current ? 1 : Math.max(0.24, 0.55 - age * 0.09)) : Math.max(0.3, 0.75 - age * 0.12);
  return (
    <li data-seq={e.seq} style={{ opacity: fade }}
      className={cx("lv-fade-up group relative -mx-3 rounded-[16px] px-3 transition-[opacity,background-color,box-shadow] duration-700 hover:!opacity-100",
        isThought ? (current ? "py-3" : "py-1.5") : "py-0.5",
        cited && "bg-gold-soft", focused && "shadow-[0_0_0_1.5px_var(--color-gold)]")}>
      {isThought ? <Thought e={e} typing={newest} speed={speed} current={current} /> : <ToolLine e={e} />}
      <button type="button" onClick={() => onSeq?.(e.seq)} title={`#${e.seq} · ${e.actor}\nprev ${e.prevHash}\nhash ${e.hash}`}
        className={cx("absolute right-3 top-1 font-mono text-[10.5px] text-ink-4 transition-opacity tnum hover:text-ink-2",
          cited ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}>
        {cited && <span className="mr-1 font-sans font-medium text-accent">cited</span>}#{e.seq}
      </button>
    </li>
  );
}

const KIND_LABEL: Record<ReasoningKind, string> = { plan: "Plan", thought: "Thinking", decision: "Decision" };

function Thought({ e, typing, speed, current }: { e: LogEntry; typing: boolean; speed: number; current: boolean }) {
  const p = obj(e.payload);
  const kind = (str(p.kind) || "thought") as ReasoningKind;
  const text = str(p.text);
  const shown = useTypewriter(text, typing, 13 / speed);
  const done = shown.length >= text.length;
  return (
    <div>
      {current && <div className={cx("mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em]", kind === "decision" ? "text-accent" : "text-ink-4")}>{KIND_LABEL[kind] ?? kind}</div>}
      <p className={cx("transition-[font-size,line-height,color] duration-500",
        current ? "text-[19px] leading-[1.42] tracking-[-0.018em] text-ink sm:text-[21px]" : "text-[14.5px] leading-[1.5] text-ink-2",
        kind === "decision" && current && "font-[520]")}>
        <Rich text={shown} />
        {!done && <span className="lv-caret ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[2px] bg-gold" />}
      </p>
    </div>
  );
}

/** Light emphasis inside agent thoughts: listing ids mono, rejections coral, passes sage. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\bp_[A-Za-z0-9_]+\b|\bRejecting\b|\bpasses\b|\$[\d,]+(?:\.\d{2})?|“[^”]*”?)/g);
  return (
    <>
      {parts.map((s, i) => {
        if (!s) return null;
        if (/^p_/.test(s)) return <span key={i} className="font-mono text-[0.78em] text-ink-3">{s}</span>;
        if (s === "Rejecting") return <span key={i} className="font-medium text-coral-ink">{s}</span>;
        if (s === "passes") return <span key={i} className="font-medium text-pass-ink">{s}</span>;
        if (s.startsWith("$")) return <span key={i} className="tnum">{s}</span>;
        return <span key={i}>{s}</span>;
      })}
    </>
  );
}

function ToolLine({ e }: { e: LogEntry }) {
  const p = obj(e.payload);
  const arrow = <span className="text-ink-5"> → </span>;
  const arg = (s: string) => <span className="text-ink-3">{s}</span>;
  let body: ReactNode;
  switch (e.action) {
    case "session_start": {
      const t = obj(p.task);
      body = <>start · budget {usd(Number(t.budget))} · guardrail {str(p.guardrail) || "observe"}</>;
      break;
    }
    case "search":
      body = <>search {arg(`“${str(p.query)}”`)}{arrow}{Number(p.count ?? 0)} results</>;
      break;
    case "view":
      body = <>view {arg(str(p.productId))}{arrow}{usd(Number(p.price))}</>;
      break;
    case "add_to_cart":
      body = <>add {arg(str(p.productId))} <span className={Number(p.qty) > 1 ? "font-medium text-coral-ink" : ""}>×{Number(p.qty ?? 1)}</span>{arrow}cart {usd(Number(p.cartTotal))}</>;
      break;
    case "remove_from_cart":
      body = <>remove {arg(str(p.productId))}{arrow}cart {usd(Number(p.cartTotal))}</>;
      break;
    case "checkout_requested":
      body = <>checkout{arrow}{usd(Number(p.total))}</>;
      break;
    case "guardrail_verdict": {
      const v = e.payload as GuardianVerdict;
      const d = v?.decision;
      body = <>guardrail{arrow}<span className={cx("font-medium", d === "block" ? "text-coral-ink" : d === "ask" ? "text-amber-ink" : "text-pass-ink")}>{String(d)}</span>
        {(v?.reasons ?? []).length > 0 && <span> · {v.reasons.map((r) => r.code).join(", ")}</span>}</>;
      break;
    }
    case "checkout_result":
      body = <>order{arrow}<span className={str(p.status) === "completed" ? "text-pass-ink" : "font-medium text-coral-ink"}>{str(p.status)}</span> {p.amount != null ? usd(Number(p.amount)) : ""}</>;
      break;
    default:
      body = <>{e.action}</>;
  }
  return <div className="break-words pr-10 font-mono text-[11.5px] leading-5 text-ink-4">{body}</div>;
}
