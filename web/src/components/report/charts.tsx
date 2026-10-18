// Report figures for /research, all server-rendered: the leaderboard (bar + 90% interval whisker), success vs. cost
// with its efficient frontier, and failure modes as stacked shares.
import Link from "next/link";
import type { ModelStats } from "@/lib/types";
import { failureLabel, modelHref } from "@/lib/ui/format";
import { ProviderDot, R, providerColor } from "./primitives";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const clean = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");

/** "=4" when a row's score ties its neighbour's, else its 1-based rank. */
function ranks(rows: ModelStats[]) {
  return rows.map((r, i) => {
    let first = i;
    while (first > 0 && rows[first - 1].score === r.score) first--;
    const tied = rows.some((o, j) => j !== i && o.score === r.score);
    return { label: `${tied ? "=" : ""}${first + 1}`, sr: tied ? `Tied for rank ${first + 1}` : `Rank ${first + 1}` };
  });
}

function Bar({ r }: { r: ModelStats }) {
  const { lower, upper } = r.reliability;
  return (
    <div aria-hidden className="relative h-2 min-w-0 flex-1 rounded-full bg-black/[0.05]">
      <div className="h-full rounded-full" style={{ width: `${r.metrics.successRate * 100}%`, background: providerColor(r.provider) }} />
      <div className="absolute top-1/2 h-3 -translate-y-1/2 border-x border-[#111]/80" style={{ left: `${lower * 100}%`, width: `${(upper - lower) * 100}%` }}>
        <div className="absolute top-1/2 w-full border-t border-[#111]/80" />
      </div>
    </div>
  );
}

function Score({ r }: { r: ModelStats }) {
  return (
    <span className="flex min-w-[60px] shrink-0 flex-col items-end whitespace-nowrap tabular-nums">
      <span className="text-[15px] leading-[1.2] tracking-[-0.01em]" style={{ color: R.ink }}>
        <span className="sr-only">Success rate: </span>{pct(r.metrics.successRate)}
        <span className="sr-only">, 90% credible interval {pct(r.reliability.lower)} to {pct(r.reliability.upper)}</span>
      </span>
    </span>
  );
}

const isBonded = (r: ModelStats) => r.provider === "Bonded";

function Name({ r, note }: { r: ModelStats; note?: string }) {
  if (!isBonded(r)) return <Link href={modelHref(r.model)} className="hover:underline">{clean(r.displayName)}</Link>;
  // Bonded Shield rows: a small gold mark and the measured lift over the same model shopping alone
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <Link href={modelHref(r.model)} className="font-[560] hover:underline" style={{ color: R.gold }}>{clean(r.displayName)}</Link>
      <span className="rounded-full px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: R.gold, background: R.goldSoft }}>Bonded</span>
      {note && <span className="text-[12px] tabular-nums" style={{ color: R.muted }}>{note}</span>}
    </span>
  );
}

/** `notes`: optional per-model annotation shown after Bonded rows' names (e.g. "+4.2 vs GPT-5 mini alone"). */
export function Leaderboard({ rows, notes }: { rows: ModelStats[]; notes?: Record<string, string> }) {
  const rk = ranks(rows);
  return (
    <div aria-label="Model leaderboard">
      {/* phones: stacked rows */}
      <ol className="border-t sm:hidden" style={{ borderColor: R.line }}>
        {rows.map((r, i) => (
          <li key={r.model} className="border-b py-3" style={{ borderColor: R.line, ...(isBonded(r) ? { background: R.goldWash } : {}) }}>
            <div className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-[12px] tabular-nums" style={{ color: R.muted }}><span aria-hidden>{rk[i].label}</span><span className="sr-only">{rk[i].sr}</span></span>
              <ProviderDot provider={r.provider} />
              <span className="min-w-0 flex-1 text-[13px]" style={{ color: R.fg }}><Name r={r} note={notes?.[r.model]} /></span>
              <Score r={r} />
            </div>
            <div className="mt-3 flex"><Bar r={r} /></div>
          </li>
        ))}
      </ol>
      {/* desktop: table */}
      <table className="hidden w-full border-collapse text-left sm:table">
        <thead className="border-b text-[12px]" style={{ borderColor: R.rule, color: R.muted }}>
          <tr>
            <th scope="col" className="w-8 pb-3 pr-2 font-normal"><span aria-hidden>#</span><span className="sr-only">Rank</span></th>
            <th scope="col" className="pb-3 pr-3 font-normal">Model</th>
            <th scope="col" className="w-[58%] pb-3 text-right font-normal">Success rate</th>
            <th scope="col" className="w-14 pb-3 pl-3 text-right font-normal">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.model} className="border-b transition-colors hover:bg-[#f8f8fc]" style={{ borderColor: "rgba(0,0,0,0.07)", ...(isBonded(r) ? { background: R.goldWash } : {}) }}>
              <td className="py-3 pr-2 text-[11px] tabular-nums" style={{ color: R.muted }}><span aria-hidden>{rk[i].label}</span><span className="sr-only">{rk[i].sr}</span></td>
              <th scope="row" className="py-3 pr-3 text-[13px] font-normal" style={{ color: R.fg }}>
                <span className="flex items-center gap-3 whitespace-nowrap"><ProviderDot provider={r.provider} /><Name r={r} note={notes?.[r.model]} /></span>
              </th>
              <td className="py-3"><div className="flex items-center gap-3"><Bar r={r} /><Score r={r} /></div></td>
              <td className="py-3 pl-3 text-right text-[13px] tabular-nums" style={{ color: R.muted }}>{r.score.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ success vs. cost */

const W = 720, H = 360, M = { t: 16, r: 24, b: 44, l: 48 };
const COST_TICKS = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];
const fmtCost = (c: number) => (c >= 0.01 ? `$${c.toFixed(2)}` : `$${c.toFixed(c >= 0.001 ? 3 : 4)}`);

/** The best observed trade-offs: walking from cheapest up, each point that beats every cheaper one. */
export function frontier(rows: ModelStats[]) {
  const out: ModelStats[] = [];
  for (const r of [...rows].sort((a, b) => a.metrics.avgCostUsd - b.metrics.avgCostUsd)) {
    if (!out.length || r.metrics.successRate > out[out.length - 1].metrics.successRate) out.push(r);
  }
  return out;
}

export function CostFrontier({ rows }: { rows: ModelStats[] }) {
  const pts = rows.filter((r) => r.metrics.avgCostUsd > 0);
  if (pts.length < 2) return null;
  const costs = pts.map((r) => r.metrics.avgCostUsd);
  const lo = Math.log10(Math.min(...costs)) - 0.15, hi = Math.log10(Math.max(...costs)) + 0.15;
  const minRate = Math.min(...pts.map((r) => r.metrics.successRate));
  const yLo = Math.max(0, Math.floor((minRate - 0.05) * 10) / 10);
  const x = (c: number) => M.l + ((Math.log10(c) - lo) / (hi - lo)) * (W - M.l - M.r);
  const y = (s: number) => M.t + (1 - (s - yLo) / (1 - yLo)) * (H - M.t - M.b);
  const yTicks = Array.from({ length: Math.round((1 - yLo) / 0.1) + 1 }, (_, i) => +(yLo + i * 0.1).toFixed(2));
  const xTicks = COST_TICKS.filter((c) => Math.log10(c) >= lo && Math.log10(c) <= hi);
  const front = frontier(pts);

  // labels: first spot (above, below, right, left of the dot) that clears every placed label and every other dot
  const placed: { x: number; y: number; w: number }[] = [];
  const dots = pts.map((r) => ({ x: x(r.metrics.avgCostUsd), y: y(r.metrics.successRate) }));
  const labels = [...pts].sort((a, b) => b.metrics.successRate - a.metrics.successRate).map((r) => {
    const name = clean(r.displayName), w = name.length * 6.2;
    const cx = x(r.metrics.avgCostUsd), cy = y(r.metrics.successRate);
    const spots = [[cx - w / 2, cy - 10], [cx - w / 2, cy + 19], [cx + 9, cy + 4], [cx - 9 - w, cy + 4]]
      .map(([lx, ly]) => [Math.min(Math.max(lx, M.l), W - 4 - w), ly]);
    const clear = ([lx, ly]: number[]) =>
      !placed.some((p) => Math.abs(p.y - ly) < 13 && lx < p.x + p.w && p.x < lx + w)
      && !dots.some((d) => !(d.x === cx && d.y === cy) && d.x > lx - 6 && d.x < lx + w + 6 && d.y > ly - 16 && d.y < ly + 6);
    const [lx, ly] = spots.find(clear) ?? spots[0];
    placed.push({ x: lx, y: ly, w });
    return { r, name, lx, ly };
  });

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[560px]" role="img"
      aria-label={`Success rate against average cost per task. Frontier: ${front.map((r) => clean(r.displayName)).join(", ")}.`}>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={R.line} />
          <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={R.muted}>{Math.round(t * 100)}%</text>
        </g>
      ))}
      {xTicks.map((c) => (
        <text key={c} x={x(c)} y={H - M.b + 18} textAnchor="middle" fontSize={11} fill={R.muted}>{fmtCost(c)}</text>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill={R.muted}>Average cost per task (log scale)</text>
      <polyline points={front.map((r) => `${x(r.metrics.avgCostUsd)},${y(r.metrics.successRate)}`).join(" ")}
        fill="none" stroke={R.ink} strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="2 4" strokeLinecap="round" />
      {pts.map((r) => (
        <circle key={r.model} cx={x(r.metrics.avgCostUsd)} cy={y(r.metrics.successRate)} r={5} fill={providerColor(r.provider)} stroke="#fff" strokeWidth={1.5} />
      ))}
      {labels.map(({ r, name, lx, ly }) => (
        <text key={r.model} x={lx} y={ly} fontSize={11} fill={R.ink}>{name}</text>
      ))}
    </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ failure modes */

const MODE_COLORS = ["#3f42ab", "#d97757", "#10a37f", "#c9a227", "#8a5cc2", "#4285f4", "#b0aca4", "#e05d6f", "#5b8c5a", "#20202b", "#9aa0ff"];

export function FailureBars({ rows }: { rows: ModelStats[] }) {
  const modes = Object.entries(rows.reduce<Record<string, number>>((acc, r) => {
    for (const [m, k] of Object.entries(r.failureModes)) acc[m] = (acc[m] ?? 0) + (k ?? 0);
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  if (!modes.length) return null;
  const color = (m: string) => MODE_COLORS[modes.indexOf(m) % MODE_COLORS.length];
  const all = { label: "All models", modes: Object.fromEntries(modes.map((m) => [m, rows.reduce((s, r) => s + (r.failureModes[m as keyof typeof r.failureModes] ?? 0), 0)])) };
  const series = [...rows.map((r) => ({ label: clean(r.displayName), modes: r.failureModes as Record<string, number> })), all];

  return (
    <div>
      <ul className="mb-5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]" style={{ color: R.muted }}>
        {modes.map((m) => (
          <li key={m} className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: color(m) }} />{failureLabel(m)}</li>
        ))}
      </ul>
      <div className="grid gap-2.5">
        {series.map((s, i) => {
          const total = modes.reduce((n, m) => n + (s.modes[m] ?? 0), 0);
          return (
            <div key={s.label} className={`grid grid-cols-[120px_minmax(0,1fr)_28px] items-center gap-3 text-[12.5px] sm:grid-cols-[150px_minmax(0,1fr)_32px] ${i === series.length - 1 ? "mt-2 border-t pt-3" : ""}`} style={{ borderColor: R.line }}>
              <span className="truncate" style={{ color: R.fg }}>{s.label}</span>
              <div className="flex h-3 overflow-hidden rounded-[2px] bg-black/[0.04]" role="img"
                aria-label={total ? modes.filter((m) => s.modes[m]).map((m) => `${failureLabel(m)} ${s.modes[m]} of ${total}`).join(", ") : "No failures"}>
                {total > 0 && modes.map((m) => s.modes[m] ? <div key={m} style={{ width: `${(s.modes[m] / total) * 100}%`, background: color(m) }} className="h-full border-r border-white last:border-r-0" /> : null)}
              </div>
              <span className="text-right tabular-nums" style={{ color: R.muted }}>{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
