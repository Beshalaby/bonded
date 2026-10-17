import type { RiskProfile } from "@/lib/types";

/** Trust score over time with shaded 90% credible band. Pure SVG, server-renderable. */
export default function TrustChart({ history, height = 220 }: { history: RiskProfile["history"]; height?: number }) {
  const W = 1200, H = height, L = 40, R = 12, T = 12, B = 26;
  if (!history.length)
    return <div className="grid place-items-center rounded-xl border border-dashed border-white/10 text-sm text-zinc-500" style={{ height }}>No history yet — trust updates after each transaction.</div>;
  const pts = history.length === 1 ? [history[0], history[0]] : history;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const band = [...pts.map((p, i) => `${x(i)},${y(p.upper)}`), ...pts.map((p, i) => `${x(i)},${y(p.lower)}`).reverse()].join(" ");
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.trustScore)}`).join(" ");
  const fails = pts.map((p, i) => ({ p, i })).filter(({ p }) => /claim|fail|bad|false/.test(p.event));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label="Trust score history">
      <defs>
        <linearGradient id="band" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#71717a">{Math.round(v * 100)}%</text>
        </g>
      ))}
      <polygon points={band} fill="url(#band)" />
      <path d={line} fill="none" stroke="#34d399" strokeWidth="2.25" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.trustScore)} r={pts.length > 60 ? 1.5 : 2.75} fill="#07090d" stroke="#34d399" strokeWidth="1.5">
          <title>{`${new Date(p.ts).toLocaleString()} · ${p.event} · ${(p.trustScore * 100).toFixed(1)}% [${(p.lower * 100).toFixed(0)}–${(p.upper * 100).toFixed(0)}]`}</title>
        </circle>
      ))}
      {fails.map(({ p, i }) => (
        <g key={`f${i}`}>
          <line x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke="#fb7185" strokeDasharray="3 3" strokeOpacity="0.6" />
          <circle cx={x(i)} cy={y(p.trustScore)} r="4" fill="#fb7185" />
        </g>
      ))}
      <text x={L} y={H - 8} fontSize="10" fill="#71717a">{new Date(pts[0].ts).toLocaleDateString()}</text>
      <text x={W - R} y={H - 8} fontSize="10" textAnchor="end" fill="#71717a">{pts.length === 2 && history.length === 1 ? "1 event" : `${history.length} events`}</text>
    </svg>
  );
}
