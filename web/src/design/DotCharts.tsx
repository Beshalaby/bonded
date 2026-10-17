"use client";
// Dot-matrix chart primitives. Everything is drawn from a fixed dot pitch so all charts share one texture.
//   DotBar        a value (and optional interval) as a row of dots on a 0–1 track
//   DotHeatmap    a rows × cols table whose cells are ordered-dither dot fields (density = rate) + the number
//   DotSparkline  a series as dot columns
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { C } from "./tokens";
import { cx } from "./primitives";

const TONE = {
  accent: { on: C.accentDot, soft: "oklch(62% 0.19 258 / 0.32)" },
  coral: { on: C.coral, soft: "oklch(68% 0.15 35 / 0.35)" },
  pass: { on: C.pass, soft: "oklch(66% 0.15 152 / 0.35)" },
  violet: { on: "oklch(60% 0.2 295)", soft: "oklch(60% 0.2 295 / 0.32)" },
  ink: { on: C.ink2, soft: "oklch(42% 0.008 275 / 0.3)" },
} as const;
export type DotTone = keyof typeof TONE;

/* ------------------------------------------------------------------ DotBar */

/**
 * A 0–1 value as dots. With `interval`, dots below the lower bound are solid, the interval is soft,
 * and the mean is a larger ink dot. Without it, dots up to `value` are solid.
 */
export function DotBar({
  value, interval, dots = 30, pitch = 5, rows = 1, tone = "accent", className, label, showMean = true,
}: {
  value: number; interval?: { lower: number; upper: number }; dots?: number; pitch?: number; rows?: 1 | 2 | 3;
  tone?: DotTone; className?: string; label?: string; showMean?: boolean;
}) {
  const t = TONE[tone];
  const w = dots * pitch, h = rows * pitch + (interval && showMean ? 4 : 0);
  const oy = (h - rows * pitch) / 2;
  const mi = Math.min(dots - 1, Math.max(0, Math.floor(value * dots)));
  const cells: ReactNode[] = [];
  for (let i = 0; i < dots; i++) {
    const p = (i + 0.5) / dots;
    for (let r = 0; r < rows; r++) {
      let fill: string = C.ink5, rad = pitch * 0.2;
      if (interval) {
        if (p < interval.lower) { fill = t.on; rad = pitch * 0.27; }
        else if (p <= interval.upper) { fill = t.soft; rad = pitch * 0.3; if (p <= value) fill = t.on; }
      } else if (p <= value) { fill = t.on; rad = pitch * 0.28; }
      cells.push(<circle key={`${i}.${r}`} cx={i * pitch + pitch / 2} cy={oy + r * pitch + pitch / 2} r={rad} fill={fill} />);
    }
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cx("block shrink-0 overflow-visible", className)} role="img" aria-label={label}>
      {cells}
      {interval && showMean && (
        <circle cx={mi * pitch + pitch / 2} cy={h / 2} r={pitch * 0.62} fill={C.ink} stroke={C.surface} strokeWidth={1.5} />
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ DotCell (heatmap cell) */

const BAYER8x4 = [0, 16, 4, 20, 2, 18, 6, 22, 24, 8, 28, 12, 26, 10, 30, 14, 3, 19, 7, 23, 1, 17, 5, 21, 27, 11, 31, 15, 25, 9, 29, 13];

/** A rate as an ordered-dither dot field: 32 dots, round(rate × 32) lit. */
export function DotCell({ rate, tone = "coral", pitch = 5, className }: { rate: number | null; tone?: DotTone; pitch?: number; className?: string }) {
  const t = TONE[tone];
  const lit = rate == null ? -1 : Math.round(Math.max(0, Math.min(1, rate)) * 32);
  const W = 8 * pitch, H = 4 * pitch;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className={cx("block shrink-0", className)}>
      {BAYER8x4.map((rank, k) => {
        const x = (k % 8) * pitch + pitch / 2, y = Math.floor(k / 8) * pitch + pitch / 2;
        const on = rank < lit;
        return <circle key={k} cx={x} cy={y} r={on ? pitch * 0.3 : pitch * 0.16} fill={rate == null ? C.ink5 : on ? t.on : C.ink5} opacity={rate == null ? 0.6 : 1} />;
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ DotHeatmap */

export interface DotHeatCell { rate: number | null; fooled: number; exposed: number; lower?: number; upper?: number }

const SHORT_LABEL: Record<string, string> = {
  "Prompt injection": "Inject.", "Fake discount": "Fake disc.", "New merchant": "New merch.", "Price gouging": "Gouging", "Knockoff": "Knock-off",
};

/** rows × cols of DotCells. Same data contract as charts.Heatmap (which renders this). */
export function DotHeatmap({
  rows, cols, cell, rowHref, tone = "coral", valueLabel = "fooled",
}: {
  rows: { key: string; label: ReactNode }[];
  cols: { key: string; label: string; short?: string }[];
  cell: (row: string, col: string) => DotHeatCell | undefined;
  rowHref?: (row: string) => string;
  tone?: DotTone;
  valueLabel?: string;
}) {
  const [hover, setHover] = useState<[string, string] | null>(null);
  return (
    <table className="w-full border-separate" style={{ borderSpacing: "6px 4px" }}>
      <thead>
        <tr>
          <th className="w-[200px] max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:w-[84px] max-sm:bg-surface" />
          {cols.map((c) => (
            <th key={c.key} scope="col" title={c.label}
              className={cx("pb-2 text-left text-[11px] font-medium uppercase tracking-[0.1em] max-sm:px-0.5 max-sm:text-center max-sm:normal-case max-sm:tracking-normal", hover?.[1] === c.key ? "text-ink" : "text-ink-3")}>
              <span className="max-sm:hidden">{c.label}</span>
              <span className="sm:hidden">{c.short ?? SHORT_LABEL[c.label] ?? c.label}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row" className={cx("truncate pr-4 text-left text-[13.5px] font-normal max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-surface max-sm:pr-1 max-sm:text-[12.5px]", hover?.[0] === r.key ? "text-ink" : "text-ink-2")}>
              <span className="block truncate max-sm:max-w-[80px]">
                {rowHref ? <Link href={rowHref(r.key)} className="tap hover:text-accent">{r.label}</Link> : r.label}
              </span>
            </th>
            {cols.map((c) => {
              const v = cell(r.key, c.key);
              const tested = !!v && !!v.exposed && v.rate != null;
              const tip = !tested ? "Not tested"
                : `${c.label}: ${valueLabel} ${v!.fooled} of ${v!.exposed} (${Math.round(v!.rate! * 100)}%)` +
                  (v!.lower != null && v!.upper != null ? ` · 90% CI ${Math.round(v!.lower * 100)}–${Math.round(v!.upper * 100)}%` : "");
              const on = hover?.[0] === r.key && hover?.[1] === c.key;
              return (
                <td key={c.key} title={tip} onMouseEnter={() => setHover([r.key, c.key])} onMouseLeave={() => setHover(null)}
                  className={cx("h-12 min-w-[120px] rounded-chip px-2.5 align-middle transition-[background-color,box-shadow] duration-150 max-sm:h-14 max-sm:min-w-[52px] max-sm:px-1",
                    on ? "bg-surface shadow-key" : "bg-canvas/70")}>
                  <div className="flex items-center gap-3 max-sm:flex-col max-sm:gap-1">
                    <DotCell rate={tested ? v!.rate : null} tone={tone} pitch={5} className="max-sm:hidden" />
                    <DotCell rate={tested ? v!.rate : null} tone={tone} pitch={4} className="sm:hidden" />
                    <span className="leading-none tabular-nums">
                      {tested ? (
                        <>
                          <span className={cx("text-[13.5px] font-medium max-sm:text-[12px]", v!.rate! >= 0.2 ? "text-coral-ink" : "text-ink")}>{Math.round(v!.rate! * 100)}%</span>
                          <span className="ml-1 text-[11px] text-ink-4 max-sm:hidden">{v!.fooled}/{v!.exposed}</span>
                        </>
                      ) : <span className="text-[12px] text-ink-4">–</span>}
                    </span>
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Legend for DotHeatmap: 0 → 100% dot density, plus "not tested". */
export function DotScaleLegend({ label, tone = "coral" }: { label: string; tone?: DotTone }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[11.5px] text-ink-3 tabular-nums">
      <span className="micro">{label}</span>
      <span>0%</span>
      <span className="inline-flex gap-1">{[0, 0.25, 0.5, 0.75, 1].map((r) => <DotCell key={r} rate={r} tone={tone} pitch={3} />)}</span>
      <span>100%</span>
      <span className="ml-1 inline-flex items-center gap-1.5"><DotCell rate={null} pitch={3} /> not tested</span>
    </div>
  );
}

/* ------------------------------------------------------------------ DotSparkline */

/**
 * A series as columns of dots (bottom-up). The last column is emphasised and can carry a direct label.
 * `base` draws a faint dotted reference row (e.g. the starting value).
 */
export function DotSparkline({
  values, height = 40, pitch = 5, tone = "accent", min, max, base, endLabel, label, className,
}: {
  values: number[]; height?: number; pitch?: number; tone?: DotTone; min?: number; max?: number; base?: number;
  endLabel?: ReactNode; label?: string; className?: string;
}) {
  if (!values.length) return null;
  const t = TONE[tone];
  const lo = min ?? Math.min(...values, base ?? Infinity);
  const hi = max ?? Math.max(...values);
  const rowsN = Math.max(2, Math.floor(height / pitch));
  const W = values.length * pitch;
  const lvl = (v: number) => Math.max(1, Math.round(((v - lo) / (hi - lo || 1)) * (rowsN - 1)) + 1);
  const baseRow = base != null ? lvl(base) : null;
  return (
    <span className={cx("inline-flex items-end gap-2", className)}>
      <svg width={W} height={rowsN * pitch} viewBox={`0 0 ${W} ${rowsN * pitch}`} role="img" aria-label={label} className="block shrink-0">
        {values.map((v, i) => {
          const n = lvl(v), last = i === values.length - 1;
          return Array.from({ length: rowsN }).map((_, r) => {
            const on = r < n;
            const y = (rowsN - 1 - r) * pitch + pitch / 2;
            const isBase = baseRow != null && r === baseRow - 1 && !on;
            return <circle key={`${i}.${r}`} cx={i * pitch + pitch / 2} cy={y}
              r={on ? pitch * (last ? 0.34 : 0.27) : pitch * 0.14}
              fill={on ? (last ? C.ink : r === n - 1 ? t.on : t.soft) : isBase ? C.ink4 : C.ink5}
              opacity={on || isBase ? 1 : 0.7} />;
          });
        })}
      </svg>
      {endLabel != null && <span className="pb-0.5 text-[12px] font-medium leading-none text-ink tabular-nums">{endLabel}</span>}
    </span>
  );
}
