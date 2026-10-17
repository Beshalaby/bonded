"use client";
// HalftoneField: a dot-matrix ridgeline. One ridge per series, height = √(density) on a shared scale, drawn as an
// ordered-dither halftone on a canvas (devicePixelRatio-sharp). The dense core of each ridge is its 90% credible
// interval; the paler skirts are the tails; a dotted ink stem marks the posterior mean. Hover a ridge for values.
//
// Performance: dots are computed once per (data, size) into typed arrays and drawn in one path per colour class.
// The "breathing" wave runs at ~30fps only while the canvas is on screen and the tab is visible; reduced motion
// draws one static frame.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "./tokens";
import { cx } from "./primitives";
import { useInView, usePageVisible, useReducedMotionPref, useSize } from "./hooks";

export interface Ridge {
  key: string;
  label: string;
  /** Small secondary text under the label (e.g. "n=31"). */
  sub?: string;
  href?: string;
  /** Density: a Beta(a, b) posterior, or any pdf over the domain. */
  beta?: { a: number; b: number };
  pdf?: (x: number) => number;
  /** Interval drawn as the dense core, mean drawn as the stem. */
  interval: { mean: number; lower: number; upper: number };
  n?: number;
  tone?: "accent" | "violet" | "coral" | "pass";
}

const TONES = {
  accent: { core: C.accentDot, tail: "oklch(80% 0.08 258)", stem: C.ink },
  violet: { core: "oklch(60% 0.2 295)", tail: "oklch(82% 0.07 295)", stem: C.ink },
  coral: { core: C.coral, tail: "oklch(85% 0.06 40)", stem: C.ink },
  pass: { core: C.pass, tail: "oklch(86% 0.06 152)", stem: C.ink },
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/* Beta pdf via log-gamma (Lanczos). */
function lgamma(z: number): number {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
export function betaPdf(a: number, b: number) {
  const lnB = lgamma(a) + lgamma(b) - lgamma(a + b);
  return (x: number) => {
    const t = Math.min(1 - 1e-6, Math.max(1e-6, x));
    const v = Math.exp((a - 1) * Math.log(t) + (b - 1) * Math.log(1 - t) - lnB);
    return Number.isFinite(v) ? v : 0;
  };
}
/** Recover Beta(1+s, 1+f) from a posterior mean and n (the store's convention). */
export function betaFromMean(mean: number, n: number) {
  const a = Math.max(1, mean * (n + 2));
  return { a, b: Math.max(1, n + 2 - a) };
}

type Layer = { ridge: number; color: string; alpha: number; dots: Float32Array; count: number };

export function HalftoneField({
  ridges, domain = [0, 1], rowHeight, overlap = 2.1, spacing, format = (v) => `${Math.round(v * 100)}%`,
  axisTicks = [0, 0.25, 0.5, 0.75, 1], axisLabel, className, ariaLabel, valueLabel = "P(success)",
}: {
  ridges: Ridge[];
  domain?: [number, number];
  /** Vertical distance between baselines, px. Default 44 (40 on phones). */
  rowHeight?: number;
  /** Tallest ridge height as a multiple of rowHeight (joyplot overlap). */
  overlap?: number;
  /** Dot pitch in CSS px. Default 5 (4 on phones). */
  spacing?: number;
  format?: (v: number) => string;
  axisTicks?: number[];
  axisLabel?: string;
  className?: string;
  ariaLabel?: string;
  valueLabel?: string;
}) {
  const router = useRouter();
  const [wrapRef, { w }] = useSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inView = useInView(wrapRef, "80px");
  const visible = usePageVisible();
  const reduce = useReducedMotionPref();
  const [hover, setHover] = useState<{ i: number; x: number; v: number } | null>(null);

  const phone = w > 0 && w < 560;
  const rowH = rowHeight ?? (phone ? 38 : 44);
  const s = spacing ?? (phone ? 4 : 5);
  const L = phone ? 4 : 184;  // label column (phones: labels float over the plot with a halo)
  const R = phone ? 44 : 76;  // value column
  const top = Math.round(rowH * overlap * 0.62);
  const axisH = 30;
  const H = top + ridges.length * rowH + axisH;
  const plotW = Math.max(40, w - L - R);
  const [d0, d1] = domain;
  const sx = (v: number) => L + ((v - d0) / (d1 - d0)) * plotW;
  const baseY = (i: number) => top + (i + 1) * rowH - 6;

  const pdfs = useMemo(() => ridges.map((r) => r.pdf ?? (r.beta ? betaPdf(r.beta.a, r.beta.b) : () => 0)), [ridges]);

  // ---- build dot layers (once per data/size)
  const layers = useMemo<Layer[]>(() => {
    if (!w) return [];
    const cols = Math.floor(plotW / s);
    const xs = Array.from({ length: cols + 1 }, (_, k) => L + k * s);
    const vals = xs.map((x) => d0 + ((x - L) / plotW) * (d1 - d0));
    const dens = pdfs.map((f) => vals.map((v) => f(v)));
    const gmax = Math.max(1e-9, ...dens.flat());
    const maxH = rowH * overlap;
    const heights = dens.map((row) => row.map((d) => maxH * Math.sqrt(d / gmax)));
    const out: Layer[] = [];
    const buckets = ridges.map((r, i) => {
      const t = TONES[r.tone ?? "accent"];
      const mk = (color: string, alpha: number) => ({ ridge: i, color, alpha, arr: [] as number[] });
      return { core: mk(t.core, 1), core2: mk(t.core, 0.55), tail: mk(t.tail, 0.95), stem: mk(t.stem, 0.9), floor: mk(C.ink5, 1), stray: mk(t.tail, 0.8) };
    });
    const rowsN = Math.floor(H / s);
    for (let k = 0; k <= cols; k++) {
      const x = xs[k], v = vals[k];
      for (let gy = 0; gy <= rowsN; gy++) {
        const y = gy * s + (s / 2);
        // frontmost (lowest) ridge covering this point wins
        let hit = -1, depth = 0;
        for (let i = ridges.length - 1; i >= 0; i--) {
          const b = baseY(i), h = heights[i][k];
          if (y <= b && y >= b - h && h > 0.5) { hit = i; depth = (b - y) / h; break; }
        }
        const thr = BAYER[(k & 3) * 4 + (gy & 3)];
        if (hit >= 0) {
          const r = ridges[hit];
          const inCI = v >= r.interval.lower && v <= r.interval.upper;
          const crest = Math.pow(depth, 0.7);
          const nearCrest = (1 - depth) * heights[hit][k] < s * 1.2; // the silhouette row is always drawn
          const intensity = nearCrest ? 1 : 0.18 + 0.72 * crest;
          if (intensity < thr * 0.92) continue;
          const rad = s * (0.16 + 0.15 * intensity);
          const bk = buckets[hit];
          const target = inCI ? (intensity > 0.55 ? bk.core : bk.core2) : bk.tail;
          target.arr.push(x, y, rad, baseY(hit));
          continue;
        }
        // stray dots just above a crest (the halftone "spray")
        for (let i = ridges.length - 1; i >= 0; i--) {
          const b = baseY(i), h = heights[i][k];
          const above = b - h - y;
          if (above > 0 && above < s * 5 && h > 3) {
            const p = 0.22 * (1 - above / (s * 5));
            if (hash(k, gy + i * 997) < p) buckets[i].stray.arr.push(x, y, s * 0.13, b);
            break;
          }
        }
      }
    }
    // floors + mean stems
    ridges.forEach((r, i) => {
      const b = baseY(i);
      for (let k = 0; k <= cols; k += 3) buckets[i].floor.arr.push(xs[k], b + s * 0.9, s * 0.12, b);
      const km = Math.round((sx(r.interval.mean) - L) / s);
      const hm = heights[i][Math.max(0, Math.min(cols, km))] ?? 0;
      for (let y = b; y >= b - hm - s * 2; y -= s * 0.8) buckets[i].stem.arr.push(L + km * s, y, s * 0.17, b);
    });
    buckets.forEach((bk) => Object.values(bk).forEach((l) => {
      if (l.arr.length) out.push({ ridge: l.ridge, color: l.color, alpha: l.alpha, dots: new Float32Array(l.arr), count: l.arr.length / 4 });
    }));
    // draw order: back ridges first, within a ridge: floor, tail, core, stray, stem
    return out;
  }, [w, H, plotW, s, rowH, overlap, d0, d1, L, ridges, pdfs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- draw loop
  const hoverRef = useRef<number | null>(null);
  hoverRef.current = hover?.i ?? null;
  const drawRef = useRef<(t: number, grow: number) => void>(() => {});
  drawRef.current = (t: number, grow: number) => {
    const cv = canvasRef.current;
    if (!cv || !w) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    const hi = hoverRef.current;
    const wave = t * 0.0011;
    for (const l of layers) {
      ctx.globalAlpha = l.alpha * (hi == null || hi === l.ridge ? 1 : 0.26);
      ctx.fillStyle = l.color;
      ctx.beginPath();
      const d = l.dots;
      for (let j = 0; j < l.count; j++) {
        const x = d[j * 4], y0 = d[j * 4 + 1], r0 = d[j * 4 + 2], b = d[j * 4 + 3];
        const y = b - (b - y0) * grow;
        const r = t ? r0 * (1 + 0.16 * Math.sin(wave + x * 0.017 + y * 0.011)) : r0;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, 6.2832);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // entrance + ambient breathing; paused offscreen / hidden tab; static under reduced motion
  const grown = useRef(false);
  useEffect(() => {
    if (!layers.length) return;
    if (reduce) { grown.current = true; drawRef.current(0, 1); return; }
    if (!inView || !visible) { drawRef.current(0, grown.current ? 1 : 0); return; }
    let raf = 0, last = 0;
    const t0 = performance.now();
    const startGrow = grown.current ? 1 : 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const g = startGrow === 1 ? 1 : Math.min(1, (now - t0) / 1100);
      if (g < 1 || now - last > 33) {
        last = now;
        const e = 1 - Math.pow(1 - g, 3);
        drawRef.current(now, e);
        if (g >= 1) grown.current = true;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [layers, inView, visible, reduce]);

  // redraw immediately on hover change when the loop is not running
  useEffect(() => { if (reduce || !inView || !visible) drawRef.current(0, 1); }, [hover?.i, reduce, inView, visible]);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (px < L - 8 || px > w - R + 8 || py > H - axisH + 6) { setHover(null); return; }
    let i = ridges.findIndex((_, k) => py <= baseY(k) + 4);
    if (i < 0) i = ridges.length - 1;
    const v = Math.max(d0, Math.min(d1, d0 + ((px - L) / plotW) * (d1 - d0)));
    setHover({ i, x: Math.max(L, Math.min(L + plotW, px)), v });
  };

  const hr = hover ? ridges[hover.i] : null;
  const summary = ariaLabel ?? `${valueLabel} by model: ` + ridges.map((r) => `${r.label} ${format(r.interval.mean)} (90% interval ${format(r.interval.lower)} to ${format(r.interval.upper)})`).join("; ");

  return (
    <div ref={wrapRef} className={cx("relative select-none", className)} style={{ height: H }}
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}
      onClick={() => { if (hr?.href) router.push(hr.href); }}
      role="figure" aria-label={summary}>
      <canvas ref={canvasRef} aria-hidden className={cx("absolute left-0 top-0", hr?.href && "cursor-pointer")} style={{ width: w, height: H }} />

      {/* labels (real links, so the chart is keyboard navigable) */}
      {w > 0 && ridges.map((r, i) => {
        const on = hover?.i === i, dim = hover != null && !on;
        const y = baseY(i);
        return (
          <div key={r.key} className="pointer-events-none absolute inset-x-0 flex items-end justify-between transition-opacity duration-200"
            style={{ top: y - 30, height: 30, opacity: dim ? 0.4 : 1 }}>
            <div className={cx("min-w-0 pb-0.5", phone && "[text-shadow:0_0_3px_white,0_0_6px_white,0_0_10px_white]")} style={{ width: phone ? "55%" : L - 14 }}>
              {r.href
                ? <Link href={r.href} onClick={(e) => e.stopPropagation()} className={cx("pointer-events-auto block truncate leading-tight tracking-[-0.01em] hover:text-accent", phone ? "text-[12px]" : "text-[13.5px]", i === 0 || on ? "font-medium text-ink" : "text-ink-2")}>{r.label}</Link>
                : <span className={cx("block truncate leading-tight", phone ? "text-[12px]" : "text-[13.5px]", i === 0 || on ? "font-medium text-ink" : "text-ink-2")}>{r.label}</span>}
              {r.sub && !phone && <span className="block truncate text-[11px] leading-tight text-ink-4">{r.sub}</span>}
            </div>
            <div className="shrink-0 pb-0.5 text-right tabular-nums" style={{ width: R - 8 }}>
              <span className={cx("font-light tracking-[-0.02em] text-ink", phone ? "text-[15px]" : "text-[19px]")}>{format(r.interval.mean)}</span>
            </div>
          </div>
        );
      })}

      {/* axis */}
      {w > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 text-[11px] text-ink-4 tabular-nums" style={{ top: H - axisH + 10, height: 16 }}>
          {axisTicks.map((t, k) => (
            <span key={t} className={cx("absolute", k === 0 ? "" : k === axisTicks.length - 1 ? "-translate-x-full" : "-translate-x-1/2", phone && k % 2 === 1 && "hidden")}
              style={{ left: sx(t) }}>{format(t)}</span>
          ))}
          {axisLabel && !phone && <span className="micro absolute left-0 !text-[10px] !text-ink-4" style={{ top: 0 }}>{axisLabel}</span>}
        </div>
      )}

      {/* crosshair + readout */}
      {hover && hr && (
        <>
          <div aria-hidden className="pointer-events-none absolute w-0 border-l border-dotted border-ink-3/70"
            style={{ left: hover.x, top: baseY(hover.i) - rowH * overlap, height: rowH * overlap + 8 }} />
          <div aria-hidden className="pointer-events-none absolute -translate-x-1/2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white tabular-nums"
            style={{ left: hover.x, top: H - axisH + 6 }}>{format(hover.v)}</div>
          <div className="pointer-events-none absolute z-10 w-[220px] rounded-[16px] bg-glass p-3.5 text-[12.5px] shadow-float backdrop-blur-xl backdrop-saturate-150"
            style={{
              left: hover.x > w - 260 ? hover.x - 232 : hover.x + 14,
              top: Math.max(0, baseY(hover.i) - rowH * overlap * 0.9),
            }}>
            <div className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-ink">{hr.label}</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-ink-3">{valueLabel}</span>
              <span className="text-[17px] font-light tracking-[-0.02em] text-ink tabular-nums">{format(hr.interval.mean)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-ink-3">90% interval</span>
              <span className="text-ink-2 tabular-nums">{format(hr.interval.lower)}–{format(hr.interval.upper)}</span>
            </div>
            {hr.n != null && (
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-ink-3">Graded tasks</span><span className="text-ink-2 tabular-nums">{hr.n}</span>
              </div>
            )}
            {hr.href && <div className="micro mt-2.5 !text-[10px]">Click to open</div>}
          </div>
        </>
      )}
    </div>
  );
}
