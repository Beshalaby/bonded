"use client";
// Overlapping Beta posterior densities (SVG). Each series: filled density, 2px outline, 90% credible band on a
// rail under the axis, mean tick and a direct label at the peak. Hover: crosshair with each density's value.
import { useEffect, useMemo, useRef, useState } from "react";
import { betaPdf, betaQuantile } from "./beta";

export interface PosteriorSeries { key: string; label: string; a: number; b: number; color: string }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export default function PosteriorChart({ series, height = 260, domain }: { series: PosteriorSeries[]; height?: number; domain?: [number, number] }) {
  const [ref, width] = useWidth();
  const [hx, setHx] = useState<number | null>(null);
  const M = { l: 12, r: 12, t: 26, b: 30 + series.length * 12 };
  const iw = Math.max(10, width - M.l - M.r), ih = height - M.t - M.b;
  // Phones: 12px axis labels on every other tick so they never collide.
  const narrow = width > 0 && width < 480;

  const [x0, x1] = useMemo(() => {
    if (domain) return domain;
    const lo = Math.min(...series.map((s) => betaQuantile(0.0005, s.a, s.b)));
    const hi = Math.max(...series.map((s) => betaQuantile(0.9995, s.a, s.b)));
    const pad = (hi - lo) * 0.08;
    return [Math.max(0, Math.floor((lo - pad) * 20) / 20), Math.min(1, Math.ceil((hi + pad) * 20) / 20)];
  }, [series, domain]);

  const curves = useMemo(() => series.map((s) => {
    const N = 240;
    const pts = Array.from({ length: N + 1 }, (_, i) => { const x = x0 + ((x1 - x0) * i) / N; const y = betaPdf(x, s.a, s.b); return [x, Number.isFinite(y) ? y : 0] as const; });
    return { ...s, pts, mean: s.a / (s.a + s.b), lo: betaQuantile(0.05, s.a, s.b), hi: betaQuantile(0.95, s.a, s.b), peak: pts.reduce((m, p) => (p[1] > m[1] ? p : m), pts[0]) };
  }), [series, x0, x1]);
  const yMax = Math.max(1e-9, ...curves.map((c) => c.peak[1])) * 1.12;
  const sx = (x: number) => M.l + ((x - x0) / (x1 - x0)) * iw;
  const sy = (y: number) => M.t + ih - (y / yMax) * ih;
  const ticks = useMemo(() => {
    const span = x1 - x0, step = span > 0.6 ? 0.1 : span > 0.25 ? 0.05 : 0.025;
    const out: number[] = [];
    for (let t = Math.ceil(x0 / step) * step; t <= x1 + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
    return out;
  }, [x0, x1]);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block"
          onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const x = x0 + ((e.clientX - r.left - M.l) / iw) * (x1 - x0); setHx(x >= x0 && x <= x1 ? x : null); }}
          onMouseLeave={() => setHx(null)}>
          {/* grid + axis */}
          {ticks.map((t, i) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={M.t + ih} stroke="oklch(96.6% 0.006 85)" />
              {(!narrow || i % 2 === 0) && <text x={sx(t)} y={M.t + ih + 15} textAnchor="middle" fontSize={narrow || (typeof window !== "undefined" && window.innerWidth < 1024) ? 12 : 10.5} fill="oklch(72% 0.009 75)" className="tnum">{Math.round(t * 1000) / 10}%</text>}
            </g>
          ))}
          <line x1={M.l} x2={M.l + iw} y1={M.t + ih} y2={M.t + ih} stroke="oklch(87% 0.007 80)" />
          {/* densities */}
          {curves.map((c) => {
            const d = c.pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join("");
            return (
              <g key={c.key}>
                <path d={`${d}L${sx(x1)},${sy(0)}L${sx(x0)},${sy(0)}Z`} fill={c.color} opacity={0.1} />
                <path d={d} fill="none" stroke={c.color} strokeWidth={2} strokeLinejoin="round" />
                <line x1={sx(c.mean)} x2={sx(c.mean)} y1={sy(betaPdf(c.mean, c.a, c.b))} y2={M.t + ih} stroke={c.color} strokeWidth={1} strokeDasharray="2 3" />
              </g>
            );
          })}
          {/* direct labels where each curve most exceeds the others (keeps labels off other curves) */}
          {curves.map((c) => {
            let best = c.peak, score = -Infinity;
            c.pts.forEach((pt, i) => {
              if (pt[1] < c.peak[1] * 0.3) return;
              const other = Math.max(0, ...curves.filter((o) => o.key !== c.key).map((o) => o.pts[i][1]));
              const sc = sy(other) - sy(pt[1]);
              if (sc > score) { score = sc; best = pt; }
            });
            let side: "middle" | "start" | "end" = Math.abs(best[0] - c.peak[0]) < (x1 - x0) * 0.01 ? "middle" : best[0] > c.peak[0] ? "start" : "end";
            // keep the label inside the plot (matters on narrow screens): flip or clamp using an estimated text width
            const est = c.label.length * 6.8, bx = sx(best[0]);
            if (side === "start" && bx + 6 + est > width - 2) side = "end";
            else if (side === "end" && bx - 6 - est < 2) side = "start";
            let px = bx + (side === "start" ? 6 : side === "end" ? -6 : 0);
            if (side === "middle") px = Math.min(Math.max(px, est / 2 + 2), width - est / 2 - 2);
            return (
              <text key={c.key} x={px} y={Math.max(12, sy(best[1]) - (side === "middle" ? 8 : 4))} textAnchor={side} fontSize={12} fontWeight={500} fill="oklch(20% 0.012 70)"
                stroke="#fff" strokeWidth={3} paintOrder="stroke">{c.label}</text>
            );
          })}
          {/* 90% credible rails */}
          {curves.map((c, i) => {
            const y = M.t + ih + 26 + i * 12;
            return (
              <g key={c.key}>
                <line x1={sx(c.lo)} x2={sx(c.hi)} y1={y} y2={y} stroke={c.color} strokeWidth={2} strokeLinecap="round" />
                <line x1={sx(c.lo)} x2={sx(c.lo)} y1={y - 3} y2={y + 3} stroke={c.color} strokeWidth={1.5} />
                <line x1={sx(c.hi)} x2={sx(c.hi)} y1={y - 3} y2={y + 3} stroke={c.color} strokeWidth={1.5} />
                <circle cx={sx(c.mean)} cy={y} r={3.5} fill={c.color} stroke="#fff" strokeWidth={1.5} />
              </g>
            );
          })}
          {/* crosshair */}
          {hx != null && (
            <g pointerEvents="none">
              <line x1={sx(hx)} x2={sx(hx)} y1={M.t} y2={M.t + ih} stroke="oklch(20% 0.012 70)" strokeOpacity={0.35} />
              {curves.map((c) => <circle key={c.key} cx={sx(hx)} cy={sy(betaPdf(hx, c.a, c.b))} r={3.5} fill={c.color} stroke="#fff" strokeWidth={1.5} />)}
            </g>
          )}
        </svg>
      )}
      {hx != null && width > 0 && (
        <div className="pointer-events-none absolute z-10 min-w-[170px] rounded-md border border-divider bg-white px-2.5 py-2 text-[12px] shadow-md"
          style={{ top: M.t, ...(sx(hx) > width - 200 ? { right: width - sx(hx) + 10 } : { left: sx(hx) + 10 }) }}>
          <div className="mb-1 font-medium text-ink tnum">success rate = {(hx * 100).toFixed(1)}%</div>
          {curves.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 tnum">
              <span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block size-2 rounded-full" style={{ background: c.color }} />{c.label}</span>
              <span className="text-ink">{betaPdf(hx, c.a, c.b).toFixed(2)}</span>
            </div>
          ))}
          <div className="mt-1 text-[11px] text-ink-4">posterior density</div>
        </div>
      )}
    </div>
  );
}
