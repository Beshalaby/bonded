"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Interval } from "@/lib/types";
import { cx } from "./ui";

/* Chart chrome tokens (light only). Data is the only loud thing. */
const INK = { primary: "#18181b", secondary: "#52525b", muted: "#a1a1aa", grid: "#f0f0f2", axis: "#d4d4d8", surface: "#ffffff" };
const SERIES = "#2563eb"; // single-series charts use the accent hue
const FOOLED = "#e11d48"; // "fooled" rate bars: rose (bad outcome)

/* --------------------------------------------------------------- tooltip */

function Tooltip({ x, y, children, containerWidth }: { x: number; y: number; children: ReactNode; containerWidth: number }) {
  const flip = x > containerWidth - 180;
  return (
    <div className="pointer-events-none absolute z-20 min-w-[120px] rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-[12px] shadow-md"
      style={{ left: flip ? undefined : x + 12, right: flip ? containerWidth - x + 12 : undefined, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
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

/* --------------------------------------------------------------- CI bar */

/**
 * Reliability as mean + 90% credible interval on a fixed 0–100% track.
 * Mean is the labelled number; the whisker shows the interval; hover shows exact bounds.
 */
export function CIBar({ interval, width = 108, label = true, n }: { interval: Interval; width?: number; label?: boolean; n?: number }) {
  const h = 18;
  const pad = 5;
  const sx = (v: number) => pad + Math.max(0, Math.min(1, v)) * (width - pad * 2);
  const lo = sx(interval.lower), hi = sx(interval.upper), m = sx(interval.mean);
  const tip = `Reliability ${Math.round(interval.mean * 100)}% · 90% CI ${Math.round(interval.lower * 100)}–${Math.round(interval.upper * 100)}%${n != null ? ` · n=${n}` : ""}`;
  return (
    <span className="inline-flex items-center gap-2.5" title={tip}>
      {label && (
        <span className="w-[64px] whitespace-nowrap text-right tnum">
          <span className="font-medium text-zinc-900">{Math.round(interval.mean * 100)}%</span>
          <span className="ml-1 text-[11.5px] text-zinc-400">±{Math.round(((interval.upper - interval.lower) / 2) * 100)}</span>
        </span>
      )}
      <svg width={width} height={h} className="block shrink-0" aria-label={tip}>
        {/* track with quarter ticks */}
        <line x1={pad} x2={width - pad} y1={h / 2} y2={h / 2} stroke={INK.axis} strokeWidth={1} />
        {[0, 0.5, 1].map((t) => <line key={t} x1={sx(t)} x2={sx(t)} y1={h / 2 - 3} y2={h / 2 + 3} stroke={INK.axis} strokeWidth={1} />)}
        {/* interval */}
        <rect x={lo} y={h / 2 - 3} width={Math.max(2, hi - lo)} height={6} rx={3} fill={SERIES} opacity={0.22} />
        <line x1={lo} x2={hi} y1={h / 2} y2={h / 2} stroke={SERIES} strokeWidth={2} strokeLinecap="round" />
        <line x1={lo} x2={lo} y1={h / 2 - 4} y2={h / 2 + 4} stroke={SERIES} strokeWidth={1.5} strokeLinecap="round" />
        <line x1={hi} x2={hi} y1={h / 2 - 4} y2={h / 2 + 4} stroke={SERIES} strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={m} cy={h / 2} r={4} fill={SERIES} stroke={INK.surface} strokeWidth={2} />
      </svg>
    </span>
  );
}

/** Axis caption to sit under a column of CIBars so the 0/50/100 ticks read. */
export function CIAxis({ width = 108, label = true }: { width?: number; label?: boolean }) {
  const pad = 5;
  return (
    <span className="inline-flex items-center gap-2.5 text-[10.5px] text-zinc-400 tnum">
      {label && <span className="w-[64px]" />}
      <span className="relative block h-3" style={{ width }}>
        <span className="absolute -translate-x-1/2" style={{ left: pad }}>0</span>
        <span className="absolute -translate-x-1/2" style={{ left: width / 2 }}>50</span>
        <span className="absolute -translate-x-1/2" style={{ left: width - pad }}>100</span>
      </span>
    </span>
  );
}

/* --------------------------------------------------------------- sequential scale */

// Single-hue (rose) sequential ramp, light -> dark. Lightest step = "near zero".
const RAMP = ["#fff5f6", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239"];
function hexToRgb(h: string) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rampColor(t: number) {
  const v = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.floor(v), f = v - i;
  const a = hexToRgb(RAMP[i]), b = hexToRgb(RAMP[Math.min(RAMP.length - 1, i + 1)]);
  const c = a.map((x, k) => Math.round(x + (b[k] - x) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function ScaleLegend({ label }: { label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-zinc-500 tnum">
      <span>{label}</span>
      <span>0%</span>
      <span className="h-2 w-28 rounded-sm" style={{ background: `linear-gradient(to right, ${RAMP.join(",")})` }} />
      <span>100%</span>
      <span className="ml-2 inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-3 rounded-sm border border-zinc-200 bg-[repeating-linear-gradient(135deg,#f4f4f5_0,#f4f4f5_2px,#fff_2px,#fff_4px)]" />
        not tested
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- heatmap */

// Short column labels for phones, where five full trap names cannot share 360px.
const SHORT_LABEL: Record<string, string> = {
  "Prompt injection": "Inject.", "Fake discount": "Fake disc.", "New merchant": "New merch.", "Price gouging": "Gouging", "Knockoff": "Knock-off",
};

export interface HeatCell { rate: number | null; fooled: number; exposed: number; lower?: number; upper?: number }
export function Heatmap({
  rows, cols, cell, rowHref,
}: {
  rows: { key: string; label: ReactNode }[];
  cols: { key: string; label: string; short?: string }[];
  cell: (row: string, col: string) => HeatCell | undefined;
  rowHref?: (row: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="w-[220px] max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:w-[84px] max-sm:bg-white" />
            {cols.map((c) => (
              <th key={c.key} title={c.label} className="px-2 pb-1.5 text-center text-[12px] font-medium text-zinc-500 max-sm:px-0.5 max-sm:leading-tight">
                <span className="max-sm:hidden">{c.label}</span>
                <span className="sm:hidden">{c.short ?? SHORT_LABEL[c.label] ?? c.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="truncate pr-4 text-[13px] text-zinc-800 max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-white max-sm:pr-2">
                <span className="block truncate max-sm:max-w-[80px]">
                  {rowHref ? <Link href={rowHref(r.key)} className="tap hover:text-accent">{r.label}</Link> : r.label}
                </span>
              </td>
              {cols.map((c) => {
                const v = cell(r.key, c.key);
                if (!v || !v.exposed || v.rate == null) {
                  return (
                    <td key={c.key} title="Not tested"
                      className="h-10 max-sm:h-12 max-sm:min-w-[44px] rounded-[3px] bg-[repeating-linear-gradient(135deg,#f4f4f5_0,#f4f4f5_2px,#fff_2px,#fff_5px)] text-center text-[12px] text-zinc-400">
                      –
                    </td>
                  );
                }
                const dark = v.rate >= 0.5;
                const tip = `${c.label}: fooled ${v.fooled} of ${v.exposed} (${Math.round(v.rate * 100)}%)` +
                  (v.lower != null && v.upper != null ? ` · 90% CI ${Math.round(v.lower * 100)}–${Math.round(v.upper * 100)}%` : "");
                return (
                  <td key={c.key} title={tip}
                    className="group h-10 min-w-[96px] rounded-[3px] text-center tnum outline-offset-[-1px] hover:outline hover:outline-2 hover:outline-zinc-900/70 max-sm:h-12 max-sm:min-w-[44px] max-sm:leading-tight"
                    style={{ background: rampColor(v.rate) }}>
                    <span className={cx("text-[13px] font-medium", dark ? "text-white" : "text-zinc-900")}>{Math.round(v.rate * 100)}%</span>
                    <span className={cx("ml-1.5 text-[11px] max-sm:ml-0 max-sm:block", dark ? "text-white/75" : "text-zinc-500")}>{v.fooled}/{v.exposed}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- rate bars with CI */

export function RateBars({
  rows, color = FOOLED, valueLabel = "Fooled",
}: {
  rows: { key: string; label: ReactNode; rate: Interval; k: number; n: number }[];
  color?: string; valueLabel?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="space-y-1">
        {rows.map((r) => {
          const tested = r.n > 0;
          const raw = tested ? r.k / r.n : 0;
          return (
            <div key={r.key} onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}
              className={cx("grid grid-cols-[132px_1fr_92px] items-center gap-3 rounded px-1 py-1.5 max-sm:grid-cols-[96px_minmax(0,1fr)_78px] max-sm:gap-2", hover === r.key && "bg-zinc-50")}
              title={tested ? `${valueLabel} ${r.k} of ${r.n} · ${Math.round(raw * 100)}% (90% CI ${Math.round(r.rate.lower * 100)}–${Math.round(r.rate.upper * 100)}%)` : "Not tested"}>
              <div className="truncate text-[13px] text-zinc-700">{r.label}</div>
              <div className="relative h-4">
                <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-100" />
                {[0.25, 0.5, 0.75].map((t) => <div key={t} className="absolute top-0 h-4 w-px bg-zinc-100" style={{ left: `${t * 100}%` }} />)}
                {tested && (
                  <>
                    <div className="absolute top-[3px] h-[10px] rounded-r-[4px]" style={{ width: `${raw * 100}%`, minWidth: raw > 0 ? 3 : 0, background: color, opacity: 0.85 }} />
                    <div className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-zinc-800" style={{ left: `${r.rate.lower * 100}%`, width: `${Math.max(0.3, (r.rate.upper - r.rate.lower) * 100)}%` }} />
                    <div className="absolute top-[2px] h-3 w-[2px] bg-zinc-800" style={{ left: `calc(${r.rate.lower * 100}% - 1px)` }} />
                    <div className="absolute top-[2px] h-3 w-[2px] bg-zinc-800" style={{ left: `calc(${r.rate.upper * 100}% - 1px)` }} />
                  </>
                )}
              </div>
              <div className="text-right text-[12.5px] tnum">
                {tested ? (
                  <><span className="font-medium text-zinc-900">{Math.round(raw * 100)}%</span><span className="ml-1.5 text-zinc-400">{r.k}/{r.n}</span></>
                ) : <span className="text-zinc-400">not tested</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-[132px_1fr_92px] gap-3 px-1 text-[10.5px] text-zinc-400 tnum max-sm:grid-cols-[96px_minmax(0,1fr)_78px] max-sm:gap-2">
        <span />
        <div className="relative h-3">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span key={t} className={cx("absolute", t === 0 ? "" : t === 1 ? "-translate-x-full" : "-translate-x-1/2", (t === 0.25 || t === 0.75) && "max-sm:hidden")} style={{ left: `${t * 100}%` }}>{t * 100}%</span>
          ))}
        </div>
        <span className="text-right max-sm:leading-tight">observed · k/n</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- count bars */

export function CountBars({ rows, total, color = SERIES }: { rows: { key: string; label: ReactNode; value: number }[]; total?: number; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[150px_1fr_72px] items-center gap-3 rounded px-1 py-1.5 hover:bg-zinc-50 max-sm:grid-cols-[112px_minmax(0,1fr)_64px] max-sm:gap-2"
          title={`${typeof r.label === "string" ? r.label : r.key}: ${r.value} (${Math.round((r.value / Math.max(1, sum)) * 100)}%)`}>
          <div className="truncate text-[13px] text-zinc-700">{r.label}</div>
          <div className="relative h-[10px]">
            <div className="h-full rounded-r-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: color, opacity: 0.85 }} />
          </div>
          <div className="text-right text-[12.5px] tnum">
            <span className="font-medium text-zinc-900">{r.value}</span>
            <span className="ml-1.5 text-zinc-400">{Math.round((r.value / Math.max(1, sum)) * 100)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- line / step chart */

export interface LinePoint { x: number; y: number; label?: string; href?: string }

export function LineChart({
  data, height = 180, yMin = 0, yMax, yFormat = (v) => String(Math.round(v)), xFormat, step = false, xType = "index",
  yLabel, tooltip,
}: {
  data: LinePoint[]; height?: number; yMin?: number; yMax?: number; yFormat?: (v: number) => string;
  xFormat?: (p: LinePoint, i: number) => string; step?: boolean; xType?: "index" | "time"; yLabel?: string;
  tooltip?: (p: LinePoint, i: number) => ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const m = { l: 40, r: 44, t: 14, b: 26 };
  const W = Math.max(200, width), H = height;
  // phones and tablets (viewport < 1024px): keep axis text at a readable 12px. The SVG only renders after mount.
  const fs = W < 600 || (typeof window !== "undefined" && window.innerWidth < 1024) ? 12 : 11;
  const iw = W - m.l - m.r, ih = H - m.t - m.b;

  const { xs, ys, ticks, top } = useMemo(() => {
    const top0 = yMax ?? niceMax(Math.max(...data.map((d) => d.y), 1));
    const xv = data.map((d, i) => (xType === "time" ? d.x : i));
    const x0 = Math.min(...xv), x1 = Math.max(...xv);
    const sx = (v: number) => m.l + (x1 === x0 ? iw / 2 : ((v - x0) / (x1 - x0)) * iw);
    const sy = (v: number) => m.t + ih - ((v - yMin) / (top0 - yMin || 1)) * ih;
    const t = niceTicks(yMin, top0, 4);
    return { xs: xv.map(sx), ys: data.map((d) => sy(d.y)), ticks: t.map((v) => ({ v, y: sy(v) })), top: top0 };
  }, [data, xType, yMax, yMin, iw, ih, m.l, m.t]);

  if (!data.length) return null;

  let path = "";
  data.forEach((_, i) => {
    if (i === 0) path += `M${xs[i]},${ys[i]}`;
    else if (step) path += `H${xs[i]}V${ys[i]}`;
    else path += `L${xs[i]},${ys[i]}`;
  });
  const area = `${path}V${m.t + ih}H${xs[0]}Z`;
  const last = data.length - 1;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0, bd = Infinity;
    xs.forEach((x, i) => { const d = Math.abs(x - px); if (d < bd) { bd = d; best = i; } });
    setHi(best);
  };

  const fmtX = xFormat ?? ((p: LinePoint) => p.label ?? String(p.x));
  // x-axis labels: first, last, and up to 3 evenly spaced in between that don't collide
  const xLabelIdx = Array.from(new Set([0, ...[0.33, 0.66].map((f) => Math.round(f * last)), last])).filter((i, k, a) => k === 0 || xs[i] - xs[a[k - 1]] > 80);

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={W} height={H} className="block" onPointerMove={onMove} onPointerLeave={() => setHi(null)}
          role="img" aria-label={yLabel ? `${yLabel} over ${data.length} points` : undefined}>
          {ticks.map((t) => (
            <g key={t.v}>
              <line x1={m.l} x2={m.l + iw} y1={t.y} y2={t.y} stroke={t.v === yMin ? INK.axis : INK.grid} strokeWidth={1} />
              <text x={m.l - 8} y={t.y} dy="0.32em" textAnchor="end" fontSize={fs} fill={INK.muted} className="tnum">{yFormat(t.v)}</text>
            </g>
          ))}
          {yLabel && <text x={m.l} y={8} fontSize={fs} fill={INK.muted} dx={-32}>{yLabel}</text>}
          {xLabelIdx.map((i) => (
            <text key={i} x={xs[i]} y={H - 6} fontSize={fs} fill={INK.muted} className="tnum"
              textAnchor={i === 0 && xs.length > 1 ? "start" : i === last ? "end" : "middle"}>{fmtX(data[i], i)}</text>
          ))}
          <path d={area} fill={SERIES} opacity={0.07} />
          <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.length <= 30 && !step && data.map((_, i) => (
            <circle key={i} cx={xs[i]} cy={ys[i]} r={2.5} fill={SERIES} />
          ))}
          {/* end marker + direct label */}
          <circle cx={xs[last]} cy={ys[last]} r={4} fill={SERIES} stroke={INK.surface} strokeWidth={2} />
          <text x={xs[last] + 8} y={ys[last]} dy="0.32em" fontSize={12} fontWeight={600} fill={INK.primary} className="tnum">{yFormat(data[last].y)}</text>
          {hi != null && (
            <g pointerEvents="none">
              <line x1={xs[hi]} x2={xs[hi]} y1={m.t} y2={m.t + ih} stroke={INK.secondary} strokeWidth={1} opacity={0.4} />
              <circle cx={xs[hi]} cy={ys[hi]} r={4.5} fill={SERIES} stroke={INK.surface} strokeWidth={2} />
            </g>
          )}
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" />
        </svg>
      )}
      {hi != null && width > 0 && (
        <Tooltip x={xs[hi]} y={ys[hi]} containerWidth={W}>
          {tooltip ? tooltip(data[hi], hi) : (
            <>
              <div className="text-[13px] font-semibold text-zinc-900 tnum">{yFormat(data[hi].y)}</div>
              <div className="text-zinc-500">{fmtX(data[hi], hi)}</div>
            </>
          )}
        </Tooltip>
      )}
      {top < 0 && null}
    </div>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return s * p;
}
function niceTicks(min: number, max: number, count: number) {
  const span = max - min;
  const raw = span / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const stepN = [1, 2, 2.5, 5, 10].map((s) => s * p).find((s) => span / s <= count) ?? raw;
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += stepN) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/* --------------------------------------------------------------- meter */

export function Meter({ value, tone = "accent", className }: { value: number; tone?: "accent" | "bad" | "good" | "warn"; className?: string }) {
  const c = { accent: "bg-accent", bad: "bg-rose-500", good: "bg-emerald-500", warn: "bg-amber-500" }[tone];
  return (
    <div className={cx("h-1 w-full overflow-hidden rounded-full bg-zinc-100", className)}>
      <div className={cx("h-full rounded-full", c)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
