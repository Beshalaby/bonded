"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { RedTeamScam } from "@/lib/types";
import { trapLabel } from "@/lib/ui/format";
import { RollingNumber } from "@/components/home/RollingNumber";

const ACCENT = "#2563eb";
const INK = { muted: "#a1a1aa", grid: "#f0f0f2", axis: "#d4d4d8" };
const EASE = [0.2, 0.75, 0.15, 1] as const;

export interface GrowthStep { tasks: number; scam?: RedTeamScam }

/** Steps: base, then +1 per kept scam in creation order. */
export function growthSteps(base: number, scams: RedTeamScam[], hidden: Set<string> = new Set()): GrowthStep[] {
  const asc = scams.filter((s) => !hidden.has(s.id) && (s.variantTaskId || s.fooled.length) && Number.isFinite(Date.parse(s.createdAt)))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const out: GrowthStep[] = [{ tasks: base }];
  asc.forEach((s, i) => out.push({ tasks: base + i + 1, scam: s }));
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Benchmark size as a step chart, one step per kept scam (x = discovery order, rounds marked below).
 * When a step is added, the new riser draws in and the end label rolls to the new count.
 */
export default function GrowthChart({ steps, height = 220, big = false }: { steps: GrowthStep[]; height?: number; big?: boolean }) {
  const reduce = useReducedMotion();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const m = { l: 40, r: big ? 92 : 70, t: 16, b: 30 };
  const W = Math.max(240, width), H = height, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const n = steps.length;
  const base = steps[0]?.tasks ?? 0, top = steps[n - 1]?.tasks ?? 0;
  const yMin = Math.max(0, base - Math.max(2, Math.ceil((top - base) * 0.6)));
  const yMax = top + Math.max(1, Math.ceil((top - base) * 0.25));
  const slots = Math.max(n, 2);
  const sx = (i: number) => m.l + (i / (slots - 1)) * iw;
  const sy = (v: number) => m.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const fs = big ? 13 : 11;

  // static path up to the second-to-last point; the newest riser animates in
  const pathTo = (k: number) => {
    let d = `M${sx(0)},${sy(steps[0].tasks)}`;
    for (let i = 1; i <= k; i++) d += `H${sx(i)}V${sy(steps[i].tasks)}`;
    return d;
  };
  const last = n - 1;
  const prevPath = pathTo(Math.max(0, last - 1));
  const newSeg = last > 0 ? `M${sx(last - 1)},${sy(steps[last - 1].tasks)}H${sx(last)}V${sy(steps[last].tasks)}` : "";
  const area = `${pathTo(last)}H${sx(slots - 1)}V${m.t + ih}H${sx(0)}Z`;
  const ticks = niceTicks(yMin, yMax, 4);

  // round boundaries for the x axis
  const roundMarks: { i: number; label: string }[] = [];
  steps.forEach((s, i) => {
    const r = s.scam?.round;
    if (r != null && steps[i - 1]?.scam?.round !== r) roundMarks.push({ i, label: `R${r}` });
  });

  if (!n) return null;
  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={W} height={H} className="block" role="img" aria-label={`Benchmark grew from ${base} to ${top} tasks over ${n - 1} kept scams`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - r.left;
            let best = 0, bd = Infinity;
            steps.forEach((_, i) => { const d = Math.abs(sx(i) - px); if (d < bd) { bd = d; best = i; } });
            setHi(best);
          }}
          onPointerLeave={() => setHi(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={m.l + iw} y1={sy(t)} y2={sy(t)} stroke={t === ticks[0] ? INK.axis : INK.grid} />
              <text x={m.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={fs} fill={INK.muted} className="tnum">{t}</text>
            </g>
          ))}
          <line x1={m.l} x2={m.l + iw} y1={sy(base)} y2={sy(base)} stroke={INK.axis} strokeDasharray="3 4" />
          <text x={m.l + iw + 8} y={sy(base)} dy="0.32em" fontSize={fs} fill={INK.muted}>base {base}</text>
          {roundMarks.map((r) => (
            <g key={r.i}>
              <line x1={sx(r.i)} x2={sx(r.i)} y1={m.t + ih} y2={m.t + ih + 4} stroke={INK.axis} />
              <text x={sx(r.i)} y={H - 8} textAnchor="middle" fontSize={fs - 0.5} fill={INK.muted}>{r.label}</text>
            </g>
          ))}
          <motion.path d={area} fill={ACCENT} initial={false} animate={{ opacity: 0.07 }} />
          <path d={prevPath} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {newSeg && (
            <motion.path key={`seg-${n}`} d={newSeg} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />
          )}
          {steps.map((s, i) => i > 0 && i < last && (
            <circle key={i} cx={sx(i)} cy={sy(s.tasks)} r={hi === i ? 4.5 : 2.5} fill={ACCENT} stroke="#fff" strokeWidth={hi === i ? 2 : 0} />
          ))}
          <motion.circle key={`end-${n}`} cx={sx(last)} cy={sy(top)} r={big ? 6 : 4.5} fill={ACCENT} stroke="#fff" strokeWidth={2}
            initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.75 }} />
          {!reduce && last > 0 && (
            <motion.circle key={`pulse-${n}`} cx={sx(last)} cy={sy(top)} r={big ? 6 : 4.5} fill="none" stroke={ACCENT}
              initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ duration: 1.1, delay: 0.85, ease: "easeOut" }}
              style={{ transformOrigin: `${sx(last)}px ${sy(top)}px` }} />
          )}
          {hi != null && <line x1={sx(hi)} x2={sx(hi)} y1={m.t} y2={m.t + ih} stroke="#52525b" opacity={0.25} pointerEvents="none" />}
        </svg>
      )}
      {width > 0 && (
        <div className="pointer-events-none absolute font-semibold text-zinc-900 tnum" style={{ left: sx(last) + 10, top: sy(top) - (big ? 13 : 9), fontSize: big ? 22 : 14 }}>
          <RollingNumber value={top} /> <span className="font-normal text-zinc-500" style={{ fontSize: fs }}>tasks</span>
        </div>
      )}
      {hi != null && width > 0 && (
        <div className="pointer-events-none absolute z-20 w-[240px] rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-[12px] shadow-md"
          style={{ left: Math.min(sx(hi) + 12, W - 252), top: Math.max(0, sy(steps[hi].tasks) - 12) }}>
          <div className="text-[13px] font-semibold text-zinc-900 tnum">{steps[hi].tasks} tasks</div>
          {steps[hi].scam ? (
            <>
              <div className="mt-0.5 truncate text-zinc-700">{steps[hi].scam!.product?.title ?? steps[hi].scam!.id}</div>
              <div className="mt-0.5 text-zinc-500">{trapLabel(steps[hi].scam!.trapType)} · fooled {steps[hi].scam!.fooled.map((f) => f.replace(/^sim\//, "")).join(", ")}</div>
            </>
          ) : <div className="text-zinc-500">Base benchmark, before the red team</div>}
        </div>
      )}
    </div>
  );
}

function niceTicks(min: number, max: number, count: number) {
  const span = max - min;
  const raw = span / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * p).find((s) => span / s <= count) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out.filter((v) => Number.isInteger(v));
}
