"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { Finding, FindingVisual, Seg, Tone } from "@/lib/findings";
import { cx } from "@/components/ui";

const TONE_TEXT: Record<Tone, string> = { bad: "text-rose-600", warn: "text-amber-600", good: "text-emerald-600", neutral: "text-zinc-900" };
const EASE = [0.2, 0.75, 0.15, 1] as const;

export function Headline({ segs, className }: { segs: Seg[]; className?: string }) {
  return (
    <span className={className}>
      {segs.map((s, i) => typeof s === "string"
        ? <span key={i}>{s}</span>
        : <span key={i} className={cx("tnum", TONE_TEXT[s.tone ?? "neutral"])}>{s.n}</span>)}
    </span>
  );
}

export default function KeyFindings({ findings, size = "md" }: { findings: Finding[]; size?: "md" | "lg" }) {
  return (
    <div className={cx("grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200",
      findings.length >= 3 ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2")}>
      {findings.map((f, i) => <FindingCard key={f.id} f={f} i={i} size={size} />)}
      {/* fill the last row so the hairline grid stays rectangular */}
      {Array.from({ length: (3 - (findings.length % 3)) % 3 }).map((_, i) => <div key={`pad${i}`} className="hidden bg-white lg:block" />)}
    </div>
  );
}

function FindingCard({ f, i, size }: { f: Finding; i: number; size: "md" | "lg" }) {
  const reduce = useReducedMotion();
  return (
    <article className="group relative flex flex-col bg-white p-5 transition-colors hover:bg-zinc-50/60">
     <motion.div className="flex flex-1 flex-col"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.06 * i, ease: EASE }}>
      <div className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.06em] text-zinc-500">
        <span className="font-mono text-zinc-400">{String(i + 1).padStart(2, "0")}</span>
        <span>{f.kicker}</span>
      </div>
      <h3 className={cx("mt-2.5 font-semibold leading-snug tracking-[-0.015em] text-zinc-900", size === "lg" ? "text-[20px]" : "text-[16.5px]")}>
        <Headline segs={f.headline} />
      </h3>
      <div className="mt-4 mb-4"><Visual v={f.visual} delay={0.06 * i + 0.2} /></div>
      <p className="text-[12.5px] leading-relaxed text-zinc-500">{f.detail}</p>
      <div className="mt-auto pt-3">
        <Link href={f.href} className="tap inline-flex items-center gap-1 text-[12.5px] font-medium text-accent underline-offset-2 hover:underline">
          {f.hrefLabel} <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
     </motion.div>
    </article>
  );
}

/* ---------------------------------------------------------------- tiny visuals */

const ROSE = "#e11d48", ACCENT = "#2563eb", EMERALD = "#059669";

export function Visual({ v, delay = 0 }: { v: FindingVisual; delay?: number }) {
  const reduce = useReducedMotion();
  const t = (d = 0) => ({ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : delay + d, ease: EASE });

  if (v.kind === "dots") {
    return (
      <div>
        <div className="flex flex-wrap gap-1.5">
          {v.items.map((it, k) => (
            <motion.div key={it.label} title={`${it.label}: ${it.detail}`}
              initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ ...t(k * 0.06), type: "spring", stiffness: 420, damping: 22 }}
              className={cx("flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px]",
                it.hit ? "border-rose-200 bg-rose-50 text-rose-700" : "border-zinc-200 bg-white text-zinc-500")}>
              <span className={cx("size-1.5 rounded-full", it.hit ? "bg-rose-500" : "bg-zinc-300")} />
              <span className="max-w-[92px] truncate">{it.label.split(" ")[0]}</span>
              <span className="tnum text-[10.5px] opacity-70">{it.detail.split(" ")[0]}</span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  if (v.kind === "bars") {
    const max = Math.max(0.0001, ...v.rows.map((r) => r.value));
    return (
      <div className="space-y-[5px]">
        {v.rows.slice(0, 5).map((r, k) => (
          <div key={r.label} className="grid grid-cols-[96px_1fr_34px] items-center gap-2 text-[11px]" title={`${r.label}: ${Math.round(r.value * 100)}%`}>
            <span className={cx("truncate", r.highlight ? "font-medium text-zinc-800" : "text-zinc-500")}>{r.label}</span>
            <span className="relative h-[6px] rounded-full bg-zinc-100">
              <motion.span className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: r.highlight ? ROSE : "#d4d4d8", originX: 0 }}
                initial={{ width: 0 }} animate={{ width: `${(r.value / max) * 100}%` }}
                transition={t(k * 0.05)} />
            </span>
            <span className={cx("text-right tnum", r.highlight ? "font-medium text-zinc-900" : "text-zinc-500")}>{Math.round(r.value * 100)}%</span>
          </div>
        ))}
      </div>
    );
  }

  if (v.kind === "split") {
    const total = Math.max(0.01, v.a.value + v.b.value);
    const fa = v.a.value / total;
    const fmt = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
    return (
      <div>
        <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
          <motion.div className="h-full rounded-l-full" style={{ background: EMERALD }}
            initial={{ width: 0 }} animate={{ width: `${fa * 100}%` }} transition={t()} />
          <div className="h-full flex-1 rounded-r-full bg-zinc-200" />
        </div>
        <div className="mt-2 flex justify-between text-[11px] tnum">
          <span className="text-zinc-600"><span className="mr-1 inline-block size-1.5 rounded-full align-middle" style={{ background: EMERALD }} />{v.a.label} {fmt(v.a.value)}</span>
          <span className="text-zinc-500"><span className="mr-1 inline-block size-1.5 rounded-full bg-zinc-300 align-middle" />{v.b.label} {fmt(v.b.value)}</span>
        </div>
      </div>
    );
  }

  if (v.kind === "step") return <StepSpark points={v.points} base={v.base} delay={delay} />;

  // interval
  const { mean, lower, upper } = v.interval;
  return (
    <div title={`${v.label} ${Math.round(mean * 100)}% · 90% CI ${Math.round(lower * 100)}–${Math.round(upper * 100)}%`}>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-200" />
        {[0, 0.25, 0.5, 0.75, 1].map((x) => <div key={x} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-zinc-200" style={{ left: `${x * 100}%` }} />)}
        <motion.div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full" style={{ background: ACCENT, opacity: 0.22, left: `${lower * 100}%` }}
          initial={{ width: 0 }} animate={{ width: `${(upper - lower) * 100}%` }} transition={t()} />
        <motion.div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ background: ACCENT, left: `${mean * 100}%`, boxShadow: "0 0 0 1px rgba(37,99,235,.25)" }}
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...t(0.3), type: "spring", stiffness: 380, damping: 20 }} />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-zinc-400 tnum">
        <span>0%</span><span>{v.label} · 90% CI</span><span>100%</span>
      </div>
    </div>
  );
}

function StepSpark({ points, base, delay }: { points: number[]; base: number; delay: number }) {
  const reduce = useReducedMotion();
  const W = 300, H = 44, pad = 3;
  const lo = base, hi = Math.max(base + 1, points[points.length - 1]);
  const n = Math.max(1, points.length - 1);
  const x = (i: number) => pad + (i / n) * (W - pad * 2 - 34);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2 - 4);
  let d = `M${x(0)},${y(points[0])}`;
  points.forEach((p, i) => { if (i) d += `H${x(i)}V${y(p)}`; });
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-11 w-full" preserveAspectRatio="xMinYMid meet" role="img"
      aria-label={`Benchmark grew from ${base} to ${points[last]} tasks`}>
      <line x1={pad} x2={W - 34} y1={y(base)} y2={y(base)} stroke="#e4e4e7" strokeDasharray="2 3" />
      <motion.path d={d} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 1.1, delay, ease: EASE }} />
      <circle cx={x(last)} cy={y(points[last])} r={3.5} fill={ACCENT} stroke="#fff" strokeWidth={1.5} />
      <text x={x(last) + 7} y={y(points[last])} dy="0.35em" fontSize={11} fontWeight={600} fill="#18181b" className="tnum max-sm:text-[12px]">{points[last]}</text>
    </svg>
  );
}
