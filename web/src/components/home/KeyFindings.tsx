"use client";
import Link from "next/link";
import { motion } from "motion/react";
import type { Finding, FindingVisual, Seg, Tone } from "@/lib/findings";
import { cx } from "@/components/ui";
import { ArrowUpRight } from "lucide-react";
import { DotBar, DotSparkline, EASE, MicroLabel } from "@/design";

const TONE_TEXT: Record<Tone, string> = { bad: "text-coral-ink", warn: "text-amber-ink", good: "text-pass-ink", neutral: "text-ink" };
const TONE_DOT = { bad: "coral", warn: "amber", good: "pass", neutral: "muted" } as const;

export function Headline({ segs, className }: { segs: Seg[]; className?: string }) {
  return (
    <span className={className}>
      {segs.map((s, i) => typeof s === "string"
        ? <span key={i}>{s}</span>
        : <span key={i} className={cx("tnum", TONE_TEXT[s.tone ?? "neutral"])}>{s.n}</span>)}
    </span>
  );
}

/** Findings as tiles: numbered micro-label, a one-sentence claim, a tiny dot-matrix visual, the evidence link. */
export default function KeyFindings({ findings, size = "md" }: { findings: Finding[]; size?: "md" | "lg" }) {
  return (
    <div className={cx("grid gap-4", findings.length >= 3 ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2")}>
      {findings.map((f, i) => <FindingCard key={f.id} f={f} i={i} size={size} />)}
    </div>
  );
}

function FindingCard({ f, i, size }: { f: Finding; i: number; size: "md" | "lg" }) {
  // reduced motion is handled globally by <MotionProvider> (no SSR/client branch, so hydration stays stable)
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 * i, ease: EASE }}
      className="group relative flex flex-col rounded-tile bg-surface p-6 shadow-tile transition-shadow duration-200 hover:shadow-raised max-sm:p-5">
      <MicroLabel dot={TONE_DOT[f.tone]}>
        <span className="tabular-nums text-ink-4">{String(i + 1).padStart(2, "0")}</span>
        <span>{f.kicker}</span>
      </MicroLabel>
      <h3 className={cx("mt-4 font-[540] leading-[1.25] tracking-[-0.02em] text-ink", size === "lg" ? "text-[22px]" : "text-[18px]")}>
        <Headline segs={f.headline} />
      </h3>
      <div className="mb-5 mt-6"><Visual v={f.visual} /></div>
      <p className="text-[12.5px] leading-relaxed text-ink-3">{f.detail}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <Link href={f.href} className="micro !text-ink-2 transition-colors after:absolute after:inset-0 after:rounded-tile hover:!text-ink">{f.hrefLabel}</Link>
        <span aria-hidden className="inline-flex size-[30px] items-center justify-center rounded-full bg-surface text-ink shadow-key transition-[background-color,color] duration-200 group-hover:bg-ink group-hover:text-white">
          <ArrowUpRight size={14} strokeWidth={2} className="transition-transform duration-200 group-hover:translate-x-px group-hover:-translate-y-px" />
        </span>
      </div>
    </motion.article>
  );
}

/* ---------------------------------------------------------------- tiny visuals (dot-matrix) */

export function Visual({ v }: { v: FindingVisual; delay?: number }) {
  if (v.kind === "dots") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {v.items.map((it) => (
          <span key={it.label} title={`${it.label}: ${it.detail}`}
            className={cx("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11.5px]",
              it.hit ? "bg-coral-soft text-coral-ink" : "bg-canvas text-ink-3")}>
            <span className={cx("size-1.5 rounded-full", it.hit ? "bg-coral" : "bg-pass")} />
            <span className="max-w-[92px] truncate">{it.label.split(" ")[0]}</span>
            <span className="tnum text-[10.5px] opacity-70">{it.detail.split(" ")[0]}</span>
          </span>
        ))}
      </div>
    );
  }

  if (v.kind === "bars") {
    const max = Math.max(0.0001, ...v.rows.map((r) => r.value));
    return (
      <div className="space-y-1.5">
        {v.rows.slice(0, 5).map((r) => (
          <div key={r.label} className="grid grid-cols-[96px_1fr_34px] items-center gap-2 text-[11.5px]" title={`${r.label}: ${Math.round(r.value * 100)}%`}>
            <span className={cx("truncate", r.highlight ? "font-medium text-ink" : "text-ink-3")}>{r.label}</span>
            <span className="relative h-[10px] overflow-hidden">
              <span className="halftone absolute inset-y-0 left-0" style={{ width: "100%", ["--dot" as string]: "var(--color-ink-5)", ["--dot-size" as string]: "5px" }} />
              <span className="halftone absolute inset-y-0 left-0 bg-canvas-sunk/0"
                style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? 5 : 0, ["--dot" as string]: r.highlight ? "var(--color-coral)" : "var(--color-ink-4)", ["--dot-size" as string]: "5px" }} />
            </span>
            <span className={cx("text-right tnum", r.highlight ? "font-medium text-ink" : "text-ink-3")}>{Math.round(r.value * 100)}%</span>
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
        <DotBar value={fa} dots={44} pitch={6} rows={2} tone="pass" label={`${v.a.label} ${fmt(v.a.value)}, ${v.b.label} ${fmt(v.b.value)}`} className="max-w-full" />
        <div className="mt-2.5 flex justify-between text-[11.5px] tnum">
          <span className="text-ink-2"><span className="mr-1.5 inline-block size-1.5 rounded-full bg-pass align-middle" />{v.a.label} {fmt(v.a.value)}</span>
          <span className="text-ink-3"><span className="mr-1.5 inline-block size-1.5 rounded-full bg-ink-5 align-middle" />{v.b.label} {fmt(v.b.value)}</span>
        </div>
      </div>
    );
  }

  if (v.kind === "step") {
    const pts = v.points.length > 52 ? v.points.filter((_, i) => i % Math.ceil(v.points.length / 52) === 0 || i === v.points.length - 1) : v.points;
    return (
      <DotSparkline values={pts} base={v.base} height={40} pitch={5} endLabel={v.points[v.points.length - 1]}
        label={`Benchmark grew from ${v.base} to ${v.points[v.points.length - 1]} tasks`} />
    );
  }

  // interval
  const { mean, lower, upper } = v.interval;
  return (
    <div title={`${v.label} ${Math.round(mean * 100)}% · 90% CI ${Math.round(lower * 100)}–${Math.round(upper * 100)}%`}>
      <DotBar value={mean} interval={v.interval} dots={44} pitch={6} rows={2} label={`${v.label} ${Math.round(mean * 100)}%, 90% interval ${Math.round(lower * 100)} to ${Math.round(upper * 100)}%`} />
      <div className="mt-2 flex justify-between text-[10.5px] text-ink-4 tnum" style={{ width: 264 }}>
        <span>0%</span><span>{v.label} · 90% CI</span><span>100%</span>
      </div>
    </div>
  );
}
