"use client";
// Pairwise "probability of superiority" matrix: cell (i, j) = P(true success rate of row model > column model),
// from independent Beta(1+s, 1+f) posteriors (exact closed form, cross-checked by 20k seeded Monte Carlo draws).
// Embeddable: pass `data` (from GET /api/compare → .matrix) or let it fetch itself.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PairwiseMatrixData } from "./types";
import { modelHref } from "@/lib/ui/format";
import { cx } from "@/components/ui";

// Styling: design-system tokens. Distinguishable = solid accent; leaning = halftone dots whose size grows with P.
const ACCENT = "var(--color-accent)";
const leanBg = (strength: number) => {
  const r = (0.7 + strength * 1.5).toFixed(2);
  return {
    backgroundColor: `oklch(96% ${(0.012 + strength * 0.03).toFixed(3)} 85)`,
    backgroundImage: `radial-gradient(circle at center, oklch(70% 0.13 80 / ${(0.45 + strength * 0.5).toFixed(2)}) ${r}px, transparent ${(+r + 0.6).toFixed(2)}px)`,
    backgroundSize: "6px 6px",
  };
};

export interface PairwiseMatrixProps {
  /** Matrix payload from GET /api/compare (`.matrix`). If omitted the component fetches it (optionally scoped to `runId`). */
  data?: PairwiseMatrixData;
  runId?: string;
  /** Called when a cell is clicked (row model, column model). Without it, cells link to /compare?a=&b=. */
  onSelect?: (a: string, b: string) => void;
  /** Highlight the currently selected pair. */
  selected?: { a: string; b: string } | null;
  /** Show at most this many models (top by posterior mean). Default: all. */
  limit?: number;
  /** Smaller cells and no footnote, for embedding in dense layouts. */
  compact?: boolean;
  className?: string;
}

const fmtP = (p: number) => (p > 0.999 ? ">99.9" : p < 0.001 ? "<0.1" : (p * 100).toFixed(p > 0.99 || p < 0.01 ? 1 : 0));
const shortName = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");

export default function PairwiseMatrix({ data: given, runId, onSelect, selected, limit, compact, className }: PairwiseMatrixProps) {
  const [fetched, setFetched] = useState<PairwiseMatrixData>();
  const [hover, setHover] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (given) return;
    let live = true;
    fetch(`/api/compare${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => live && d?.matrix && setFetched(d.matrix)).catch(() => {});
    return () => { live = false; };
  }, [given, runId]);
  const data = given ?? fetched;
  if (!data) return <div className={cx("h-[240px] animate-pulse rounded-[20px] bg-canvas", className)} />;
  const k = Math.min(data.models.length, limit ?? data.models.length);
  const models = data.models.slice(0, k);
  if (models.length < 2) return <div className={cx("rounded-[20px] bg-canvas p-6 text-center text-[13px] text-ink-3 shadow-well", className)}>Need at least two models with results.</div>;
  // Phones: numbered columns (matching the numbered rows) and narrow cells so five models fit in ~360px.
  const cell = cx(compact ? "h-9 min-w-[60px]" : "h-11 w-[96px] min-w-[84px]", "max-sm:h-10 max-sm:w-auto max-sm:min-w-[40px]");

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 4 }}>
          <thead>
            <tr>
              <th className="pr-3 text-left align-bottom text-[11px] font-medium uppercase tracking-[0.1em] text-ink-4 max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-surface max-sm:pr-2 max-sm:normal-case max-sm:tracking-normal">
                <span className="whitespace-nowrap">row beats column<span className="sm:hidden"> (%)</span></span>
              </th>
              {models.map((m, j) => (
                <th key={m.model} className={cx("px-1 pb-2 text-center align-bottom text-[12px] font-medium leading-tight", hover?.[1] === j ? "text-ink" : "text-ink-3")}>
                  <span className="mx-auto block max-w-[96px] truncate max-sm:hidden" title={m.displayName}>{shortName(m.displayName)}</span>
                  <span className="sm:hidden" title={m.displayName}>#{j + 1}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((A, i) => (
              <tr key={A.model}>
                <td className={cx("whitespace-nowrap pr-4 text-[13.5px] max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-surface max-sm:pr-2", hover?.[0] === i ? "text-ink" : "text-ink-2")}>
                  <span className="mr-1.5 inline-block w-5 text-[12px] text-ink-4 tnum sm:hidden">#{i + 1}</span>
                  <Link href={modelHref(A.model)} className="tap hover:text-accent max-sm:inline-block max-sm:max-w-[104px] max-sm:truncate max-sm:align-bottom">{shortName(A.displayName)}</Link>
                  <span className="ml-2 text-[11.5px] text-ink-4 tnum max-sm:hidden">{Math.round(A.mean * 100)}%</span>
                </td>
                {models.map((B, j) => {
                  const c = data.cells[i]?.[j];
                  if (i === j || !c) return <td key={B.model} className={cx(cell, "rounded-chip bg-canvas text-center text-[11px] text-ink-5")}>—</td>;
                  const strength = Math.max(0, (c.p - 0.5) / 0.5);
                  const dist = c.p > data.threshold;
                  const isSel = selected && ((selected.a === A.model && selected.b === B.model));
                  const bg: React.CSSProperties = dist ? { background: ACCENT, boxShadow: "inset 0 1px 0 oklch(100% 0 0 / 0.2), 0 4px 10px -4px oklch(52% 0.105 72 / 0.45)" } : c.p > 0.5 ? leanBg(strength) : { background: "var(--color-canvas)" };
                  const tip = `P(${shortName(A.displayName)} > ${shortName(B.displayName)}) = ${c.p.toFixed(4)} exact · ${c.mc.toFixed(4)} Monte Carlo (${(20000).toLocaleString()} draws)` +
                    (dist ? " · distinguishable at 95%" : c.p < 1 - data.threshold ? " · column is distinguishably better" : " · not distinguishable");
                  const inner = (
                    <span className="flex h-full flex-col items-center justify-center leading-none">
                      <span className={cx("tnum rounded-full px-1", compact ? "text-[12px]" : "text-[13px]", dist ? "font-semibold text-white" : c.p > 0.5 ? "bg-surface/85 font-medium text-ink" : "text-ink-4")}>
                        {fmtP(c.p)}<span className={cx("text-[10px] max-sm:hidden", dist ? "text-white/70" : "text-ink-4")}>%</span>
                      </span>
                    </span>
                  );
                  const cls = cx(cell, "rounded-chip p-0 text-center transition-[outline-color]",
                    isSel && "outline outline-2 outline-offset-2 outline-ink", "hover:outline hover:outline-2 hover:outline-offset-2 hover:outline-ink/50");
                  return (
                    <td key={B.model} className={cls} style={bg} title={tip}
                      onMouseEnter={() => setHover([i, j])} onMouseLeave={() => setHover(null)}>
                      {onSelect
                        ? <button type="button" onClick={() => onSelect(A.model, B.model)} className="block h-full w-full">{inner}</button>
                        : <Link href={`/compare?a=${encodeURIComponent(A.model)}&b=${encodeURIComponent(B.model)}`} className="block h-full w-full">{inner}</Link>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-ink-3">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3.5 w-5 rounded-[5px] bg-accent" /> distinguishable, P &gt; {Math.round(data.threshold * 100)}%</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-5 rounded-[5px]" style={leanBg(0.15)} />
            <span className="inline-block h-3.5 w-5 rounded-[5px]" style={leanBg(0.8)} />
            leaning, 50–{Math.round(data.threshold * 100)}%
          </span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3.5 w-5 rounded-[5px] bg-canvas" /> row is worse (read the mirrored cell)</span>
          <span className="text-ink-4">Exact closed form · Monte Carlo check max |Δ| = {data.method.maxAbsMcError.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}
